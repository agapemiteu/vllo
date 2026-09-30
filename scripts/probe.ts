// Connectivity probe: stored Groq agent session + one web research call. No audio.
import "dotenv/config";
import WebSocket from "ws";
import { ensureAgent } from "../server/agents.js";
import { webResearch } from "../server/research.js";

const t0 = Date.now();
const r = await webResearch("driving distance Ajah to Admiralty Way Lekki", "Check travel time plausibility").catch((e) => ({ summary: `ERROR ${e.message}`, sources: [] }));
console.log(`research (${Date.now() - t0}ms):`, r.summary, r.sources.map((s) => s.url));

const id = await ensureAgent("daniel");
console.log("stored agent:", id);
const ws = new WebSocket("wss://agents.assemblyai.com/v1/ws", { headers: { Authorization: `Bearer ${process.env.ASSEMBLYAI_API_KEY}` } });
const timer = setTimeout(() => { console.log("timeout"); process.exit(1); }, 25000);
let words = "";
ws.on("open", () => ws.send(JSON.stringify({ type: "session.update", session: { agent_id: id } })));
ws.on("message", (raw) => {
  const ev = JSON.parse(String(raw));
  if (ev.type === "reply.audio") return;
  if (ev.type === "transcript.agent.delta") { words += ev.delta + " "; return; }
  console.log("<-", ev.type, ev.code ?? "", ev.message ?? "", ev.type === "session.ready" ? `llm=${JSON.stringify(ev.config?.llm)}` : "", ev.type === "transcript.agent" ? ev.text : "");
  if (ev.type === "reply.done") setTimeout(() => ws.send(JSON.stringify({ type: "session.end" })), 500);
  if (ev.type === "session.ended") { clearTimeout(timer); process.exit(0); }
});
ws.on("close", (c, why) => { console.log("closed", c, String(why)); process.exit(0); });
