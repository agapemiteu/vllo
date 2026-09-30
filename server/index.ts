import "dotenv/config";
import express from "express";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { RoomBridge, setOnRoomEnded } from "./bridge.js";
import { store } from "./caseStore.js";
import { buildReport } from "./report.js";
import { decide, releaseApproval } from "./tools.js";
import { agentFor, groqLlm } from "./agents.js";
import { ROOMS, type RoomId } from "./types.js";

const PORT = Number(process.env.PORT || 8787);
const app = express();
const dist = fileURLToPath(new URL("../dist", import.meta.url));

app.get("/healthz", (_req, res) => res.json({ ok: true }));
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!ws).*/, (_req, res) => res.sendFile(`${dist}/index.html`));
}

/** Persist the full session (state + report) so it can be reopened or audited later. */
function saveSession() {
  const dir = fileURLToPath(new URL("../sessions", import.meta.url));
  mkdirSync(dir, { recursive: true });
  const file = `${dir}/case024-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify({ ...store.snapshot(), report: store.report }, null, 2));
  console.log(`session saved: ${file}`);
}

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });
const bridges = Object.fromEntries(ROOMS.map((r) => [r, new RoomBridge(r)])) as Record<RoomId, RoomBridge>;
const consoles = new Set<WebSocket>();

const broadcast = () => {
  const msg = JSON.stringify({ type: "snapshot", state: store.snapshot() });
  for (const c of consoles) if (c.readyState === c.OPEN) c.send(msg);
};
store.on("change", broadcast);

setOnRoomEnded(() => {
  if (ROOMS.every((r) => store.rooms[r].status === "ENDED")) {
    store.report = buildReport();
    store.changed();
    saveSession();
  }
});

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://x");
  const m = /^\/ws\/room\/(daniel|tunde)$/.exec(url.pathname);
  if (m) {
    return wss.handleUpgrade(req, socket, head, (ws) => bridges[m[1] as RoomId].attachBrowser(ws));
  }
  if (url.pathname === "/ws/console") {
    return wss.handleUpgrade(req, socket, head, (ws) => {
      consoles.add(ws);
      ws.send(JSON.stringify({ type: "snapshot", state: store.snapshot() }));
      ws.on("close", () => consoles.delete(ws));
      ws.on("message", (data) => {
        let msg: any;
        try { msg = JSON.parse(String(data)); } catch { return; }
        if (msg.type === "report") {
          store.report = buildReport();
          store.changed();
          saveSession();
        }
        if (msg.type === "close_report") {
          store.report = null;
          store.changed();
        }
        const room = msg.room as RoomId;
        if (msg.type === "mode" && bridges[room] && (msg.mode === "auto" || msg.mode === "assisted")) {
          store.setRoom(room, { mode: msg.mode });
          store.log(room, { kind: "system", label: msg.mode === "assisted" ? "Assisted mode: investigator approves each question" : "Autonomous mode", status: "done" });
          if (msg.mode === "auto") releaseApproval(room);
        }
        if (msg.type === "decide" && bridges[room]) decide(room, { decision: msg.decision, question: msg.question, note: msg.note });
        if (msg.type === "direct" && bridges[room] && typeof msg.text === "string" && msg.text.trim()) bridges[room].direct(msg.text.trim());
        if (msg.type === "end_room" && bridges[msg.room as RoomId]) bridges[msg.room as RoomId].finish("investigator");
        if (msg.type === "reset") {
          for (const b of Object.values(bridges)) b.hardReset();
          store.reset();
        }
      });
    });
  }
  socket.destroy();
});

server.listen(PORT, () => {
  console.log(`vllo server on :${PORT}`);
  if (!process.env.ASSEMBLYAI_API_KEY) console.warn("ASSEMBLYAI_API_KEY is not set");
  if (!process.env.GROQ_API_KEY) console.warn("GROQ_API_KEY is not set: managed LLM, no web research");
  if (groqLlm() && process.env.ASSEMBLYAI_API_KEY) {
    for (const r of ROOMS)
      agentFor(r).then(
        (id) => console.log(`stored agent vllo-${r}: ${id}`),
        (e) => console.error(`stored agent vllo-${r} failed: ${e.message}`),
      );
  }
  if (process.env.VLLO_SEED === "1") import("../scripts/seed.js").then((m) => m.seed());
});
