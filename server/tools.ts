import { store } from "./caseStore.js";
import { evaluate, toMin } from "./conflicts.js";
import { checkQuestion, redact } from "./guardrails.js";
import { webResearch } from "./research.js";
import type { Claim, Conflict, Intel, Lead, RoomId, Subject } from "./types.js";

export const TOOLS = [
  {
    type: "function",
    name: "record_claim",
    description:
      "Record a factual claim the interviewee just made. Call this for EVERY stated time, place, vehicle, companion, or car handover, once per fact, before asking your next question. Returns conflicts, timeline gaps and open objectives to guide your next question.",
    parameters: {
      type: "object",
      properties: {
        subject: { type: "string", enum: ["location", "vehicle", "companion", "car_handover", "other"], description: "What the claim is about" },
        about: { type: "string", enum: ["daniel", "tunde"], description: "Whose actions the claim describes (usually the interviewee themselves)" },
        value: {
          type: "string",
          description:
            "location: work | warehouse_area | fuel_station | home | other. vehicle: own_car | tunde_corolla | other | unknown. companion: none | daniel | tunde | other. car_handover: lent_to_daniel | returned_by_daniel | not_lent. other: short free text. Example: 'alone' -> none.",
        },
        time: { type: "string", description: "24h HH:MM if stated or clearly implied (8:30pm -> 20:30, 'around quarter to nine' -> 20:45). Omit if unknown." },
        time_end: { type: "string", description: "Optional end of a stated time range, HH:MM" },
        quote: { type: "string", description: "The interviewee's exact words" },
        revises_claim_id: { type: "string", description: "If this corrects an earlier claim, that claim's id (e.g. C2)" },
      },
      required: ["subject", "about", "value", "quote"],
    },
  },
  {
    type: "function",
    name: "set_next_question",
    description:
      "Submit the exact question you are about to ask, with the reason. You may only speak the question if the result says approved. If not approved, revise and call again.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          enum: ["FREE_ACCOUNT", "NEW_FACT", "MISSING_DETAIL", "INTERNAL_CONFLICT", "EXTERNAL_CONFLICT", "CROSS_ACCOUNT_CONFLICT", "TIMELINE_GAP", "MOTIVE", "CLOSING"],
        },
        source_ids: { type: "array", items: { type: "string" }, description: "Claim, conflict, lead or evidence ids motivating the question" },
        question: { type: "string" },
      },
      required: ["reason", "question"],
    },
  },
  {
    type: "function",
    name: "get_open_items",
    description: "Get unresolved objectives, open conflicts, timeline gaps, your working leads and any research findings for this interview.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "log_lead",
    description:
      "Log a line of inquiry you are forming: a possible motive, opportunity, means, relationship, or lead worth following. Call when something they say opens a new 'why' or 'how'. Leads guide later questions; they are never conclusions about guilt.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["motive", "opportunity", "means", "relationship", "lead"] },
        text: { type: "string", description: "One sentence, neutral. Example: 'Left warehouse job recently; ask how and why employment ended.'" },
        source_ids: { type: "array", items: { type: "string" } },
      },
      required: ["kind", "text"],
    },
  },
  {
    type: "function",
    name: "research",
    description:
      "Start a web search to test whether a stated detail is plausible: a named place, business, route, travel time between two Lagos locations, opening hours. Runs in the background; keep interviewing. Findings arrive later as a system message. Use at most once per new named place or route.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query. Example: 'driving time Ajah to Admiralty Way Lekki evening'" },
        purpose: { type: "string", description: "What this checks. Example: 'Can he get from the fuel station to home by 21:00?'" },
      },
      required: ["query", "purpose"],
    },
  },
  {
    type: "function",
    name: "end_interview",
    description:
      "End the interview. Call immediately if the interviewee asks for a lawyer, refuses to continue, or shows distress, or when all objectives are resolved.",
    parameters: {
      type: "object",
      properties: { reason: { type: "string", enum: ["lawyer_requested", "declined", "welfare", "objectives_complete"] } },
      required: ["reason"],
    },
  },
];

type Decision = { decision: "approve" | "reject"; question?: string; note?: string };
const approvals = new Map<RoomId, (d: Decision) => void>();

/** Investigator decision on a question drafted in assisted mode. */
export function decide(room: RoomId, d: Decision) {
  approvals.get(room)?.(d);
}

/** Room switched back to autonomous, ended or reset: let a held question through so the agent is never stuck. */
export function releaseApproval(room: RoomId) {
  approvals.get(room)?.({ decision: "approve" });
}

/** Tools the voice agent sees. Claims are extracted server-side from every utterance instead. */
/**
 * Tools the voice model sees: none. The managed model sometimes spoke tool calls aloud
 * ("set_next_question{...}"), so everything it needs arrives as between-turn context instead,
 * and the server enforces the rules (question checks, rights stops) itself.
 */
export const AGENT_TOOLS: typeof TOOLS = [];

export interface ToolCtx {
  end: (reason: string) => void;
  inject: (text: string) => void;
}

const VALUE_ALIASES: Record<string, Record<string, string>> = {
  location: { warehouse: "warehouse_area", "the warehouse": "warehouse_area", office: "work", job: "work", "fuel station": "fuel_station", "petrol station": "fuel_station", "filling station": "fuel_station", house: "home" },
  vehicle: { "my car": "own_car", "own car": "own_car", corolla: "tunde_corolla", "tunde's car": "tunde_corolla", "tunde's corolla": "tunde_corolla" },
  companion: { alone: "none", nobody: "none", "no one": "none" },
  car_handover: { lent: "lent_to_daniel", returned: "returned_by_daniel", "not lent": "not_lent" },
};

const ALLOWED: Record<string, string[]> = {
  location: ["work", "warehouse_area", "fuel_station", "home", "other"],
  vehicle: ["own_car", "tunde_corolla", "other", "unknown"],
  companion: ["none", "daniel", "tunde", "other"],
  car_handover: ["lent_to_daniel", "returned_by_daniel", "not_lent"],
};

/** Map loose model output onto the fixed value sets, so the conflict rules never depend on phrasing. */
function normValue(subject: Subject, v: string) {
  const raw = String(v ?? "").trim().toLowerCase();
  if (subject === "other") return String(v).trim();
  const alias = VALUE_ALIASES[subject]?.[raw] ?? raw.replace(/[\s-]+/g, "_");
  if (ALLOWED[subject]?.includes(alias)) return alias;
  const has = (...w: string[]) => w.some((x) => raw.includes(x));
  switch (subject) {
    case "location":
      if (has("warehouse", "admiralty")) return "warehouse_area";
      if (has("work", "job", "shift", "office")) return "work";
      if (has("fuel", "petrol", "filling")) return "fuel_station";
      if (has("home", "house", "flat")) return "home";
      return "other";
    case "vehicle":
      if (has("corolla", "tunde", "friend")) return "tunde_corolla";
      if (has("own", "my car", "mine")) return "own_car";
      return has("unknown", "not sure") ? "unknown" : "other";
    case "companion":
      if (has("alone", "nobody", "no one", "none", "myself")) return "none";
      if (has("tunde")) return "tunde";
      if (has("daniel")) return "daniel";
      return "other";
    case "car_handover":
      if (has("return", "back")) return "returned_by_daniel";
      if (has("not", "never", "didn")) return "not_lent";
      return "lent_to_daniel";
  }
  return alias;
}

function normTime(t?: string) {
  if (!t) return undefined;
  const s = String(t).trim().toLowerCase();
  const m = /^(\d{1,2})(?:[:.]?(\d{2}))?\s*(am|pm)?$/.exec(s);
  if (!m) return undefined;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3] === "pm" && h < 12) h += 12;
  // Case window is the evening: a bare "9:05" or "8" means 21:05 / 20:00.
  if (!m[3] && h >= 1 && h <= 11) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return undefined;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

const agentConflict = (c: Conflict) => ({
  id: c.id,
  type: c.type,
  topic: c.topic,
  challenge_hint: redact(c.challengeHint),
});

export function drainPending(room: RoomId) {
  const ids = store.pending[room];
  store.pending[room] = [];
  return ids.map((id) => store.conflicts.find((c) => c.id === id)!).filter((c) => c?.status === "OPEN").map(agentConflict);
}

function openItems(room: RoomId) {
  return {
    conflicts: store.conflicts.filter((c) => c.status === "OPEN" && c.rooms.includes(room)).map(agentConflict),
    gaps: store.gaps.filter((g) => g.person === room).map(({ from, to, minutes }) => ({ from, to, minutes })),
    open_objectives: store.objectives.filter((o) => !o.resolved).map((o) => `${o.id}: ${o.text}`),
    leads: store.leads.filter((l) => l.room === room).map((l) => `${l.id} ${l.kind}: ${l.text}`),
    research: store.intel.filter((i) => i.room === room && i.status === "done").map((i) => `${i.id}: ${i.summary}`),
  };
}

const SUBJECT_LABEL: Record<string, string> = {
  location: "Location", vehicle: "Vehicle", companion: "Companion", car_handover: "Car handover", other: "Detail",
};

export function handleTool(room: RoomId, name: string, args: any, ctx: ToolCtx): unknown {
  switch (name) {
    case "record_claim": {
      let subject = (["location", "vehicle", "companion", "car_handover", "other"].includes(args.subject) ? args.subject : "other") as Subject;
      const rawVal = String(args.value ?? "").trim().toLowerCase();
      if (["lent_to_daniel", "returned_by_daniel", "not_lent"].includes(rawVal.replace(/[\s-]+/g, "_"))) subject = "car_handover";
      if (subject === "other" && ["daniel", "tunde", "none", "alone"].includes(rawVal)) subject = "companion";
      // Where a car was kept ("mine was at the mechanic") is a detail, not which vehicle they drove.
      if (subject === "vehicle" && /mechanic|garage|workshop|repair/i.test(`${rawVal} ${args.quote ?? ""}`)) {
        subject = "other";
        args = { ...args, value: String(args.value), revises_claim_id: undefined };
      }
      if (subject === "other" && /\bwith (him|daniel|tunde)\b/i.test(String(args.quote ?? ""))) {
        subject = "companion";
        args = { ...args, value: room === "tunde" ? "daniel" : "tunde" };
      }
      const about: RoomId = args.about === "daniel" || args.about === "tunde" ? args.about : room;
      const claim: Claim = {
        id: store.nextId("C"),
        room,
        about,
        subject,
        value: normValue(subject, args.value),
        time: normTime(args.time),
        timeEnd: normTime(args.time_end),
        quote: String(args.quote ?? "").slice(0, 300),
        saidAt: store.clock(room),
        status: "ACTIVE",
      };
      const old = args.revises_claim_id ? store.claim(String(args.revises_claim_id).toUpperCase()) : undefined;
      if (old && old.room === room && old.status === "ACTIVE") {
        claim.revises = old.id;
        old.status = "REVISED";
        old.revisedBy = claim.id;
        store.revisions.push({
          id: store.nextId("V"), room, oldClaimId: old.id, newClaimId: claim.id, subject,
          oldValue: old.value, newValue: claim.value, oldQuote: old.quote, newQuote: claim.quote,
          oldTime: old.time, newTime: claim.time, at: claim.saidAt,
        });
      }
      store.claims.push(claim);
      store.log(room, {
        kind: "claim",
        label: `${SUBJECT_LABEL[subject]}: ${claim.value.replace(/_/g, " ")}${claim.time ? ` at ${claim.time}` : ""}`,
        detail: `"${claim.quote}"`,
        refs: [claim.id],
        status: "done",
      });
      if (claim.revises) {
        store.log(room, { kind: "resolved", label: `Statement revised: ${old!.value.replace(/_/g, " ")} → ${claim.value.replace(/_/g, " ")}`, refs: [old!.id, claim.id], status: "warn" });
      }

      const { created, resolved } = evaluate(store, room);
      const evCount = store.claims.filter((c) => c.status === "ACTIVE").length;
      store.log(room, {
        kind: "check",
        label: "Cross-checked against evidence and both accounts",
        detail: `3 evidence items · ${evCount} active claims · ${created.length} new conflict${created.length === 1 ? "" : "s"}`,
        status: "done",
      });
      for (const c of created) {
        const target = c.rooms[0];
        store.log(target, {
          kind: "conflict",
          label: `${c.type.replace(/_/g, " ").toLowerCase()} · ${c.topic}`,
          detail: c.summary,
          refs: [c.id, ...c.claimIds, ...c.evidenceIds],
          status: "warn",
        });
      }
      for (const c of resolved) {
        for (const r of c.rooms) store.log(r, { kind: "resolved", label: `Resolved ${c.id} · ${c.topic}`, detail: `by ${c.resolvedBy}`, refs: [c.id, c.resolvedBy!], status: "done" });
      }
      store.changed();

      const result: any = {
        claim_id: claim.id,
        conflicts: drainPending(room),
        gaps: store.gaps.filter((g) => g.person === room).map(({ from, to, minutes }) => ({ from, to, minutes })),
        open_objectives: store.objectives.filter((o) => !o.resolved).map((o) => o.id),
      };
      if (!claim.time && ["location", "companion"].includes(subject)) result.missing = "No time recorded for this fact. Ask when, if it matters.";
      return result;
    }

    case "set_next_question": {
      const question = String(args.question ?? "").trim();
      const verdict = checkQuestion(question, room);
      if (!verdict.ok) {
        store.guard(room, verdict.rule, "BLOCKED", question);
        store.log(room, { kind: "blocked", label: `Question blocked · ${verdict.rule.replace(/_/g, " ").toLowerCase()}`, detail: `"${question}"`, status: "error" });
        return { approved: false, violation: verdict.rule, instruction: verdict.instruction };
      }
      const sourceIds = Array.isArray(args.source_ids) ? args.source_ids.map(String) : [];
      const reason = String(args.reason ?? "NEW_FACT");

      // Investigative priority, enforced in code: once the free account is in, open conflicts come first.
      const CONFLICT_REASONS = ["INTERNAL_CONFLICT", "EXTERNAL_CONFLICT", "CROSS_ACCOUNT_CONFLICT"];
      const asked = store.activity.filter((a) => a.room === room && a.kind === "gate" && a.status === "done").length;
      const RANK: Record<string, number> = { CROSS_ACCOUNT_CONFLICT: 0, EXTERNAL_CONFLICT: 1, INTERNAL_CONFLICT: 2 };
      const due = store.conflicts
        .filter((c) => c.status === "OPEN" && c.rooms.includes(room) && !c.challenged)
        .sort((a, b) => RANK[a.type] - RANK[b.type] || a.createdAt - b.createdAt);
      if (CONFLICT_REASONS.includes(reason)) {
        const target = due.find((c) => sourceIds.includes(c.id)) ?? due.find((c) => c.type === reason) ?? due[0];
        if (target) target.challenged = true;
      } else if (asked >= 1 && due.length && reason !== "CLOSING") {
        const c = due[0];
        store.log(room, { kind: "gate", label: `Redirected to ${c.id} · ${c.topic}`, detail: `Open ${c.type.replace(/_/g, " ").toLowerCase()} outranks ${reason.replace(/_/g, " ").toLowerCase()}`, refs: [c.id], status: "warn" });
        return {
          approved: false,
          violation: "PRIORITY",
          instruction: `An open case update must be raised first. ${c.id} (${c.type}, ${c.topic}): ${redact(c.challengeHint)} Ask one open, neutral question about it with reason ${c.type} and source_ids ["${c.id}"], then call set_next_question again.`,
        };
      }
      const approve = (q: string, edited: boolean) => {
        store.setRoom(room, { lastQuestion: { reason, question: q, sourceIds }, approval: undefined });
        store.log(room, {
          kind: "gate",
          label: `${edited ? "Question edited by investigator" : "Question approved"} · ${reason.replace(/_/g, " ").toLowerCase()}`,
          detail: `"${q}"`,
          refs: sourceIds,
          status: "done",
        });
        const pending = drainPending(room);
        const res: any = { approved: true };
        if (edited) res.instruction = `The investigator rewrote your question. Ask exactly this instead: "${q}"`;
        if (pending.length) res.new_conflicts_since_last_check = pending;
        return res;
      };

      if (store.rooms[room].mode !== "assisted") return approve(question, false);

      // Assisted: hold the tool result until the investigator decides.
      const id = store.nextId("Q");
      store.setRoom(room, { approval: { id, reason, question, sourceIds } });
      const act = store.log(room, { kind: "gate", label: `Awaiting investigator · ${reason.replace(/_/g, " ").toLowerCase()}`, detail: `"${question}"`, refs: sourceIds, status: "running" });
      return new Promise((resolve) => {
        approvals.set(room, (d) => {
          approvals.delete(room);
          if (d.decision === "reject") {
            store.setRoom(room, { approval: undefined });
            store.patchActivity(act, { status: "error", label: "Investigator rejected question" });
            const why = d.note ? ` Investigator note: ${d.note}` : "";
            return resolve({ approved: false, violation: "INVESTIGATOR_REJECTED", instruction: `Do not ask that. Choose a different open question.${why}` });
          }
          store.patchActivity(act, { status: "done", label: "Investigator approved" });
          const q = (d.question ?? "").trim();
          if (q && q !== question) {
            const v = checkQuestion(q, room);
            if (!v.ok) store.guard(room, v.rule, "FLAGGED", `Investigator edit: ${q}`);
          }
          resolve(approve(q || question, !!q && q !== question));
        });
      });
    }

    case "get_open_items": {
      store.log(room, { kind: "lookup", label: "Reviewed open items", status: "done" });
      const items = openItems(room);
      store.pending[room] = [];
      return items;
    }

    case "log_lead": {
      const kinds = ["motive", "opportunity", "means", "relationship", "lead"];
      const lead: Lead = {
        id: store.nextId("L"),
        room,
        kind: (kinds.includes(args.kind) ? args.kind : "lead") as Lead["kind"],
        text: redact(String(args.text ?? "")).slice(0, 240),
        sourceIds: Array.isArray(args.source_ids) ? args.source_ids.map(String) : [],
        at: store.clock(room),
      };
      store.leads.push(lead);
      store.log(room, { kind: "lookup", label: `New ${lead.kind} lead`, detail: lead.text, refs: [lead.id], status: "done" });
      return { lead_id: lead.id };
    }

    case "research": {
      const mine = store.intel.filter((i) => i.room === room);
      if (mine.length >= 2) return { status: "skipped", reason: "Research budget for this interview is used. Continue with open items." };
      if (!process.env.GROQ_API_KEY) return { status: "unavailable" };
      const intel: Intel = {
        id: store.nextId("W"),
        room,
        query: String(args.query ?? "").slice(0, 160),
        purpose: String(args.purpose ?? "").slice(0, 200),
        status: "running",
        at: store.clock(room),
      };
      store.intel.push(intel);
      const act = store.log(room, { kind: "lookup", label: `Searching the web`, detail: intel.query, refs: [intel.id], status: "running" });
      webResearch(intel.query, intel.purpose)
        .then((r) => {
          Object.assign(intel, { status: "done", summary: r.summary, sources: r.sources });
          store.patchActivity(act, { status: "done", label: "Web research complete", detail: r.summary });
          ctx.inject(`Research ${intel.id} findings (${intel.purpose}): ${r.summary} Use this only if relevant; never quote it as an accusation.`);
        })
        .catch((e) => {
          Object.assign(intel, { status: "error", summary: String(e.message ?? e).slice(0, 140) });
          store.patchActivity(act, { status: "error", label: "Web research failed", detail: intel.summary });
        });
      return { research_id: intel.id, status: "started", note: "Keep interviewing. Findings will arrive as a system message." };
    }

    case "end_interview": {
      const reason = String(args.reason ?? "declined");
      store.log(room, { kind: "end", label: `Interview ending · ${reason.replace(/_/g, " ")}`, status: reason === "objectives_complete" ? "done" : "warn" });
      ctx.end(reason);
      return { ended: true, instruction: reason === "objectives_complete" ? "Say only: Thank you. That's everything for now." : "Say only: Understood. This interview has ended." };
    }

    default:
      return { error: `Unknown tool ${name}.` };
  }
}

export { toMin };
