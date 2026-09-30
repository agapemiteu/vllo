import { CASE, store } from "./caseStore.js";
import { END_WORDS } from "./guardrails.js";
import { insights } from "./insights.js";
import { ROOMS } from "./types.js";

const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** Deterministic: built only from recorded state. No model calls. */
export function buildReport() {
  const claim = (id: string) => store.claim(id);
  const interviews = ROOMS.map((r) => {
    const room = store.rooms[r];
    const p = CASE.interviewees.find((x: any) => x.id === r);
    const dur = room.startedAt ? (room.endedAt ?? Date.now()) - room.startedAt : 0;
    return {
      id: r,
      name: p.name,
      relation: p.relation,
      status: room.status,
      duration: mmss(dur),
      endReason: room.endReason ? END_WORDS[room.endReason] ?? room.endReason : "In progress",
      claims: store.claims.filter((c) => c.room === r).length,
    };
  });

  const conflicts = store.conflicts.map((c) => ({
    id: c.id,
    rule: c.rule,
    type: c.type,
    topic: c.topic,
    status: c.status,
    summary: c.summary,
    resolvedBy: c.resolvedBy,
    evidence: c.evidenceIds,
    statements: c.claimIds.map((id) => {
      const cl = claim(id)!;
      return { id, speaker: cl.room, quote: cl.quote, at: mmss(cl.saidAt), time: cl.time, status: cl.status };
    }),
  }));

  const timeline = ROOMS.map((r) => ({
    person: r,
    entries: store.claims
      .filter((c) => c.about === r && c.time)
      .sort((a, b) => a.time!.localeCompare(b.time!))
      .map((c) => ({ id: c.id, time: c.time, timeEnd: c.timeEnd, subject: c.subject, value: c.value, status: c.status, speaker: c.room, at: mmss(c.saidAt) })),
  }));

  return {
    generatedAt: new Date().toISOString(),
    title: `Case ${CASE.case_id} · ${CASE.title}`,
    modes: { daniel: store.rooms.daniel.mode, tunde: store.rooms.tunde.mode },
    incident: CASE.incident,
    interviews,
    totals: {
      claims: store.claims.length,
      conflicts: conflicts.length,
      resolved: conflicts.filter((c) => c.status === "RESOLVED").length,
      open: conflicts.filter((c) => c.status === "OPEN").length,
      revisions: store.revisions.length,
      blocked: store.guardrails.filter((g) => g.action === "BLOCKED").length,
    },
    timeline,
    evidence: CASE.evidence,
    conflicts,
    revisions: store.revisions.map((v) => ({ ...v, at: mmss(v.at) })),
    objectives: store.objectives,
    leads: store.leads.map((l) => ({ ...l, at: mmss(l.at) })),
    research: store.intel.filter((i) => i.status === "done"),
    guardrails: store.guardrails.map((g) => ({ ...g, at: mmss(g.at) })),
    insights: insights(store),
    principle: "vllo reports conflicts between statements and evidence. It does not assess truthfulness, emotion, or guilt.",
  };
}
