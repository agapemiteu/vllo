import type { RoomId } from "./types.js";
import { other } from "./types.js";

interface Rule {
  id: string;
  test: (q: string, room: RoomId) => boolean;
  instruction: string;
}

const NAMES: Record<RoomId, RegExp> = { daniel: /\bdaniel\b/i, tunde: /\btunde\b/i };

const ACCUSATORY = /\b(lie|lying|liar|lied|guilty|admit|confess|you did it|caught)\b/i;
const LEADING = /(isn't it true|didn't you|you did .* right\?|wouldn't you agree|admit that)/i;
const COERCIVE = /(better for you|if you cooperate|we already know|no point denying|make this easier)/i;
const sourceLeak = (q: string, room: RoomId) =>
  NAMES[other(room)].test(q) || /\b(he|she|they|someone|your friend) (said|told us|claims|admitted)\b/i.test(q);

export const QUESTION_RULES: Rule[] = [
  { id: "SOURCE_LEAK", test: sourceLeak, instruction: "Do not reveal sources or name anyone else being interviewed. Use: 'We have information that...' or ask openly." },
  { id: "ACCUSATORY", test: (q) => ACCUSATORY.test(q), instruction: "Remove accusatory language. Ask an open question." },
  { id: "LEADING", test: (q) => LEADING.test(q), instruction: "Rephrase as an open question starting with What, Where, When, Who, Tell me, or Walk me through." },
  { id: "COERCIVE", test: (q) => COERCIVE.test(q), instruction: "No pressure, promises, or bargaining. Ask neutrally." },
  { id: "DOUBLE_QUESTION", test: (q) => (q.match(/\?/g) ?? []).length > 1, instruction: "Ask one question at a time." },
  { id: "TOO_LONG", test: (q) => q.trim().split(/\s+/).length > 30, instruction: "Keep the question under 25 words." },
];

export function checkQuestion(q: string, room: RoomId) {
  for (const r of QUESTION_RULES) if (r.test(q, room)) return { ok: false as const, rule: r.id, instruction: r.instruction };
  return { ok: true as const };
}

export type EndTrigger = "lawyer_requested" | "declined" | "welfare";

const USER_TRIGGERS: [RegExp, EndTrigger][] = [
  [/\b(lawyer|solicitor|attorney|legal representation)\b/i, "lawyer_requested"],
  [/\b(i want to stop|i'm done|i am done|end this|no more questions)\b/i, "declined"],
  [/\b(kill myself|hurt myself|end my life)\b/i, "welfare"],
];

export function checkUserTranscript(text: string): EndTrigger | null {
  for (const [re, reason] of USER_TRIGGERS) if (re.test(text)) return reason;
  return null;
}

/** What the agent actually said: catch conduct breaches that bypassed the gate. */
export function checkAgentTranscript(text: string, room: RoomId): string | null {
  if (ACCUSATORY.test(text)) return "ACCUSATORY";
  if (sourceLeak(text, room)) return "SOURCE_LEAK";
  if (COERCIVE.test(text)) return "COERCIVE";
  return null;
}

/** Hard redaction for any agent-facing text about the other room. */
export function redact(text: string) {
  return text.replace(/\b(daniel|tunde)\b/gi, "another person");
}

export const END_WORDS: Record<string, string> = {
  lawyer_requested: "You asked for a lawyer",
  declined: "You chose to stop the interview",
  welfare: "The interview was paused for your welfare",
  objectives_complete: "All questions were covered",
  investigator: "The investigator ended the session",
};
