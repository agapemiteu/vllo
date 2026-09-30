// End-to-end: streams synthesized speech into the running server exactly like a browser mic, and prints the console trail.
// Usage: server running (npm run dev), then: npx tsx scripts/e2e.ts [room] [host]
import { readFileSync } from "node:fs";
import WebSocket from "ws";

const room = process.argv[2] ?? "daniel";
const host = process.argv[3] ?? "ws://localhost:8787";
// "seq": just check in and wait for the server to start it (someone registered it already)
const seqMode = process.argv[4] === "seq";
// workspace (5th arg) and URL slot for the room
const workspace = process.argv[5] ?? "e2etest01";
const slot = room === "daniel" ? "p1" : "p2";
// 6th arg: recording set to play (defaults to the role name, e.g. daniel1..4.wav)
const voice = process.argv[6] ?? room;
const files = [1, 2, 3, 4].map((i) => new URL(`./audio/${voice}${i}.wav`, import.meta.url));
const pcm = files.map((f) => readFileSync(f).subarray(44)); // strip WAV header
const CHUNK = 4800; // 100 ms at 24 kHz, 16-bit mono
const silence = Buffer.alloc(CHUNK);
const t0 = Date.now();
const ts = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

const sock = new WebSocket(`${host}/ws/w/${workspace}/room/${slot}`);
const con = new WebSocket(`${host}/ws/w/${workspace}/console`);
let seen = 0, agentLines = 0;
con.on("message", (raw) => {
  const msg = JSON.parse(String(raw));
  if (msg.type !== "snapshot") return;
  const acts = msg.state.activity.filter((a: any) => a.room === room);
  for (const a of acts.slice(seen)) {
    if (a.status === "running") continue;
    if (a.kind === "said") agentLines++;
    console.log(ts(), a.kind.padEnd(8), a.label.slice(0, 110), a.detail ? `| ${String(a.detail).slice(0, 90)}` : "");
    seen++;
  }
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function stream(buf: Buffer) {
  for (let i = 0; i < buf.length; i += CHUNK) {
    sock.send(buf.subarray(i, i + CHUNK));
    await sleep(100);
  }
}
async function silenceUntil(pred: () => boolean, maxMs: number) {
  const end = Date.now() + maxMs;
  while (Date.now() < end && !pred()) {
    sock.send(silence);
    await sleep(100);
  }
}

sock.on("open", async () => {
  // Real flow: the room device checks in, the investigator schedules a slot, the scheduler kicks it off.
  sock.send(JSON.stringify({ type: "checkin" }));
  await sleep(300);
  if (!seqMode) con.send(JSON.stringify({ type: "start_room", room: slot }));
  console.log(ts(), seqMode ? "checked in, waiting for the sequence" : "checked in, slot in 5s");
  await silenceUntil(() => agentLines >= 1, seqMode ? 420000 : 40000);
  await silenceUntil(() => false, 1500);
  for (let i = 0; i < pcm.length; i++) {
    console.log(`\n${ts()} >>> streaming line ${i + 1}`);
    const before = agentLines;
    await stream(pcm[i]);
    await silenceUntil(() => agentLines > before, 30000);
    await silenceUntil(() => false, 2500);
  }
  await silenceUntil(() => false, 8000);
  const snap = await new Promise<any>((r) => con.once("message", (m) => r(JSON.parse(String(m)).state)));
  console.log("\nstatus:", snap.rooms[room].status, snap.rooms[room].endReason ?? "");
  console.log("claims:", snap.claims.map((c: any) => `${c.id} ${c.subject}=${c.value}${c.time ? "@" + c.time : ""}${c.status === "REVISED" ? "(rev)" : ""}`).join(" | "));
  console.log("conflicts:", snap.conflicts.map((c: any) => `${c.id}:${c.rule}:${c.status}`).join(" "));
  console.log("guardrails:", snap.guardrails.map((g: any) => `${g.action}:${g.rule}`).join(" "));
  process.exit(0);
});
setTimeout(() => process.exit(1), seqMode ? 720000 : 240000);
