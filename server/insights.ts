import type { Store } from "./caseStore.js";
import { first } from "./caseStore.js";
import { locationAt, toMin } from "./conflicts.js";
import type { Claim, RoomId } from "./types.js";

const pretty = (v?: string | null) => (v ?? "").replace(/_/g, " ");
const active = (s: Store) => s.claims.filter((c) => c.status === "ACTIVE");
const latest = (s: Store, f: (c: Claim) => boolean) => active(s).filter(f).at(-1) ?? null;

export interface Fact {
  id: string;
  text: string;
  status: "corroborated" | "single_source";
  sources: string[];
}

export interface Comparison {
  topic: string;
  daniel: { text: string; claimId?: string } | null;
  tunde: { text: string; claimId?: string } | null;
  evidence?: string;
  verdict: "agree" | "diverge" | "one_account" | "none";
}

/** Facts: statements that at least one account makes and that another account or the evidence supports. */
export function facts(s: Store): Fact[] {
  const out: Fact[] = [];
  const danVehicle = latest(s, (c) => c.subject === "vehicle" && c.about === "daniel");
  const handover = latest(s, (c) => c.subject === "car_handover" && c.room === "tunde");
  if (danVehicle?.value === "tunde_corolla" || handover?.value === "lent_to_daniel") {
    const src = [danVehicle?.value === "tunde_corolla" ? danVehicle.id : null, handover?.value === "lent_to_daniel" ? handover.id : null].filter(Boolean) as string[];
    out.push({ id: "F-car", text: `${first("daniel")} had ${first("tunde")}'s grey Corolla on Monday evening`, status: src.length > 1 ? "corroborated" : "single_source", sources: [...src, "E1", "E3"] });
  }
  const scene = active(s).find((c) => c.subject === "location" && c.about === "daniel" && c.value === "warehouse_area" && (toMin(c.time) ?? 0) >= toMin("20:55")! && (toMin(c.time) ?? 9999) <= toMin("21:15")!);
  if (scene) out.push({ id: "F-scene", text: `${first("daniel")} was near the warehouse at ${scene.time}`, status: "corroborated", sources: [scene.id, "E2"] });

  const dc = latest(s, (c) => c.subject === "companion" && c.room === "daniel");
  const tc = latest(s, (c) => c.subject === "companion" && c.room === "tunde");
  if (dc?.value === "tunde" && tc?.value === "daniel")
    out.push({ id: "F-together", text: `${first("daniel")} and ${first("tunde")} were together${tc.time ? ` around ${tc.time}` : ""}`, status: "corroborated", sources: [dc.id, tc.id] });

  // Any fact both rooms state identically about the same person
  const seen = new Set(out.flatMap((f) => f.sources));
  for (const a of active(s)) {
    if (a.room !== "daniel" || seen.has(a.id) || a.subject === "other") continue;
    const b = active(s).find((x) => x.room === "tunde" && x.about === a.about && x.subject === a.subject && x.value === a.value && !seen.has(x.id));
    if (b) out.push({ id: `F-${a.id}-${b.id}`, text: `${first(a.about)}: ${pretty(a.subject)} ${pretty(a.value)}${a.time ?? b.time ? ` at ${a.time ?? b.time}` : ""}`, status: "corroborated", sources: [a.id, b.id] });
  }
  return out;
}

function describeLoc(c: Claim | null) {
  return c ? { text: `${pretty(c.value)} at ${c.time}`, claimId: c.id } : null;
}

export function compare(s: Store): Comparison[] {
  const rows: Comparison[] = [];

  const dv = latest(s, (c) => c.subject === "vehicle" && c.about === "daniel" && c.room === "daniel");
  const th = latest(s, (c) => c.room === "tunde" && (c.subject === "car_handover" || (c.subject === "vehicle" && c.about === "daniel")));
  const tSaysCorolla = th && (th.value === "lent_to_daniel" || th.value === "tunde_corolla");
  rows.push({
    topic: `Vehicle ${first("daniel")} used`,
    daniel: dv ? { text: pretty(dv.value), claimId: dv.id } : null,
    tunde: th ? { text: pretty(th.value), claimId: th.id } : null,
    evidence: `E1 CCTV: ${first("tunde")}'s Corolla at 21:17`,
    verdict: verdict(dv, th, () => (dv!.value === "tunde_corolla") === !!tSaysCorolla),
  });

  const dc = latest(s, (c) => c.subject === "companion" && c.room === "daniel");
  const tc = latest(s, (c) => c.subject === "companion" && c.room === "tunde");
  rows.push({
    topic: "Together that evening",
    daniel: dc ? { text: dc.value === "none" ? "alone" : `with ${pretty(dc.value)}`, claimId: dc.id } : null,
    tunde: tc ? { text: tc.value === "none" ? "alone" : `with ${pretty(tc.value)}`, claimId: tc.id } : null,
    verdict: verdict(dc, tc, () => (dc!.value === "none") === (tc!.value === "none")),
  });

  for (const p of ["daniel", "tunde"] as RoomId[]) {
    const own = locationAt(s, p, "21:10");
    const ownFromRoom = own && own.room === p ? own : latest(s, (c) => c.subject === "location" && c.about === p && c.room === p && !!c.time && toMin(c.time)! <= toMin("21:10")!);
    const otherRoom: RoomId = p === "daniel" ? "tunde" : "daniel";
    const fromOther = latest(s, (c) => c.subject === "location" && c.about === p && c.room === otherRoom);
    const d = p === "daniel" ? describeLoc(ownFromRoom) : describeLoc(fromOther);
    const t = p === "daniel" ? describeLoc(fromOther) : describeLoc(ownFromRoom);
    rows.push({
      topic: `${first(p)} at the time of the incident`,
      daniel: d,
      tunde: t,
      evidence: p === "daniel" ? "E2 phone: 400m from warehouse at 21:06" : undefined,
      verdict: d && t ? (d.text.split(" at ")[0] === t.text.split(" at ")[0] ? "agree" : "diverge") : d || t ? "one_account" : "none",
    });
  }
  return rows;
}

function verdict(a: Claim | null, b: Claim | null, same: () => boolean): Comparison["verdict"] {
  if (a && b) return same() ? "agree" : "diverge";
  return a || b ? "one_account" : "none";
}

/** Share of the 20:00-22:00 window between first and last timed statement, minus gaps. */
function coverage(s: Store, p: RoomId) {
  const times = active(s).filter((c) => c.about === p && c.time).flatMap((c) => [toMin(c.time)!, toMin(c.timeEnd) ?? toMin(c.time)!]);
  if (!times.length) return 0;
  const lo = Math.max(20 * 60, Math.min(...times)), hi = Math.min(22 * 60, Math.max(...times));
  const gapMin = s.gaps.filter((g) => g.person === p).reduce((n, g) => n + g.minutes, 0);
  return Math.max(0, Math.round(((hi - lo - gapMin + 10) / 120) * 100));
}

export function metrics(s: Store) {
  const questions = s.activity.filter((a) => a.kind === "gate" && a.status === "done").length;
  return {
    claims: s.claims.length,
    facts: facts(s).filter((f) => f.status === "corroborated").length,
    conflicts: s.conflicts.length,
    resolved: s.conflicts.filter((c) => c.status === "RESOLVED").length,
    questions,
    blocked: s.guardrails.filter((g) => g.action === "BLOCKED").length,
    breaches: s.guardrails.filter((g) => g.action === "FLAGGED").length,
    research: s.intel.filter((i) => i.status === "done").length,
    coverage: { daniel: Math.min(100, coverage(s, "daniel")), tunde: Math.min(100, coverage(s, "tunde")) },
  };
}

export function insights(s: Store) {
  return { facts: facts(s), compare: compare(s), metrics: metrics(s) };
}
