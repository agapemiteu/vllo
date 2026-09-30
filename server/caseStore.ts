import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { insights } from "./insights.js";
import type {
  Activity, Claim, Conflict, Gap, GuardrailEvent, Intel, Lead, Objective, Revision, RoomId, RoomState, SessionPlan,
} from "./types.js";

export const CASE = JSON.parse(
  readFileSync(fileURLToPath(new URL("./case/case_024.json", import.meta.url)), "utf8"),
);

/** Default profiles, so a full reset restores the sample subjects. */
const DEFAULT_PEOPLE = JSON.parse(JSON.stringify(CASE.interviewees));

/** Registered display name (first name) for a role, used in every console-facing sentence. */
export const first = (r: RoomId) => String(CASE.interviewees.find((p: any) => p.id === r)?.name ?? r).split(" ")[0];

export function restoreDefaultPeople() {
  CASE.interviewees = JSON.parse(JSON.stringify(DEFAULT_PEOPLE));
}

export interface TranscriptLine {
  room: RoomId;
  speaker: "agent" | "interviewee";
  text: string;
  at: number;
  interrupted?: boolean;
}

function freshRoom(id: RoomId): RoomState {
  return { id, status: "IDLE", agentState: "LISTENING", caption: "", userPartial: "", mode: "auto" };
}

class CaseStore extends EventEmitter {
  rooms!: Record<RoomId, RoomState>;
  claims!: Claim[];
  conflicts!: Conflict[];
  guardrails!: GuardrailEvent[];
  revisions!: Revision[];
  activity!: Activity[];
  transcript!: TranscriptLine[];
  gaps!: Gap[];
  leads!: Lead[];
  intel!: Intel[];
  objectives!: Objective[];
  /** conflict ids waiting to be delivered to a room's next tool result */
  pending!: Record<RoomId, string[]>;
  report: unknown = null;
  /** Scheduling survives a case reset; interview data does not. */
  plan: Record<RoomId, SessionPlan> = {
    daniel: { location: "Interview Room A", checkedIn: false, durationSec: 120 },
    tunde: { location: "Interview Room B", checkedIn: false, durationSec: 120 },
  };
  /** Back-to-back run: when the first interview ends early, the next is pulled forward to keep the handoff gap. */
  sequence: { order: RoomId[]; gapSec: number } | null = null;
  /** roles that have been registered through /new */
  registered: Record<RoomId, boolean> = { daniel: false, tunde: false };
  /** photo version per person (0 = none uploaded) */
  photos: Record<RoomId, number> = { daniel: 0, tunde: 0 };
  private seq!: Record<string, number>;
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.reset();
  }

  reset() {
    const modes = this.rooms ? { daniel: this.rooms.daniel.mode, tunde: this.rooms.tunde.mode } : { daniel: "auto" as const, tunde: "auto" as const };
    this.rooms = { daniel: { ...freshRoom("daniel"), mode: modes.daniel }, tunde: { ...freshRoom("tunde"), mode: modes.tunde } };
    this.claims = [];
    this.conflicts = [];
    this.guardrails = [];
    this.revisions = [];
    this.activity = [];
    this.transcript = [];
    this.gaps = [];
    this.leads = [];
    this.intel = [];
    this.objectives = CASE.objectives.map((o: any) => ({ ...o, resolved: false }));
    this.pending = { daniel: [], tunde: [] };
    this.report = null;
    this.seq = {};
    this.changed();
  }

  /** Clear one person's interview so their slot can be reused for a fresh session. */
  resetRoom(r: RoomId) {
    const gone = new Set(this.claims.filter((c) => c.room === r).map((c) => c.id));
    this.claims = this.claims.filter((c) => c.room !== r);
    this.conflicts = this.conflicts.filter((k) => !k.claimIds.some((id) => gone.has(id)) && !k.rooms.includes(r));
    this.revisions = this.revisions.filter((v) => v.room !== r);
    this.guardrails = this.guardrails.filter((g) => g.room !== r);
    this.activity = this.activity.filter((a) => a.room !== r);
    this.transcript = this.transcript.filter((t) => t.room !== r);
    this.leads = this.leads.filter((l) => l.room !== r);
    this.intel = this.intel.filter((i) => i.room !== r);
    this.pending[r] = [];
    const mode = this.rooms[r].mode;
    this.rooms[r] = { ...freshRoom(r), mode };
    this.plan[r].checkedIn = false;
    this.report = null;
    this.changed();
  }

  nextId(prefix: string) {
    this.seq[prefix] = (this.seq[prefix] ?? 0) + 1;
    return `${prefix}${this.seq[prefix]}`;
  }

  /** ms since the room began, for provenance */
  clock(room: RoomId) {
    const s = this.rooms[room].startedAt;
    return s ? Date.now() - s : 0;
  }

  claim(id: string) {
    return this.claims.find((c) => c.id === id);
  }

  log(room: RoomId, a: Omit<Activity, "id" | "room" | "at">) {
    const act: Activity = { id: this.nextId("A"), room, at: this.clock(room), ...a };
    this.activity.push(act);
    if (this.activity.length > 400) this.activity.splice(0, this.activity.length - 400);
    this.changed();
    return act;
  }

  patchActivity(act: Activity, patch: Partial<Activity>) {
    Object.assign(act, patch);
    this.changed();
  }

  guard(room: RoomId, rule: string, action: GuardrailEvent["action"], detail: string) {
    const ev: GuardrailEvent = { id: this.nextId("G"), room, rule, action, detail, at: this.clock(room) };
    this.guardrails.push(ev);
    this.changed();
    return ev;
  }

  say(room: RoomId, speaker: TranscriptLine["speaker"], text: string, interrupted = false) {
    this.transcript.push({ room, speaker, text, at: this.clock(room), interrupted });
    this.changed();
  }

  setRoom(room: RoomId, patch: Partial<RoomState>) {
    Object.assign(this.rooms[room], patch);
    this.changed();
  }

  /** Coalesce bursts of mutations into one snapshot broadcast. */
  changed() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.emit("change");
    }, 40);
  }

  snapshot() {
    return {
      case: CASE,
      now: Date.now(),
      rooms: this.rooms,
      claims: this.claims,
      conflicts: this.conflicts,
      guardrails: this.guardrails,
      revisions: this.revisions,
      activity: this.activity,
      transcript: this.transcript,
      gaps: this.gaps,
      leads: this.leads,
      intel: this.intel,
      objectives: this.objectives,
      insights: insights(this),
      plan: this.plan,
      sequence: this.sequence,
      registered: this.registered,
      photos: this.photos,
      report: this.report,
    };
  }
}

export const store = new CaseStore();
export type Store = CaseStore;
