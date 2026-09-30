import assert from "node:assert/strict";
import { store } from "../server/caseStore.js";
import { checkQuestion, checkUserTranscript } from "../server/guardrails.js";
import { handleTool } from "../server/tools.js";
import type { RoomId } from "../server/types.js";

const ctx = { end: () => {}, inject: () => {} };
const call = (room: RoomId, name: string, args: any) => handleTool(room, name, args, ctx) as any;
const rule = (r: string) => store.conflicts.find((c) => c.rule === r);
const ok = (msg: string) => console.log(`  ok  ${msg}`);

store.rooms.daniel.startedAt = Date.now();
store.rooms.tunde.startedAt = Date.now();

// Step 2: Daniel
call("daniel", "record_claim", { subject: "location", about: "daniel", value: "work", time: "20:30", quote: "I finished work at half eight" });
const c2 = call("daniel", "record_claim", { subject: "vehicle", about: "daniel", value: "own_car", quote: "drove my own car" });
call("daniel", "record_claim", { subject: "location", about: "daniel", value: "home", time: "21:00", quote: "straight home" });
call("daniel", "record_claim", { subject: "companion", about: "daniel", value: "alone", quote: "I was alone" });
assert.equal(rule("R1")?.status, "OPEN"); ok("R1 phone conflict OPEN");
assert.equal(rule("R2")?.status, "OPEN"); ok("R2 vehicle vs CCTV OPEN");

// Step 3: Tunde
call("tunde", "record_claim", { subject: "location", about: "tunde", value: "home", time: "20:00", quote: "I was home from eight" });
call("tunde", "record_claim", { subject: "location", about: "tunde", value: "home", time: "21:00", quote: "all night" });
call("tunde", "record_claim", { subject: "car_handover", about: "tunde", value: "lent_to_daniel", quote: "I lent Daniel my Corolla on Monday" });
assert.equal(rule("R3")?.status, "OPEN"); ok("R3 cross-account vehicle OPEN");

// Delivery to Daniel's room is redacted
const q = call("daniel", "get_open_items", {});
const hints = JSON.stringify(q.conflicts);
assert.ok(!/tunde|daniel/i.test(hints), "hints must not name anyone"); ok("Daniel's hints contain no names");
assert.ok(q.conflicts.some((c: any) => c.type === "CROSS_ACCOUNT_CONFLICT")); ok("cross-account hint delivered");

// Step 5: Daniel revises vehicle
call("daniel", "record_claim", { subject: "vehicle", about: "daniel", value: "tunde_corolla", quote: "it was Tunde's car", revises_claim_id: c2.claim_id });
assert.equal(store.claim(c2.claim_id)?.status, "REVISED"); ok("C2 REVISED");
assert.equal(rule("R2")?.status, "RESOLVED"); ok("R2 RESOLVED");
assert.equal(rule("R3")?.status, "RESOLVED"); ok("R3 RESOLVED");
assert.ok(store.objectives.find((o) => o.id === "O2")?.resolved); ok("O2 resolved");

// Step 6: barge-in correction
call("daniel", "record_claim", { subject: "location", about: "daniel", value: "warehouse", time: "21:05", quote: "I went back for my charger, five minutes" });
assert.equal(rule("R1")?.status, "RESOLVED"); ok("R1 RESOLVED");
assert.ok(store.objectives.find((o) => o.id === "O3")?.resolved); ok("O3 resolved");

// Step 7: Tunde co-presence
call("tunde", "record_claim", { subject: "companion", about: "tunde", value: "daniel", time: "21:05", quote: "I was with him when he went back" });
assert.equal(rule("R4")?.status, "OPEN"); ok("R4 co-presence OPEN");

// Guardrails
const g = checkQuestion("Tunde said you took his car, isn't it true?", "daniel");
assert.equal(g.ok, false);
assert.equal((g as any).rule, "SOURCE_LEAK"); ok("gate blocks SOURCE_LEAK");
const approved = call("daniel", "set_next_question", { reason: "CROSS_ACCOUNT_CONFLICT", question: "Was anyone with you when you went back?" });
assert.equal(approved.approved, true); ok("neutral question approved");
assert.equal(checkUserTranscript("I want a lawyer"), "lawyer_requested"); ok("lawyer request detected");

// Time normalisation
const t = call("tunde", "record_claim", { subject: "location", about: "tunde", value: "fuel_station", time: "9:40pm", quote: "fuel" });
assert.equal(store.claim(t.claim_id)?.time, "21:40"); ok("9:40pm -> 21:40");

console.log(`\nconflicts: ${store.conflicts.map((c) => `${c.id}:${c.rule}:${c.status}`).join(" ")}`);
console.log("smoke passed");
process.exit(0);
