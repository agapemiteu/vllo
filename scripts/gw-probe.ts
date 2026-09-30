import "dotenv/config";
import { AGENT_TOOLS } from "../server/tools.js";
const tools = AGENT_TOOLS.map(({ type: _t, ...t }) => ({ type: "function", function: t }));
async function run(label: string, model: string, messages: any[], withTools = true) {
  const r = await fetch("https://llm-gateway.assemblyai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: process.env.ASSEMBLYAI_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, ...(withTools ? { tools } : {}), max_tokens: 200 }),
  });
  const t = await r.text();
  console.log(label, model, r.status, t.slice(0, 220).replace(/\s+/g, " "));
}
const base = [{ role: "system", content: "You are an interviewer." }, { role: "assistant", content: "Hello." }, { role: "user", content: "I drove home at 8." }];
const midSystem = [...base.slice(0, 2), { role: "system", content: "Case update: ask about the vehicle." }, base[2]];
for (const m of ["claude-sonnet-4-6", "gpt-5.1", "gemini-3.5-flash"]) {
  await run("tools      ", m, base);
  await run("midSystem  ", m, midSystem, false);
}
