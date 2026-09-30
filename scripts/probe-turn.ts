// End-to-end text probe: real stored agent (Groq), real extractor, real conflict engine. No audio.
import "dotenv/config";
import WebSocket from "ws";
import { agentFor } from "../server/agents.js";
import { store } from "../server/caseStore.js";
import { extractClaims } from "../server/extractor.js";
import { AGENT_TOOLS, drainPending, handleTool } from "../server/tools.js";
import { greeting, systemPrompt } from "../server/prompt.js";
const MANAGED = process.argv[2] === "managed";

const TURNS: { text: string; before?: () => void }[] = [
  { text: "I finished work at half eight and drove my own car straight home. I was alone." },
  {
    text: "Okay, it was Tunde's car. Mine was at the mechanic.",
    before: () => handleTool("tunde", "record_claim", { subject: "car_handover", about: "tunde", value: "lent_to_daniel", quote: "I lent Daniel my Corolla on Monday" }, ctx),
  },
  { text: "Wait, I went back to the warehouse for my charger, around five past nine. Five minutes." },
  { text: "I want a lawyer." },
];

const ctx = { end: (r: string) => console.log(ts(), "END_INTERVIEW", r), inject: () => {} };
const id = MANAGED ? "" : await agentFor("daniel");
store.rooms.daniel.startedAt = store.rooms.tunde.startedAt = Date.now();
store.rooms.daniel.status = "LIVE";
const ws = new WebSocket("wss://agents.assemblyai.com/v1/ws", { headers: { Authorization: `Bearer ${process.env.ASSEMBLYAI_API_KEY}` } });
const t0 = Date.now();
const ts = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
let last = "", pending: any[] = [], turn = 0, idle: NodeJS.Timeout | null = null, lastAgent = "";
const flush = () => {
  if (last !== "reply.done") return;
  for (const p of pending) ws.send(JSON.stringify({ type: "tool.result", call_id: p.call_id, result: JSON.stringify(p.result) }));
  pending = [];
};
store.on("pending", () => {
  const items = drainPending("daniel");
  if (!items.length) return;
  const lines = items.map((c) => `${c.id} (${c.type}, ${c.topic}): ${c.challenge_hint}`).join(" ");
  console.log(ts(), "CASE UPDATE ->", lines.slice(0, 160));
  ws.send(JSON.stringify({ type: "conversation.message", role: "system", content: `Case update. ${lines} Raise it in the challenge phase with an open, neutral question. Never say where the information came from.` }));
});
const nextTurn = async () => {
  if (turn >= TURNS.length) {
    console.log("\nclaims:", store.claims.map((c) => `${c.id}[${c.room}] ${c.subject}=${c.value}${c.time ? "@" + c.time : ""}${c.status === "REVISED" ? "(revised)" : ""}`).join(" | "));
    console.log("conflicts:", store.conflicts.map((c) => `${c.id}:${c.rule}:${c.status}`).join(" "));
    console.log("guardrails:", store.guardrails.map((g) => `${g.action}:${g.rule}`).join(" "));
    ws.send(JSON.stringify({ type: "session.end" }));
    return;
  }
  const t = TURNS[turn++];
  t.before?.();
  console.log(`\n${ts()} DANIEL: ${t.text}`);
  ws.send(JSON.stringify({ type: "conversation.message", role: "user", content: t.text }));
  ws.send(JSON.stringify({ type: "reply.create" }));
  const e0 = Date.now();
  const claims = await extractClaims("daniel", t.text, lastAgent);
  console.log(ts(), `EXTRACT (${Date.now() - e0}ms)`, JSON.stringify(claims));
  for (const c of claims) handleTool("daniel", "record_claim", c, ctx);
};
const armIdle = () => {
  if (idle) clearTimeout(idle);
  idle = setTimeout(nextTurn, 9000);
};
setTimeout(() => process.exit(1), 180000);

ws.on("open", () =>
  ws.send(JSON.stringify({ type: "session.update", session: MANAGED ? { system_prompt: systemPrompt("daniel"), greeting: greeting("daniel"), tools: AGENT_TOOLS, output: { voice: "charles" } } : { agent_id: id } })),
);
ws.on("message", (raw) => {
  const ev = JSON.parse(String(raw));
  if (["reply.audio", "transcript.agent.delta", "session.updated"].includes(ev.type)) return;
  if (!["tool.call", "transcript.agent"].includes(ev.type)) console.log(ts(), "  ev", ev.type, ev.status ?? "", ev.code ?? "");
  if (ev.type === "tool.call") {
    const result = handleTool("daniel", ev.name, ev.arguments, ctx);
    console.log(ts(), "TOOL", ev.name, JSON.stringify(ev.arguments).slice(0, 200), "->", JSON.stringify(result).slice(0, 160));
    pending.push({ call_id: ev.call_id, result });
    flush();
    armIdle();
    return;
  }
  if (ev.type === "reply.started") last = ev.type;
  if (ev.type === "reply.done") { last = ev.type; flush(); armIdle(); }
  if (ev.type === "transcript.agent") { lastAgent = ev.text; console.log(ts(), "AGENT:", ev.text); }
  if (ev.type === "session.error") console.log(ts(), "ERROR", ev.code, ev.message);
  if (ev.type === "session.ended") process.exit(0);
});
