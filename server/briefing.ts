import { first, store } from "./caseStore.js";
import type { RoomId } from "./types.js";

const pretty = (v: string) => v.replace(/_/g, " ");
const name = (r: RoomId) => first(r);

/**
 * What earlier interviews established that bears on this person.
 * agent: redacted, no names or quotes. console: named, with claim ids, for the investigator.
 */
export function briefingFor(room: RoomId) {
  const other: RoomId = room === "daniel" ? "tunde" : "daniel";
  const items: { agent: string; console: string; claimId: string }[] = [];
  for (const c of store.claims.filter((x) => x.room === other && x.status === "ACTIVE")) {
    const at = c.time ? ` around ${c.time}` : "";
    if (c.subject === "car_handover" && c.value === "lent_to_daniel" && room === "daniel")
      items.push({ agent: "They may have had use of a borrowed car on Monday evening.", console: `${name(other)}: "${c.quote}"`, claimId: c.id });
    else if (c.subject === "car_handover" && c.value === "returned_by_daniel" && room === "daniel")
      items.push({ agent: `A borrowed car may have been returned by them${at}.`, console: `${name(other)}: "${c.quote}"`, claimId: c.id });
    else if (c.subject === "companion" && c.value === room)
      items.push({ agent: `They may not have been alone${at}.`, console: `${name(other)}: "${c.quote}"`, claimId: c.id });
    else if (c.about === room && c.subject === "location")
      items.push({ agent: `They may have been at the ${pretty(c.value)}${at}.`, console: `${name(other)}: "${c.quote}"`, claimId: c.id });
    else if (c.about === room && c.subject === "vehicle")
      items.push({ agent: `They may have used ${c.value === "tunde_corolla" ? "a borrowed car" : "a specific vehicle"}.`, console: `${name(other)}: "${c.quote}"`, claimId: c.id });
  }
  return { from: other, items: items.slice(0, 4) };
}
