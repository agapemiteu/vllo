import "dotenv/config";
import express from "express";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { RoomBridge, setOnRoomEnded } from "./bridge.js";
import { store } from "./caseStore.js";
import { buildReport } from "./report.js";
import { ROOMS, type RoomId } from "./types.js";

const PORT = Number(process.env.PORT || 8787);
const app = express();
const dist = fileURLToPath(new URL("../dist", import.meta.url));

app.get("/healthz", (_req, res) => res.json({ ok: true }));
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!ws).*/, (_req, res) => res.sendFile(`${dist}/index.html`));
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
        }
        if (msg.type === "close_report") {
          store.report = null;
          store.changed();
        }
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
});
