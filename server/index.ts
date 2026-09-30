import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { setOnRoomEnded, upstreamLog } from "./bridge.js";
import { CASE, restoreDefaultPeople, sampleCase, store } from "./caseStore.js";
import { runIn } from "./context.js";
import { buildReport } from "./report.js";
import { evaluate } from "./conflicts.js";
import { customCase } from "./casefile.js";
import { reportPdf } from "./reportPdf.js";
import { sendReportEmail } from "./email.js";
import { afterSlot, startReason } from "./schedule.js";
import { agentFor, agentLlm } from "./agents.js";
import { allWorkspaces, getWorkspace, SLOT, type Workspace } from "./workspace.js";
import { ROOMS, type RoomId } from "./types.js";

const PORT = Number(process.env.PORT || 8787);
const app = express();
const dist = fileURLToPath(new URL("../dist", import.meta.url));

// Never let one bad request or socket take the whole server down.
process.on("unhandledRejection", (e) => console.error("unhandled rejection", e));
process.on("uncaughtException", (e) => console.error("uncaught exception", e));

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown, min: number, max: number, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

// The client may be hosted on another origin (Vercel); allow it to call the API.
app.use("/api", (req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return void res.status(204).end();
  next();
});

app.get("/healthz", (_req, res) => res.json({ ok: true }));

/** Resolve the workspace in the URL and run the rest of the request inside it. */
type WReq = Request & { ws: Workspace; room?: RoomId };
const ctxOf = (req: unknown): WReq => req as WReq;
const inWorkspace = (req: Request, res: Response, next: NextFunction) => {
  const w = getWorkspace(String(req.params.ws), created);
  if (!w) return void res.status(400).json({ error: "invalid or unavailable workspace" });
  ctxOf(req).ws = w;
  runIn(w, next);
};
const w = express.Router({ mergeParams: true });
// The person slot (p1/p2) in any workspace route.
w.param("slot", (req, res, next, value) => {
  const room = SLOT[String(value)];
  if (!room) return void res.status(400).json({ error: "unknown person slot" });
  ctxOf(req).room = room;
  next();
});
app.use("/api/w/:ws", inWorkspace, w);

/** Set up the case: the built-in sample, or the investigator's own. Not while an interview is running. */
w.post("/case", express.json({ limit: "64kb" }), (req, res) => {
  const ws = (ctxOf(req)).ws;
  if (ROOMS.some((r) => ["LIVE", "CONNECTING"].includes(store.rooms[r].status)))
    return void res.status(409).json({ error: "An interview is in progress. End it before changing the case." });
  const b = req.body ?? {};
  let file: any;
  if (b.mode === "custom") {
    const made = customCase(b);
    if ("error" in made) return void res.status(400).json(made);
    file = made.file;
  } else file = sampleCase();
  for (const r of ROOMS) ws.bridges[r].hardReset();
  store.caseFile = file;
  store.reset();
  for (const r of ROOMS) {
    store.registered[r] = false;
    Object.assign(store.plan[r], { scheduledAt: undefined, after: undefined, armed: false, checkedIn: false });
    ws.photos.delete(r);
    store.photos[r] = 0;
  }
  store.changed();
  res.json({ ok: true, custom: !!file.custom });
});

/**
 * Register a person into slot p1/p2 with when and how long to interview them.
 * start: "join" (on check-in) | "in" (inSec) | "after" (afterSlot ends, plus gapSec)
 */
w.post("/register/:slot", express.json({ limit: "32kb" }), (req, res) => {
  const { ws, room: id } = ctxOf(req);
  const room = id!;
  const b = req.body ?? {};
  const name = str(b.name, 60);
  if (!name) return void res.status(400).json({ error: "A name is required." });
  if (["LIVE", "CONNECTING"].includes(store.rooms[room].status))
    return void res.status(409).json({ error: "This person's interview is in progress." });
  // A finished (or failed) interview's slot is reused: clear that person's old session first.
  if (store.rooms[room].status !== "IDLE" || store.claims.some((c) => c.room === room)) {
    ws.bridges[room].hardReset();
    store.resetRoom(room);
    evaluate(store, room);
  }
  const p = CASE.interviewees.find((x: any) => x.id === room);
  p.name = name;
  p.relation = str(b.relation, 120) || (CASE.custom ? "Person of interest" : p.relation);
  p.on_file = str(b.notes, 600);
  const plan = store.plan[room];
  plan.durationSec = num(b.durationSec, 45, 300, 90);
  plan.email = EMAIL.test(str(b.email, 200)) ? str(b.email, 200) : undefined;
  plan.after = undefined;
  plan.scheduledAt = undefined;
  plan.armed = false;
  const other = SLOT[str(b.afterSlot, 10)];
  if (b.start === "in") plan.scheduledAt = Date.now() + num(b.inSec, 5, 24 * 3600, 60) * 1000;
  else if (b.start === "after" && other && other !== room && store.registered[other]) {
    plan.after = { room: other, gapSec: num(b.gapSec, 5, 600, 60) };
    if (store.rooms[other].status === "ENDED") plan.scheduledAt = Date.now() + plan.after.gapSec * 1000;
  } else plan.armed = true;
  store.registered[room] = true;
  store.changed();
  res.json({ ok: true });
});

// Photos, shared by every page and device in the workspace (and put in the report).
w.post("/photo/:slot", express.json({ limit: "3mb" }), (req, res) => {
  const { ws, room } = ctxOf(req);
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.dataUrl ?? ""));
  if (!m) return void res.status(400).json({ error: "Expected a JPEG, PNG or WebP image." });
  const buf = Buffer.from(m[2], "base64");
  if (buf.length < 100 || buf.length > 2_000_000) return void res.status(400).json({ error: "Image is empty or too large." });
  ws.photos.set(room!, buf);
  store.photos[room!] = Date.now();
  store.changed();
  res.json({ ok: true, version: store.photos[room!] });
});
w.delete("/photo/:slot", (req, res) => {
  const { ws, room } = ctxOf(req);
  ws.photos.delete(room!);
  store.photos[room!] = 0;
  store.changed();
  res.json({ ok: true });
});
w.get("/photo/:slot", (req, res) => {
  const { ws, room } = ctxOf(req);
  const buf = ws.photos.get(room!);
  if (!buf) return void res.status(404).end();
  res.set("Cache-Control", "no-cache").type(buf[0] === 0x89 ? "png" : "jpeg").send(buf);
});

/** The interview report as a PDF file. */
w.get("/report/:slot.pdf", async (req, res, next) => {
  try {
    const { ws, room } = ctxOf(req);
    const pdf = await reportPdf(ws, room!);
    const who = String(CASE.interviewees.find((p: any) => p.id === room)?.name ?? "interview").replace(/[^A-Za-z0-9]+/g, "-");
    res.set("Content-Disposition", `${req.query.inline ? "inline" : "attachment"}; filename="vllo-report-${who}.pdf"`);
    res.type("pdf").send(pdf);
  } catch (e) {
    next(e);
  }
});

/** Email the PDF report. Falls back cleanly when no mail provider is configured. */
w.post("/email/:slot", express.json({ limit: "8kb" }), async (req, res, next) => {
  try {
    const { ws, room } = ctxOf(req);
    const to = str(req.body?.to, 200);
    if (!EMAIL.test(to)) return void res.status(400).json({ error: "That email address doesn't look right." });
    const now = Date.now();
    ws.emails = ws.emails.filter((t) => now - t < 10 * 60 * 1000);
    if (ws.emails.length >= 5) return void res.status(429).json({ error: "Too many emails in a short time. Try again in a few minutes." });
    const pdf = await reportPdf(ws, room!);
    const result = await sendReportEmail(to, room!, pdf);
    if (result.ok) ws.emails.push(now);
    res.status(result.ok ? 200 : result.status).json(result);
  } catch (e) {
    next(e);
  }
});

w.get("/debug/:slot", (req, res) => {
  const { ws, room } = ctxOf(req);
  res.type("text").send((upstreamLog[`${ws.id}/${room}`] ?? []).join("\n"));
});

if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!ws|api).*/, (_req, res) => res.sendFile(`${dist}/index.html`));
}

app.use("/api", (_req, res) => res.status(404).json({ error: "not found" }));
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = Number(err?.status ?? err?.statusCode);
  if (status >= 400 && status < 500) {
    if (!res.headersSent) res.status(status).json({ error: status === 413 ? "That upload is too large." : "The request couldn't be read." });
    return;
  }
  console.error("request failed", err);
  if (!res.headersSent) res.status(500).json({ error: "Something went wrong. Please try again." });
});

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 512 * 1024 });

const broadcast = (ws: Workspace) => {
  if (!ws.consoles.size) return;
  const msg = JSON.stringify({ type: "snapshot", state: ws.store.snapshot() });
  for (const c of ws.consoles) if (c.readyState === c.OPEN) c.send(msg);
};
function created(ws: Workspace) {
  ws.store.on("change", () => runIn(ws, () => broadcast(ws)));
}

setOnRoomEnded(() => {
  // "After X ends": schedule whoever is waiting on the room that just finished.
  for (const r of ROOMS) {
    const a = store.plan[r].after;
    const at = afterSlot(store.plan[r], !!a && store.rooms[a.room].status === "ENDED", store.rooms[r], Date.now());
    if (at) store.plan[r].scheduledAt = at;
  }
  // Report as soon as any interview ends; it covers everyone interviewed so far.
  store.report = buildReport();
  store.changed();
});

function onConsoleMessage(ws: Workspace, raw: string) {
  let msg: any;
  try { msg = JSON.parse(raw); } catch { return; }
  if (!msg || typeof msg !== "object" || typeof msg.type !== "string") return;
  const room = SLOT[String(msg.room)];
  switch (msg.type) {
    case "report":
      store.report = buildReport();
      store.changed();
      break;
    case "close_report":
      store.report = null;
      store.changed();
      break;
    case "start_room":
      if (!room) return;
      // An interview cut off by a lost connection can be restarted; what was said so far is kept.
      if (store.rooms[room].status === "DISCONNECTED") {
        ws.bridges[room].hardReset();
        store.setRoom(room, { status: "IDLE", agentState: "LISTENING", caption: "", userPartial: "" });
        store.plan[room].checkedIn = false;
      }
      if (store.rooms[room].status !== "IDLE") return;
      // Not checked in yet: arm it, so it starts the moment they join.
      if (store.plan[room].checkedIn) ws.bridges[room].kickoff("investigator");
      else {
        store.plan[room].armed = true;
        store.plan[room].scheduledAt = undefined;
        store.plan[room].after = undefined;
        store.log(room, { kind: "system", label: `Starts as soon as ${String(CASE.interviewees.find((p: any) => p.id === room)?.name ?? "they").split(" ")[0]} checks in`, status: "done" });
      }
      break;
    case "end_room":
      if (room) ws.bridges[room].finish("investigator");
      break;
    case "mode":
      if (room && (msg.mode === "auto" || msg.mode === "assisted")) store.setRoom(room, { mode: msg.mode });
      break;
    case "direct":
      if (room && typeof msg.text === "string" && msg.text.trim()) ws.bridges[room].direct(msg.text.trim().slice(0, 400));
      break;
    case "reset":
      for (const r of ROOMS) ws.bridges[r].hardReset();
      store.reset();
      if (msg.full) {
        store.caseFile = sampleCase();
        store.reset();
        restoreDefaultPeople();
        for (const r of ROOMS) {
          store.registered[r] = false;
          Object.assign(store.plan[r], { scheduledAt: undefined, after: undefined, armed: false, checkedIn: false });
          ws.photos.delete(r);
          store.photos[r] = 0;
        }
      }
      for (const r of ROOMS) if ((store.plan[r].scheduledAt ?? Infinity) <= Date.now()) store.plan[r].scheduledAt = undefined;
      store.changed();
      break;
  }
}

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://x");
  // /ws/w/<workspace>/room/<slot> and /ws/w/<workspace>/console; the old single-workspace paths map to "demo".
  let m = /^\/ws\/w\/([a-z0-9]+)\/(room|console)(?:\/([a-z0-9]+))?$/.exec(url.pathname);
  if (!m) {
    const legacy = /^\/ws\/(room|console)(?:\/(daniel|tunde))?$/.exec(url.pathname);
    if (legacy) m = [url.pathname, "demoworkspace", legacy[1], legacy[2]] as unknown as RegExpExecArray;
  }
  const ws = m ? getWorkspace(m[1], created) : null;
  const room = m?.[3] ? SLOT[m[3]] : undefined;
  if (!m || !ws || (m[2] === "room" && !room)) return void socket.destroy();

  wss.handleUpgrade(req, socket, head, (sock) =>
    runIn(ws, () => {
      sock.on("error", () => {});
      if (m![2] === "room") return ws.bridges[room!].attachBrowser(sock);
      ws.consoles.add(sock);
      sock.send(JSON.stringify({ type: "snapshot", state: ws.store.snapshot() }));
      sock.on("close", () => ws.consoles.delete(sock));
      sock.on("message", (data) =>
        runIn(ws, () => {
          ws.lastActive = Date.now();
          try {
            onConsoleMessage(ws, String(data));
          } catch (e) {
            console.error(`[${ws.id}] console message failed`, e);
          }
        }),
      );
    }),
  );
});

// Scheduler: every workspace, every second.
setInterval(() => {
  for (const ws of allWorkspaces()) {
    runIn(ws, () => {
      for (const r of ROOMS) {
        const why = startReason(store.plan[r], store.rooms[r], Date.now());
        if (!why) continue;
        store.plan[r].armed = false;
        try {
          ws.bridges[r].kickoff(why);
        } catch (e) {
          console.error(`[${ws.id}/${r}] kickoff failed`, e);
        }
      }
    });
  }
}, 1000);

server.listen(PORT, () => {
  console.log(`vllo server on :${PORT}`);
  if (!process.env.ASSEMBLYAI_API_KEY) console.warn("ASSEMBLYAI_API_KEY is not set");
  if (!process.env.GROQ_API_KEY) console.warn("GROQ_API_KEY is not set: no claim extraction or web checks");
  if (!process.env.BREVO_API_KEY || !process.env.REPORT_FROM_EMAIL) console.warn("BREVO_API_KEY or REPORT_FROM_EMAIL not set: report email falls back to download");
  if (agentLlm() && process.env.ASSEMBLYAI_API_KEY) {
    for (const r of ROOMS)
      agentFor(r).then(
        (id) => console.log(`stored agent vllo-${r}: ${id}`),
        (e) => console.error(`stored agent vllo-${r} failed: ${e.message}`),
      );
  }
});
