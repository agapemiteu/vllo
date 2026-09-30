// A custom LLM is only allowed on stored agents, so each room gets a stored agent, upserted once at boot.
import { greeting, systemPrompt } from "./prompt.js";
import { AGENT_TOOLS } from "./tools.js";
import type { RoomId } from "./types.js";

const BASE = "https://agents.assemblyai.com/v1/agents";
const KEYTERMS = ["Tunde", "Daniel", "Corolla", "Admiralty Way", "Lekki", "warehouse", "Ajah", "Lekki Phase 1"];

const headers = () => ({ Authorization: process.env.ASSEMBLYAI_API_KEY!, "Content-Type": "application/json" });

/**
 * The voice agent's brain. VLLO_LLM:
 *  gateway (default) - AssemblyAI LLM Gateway (Claude, GPT, Gemini) billed to the AssemblyAI account
 *  groq              - Groq, needs a tier above the free 8k tokens/min
 *  managed           - AssemblyAI's built-in model, inline session config
 */
export function agentLlm() {
  const mode = process.env.VLLO_LLM || "gateway";
  if (mode === "gateway" && process.env.ASSEMBLYAI_API_KEY)
    return { base_url: "https://llm-gateway.assemblyai.com/v1", model: process.env.VLLO_GATEWAY_MODEL || "claude-sonnet-4-6", api_key: process.env.ASSEMBLYAI_API_KEY };
  if (mode === "groq" && process.env.GROQ_API_KEY)
    return { base_url: "https://api.groq.com/openai/v1", model: process.env.GROQ_MODEL || "openai/gpt-oss-120b", api_key: process.env.GROQ_API_KEY };
  return undefined;
}

const ids = new Map<RoomId, string>();
const ready = new Map<RoomId, Promise<string>>();

/** Upsert once (at boot or first use), then reuse. */
export function agentFor(room: RoomId) {
  if (!ready.has(room)) {
    const p = ensureAgent(room);
    p.catch(() => ready.delete(room));
    ready.set(room, p);
  }
  return ready.get(room)!;
}

/** Upsert the stored agent for a room and return its id. */
export async function ensureAgent(room: RoomId): Promise<string> {
  const llm = agentLlm();
  if (!llm) throw new Error("no custom LLM configured");
  const voice = process.env.VLLO_VOICE || "charles";
  const body = {
    name: `vllo-${room}`,
    system_prompt: systemPrompt(room),
    greeting: greeting(room),
    voice: { voice_id: voice },
    input: { format: { encoding: "audio/pcm", sample_rate: 24000 }, keyterms: KEYTERMS },
    output: { voice, format: { encoding: "audio/pcm", sample_rate: 24000 } },
    tools: AGENT_TOOLS.map(({ type: _t, ...t }) => t),
    llm: [llm],
  };

  let id = ids.get(room);
  if (!id) {
    const list = await fetch(BASE, { headers: headers(), signal: AbortSignal.timeout(10_000) });
    if (!list.ok) throw new Error(`list agents ${list.status}: ${(await list.text()).slice(0, 200)}`);
    const data: any = await list.json();
    const arr: any[] = Array.isArray(data) ? data : data.agents ?? data.data ?? [];
    id = arr.find((a) => a.name === body.name)?.id;
  }

  const res = await fetch(id ? `${BASE}/${id}` : BASE, {
    method: id ? "PUT" : "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`${id ? "update" : "create"} agent ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const agent: any = await res.json();
  ids.set(room, agent.id);
  return agent.id;
}
