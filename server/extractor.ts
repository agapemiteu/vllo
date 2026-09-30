/**
 * Claim extraction on every finished interviewee utterance (Groq, JSON mode).
 * The voice agent never has to remember to record facts; the conflict engine gets structured claims either way.
 */
import { CASE, store } from "./caseStore.js";
import type { RoomId } from "./types.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM = `You extract factual claims from one utterance in an investigative interview about Monday evening (20:00-22:00) around a warehouse break-in on Admiralty Way, Lekki. People: daniel (former warehouse night staff), tunde (Daniel's friend, owns a grey Toyota Corolla).

Return JSON: {"claims":[{"subject","about","value","time","time_end","quote","revises_claim_id"}], "threads":[{"kind","text","why"}]}. Use empty arrays when there is nothing.

threads: at most ONE new, concrete thing this utterance introduces that could be independently checked: a third party (a mechanic, a shop attendant, a neighbour), a specific business or place (a named workshop, fuel station, street), or an object that leaves a trace (a receipt, a phone charger, a bank transfer). kind is person | place | business | object | reason. text is a short noun phrase ("the mechanic in Ajah"). why is one short sentence on what verifying it would confirm or contradict.
NEVER a thread for: Daniel, Tunde, the Corolla, their own car in general, the warehouse, home, work, being alone, a request for a lawyer, or anything already in their earlier claims. When in doubt, return no thread.

subject and value (use exactly these values):
- location: work | warehouse_area | fuel_station | home | other   ("work", "my job", "my shift" = work, even for former warehouse staff; only the warehouse itself or Admiralty Way = warehouse_area)
- vehicle: own_car | tunde_corolla | other | unknown   ("his car", "Tunde's car", "the Corolla", "my friend's car" said by daniel = tunde_corolla)
- companion: none | daniel | tunde | other   ("alone", "by myself", "nobody" = none; "with him" = the other person)
- car_handover: lent_to_daniel | returned_by_daniel | not_lent   ("I lent him my car" = car_handover lent_to_daniel, NOT a vehicle claim)
- other: short free text, only for clearly relevant facts (a reason, a person, an object, where their own car was)

about: whose actions the claim describes, usually the speaker.
Where a vehicle WAS (e.g. "my car was at the mechanic") is NOT a vehicle claim: use subject other with value like "own car at mechanic". A vehicle claim is only about which vehicle a person drove or used.
All times are in the evening: "9:05" = 21:05, "8" = 20:00.
time: 24h HH:MM if stated or clearly implied. Evening times: "half eight" = 20:30, "quarter to nine" = 20:45, "five past nine" = 21:05, "ten past nine" = 21:10, "around nine" = 21:00. "X past H" is AFTER the hour H; "X to H" is BEFORE the hour H. "Five minutes later" = add 5 to the previous time. Omit if unknown.
time_end: end of a stated duration ("for five minutes" from 21:05 = 21:10).
quote: the speaker's exact words for that fact.
revises_claim_id: if the speaker corrects or contradicts one of their EARLIER claims listed below on the same subject, give that claim's id.
Follow-ups: if the utterance only adds a time or detail to an earlier claim (previous utterance "I went back to the warehouse", this one "around five past nine"), restate that full claim with the new time and set revises_claim_id to it.
One claim per fact. Never invent facts. Output JSON only.`;

/** The same job for an investigator's own case: no fixed value lists, the case and people come from the case file. */
function customSystem() {
  const people = CASE.interviewees.map((p: any) => `${p.id} = ${p.name}`).join(", ");
  return `You extract factual claims from one utterance in an investigative interview. Case: ${CASE.title}. ${CASE.summary ?? ""} Incident: ${CASE.incident?.date ?? ""} ${CASE.incident?.time ?? ""} at ${CASE.incident?.location ?? ""}. People (id = name): ${people}.

Return JSON: {"claims":[{"subject","about","value","time","time_end","quote","revises_claim_id"}], "threads":[{"kind","text","why"}]}. Use empty arrays when there is nothing.

subject: location | vehicle | companion | activity | other.
value: a short plain phrase (2-6 words) for the fact, e.g. "at home", "own blue car", "alone", "with the manager", "left the office".
about: the id of the person the claim describes, usually the speaker.
time: 24h HH:MM only if stated or clearly implied; otherwise omit.
time_end: end of a stated duration, HH:MM.
quote: the speaker's exact words for that fact.
revises_claim_id: if the speaker corrects one of their EARLIER claims listed below on the same subject, that claim's id.
threads: at most ONE new, concrete thing that could be independently checked (a third party, a named place or business, an object that leaves a trace like a receipt). kind is person | place | business | object | reason. Never a thread for the people above, a request for a lawyer, or anything already claimed.
One claim per fact. Never invent facts. Output JSON only.`;
}

export interface Thread {
  kind: "person" | "place" | "business" | "object" | "reason";
  text: string;
  why?: string;
}

export async function extractClaims(room: RoomId, utterance: string, lastQuestion?: string, previous?: string) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { claims: [], threads: [] as Thread[] };
  const earlier = store.claims
    .filter((c) => c.room === room && c.status === "ACTIVE")
    .map((c) => `${c.id}: ${c.subject}=${c.value}${c.time ? ` at ${c.time}` : ""} ("${c.quote}")`)
    .join("\n");

  // Each Groq model has its own per-minute budget: on a 429, move to the next one.
  // 120b last: it is the research model's budget.
  const models = [process.env.GROQ_EXTRACT_MODEL || "openai/gpt-oss-20b", "qwen/qwen3.8-27b", "openai/gpt-oss-120b"];
  let res: Response | null = null;
  for (const model of [...new Set(models)]) {
    res = await call(model).catch(() => null as any);
    if (res?.ok) break;
  }
  if (!res?.ok) throw new Error(`extract ${res?.status ?? "timeout"}: ${res ? (await res.text()).slice(0, 160) : ""}`);
  const data: any = await res!.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  return {
    claims: Array.isArray(parsed.claims) ? parsed.claims.filter((c: any) => c && c.subject && c.value) : [],
    threads: (Array.isArray(parsed.threads) ? parsed.threads : []).filter((t: any) => t && t.text && !/\b(daniel|tunde|corolla|lawyer|alone)\b/i.test(t.text)).slice(0, 1) as Thread[],
  };

  function call(model: string) {
    return fetch(GROQ_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: CASE.custom ? customSystem() : SYSTEM },
        {
          role: "user",
          content: `Speaker: ${room}\nInterviewer's last question: ${lastQuestion ?? "(opening: describe Monday evening from 8pm)"}\nSpeaker's previous utterance: ${previous ? `"${previous}"` : "(none)"}\nSpeaker's earlier claims:\n${earlier || "(none)"}\n\nUtterance: "${utterance}"`,
        },
      ],
    }),
    });
  }
}
