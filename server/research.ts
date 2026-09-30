/**
 * Web intelligence via Groq models with built-in web search (gpt-oss browser_search or compound).
 * Runs async: the interview never waits on it. Findings are pushed back into the agent's context.
 */
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export interface ResearchResult {
  summary: string;
  sources: { title: string; url: string }[];
}

export async function webResearch(query: string, purpose: string): Promise<ResearchResult> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not set");
  const model = process.env.GROQ_RESEARCH_MODEL || "openai/gpt-oss-20b";

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(40_000),
    body: JSON.stringify({
      model,
      temperature: 0.2,
      // gpt-oss models on Groq ship a built-in browser tool; compound models search natively.
      ...(model.startsWith("openai/gpt-oss") ? { tools: [{ type: "browser_search" }], tool_choice: "required" } : {}),
      messages: [
        {
          role: "system",
          content:
            "You are a research analyst supporting an investigative interview in Lagos, Nigeria. Search the web and return only verifiable facts relevant to the purpose: distances, travel times, opening hours, what a place is, where it is. Three sentences maximum, plain text, no speculation about any person's guilt. If nothing reliable is found, say so in one sentence.",
        },
        { role: "user", content: `Query: ${query}\nPurpose: ${purpose}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  const msg = data.choices?.[0]?.message ?? {};
  const summary = String(msg.content ?? "").trim() || "No reliable information found.";

  const sources: ResearchResult["sources"] = [];
  const seen = new Set<string>();
  for (const t of msg.executed_tools ?? []) {
    for (const r of [...(t?.search_results?.results ?? []), ...(t?.browser_results ?? [])]) {
      if (r?.url && !seen.has(r.url) && sources.length < 4) {
        seen.add(r.url);
        sources.push({ title: String(r.title ?? r.url).slice(0, 90), url: r.url });
      }
    }
  }
  if (!sources.length) {
    for (const m of summary.matchAll(/https?:\/\/[^\s)\]]+/g)) {
      if (!seen.has(m[0]) && sources.length < 4) {
        seen.add(m[0]);
        sources.push({ title: new URL(m[0]).hostname, url: m[0] });
      }
    }
  }
  return { summary: summary.replace(/https?:\/\/[^\s)\]]+/g, "").replace(/\s+/g, " ").trim(), sources };
}
