import type { Claim, Conflict, Gap, RoomId } from "./types.js";
import { ROOMS } from "./types.js";
import type { Store } from "./caseStore.js";
import { CASE, first } from "./caseStore.js";
import { updateCustomObjectives } from "./checker.js";

export const toMin = (t?: string) => {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** The time window the case cares about (the sample: 20:00-22:00). */
const windowOf = () => ({ start: toMin(CASE.window?.start) ?? 0, end: toMin(CASE.window?.end) ?? 1439 });

export const HINTS = {
  R1: "Records place their phone near Admiralty Way at 21:06. Ask them neutrally to help you understand that.",
  R2: "Camera footage shows a specific vehicle near the scene. Ask openly which vehicle they used on Monday evening.",
  R3: "Information suggests they may have used a different vehicle. Ask an open question about the vehicle. Do not say where the information came from.",
  R4: "Information suggests they may not have been alone. Ask openly whether anyone was with them, and when.",
  R5: "Their account has changed on this point. Ask them to clarify which version is accurate, without accusing.",
} as const;

const active = (s: Store) => s.claims.filter((c) => c.status === "ACTIVE");

/** Times overlap within tolerance. Untimed claims describe the whole evening, so they overlap. */
function overlaps(a: Claim, b: Claim, tol: number, requireTimes = false) {
  const ta = toMin(a.time), tb = toMin(b.time);
  if (ta == null || tb == null) return !requireTimes;
  const aEnd = toMin(a.timeEnd) ?? ta, bEnd = toMin(b.timeEnd) ?? tb;
  return ta - tol <= bEnd && tb - tol <= aEnd;
}

export function locationAt(s: Store, person: RoomId, t: string) {
  const tm = toMin(t)!;
  const cands = active(s)
    .filter((c) => c.subject === "location" && c.about === person && toMin(c.time) != null && toMin(c.time)! <= tm)
    .sort((a, b) => toMin(a.time)! - toMin(b.time)! || s.claims.indexOf(a) - s.claims.indexOf(b));
  return cands.at(-1) ?? null;
}

/** Latest ACTIVE claim by creation order. */
function latest(s: Store, pred: (c: Claim) => boolean) {
  return active(s).filter(pred).at(-1) ?? null;
}

const danielAtWarehouse = (s: Store) =>
  active(s).find((c) => {
    const t = toMin(c.time);
    return c.subject === "location" && c.about === "daniel" && c.value === "warehouse_area" && t != null && t >= toMin("20:55")! && t <= toMin("21:15")!;
  }) ?? null;

type Draft = Omit<Conflict, "id" | "status" | "createdAt">;

/**
 * Run every rule. Creates new conflicts (deduped by key), re-evaluates resolution of existing ones,
 * queues new conflicts for delivery to the rooms that should be told. Returns newly created + newly resolved.
 */
export function evaluate(s: Store, triggerRoom: RoomId) {
  // An investigator's own case has no hand-written rules: gaps and objectives here, contradictions in checker.ts.
  if (CASE.custom) {
    s.gaps = computeGaps(s);
    updateCustomObjectives();
    return { created: [] as Conflict[], resolved: [] as Conflict[] };
  }
  const drafts: Draft[] = [];
  const resolvedBy: Record<string, string | null> = {};

  // R1 phone vs stated location at 21:06
  {
    const loc = locationAt(s, "daniel", "21:06");
    if (loc && loc.value !== "warehouse_area") {
      drafts.push({
        key: "R1", rule: "R1", type: "EXTERNAL_CONFLICT", topic: "phone location 21:06",
        claimIds: [loc.id], evidenceIds: ["E2"], rooms: ["daniel"],
        summary: `${first("daniel")} places himself at "${loc.value.replace(/_/g, " ")}" (${loc.time}), but his phone hit a mast 400m from the warehouse at 21:06.`,
        challengeHint: HINTS.R1,
      });
    }
    resolvedBy.R1 = danielAtWarehouse(s)?.id ?? null;
  }

  // R2 vehicle vs CCTV + registry
  const danVehicle = latest(s, (c) => c.subject === "vehicle" && c.about === "daniel" && c.room === "daniel");
  {
    // Any vehicle other than the Corolla (own car, taxi, bike...) contradicts the camera.
    if (danVehicle && danVehicle.value !== "tunde_corolla" && danVehicle.value !== "unknown") {
      const how = danVehicle.value === "own_car" ? "he drove his own car" : `he used ${danVehicle.value === "other" ? `another vehicle ("${danVehicle.quote}")` : danVehicle.value.replace(/_/g, " ")}`;
      drafts.push({
        key: "R2", rule: "R2", type: "EXTERNAL_CONFLICT", topic: "vehicle",
        claimIds: [danVehicle.id], evidenceIds: ["E1", "E3"], rooms: ["daniel"],
        summary: `${first("daniel")} says ${how}. CCTV shows ${first("tunde")}'s grey Corolla leaving Admiralty Way at 21:17.`,
        challengeHint: HINTS.R2,
      });
    }
    resolvedBy.R2 = danVehicle?.value === "tunde_corolla" ? danVehicle.id : null;
  }

  // R3 vehicle cross-account
  const handover = latest(s, (c) => c.subject === "car_handover" && c.room === "tunde");
  {
    if (danVehicle?.value === "own_car" && handover?.value === "lent_to_daniel") {
      drafts.push({
        key: "R3", rule: "R3", type: "CROSS_ACCOUNT_CONFLICT", topic: "vehicle",
        claimIds: [danVehicle.id, handover.id], evidenceIds: [], rooms: ["daniel"],
        summary: `${first("daniel")}: "${danVehicle.quote}". ${first("tunde")}: "${handover.quote}".`,
        challengeHint: HINTS.R3,
      });
    }
    if (danVehicle?.value === "tunde_corolla") resolvedBy.R3 = danVehicle.id;
    else if (handover && handover.value !== "lent_to_daniel") resolvedBy.R3 = handover.id;
    else resolvedBy.R3 = null;
  }

  // R4 companion cross-account (pairwise)
  const comps = active(s).filter((c) => c.subject === "companion");
  for (const a of comps) {
    const aNames = a.value === other(a.room);
    if (!aNames) continue;
    for (const b of comps) {
      if (b.room === a.room || b.value !== "none") continue;
      if (!overlaps(a, b, 20)) continue;
      drafts.push({
        key: `R4:${b.id}`, rule: "R4", type: "CROSS_ACCOUNT_CONFLICT", topic: "co-presence",
        claimIds: [a.id, b.id], evidenceIds: [], rooms: [b.room],
        summary: `${name(a.room)} says they were together${a.time ? ` at ${a.time}` : ""} ("${a.quote}"). ${name(b.room)} says they were alone ("${b.quote}").`,
        challengeHint: HINTS.R4,
      });
    }
  }

  // R5 self-contradiction (pairwise, same room/subject/about)
  const act = active(s);
  for (let i = 0; i < act.length; i++) {
    for (let j = i + 1; j < act.length; j++) {
      const a = act[i], b = act[j];
      if (a.room !== b.room || a.subject !== b.subject || a.about !== b.about || a.value === b.value) continue;
      if (a.subject === "other" || a.subject === "car_handover") continue;
      if (b.revises) continue;
      const isLoc = a.subject === "location";
      if (!overlaps(a, b, isLoc ? 10 : 15, isLoc)) continue;
      drafts.push({
        key: `R5:${a.id}:${b.id}`, rule: "R5", type: "INTERNAL_CONFLICT", topic: a.subject.replace("_", " "),
        claimIds: [a.id, b.id], evidenceIds: [], rooms: [a.room],
        summary: `${name(a.room)} first said "${a.quote}", later "${b.quote}".`,
        challengeHint: HINTS.R5,
      });
    }
  }

  const created: Conflict[] = [];
  for (const d of drafts) {
    if (s.conflicts.some((c) => c.key === d.key)) continue;
    const c: Conflict = { ...d, id: s.nextId("K"), status: "OPEN", createdAt: s.clock(triggerRoom) };
    s.conflicts.push(c);
    created.push(c);
    for (const r of c.rooms) s.pending[r].push(c.id);
  }

  // Resolution
  const resolved: Conflict[] = [];
  for (const c of s.conflicts) {
    if (c.status !== "OPEN") continue;
    let by: string | null = null;
    if (c.rule === "R1" || c.rule === "R2" || c.rule === "R3") by = resolvedBy[c.rule] ?? null;
    else if (c.rule === "R4") {
      const [a, b] = c.claimIds.map((id) => s.claim(id)!);
      if (a.status === "REVISED") by = a.revisedBy!;
      else if (b.status === "REVISED") by = b.revisedBy!;
      else {
        const fix = latest(s, (x) => x.room === b.room && x.subject === "companion" && x.value === a.room && s.claims.indexOf(x) > s.claims.indexOf(b));
        by = fix?.id ?? null;
      }
    } else if (c.rule === "R5") {
      const gone = c.claimIds.map((id) => s.claim(id)!).find((x) => x.status === "REVISED");
      by = gone?.revisedBy ?? null;
    }
    if (by) {
      c.status = "RESOLVED";
      c.resolvedBy = by;
      resolved.push(c);
      for (const r of ROOMS) s.pending[r] = s.pending[r].filter((id) => id !== c.id);
    }
  }

  s.gaps = computeGaps(s);
  updateObjectives(s);
  if (created.length) s.emit("pending");
  return { created, resolved };
}

function other(r: RoomId): RoomId {
  return r === "daniel" ? "tunde" : "daniel";
}
function name(r: RoomId) {
  return first(r);
}

export function computeGaps(s: Store): Gap[] {
  const gaps: Gap[] = [];
  for (const p of ROOMS) {
    const spans = active(s)
      .filter((c) => c.about === p && toMin(c.time) != null)
      .map((c) => [toMin(c.time)!, toMin(c.timeEnd) ?? toMin(c.time)!] as [number, number])
      .filter(([a, b]) => b >= windowOf().start && a <= windowOf().end)
      .sort((x, y) => x[0] - y[0]);
    let cursor: number | null = null;
    for (const [a, b] of spans) {
      if (cursor != null && a - cursor > 20) gaps.push({ person: p, from: fmt(cursor), to: fmt(a), minutes: a - cursor });
      cursor = cursor == null ? b : Math.max(cursor, b);
    }
  }
  return gaps;
}

function updateObjectives(s: Store) {
  const open = (rule: string) => s.conflicts.some((c) => c.rule === rule && c.status === "OPEN");
  const hasTimed = (p: RoomId) => active(s).some((c) => c.about === p && toMin(c.time) != null);
  const vehicleStated =
    !!latest(s, (c) => c.subject === "vehicle" && c.about === "daniel") &&
    !!latest(s, (c) => c.room === "tunde" && (c.subject === "car_handover" || c.subject === "vehicle"));
  const compFrom = (r: RoomId) => active(s).some((c) => c.room === r && c.subject === "companion");

  const done: Record<string, boolean> = {
    O1: hasTimed("daniel") && hasTimed("tunde") && s.gaps.length === 0,
    O2: vehicleStated && !open("R2") && !open("R3"),
    O3: !!danielAtWarehouse(s),
    O4: compFrom("daniel") && compFrom("tunde") && !open("R4"),
  };
  for (const o of s.objectives) o.resolved = !!done[o.id];
}
