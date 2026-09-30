import WebSocket from "ws";
import { store } from "./caseStore.js";
import { checkAgentTranscript, checkUserTranscript, END_WORDS } from "./guardrails.js";
import { greeting, systemPrompt } from "./prompt.js";
import { handleTool, TOOLS } from "./tools.js";
import type { RoomId } from "./types.js";

const AAI_URL = "wss://agents.assemblyai.com/v1/ws";
const REMINDER = "\n\nReminder: never accuse, never reveal sources or name other interviewees, never pressure.";

function llmConfig() {
  const key = process.env.GROQ_API_KEY;
  if (!key || process.env.VLLO_LLM === "managed") return undefined;
  return [{ base_url: "https://api.groq.com/openai/v1", model: process.env.GROQ_MODEL || "openai/gpt-oss-120b", api_key: key }];
}

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
  private useLlm = true;
  private flagged = false;
  private prompt = "";

  constructor(readonly room: RoomId) {
    store.on("change", () => this.pushRoomState());
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
      if (msg.type === "stop") this.finish("declined");
    });
    ws.on("close", () => {
      if (this.browser === ws) this.browser = null;
    });
    this.pushRoomState();
  }

  private sendBrowser(obj: unknown) {
    if (this.browser?.readyState === WebSocket.OPEN) this.browser.send(JSON.stringify(obj));
  }

  pushRoomState() {
    const r = this.state;
    const p = store.snapshot().case.interviewees.find((x: any) => x.id === this.room);
    this.sendBrowser({
      type: "room",
      room: { id: r.id, name: p.name, status: r.status, agentState: r.agentState, caption: r.caption, endReason: r.endReason, endWords: r.endReason ? END_WORDS[r.endReason] : undefined, greeting: greeting(this.room) },
    });
  }

  start() {
    if (this.state.status === "LIVE" || this.state.status === "CONNECTING") return;
    if (!process.env.ASSEMBLYAI_API_KEY) {
      store.log(this.room, { kind: "system", label: "ASSEMBLYAI_API_KEY missing on server", status: "error" });
      return;
    }
    this.ending = null;
    this.resumed = false;
    this.flagged = false;
    this.prompt = systemPrompt(this.room);
    store.setRoom(this.room, { status: "CONNECTING", caption: "", userPartial: "", endReason: undefined, startedAt: Date.now(), endedAt: undefined });
    this.connect(false);
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
      const llm = this.useLlm ? llmConfig() : undefined;
      ws.send(JSON.stringify({
        type: "session.update",
        session: {
          system_prompt: this.prompt,
          greeting: greeting(this.room),
          tools: TOOLS,
          input: {
            format: { encoding: "audio/pcm" },
            keyterms: ["Tunde", "Daniel", "Corolla", "Admiralty Way", "Lekki", "warehouse", "Ajah", "Lekki Phase 1"],
          },
          output: { voice: process.env.VLLO_VOICE || "charles", format: { encoding: "audio/pcm" } },
          ...(llm ? { llm } : {}),
        },
      }));
      if (llm) store.log(this.room, { kind: "system", label: "Reasoning on Groq", detail: llm[0].model, status: "done" });
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
      if (this.state.status === "CONNECTING" && this.useLlm && llmConfig()) {
        this.useLlm = false;
        store.log(this.room, { kind: "system", label: "Custom LLM rejected, using AssemblyAI managed model", status: "warn" });
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

  private flushIfIdle() {
    if (this.lastEvent !== "reply.done" || !this.pendingResults.length) return;
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
        store.setRoom(room, { status: "LIVE", agentState: "SPEAKING" });
        if (!this.resumed) store.log(room, { kind: "system", label: "Session live", detail: `AssemblyAI Voice Agent · ${ev.session_id}`, status: "done" });
        else store.log(room, { kind: "system", label: "Session resumed", status: "done" });
        break;

      case "session.error":
        console.error(`[${room}] session.error`, ev.code, ev.message, ev.param ?? "");
        if (!this.ready && this.useLlm && llmConfig() && (String(ev.param ?? "").includes("llm") || ["invalid_config", "invalid_value", "invalid_format", "agent_init_failed"].includes(ev.code))) {
          this.useLlm = false;
          store.log(room, { kind: "system", label: "Custom LLM rejected, using AssemblyAI managed model", detail: ev.message, status: "warn" });
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
        const trigger = checkUserTranscript(text);
        if (trigger && !this.ending) {
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
        try {
          result = handleTool(room, ev.name, ev.arguments ?? {}, {
            end: (reason) => {
              this.ending = reason;
              this.scheduleFinish(9000);
            },
            inject: (text) => this.sendUp({ type: "conversation.message", role: "system", content: text }),
          });
        } catch (e: any) {
          console.error(`[${room}] tool ${ev.name} failed`, e);
          result = { error: `Tool failed: ${e.message}. Continue the interview.` };
        }
        this.pendingResults.push({ call_id: ev.call_id, result });
        this.flushIfIdle();
        break;
      }

      case "session.ended":
        this.markEnded(this.ending ?? this.state.endReason ?? "declined");
        break;
    }
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
    this.ready = false;
    store.setRoom(this.room, { status: "ENDED", agentState: "LISTENING", endReason: reason, endedAt: Date.now() });
    store.log(this.room, { kind: "end", label: `Interview ended · ${reason.replace(/_/g, " ")}`, status: reason === "objectives_complete" ? "done" : "warn" });
    this.sendBrowser({ type: "ended", reason });
    onRoomEnded?.();
  }

  hardReset() {
    if (this.endTimer) clearTimeout(this.endTimer);
    if (this.state.status === "LIVE") this.sendUp({ type: "session.end" });
    const ws = this.upstream;
    this.upstream = null;
    ws?.close();
    this.ready = false;
    this.sessionId = null;
    this.pendingResults = [];
    this.ending = null;
    this.useLlm = true;
    this.sendBrowser({ type: "flush" });
  }
}

let onRoomEnded: (() => void) | undefined;
export function setOnRoomEnded(fn: () => void) {
  onRoomEnded = fn;
}
