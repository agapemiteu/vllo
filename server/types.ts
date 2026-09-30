export type RoomId = "daniel" | "tunde";
export const ROOMS: RoomId[] = ["daniel", "tunde"];
export const other = (r: RoomId): RoomId => (r === "daniel" ? "tunde" : "daniel");

export type Subject = "location" | "vehicle" | "companion" | "car_handover" | "other";

export interface Claim {
  id: string;
  room: RoomId;
  about: RoomId;
  subject: Subject;
  value: string;
  time?: string;
  timeEnd?: string;
  quote: string;
  saidAt: number;
  status: "ACTIVE" | "REVISED";
  revisedBy?: string;
  revises?: string;
}

export type ConflictType = "EXTERNAL_CONFLICT" | "INTERNAL_CONFLICT" | "CROSS_ACCOUNT_CONFLICT";

export interface Conflict {
  id: string;
  key: string;
  rule: "R1" | "R2" | "R3" | "R4" | "R5";
  type: ConflictType;
  topic: string;
  claimIds: string[];
  evidenceIds: string[];
  rooms: RoomId[];
  status: "OPEN" | "RESOLVED";
  resolvedBy?: string;
  summary: string;
  challengeHint: string;
  createdAt: number;
}

export interface GuardrailEvent {
  id: string;
  room: RoomId;
  rule: string;
  action: "BLOCKED" | "ENDED" | "FLAGGED";
  detail: string;
  at: number;
}

export interface Revision {
  id: string;
  room: RoomId;
  oldClaimId: string;
  newClaimId: string;
  subject: Subject;
  oldValue: string;
  newValue: string;
  oldQuote: string;
  newQuote: string;
  oldTime?: string;
  newTime?: string;
  at: number;
}

/** One step in the agent's visible reasoning trail. */
export interface Activity {
  id: string;
  room: RoomId;
  kind: "heard" | "said" | "claim" | "check" | "conflict" | "resolved" | "gate" | "blocked" | "lookup" | "end" | "system";
  label: string;
  detail?: string;
  refs?: string[];
  status: "running" | "done" | "warn" | "error";
  at: number;
  interrupted?: boolean;
}

export interface RoomState {
  id: RoomId;
  status: "IDLE" | "CONNECTING" | "LIVE" | "ENDED" | "DISCONNECTED";
  agentState: "SPEAKING" | "LISTENING" | "THINKING";
  startedAt?: number;
  endedAt?: number;
  caption: string;
  userPartial: string;
  lastQuestion?: { reason: string; question: string; sourceIds: string[] };
  endReason?: string;
}

export interface Gap {
  person: RoomId;
  from: string;
  to: string;
  minutes: number;
}

export interface Lead {
  id: string;
  room: RoomId;
  kind: "motive" | "opportunity" | "means" | "relationship" | "lead";
  text: string;
  sourceIds: string[];
  at: number;
}

export interface Intel {
  id: string;
  room: RoomId;
  query: string;
  purpose: string;
  status: "running" | "done" | "error";
  summary?: string;
  sources?: { title: string; url: string }[];
  at: number;
}

export interface Objective {
  id: string;
  text: string;
  resolved: boolean;
}
