/**
 * Claim extraction on every finished interviewee utterance (Groq, JSON mode).
 * The voice agent never has to remember to record facts; the conflict engine gets structured claims either way.
 */
import { store } from "./caseStore.js";
import type { RoomId } from "./types.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM = `You extract factual claims from one utterance in an investigative interview about Monday evening (20:00-22:00) around a warehouse break-in on Admiralty Way, Lekki. People: daniel (former warehouse night staff), tunde (Daniel's friend, owns a grey Toyota Corolla).

Return JSON: {"claims":[{"subject","about","value","time","time_end","quote","revises_claim_id"}]}. Return {"claims":[]} if the utterance states no fact.

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
One claim per fact. Never invent facts. Output JSON only.`;

export async function extractClaims(room: RoomId, utterance: string, lastQuestion?: string) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return [];
  const earlier = store.claims
    .filter((c) => c.room === room && c.status === "ACTIVE")
    .map((c) => `${c.id}: ${c.subject}=${c.value}${c.time ? ` at ${c.time}` : ""} ("${c.quote}")`)
    .join("\n");

  // Each Groq model has its own per-minute budget: on a 429, move to the next one.
  const models = [process.env.GROQ_EXTRACT_MODEL || "openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3.8-27b"];
  let res: Response | null = null;
  for (const model of [...new Set(models)]) {
    res = await call(model).catch(() => null as any);
    if (res?.ok) break;
  }
  if (!res?.ok) throw new Error(`extract ${res?.status ?? "timeout"}: ${res ? (await res.text()).slice(0, 160) : ""}`);
  const data: any = await res!.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  return Array.isArray(parsed.claims) ? parsed.claims.filter((c: any) => c && c.subject && c.value) : [];

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
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Speaker: ${room}\nInterviewer's last question: ${lastQuestion ?? "(opening: describe Monday evening from 8pm)"}\nSpeaker's earlier claims:\n${earlier || "(none)"}\n\nUtterance: "${utterance}"`,
        },
      ],
    }),
    });
  }
}
