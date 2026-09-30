import WebSocket from "ws";
import { store } from "./caseStore.js";
import { checkAgentTranscript, checkUserTranscript, END_WORDS } from "./guardrails.js";
import { agentFor, groqLlm } from "./agents.js";
import { extractClaims, type Thread } from "./extractor.js";
import { greeting, systemPrompt } from "./prompt.js";
import { AGENT_TOOLS, drainPending, handleTool, releaseApproval, type ToolCtx } from "./tools.js";
import type { Lead, RoomId } from "./types.js";

const AAI_URL = "wss://agents.assemblyai.com/v1/ws";
const REMINDER = "\n\nReminder: never accuse, never reveal sources or name other interviewees, never pressure.";

const KEYTERMS = ["Tunde", "Daniel", "Corolla", "Admiralty Way", "Lekki", "warehouse", "Ajah", "Lekki Phase 1"];

export class RoomBridge {
  private browser: WebSocket | null = null;
  private upstream: WebSocket | null = null;
  private ready = false;
  private sessionId: string | null = null;
  private lastEvent: string | null = null;
  private pendingResults: { call_id: string; result: unknown }[] = [];
  private captionReply: string | null = null;
  private ending: string | null = null;
  private endTimer: NodeJS.Timeout | null = null;
  private resumed = false;
  /** Stored agent bound to Groq; null means inline config on the managed model. */
  private agentId: string | null = null;
  private flagged = false;
  private prompt = "";

  private lastAgentText = "";
  /** Rights phrase heard in the transcript; it names the end reason even if the model picks another. */
  private trigger: string | null = null;
  private extracting: Promise<void> = Promise.resolve();
  private heardBuffer: string[] = [];
  private heardTimer: NodeJS.Timeout | null = null;
  private capTimer: NodeJS.Timeout | null = null;

  /** Speech arrives in fragments; extract once the speaker pauses so claims see whole sentences. */
  private bufferHeard(text: string) {
    this.heardBuffer.push(text);
    if (this.heardTimer) clearTimeout(this.heardTimer);
    this.heardTimer = setTimeout(() => this.flushHeard(), 1400);
  }

  private flushHeard() {
    if (this.heardTimer) clearTimeout(this.heardTimer);
    this.heardTimer = null;
    const text = this.heardBuffer.join(" ").replace(/\s+/g, " ").trim();
    this.heardBuffer = [];
    if (text) this.extract(text);
  }

  constructor(readonly room: RoomId) {
    store.on("change", () => this.pushRoomState());
    store.on("pending", () => this.deliverPending());
  }

  /** Conflicts meant for this room reach the agent as redacted system context, never with names or quotes. */
  private deliverPending() {
    if (!this.ready || this.state.status !== "LIVE" || !store.pending[this.room].length) return;
    const items = drainPending(this.room);
    if (!items.length) return;
    const lines = items.map((c) => `${c.id} (${c.type}, ${c.topic}): ${c.challenge_hint}`).join(" ");
    this.sendUp({ type: "conversation.message", role: "system", content: `Case update. ${lines} Raise it in the challenge phase with an open, neutral question. Never say where the information came from.` });
  }

  private toolCtx(): ToolCtx {
    return {
      end: (reason) => {
        this.ending = this.trigger ?? reason;
        this.scheduleFinish(9000);
      },
      inject: (text) => this.sendUp({ type: "conversation.message", role: "system", content: text }),
    };
  }

  /** New specifics become leads; places and businesses get checked on the web; the best one goes to the agent to pursue. */
  private openThreads(threads: Thread[], quote: string) {
    if (this.ending || this.trigger || this.state.status !== "LIVE") return;
    const key = (x: string) => x.toLowerCase().replace(/^(the|a|an|his|her|my)\s+/, "").split(/[\s:]+/).slice(0, 2).join(" ");
    const fresh = threads.filter((t) => !store.leads.some((l) => l.room === this.room && key(l.text) === key(t.text)));
    if (!fresh.length) return;
    const KIND: Record<string, Lead["kind"]> = { person: "relationship", place: "opportunity", business: "lead", object: "means", reason: "motive" };
    for (const t of fresh) {
      const lead: Lead = {
        id: store.nextId("L"), room: this.room, kind: KIND[t.kind] ?? "lead", thread: t.kind,
        text: `${t.text}${t.why ? `: ${t.why}` : ""}`.slice(0, 240), sourceIds: [], at: store.clock(this.room),
      };
      store.leads.push(lead);
      store.log(this.room, { kind: "lookup", label: `New thread · ${t.kind}`, detail: lead.text, refs: [lead.id], status: "done" });
      const researched = store.intel.filter((i) => i.room === this.room).length;
      if ((t.kind === "place" || t.kind === "business") && researched < 3) {
        handleTool(this.room, "research", { query: `${t.text} Lagos`, purpose: t.why ?? `Verify "${t.text}" from: ${quote.slice(0, 80)}` }, this.toolCtx());
      }
    }
    const top = fresh[0];
    this.sendUp({
      type: "conversation.message",
      role: "system",
      content: `New thread to pull: ${top.text} (${top.kind}). When it fits, ask for specifics that can be independently verified: names, exact place, times, receipts, who else can confirm.`,
    });
  }

  /** Server-side claim extraction, serialised per room so revisions see earlier claims. */
  private extract(text: string) {
    const lastQ = this.state.lastQuestion?.question ?? this.lastAgentText;
    this.extracting = this.extracting.then(async () => {
      try {
        const { claims, threads } = await extractClaims(this.room, text, lastQ);
        for (const c of claims) handleTool(this.room, "record_claim", c, this.toolCtx());
        this.openThreads(threads, text);
      } catch (e: any) {
        console.error(`[${this.room}] extraction failed`, e.message);
        store.log(this.room, { kind: "system", label: "Claim extraction failed", detail: String(e.message).slice(0, 140), status: "error" });
      }
    });
  }

  get state() {
    return store.rooms[this.room];
  }

  attachBrowser(ws: WebSocket) {
    this.browser?.close();
    this.browser = ws;
    ws.on("message", (data, isBinary) => {
      if (isBinary) return this.forwardAudio(data as Buffer);
      let msg: any;
      try { msg = JSON.parse(String(data)); } catch { return; }
      if (msg.type === "start") this.start();
      if (msg.type === "checkin") {
        store.plan[this.room].checkedIn = true;
        store.log(this.room, { kind: "system", label: "Checked in", detail: `${store.plan[this.room].location} · microphone ready`, status: "done" });
      }
      if (msg.type === "stop") this.finish("declined");
    });
    ws.on("close", () => {
      if (this.browser !== ws) return;
      this.browser = null;
      if (store.plan[this.room].checkedIn && this.state.status !== "LIVE") {
        store.plan[this.room].checkedIn = false;
        store.changed();
      }
    });
    this.pushRoomState();
  }

  private sendBrowser(obj: unknown) {
    if (this.browser?.readyState === WebSocket.OPEN) this.browser.send(JSON.stringify(obj));
  }

  pushRoomState() {
    const r = this.state;
    const p = store.snapshot().case.interviewees.find((x: any) => x.id === this.room);
    const plan = store.plan[this.room];
    this.sendBrowser({
      type: "room",
      room: {
        id: r.id, name: p.name, status: r.status, agentState: r.agentState, caption: r.caption,
        endReason: r.endReason, endWords: r.endReason ? END_WORDS[r.endReason] : undefined, greeting: greeting(this.room),
        scheduledAt: plan.scheduledAt, location: plan.location, checkedIn: plan.checkedIn, photo: store.photos[this.room],
        station: store.snapshot().case.station,
        serverNow: Date.now(),
      },
    });
  }

  /** Scheduled time reached, or the investigator pressed Start: the room device must be checked in (mic open). */
  kickoff(by: "schedule" | "investigator") {
    if (this.state.status === "LIVE" || this.state.status === "CONNECTING") return;
    if (!store.plan[this.room].checkedIn || !this.browser) {
      store.log(this.room, { kind: "system", label: "Cannot start: interviewee not checked in", status: "warn" });
      return;
    }
    store.log(this.room, { kind: "system", label: by === "schedule" ? "Scheduled time reached, starting interview" : "Investigator started the interview", status: "done" });
    this.sendBrowser({ type: "kickoff" });
    this.start();
  }

  start() {
    if (this.state.status === "LIVE" || this.state.status === "CONNECTING") return;
    if (!process.env.ASSEMBLYAI_API_KEY) {
      store.log(this.room, { kind: "system", label: "ASSEMBLYAI_API_KEY missing on server", status: "error" });
      return;
    }
    this.ending = null;
    this.trigger = null;
    this.resumed = false;
    this.flagged = false;
    this.prompt = systemPrompt(this.room);
    store.setRoom(this.room, { status: "CONNECTING", caption: "", userPartial: "", endReason: undefined, startedAt: Date.now(), endedAt: undefined });
    this.agentId = null;
    const llm = groqLlm();
    if (!llm) return this.connect(false);
    agentFor(this.room)
      .then((id) => {
        this.agentId = id;
        store.log(this.room, { kind: "system", label: "Reasoning on Groq", detail: `${llm.model} · stored agent vllo-${this.room}`, status: "done" });
      })
      .catch((e) => {
        console.error(`[${this.room}] stored agent failed`, e.message);
        store.log(this.room, { kind: "system", label: "Groq agent unavailable, using AssemblyAI managed model", detail: String(e.message).slice(0, 160), status: "warn" });
      })
      .finally(() => this.connect(false));
  }

  private connect(resume: boolean) {
    this.ready = false;
    const ws = new WebSocket(AAI_URL, { headers: { Authorization: `Bearer ${process.env.ASSEMBLYAI_API_KEY}` } });
    this.upstream = ws;
    let gotEnded = false;

    ws.on("open", () => {
      if (resume && this.sessionId) {
        ws.send(JSON.stringify({ type: "session.resume", session_id: this.sessionId }));
        return;
      }
      if (this.agentId) {
        ws.send(JSON.stringify({ type: "session.update", session: { agent_id: this.agentId } }));
        return;
      }
      ws.send(JSON.stringify({
        type: "session.update",
        session: {
          system_prompt: this.prompt,
          greeting: greeting(this.room),
          tools: AGENT_TOOLS,
          input: { format: { encoding: "audio/pcm" }, keyterms: KEYTERMS },
          output: { voice: process.env.VLLO_VOICE || "charles", format: { encoding: "audio/pcm" } },
        },
      }));
    });

    ws.on("message", (raw) => {
      let ev: any;
      try { ev = JSON.parse(String(raw)); } catch { return; }
      if (ev.type === "session.ended") gotEnded = true;
      this.onUpstream(ev, ws);
    });

    ws.on("close", () => {
      if (this.upstream !== ws) return;
      this.ready = false;
      if (gotEnded || this.state.status === "ENDED") return;
      if (this.state.status === "LIVE" && this.sessionId && !this.resumed) {
        this.resumed = true;
        store.log(this.room, { kind: "system", label: "Connection dropped, resuming session", status: "running" });
        return this.connect(true);
      }
      if (this.state.status === "CONNECTING" && this.agentId) {
        this.agentId = null;
        store.log(this.room, { kind: "system", label: "Groq agent rejected, using AssemblyAI managed model", status: "warn" });
        return this.connect(false);
      }
      store.setRoom(this.room, { status: "DISCONNECTED", agentState: "LISTENING" });
      this.sendBrowser({ type: "flush" });
    });
    ws.on("error", (e) => console.error(`[${this.room}] upstream error`, e.message));
  }

  private sendUp(obj: unknown) {
    if (this.upstream?.readyState === WebSocket.OPEN) this.upstream.send(JSON.stringify(obj));
  }

  private forwardAudio(buf: Buffer) {
    if (!this.ready || this.state.status !== "LIVE") return;
    this.sendUp({ type: "input.audio", audio: buf.toString("base64") });
  }

  private holdTimer: NodeJS.Timeout | null = null;

  private flushIfIdle(force = false) {
    if (!this.pendingResults.length) return;
    if (!force && this.lastEvent !== "reply.done") {
      // Held because the interviewee started talking. If no reply follows, the agent is waiting on us: release.
      if (this.lastEvent !== "reply.started" && !this.holdTimer) {
        this.holdTimer = setTimeout(() => {
          this.holdTimer = null;
          if (this.lastEvent !== "reply.started") this.flushIfIdle(true);
        }, 1500);
      }
      return;
    }
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = null;
    for (const t of this.pendingResults) {
      this.sendUp({ type: "tool.result", call_id: t.call_id, result: JSON.stringify(t.result) });
    }
    this.pendingResults = [];
  }

  private onUpstream(ev: any, ws: WebSocket) {
    const room = this.room;
    switch (ev.type) {
      case "session.ready":
        this.ready = true;
        this.sessionId = ev.session_id;
        if (!this.resumed) {
          const cap = Number(process.env.VLLO_MAX_SECONDS || 240) * 1000;
          if (this.capTimer) clearTimeout(this.capTimer);
          this.capTimer = setTimeout(() => {
            if (this.state.status !== "LIVE" || this.ending) return;
            store.log(room, { kind: "end", label: "Time limit reached", status: "warn" });
            this.ending = "time_limit";
            this.sendUp({ type: "reply.create", instructions: "Say only: Thank you. We have reached the time for this interview." });
            this.scheduleFinish(7000);
          }, cap);
        }
        store.setRoom(room, { status: "LIVE", agentState: "SPEAKING" });
        if (!this.resumed) store.log(room, { kind: "system", label: "Session live", detail: `AssemblyAI Voice Agent · ${ev.session_id}`, status: "done" });
        else store.log(room, { kind: "system", label: "Session resumed", status: "done" });
        break;

      case "session.error":
        console.error(`[${room}] session.error`, ev.code, ev.message, ev.param ?? "");
        if (!this.ready && this.agentId && !["at_capacity", "concurrency_exceeded"].includes(ev.code)) {
          this.agentId = null;
          store.log(room, { kind: "system", label: "Groq agent rejected, using AssemblyAI managed model", detail: ev.message, status: "warn" });
          this.upstream = null;
          ws.close();
          this.connect(false);
          return;
        }
        store.log(room, { kind: "system", label: `Session error · ${ev.code}`, detail: ev.message, status: "error" });
        break;

      case "input.speech.started":
        this.lastEvent = ev.type;
        store.setRoom(room, { agentState: "LISTENING" });
        break;

      case "transcript.user.delta":
        store.setRoom(room, { userPartial: ev.text ?? "" });
        break;

      case "transcript.user": {
        const text = String(ev.text ?? "").trim();
        store.setRoom(room, { userPartial: "", agentState: "THINKING" });
        if (!text) break;
        store.say(room, "interviewee", text);
        store.log(room, { kind: "heard", label: text, status: "done" });
        this.bufferHeard(text);
        const trigger = checkUserTranscript(text);
        if (trigger && !this.ending) {
          this.trigger = trigger;
          store.guard(room, trigger.toUpperCase(), "ENDED", `"${text}"`);
          setTimeout(() => {
            if (!this.ending && this.state.status === "LIVE") {
              store.log(room, { kind: "end", label: "Server ended session (rights backstop)", detail: trigger.replace(/_/g, " "), status: "warn" });
              this.finish(trigger);
            }
          }, 4000);
        }
        break;
      }

      case "reply.started":
        this.lastEvent = ev.type;
        this.captionReply = ev.reply_id;
        store.setRoom(room, { agentState: "THINKING" });
        break;

      case "reply.audio":
        if (this.browser?.readyState === WebSocket.OPEN) this.browser.send(Buffer.from(ev.data, "base64"), { binary: true });
        if (this.state.agentState !== "SPEAKING") store.setRoom(room, { agentState: "SPEAKING" });
        break;

      case "transcript.agent.delta":
        if (ev.reply_id !== this.captionReply) {
          this.captionReply = ev.reply_id;
          store.setRoom(room, { caption: "" });
        }
        store.setRoom(room, { caption: (this.state.caption ? this.state.caption + " " : "") + ev.delta });
        break;

      case "transcript.agent": {
        const text = String(ev.text ?? "").trim();
        if (!text) break;
        store.setRoom(room, { caption: text });
        this.lastAgentText = text;
        store.say(room, "agent", text, !!ev.interrupted);
        store.log(room, { kind: "said", label: text, status: ev.interrupted ? "warn" : "done", interrupted: !!ev.interrupted });
        const breach = checkAgentTranscript(text, room);
        if (breach && !this.ending) {
          store.guard(room, breach, "FLAGGED", `Agent said: "${text}"`);
          if (!this.flagged) {
            this.flagged = true;
            this.prompt += REMINDER;
            this.sendUp({ type: "session.update", session: { system_prompt: this.prompt } });
          }
        }
        break;
      }

      case "reply.done":
        this.lastEvent = ev.type;
        if (ev.status === "interrupted") {
          this.pendingResults = [];
          this.sendBrowser({ type: "flush" });
          store.log(room, { kind: "system", label: "Interrupted, listening", status: "warn" });
          store.setRoom(room, { agentState: "LISTENING" });
        } else {
          this.flushIfIdle();
          store.setRoom(room, { agentState: "LISTENING" });
          if (this.ending && !this.pendingResults.length && !String(ev.reply_id ?? "").startsWith("fc-")) {
            this.scheduleFinish(1800);
          }
        }
        break;

      case "tool.call": {
        store.setRoom(room, { agentState: "THINKING" });
        let result: unknown;
        const callId = ev.call_id;
        try {
          result = handleTool(room, ev.name, ev.arguments ?? {}, this.toolCtx());
        } catch (e: any) {
          console.error(`[${room}] tool ${ev.name} failed`, e);
          result = { error: `Tool failed: ${e.message}. Continue the interview.` };
        }
        if (result instanceof Promise) {
          result.then((r) => {
            this.pendingResults.push({ call_id: callId, result: r });
            this.flushIfIdle();
          });
        } else {
          this.pendingResults.push({ call_id: callId, result });
          this.flushIfIdle();
        }
        break;
      }

      case "session.ended":
        this.markEnded(this.ending ?? this.state.endReason ?? "declined");
        break;
    }
  }

  /** Investigator steering: context only, the agent still has to pass the question gate. */
  direct(text: string) {
    if (this.state.status !== "LIVE") return;
    this.sendUp({ type: "conversation.message", role: "system", content: `Investigator direction: ${text.slice(0, 400)}. Follow it on your next question, within all conduct rules.` });
    store.log(this.room, { kind: "system", label: "Investigator direction", detail: text.slice(0, 400), status: "done" });
  }

  private scheduleFinish(ms: number) {
    if (this.endTimer) clearTimeout(this.endTimer);
    this.endTimer = setTimeout(() => this.finish(this.ending ?? "declined"), ms);
  }

  finish(reason: string) {
    if (this.state.status === "ENDED") return;
    this.ending = reason;
    if (this.endTimer) clearTimeout(this.endTimer);
    this.sendUp({ type: "session.end" });
    this.markEnded(reason);
    const ws = this.upstream;
    setTimeout(() => ws?.close(), 2500);
  }

  private markEnded(reason: string) {
    if (this.state.status === "ENDED") return;
    if (this.capTimer) clearTimeout(this.capTimer);
    this.flushHeard();
    releaseApproval(this.room);
    this.ready = false;
    store.setRoom(this.room, { status: "ENDED", agentState: "LISTENING", endReason: reason, endedAt: Date.now() });
    store.log(this.room, { kind: "end", label: `Interview ended · ${reason.replace(/_/g, " ")}`, status: reason === "objectives_complete" ? "done" : "warn" });
    this.sendBrowser({ type: "ended", reason });
    onRoomEnded?.();
  }

  hardReset() {
    if (this.capTimer) clearTimeout(this.capTimer);
    if (this.heardTimer) clearTimeout(this.heardTimer);
    this.heardBuffer = [];
    releaseApproval(this.room);
    if (this.endTimer) clearTimeout(this.endTimer);
    if (this.state.status === "LIVE") this.sendUp({ type: "session.end" });
    const ws = this.upstream;
    this.upstream = null;
    ws?.close();
    this.ready = false;
    this.sessionId = null;
    this.pendingResults = [];
    this.ending = null;
    this.sendBrowser({ type: "flush" });
  }
}

let onRoomEnded: (() => void) | undefined;
export function setOnRoomEnded(fn: () => void) {
  onRoomEnded = fn;
}
