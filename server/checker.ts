/**
 * Contradiction checking for an investigator's own case, where there are no hand-written rules.
 * A model compares the newest statements against the typed evidence, the person's earlier statements
 * and the other person's account. Its answer is validated: only ids we sent back are accepted,
 * and the question it proposes goes through the same redaction as the built-in rules.
 */
import { CASE, first, store } from "./caseStore.js";
import { redact } from "./guardrails.js";
import type { Conflict, RoomId } from "./types.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM = `You check an investigative interview for contradictions. You get the case, the evidence, every statement recorded so far (id, speaker, time, content) and the ids of the NEWEST statements.

Report only clear contradictions that involve at least one of the newest statements:
- "evidence": a statement cannot be true if the evidence is accurate (different place, time, vehicle, person or action).
- "self": the same speaker said two things that cannot both be true.
- "other_person": two people describe the same moment in ways that cannot both be true.
Do not report vague differences, missing detail or things that could both be true.

Also list ids of OPEN contradictions that the newest statements now clearly explain or retract.

Return JSON only: {"conflicts":[{"kind":"evidence|self|other_person","claim_ids":["C1"],"evidence_ids":["E1"],"topic":"2-4 words","summary":"one factual sentence, may name people","question":"one short, open, neutral question the interviewer can ask the speaker of the newest statement; never accuse, never name anyone else, never say where the information came from"}],"resolved":["K1"]}. Use empty arrays when there is nothing.`;

const TYPE: Record<string, Conflict["type"]> = { evidence: "EXTERNAL_CONFLICT", self: "INTERNAL_CONFLICT", other_person: "CROSS_ACCOUNT_CONFLICT" };

export async function checkCustomConflicts(room: RoomId, newIds: string[]) {
  const key = process.env.GROQ_API_KEY;
  if (!key || !newIds.length) return;
  const active = store.claims.filter((c) => c.status === "ACTIVE");
  const openConflicts = store.conflicts.filter((c) => c.status === "OPEN");
  const payload = [
    `Case: ${CASE.title}. ${CASE.summary ?? ""} Incident: ${CASE.incident?.date ?? ""} ${CASE.incident?.time ?? ""} at ${CASE.incident?.location ?? ""}.`,
    `Evidence:\n${(CASE.evidence ?? []).map((e: any) => `${e.id}: ${e.detail}`).join("\n") || "(none)"}`,
    `Statements:\n${active.map((c) => `${c.id} [${first(c.room)}, about ${first(c.about)}]${c.time ? ` ${c.time}` : ""} ${c.subject}: ${c.value} ("${c.quote}")`).join("\n")}`,
    `Open contradictions:\n${openConflicts.map((c) => `${c.id}: ${c.summary}`).join("\n") || "(none)"}`,
    `Newest statements: ${newIds.join(", ")}`,
  ].join("\n\n");

  let parsed: any = null;
  for (const model of [process.env.GROQ_EXTRACT_MODEL || "openai/gpt-oss-20b", "qwen/qwen3.8-27b", "openai/gpt-oss-120b"]) {
    try {
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({ model, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: payload }] }),
      });
      if (!res.ok) continue;
      const data: any = await res.json();
      parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
      break;
    } catch {
      /* next model */
    }
  }
  if (!parsed) return;

  const claimIds = new Set(store.claims.map((c) => c.id));
  const evidenceIds = new Set((CASE.evidence ?? []).map((e: any) => e.id));
  const newest = new Set(newIds);
  let created = 0;

  for (const k of Array.isArray(parsed.conflicts) ? parsed.conflicts.slice(0, 3) : []) {
    const type = TYPE[k?.kind];
    const cids = (Array.isArray(k?.claim_ids) ? k.claim_ids : []).map(String).filter((id: string) => claimIds.has(id));
    const eids = (Array.isArray(k?.evidence_ids) ? k.evidence_ids : []).map(String).filter((id: string) => evidenceIds.has(id));
    if (!type || !cids.some((id: string) => newest.has(id))) continue;
    if (type === "EXTERNAL_CONFLICT" && !eids.length) continue;
    if (type !== "EXTERNAL_CONFLICT" && cids.length < 2) continue;
    const dedupe = `AI:${[...cids, ...eids].sort().join(",")}`;
    if (store.conflicts.some((c) => c.key === dedupe)) continue;
    const question = redact(String(k?.question ?? "").slice(0, 240)) || "Help me understand this part of your account.";
    const c: Conflict = {
      id: store.nextId("K"),
      key: dedupe,
      rule: "AI",
      type,
      topic: String(k?.topic ?? "account").slice(0, 40),
      claimIds: cids,
      evidenceIds: eids,
      rooms: [room],
      status: "OPEN",
      summary: String(k?.summary ?? "").slice(0, 300) || "Two accounts of the same moment do not match.",
      challengeHint: `Ask along these lines, neutrally: ${question}`,
      createdAt: store.clock(room),
    };
    store.conflicts.push(c);
    store.pending[room].push(c.id);
    store.log(room, { kind: "conflict", label: `${type.replace(/_/g, " ").toLowerCase()} · ${c.topic}`, detail: c.summary, refs: [c.id, ...cids, ...eids], status: "warn" });
    created++;
  }

  const latest = newIds[newIds.length - 1];
  for (const id of Array.isArray(parsed.resolved) ? parsed.resolved.map(String) : []) {
    const c = store.conflicts.find((x) => x.id === id && x.status === "OPEN");
    if (!c) continue;
    c.status = "RESOLVED";
    c.resolvedBy = latest;
    for (const r of c.rooms) store.log(r, { kind: "resolved", label: `Resolved ${c.id} · ${c.topic}`, detail: `by ${latest}`, refs: [c.id, latest], status: "done" });
  }

  updateCustomObjectives();
  if (created) store.emit("pending");
  store.changed();
}

/** Objectives for an investigator's own case: simple, checkable conditions. */
export function updateCustomObjectives() {
  const active = store.claims.filter((c) => c.status === "ACTIVE");
  const timed = (r: RoomId) => active.filter((c) => c.about === r && c.time).length;
  const registered = (["daniel", "tunde"] as RoomId[]).filter((r) => store.registered[r] || active.some((c) => c.room === r));
  const done: Record<string, boolean> = {
    O1: registered.length > 0 && registered.every((r) => timed(r) >= 2) && store.gaps.length === 0,
    O2: active.length >= 3 && !store.conflicts.some((c) => c.status === "OPEN" && c.type === "EXTERNAL_CONFLICT"),
    O3: active.some((c) => c.subject === "companion"),
  };
  for (const o of store.objectives) o.resolved = !!done[o.id];
}
