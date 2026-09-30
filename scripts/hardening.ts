// Server hardening checks: workspace isolation, scheduling, custom cases, PDF report, bad input.
import assert from "node:assert/strict";
import { runIn } from "../server/context.js";
import { CASE, store } from "../server/caseStore.js";
import { customCase } from "../server/casefile.js";
import { handleTool } from "../server/tools.js";
import { reportPdf } from "../server/reportPdf.js";
import { afterSlot, startReason } from "../server/schedule.js";
import { getWorkspace } from "../server/workspace.js";

const ok = (m: string) => console.log(`  ok  ${m}`);
const ctx = { end() {}, inject() {} };

// 1. Workspaces are isolated
const a = getWorkspace("alpha123")!;
const b = getWorkspace("bravo456")!;
runIn(a, () => {
  store.rooms.daniel.startedAt = Date.now();
  handleTool("daniel", "record_claim", { subject: "vehicle", about: "daniel", value: "other", quote: "I took an Uber" }, ctx);
});
runIn(b, () => assert.equal(store.claims.length, 0));
runIn(a, () => assert.equal(store.claims.length, 1));
ok("claims in one workspace never appear in another");
assert.equal(getWorkspace("BAD ID!"), null);
assert.equal(getWorkspace("../etc"), null);
ok("invalid workspace ids are refused");

// 2. Scheduling
const idle: any = { status: "IDLE" };
const base = { location: "", durationSec: 90 };
assert.equal(startReason({ ...base, checkedIn: false, armed: true }, idle, 0), null);
assert.equal(startReason({ ...base, checkedIn: true, armed: true }, idle, 0), "checkin");
assert.equal(startReason({ ...base, checkedIn: true }, idle, 0), "checkin");
assert.equal(startReason({ ...base, checkedIn: true, scheduledAt: 1000 }, idle, 999), null);
assert.equal(startReason({ ...base, checkedIn: true, scheduledAt: 1000 }, idle, 1000), "schedule");
assert.equal(startReason({ ...base, checkedIn: true, after: { room: "tunde", gapSec: 60 } }, idle, 0), null);
assert.equal(startReason({ ...base, checkedIn: true, armed: true }, { status: "LIVE" } as any, 0), null);
assert.equal(startReason({ ...base, checkedIn: true, armed: true }, { status: "ENDED" } as any, 0), null);
assert.equal(afterSlot({ ...base, checkedIn: false, after: { room: "tunde", gapSec: 60 } }, true, idle, 0), 60000);
assert.equal(afterSlot({ ...base, checkedIn: false, after: { room: "tunde", gapSec: 60 } }, false, idle, 0), null);
ok("every scheduling path starts only when it should");

// 3. Custom case: bad input rejected, messy input cleaned
assert.ok("error" in customCase({}));
assert.ok("error" in customCase({ title: "x" }));
const made = customCase({ title: "  Missing laptop  ", time: "2pm-ish 14:30", evidence: "- 14:10 badge swipe at door B\n\n* laptop last seen on desk 3\n" + "x".repeat(5000) });
assert.ok("file" in made);
const file = (made as any).file;
assert.equal(file.title, "Missing laptop");
assert.equal(file.incident.time, "14:30");
assert.equal(file.evidence.length, 3);
assert.equal(file.evidence[0].time, "14:10");
assert.ok(file.evidence[2].detail.length <= 300);
ok("custom case: rejects empty input, cleans messy input");

// 4. Custom case runs through the engine without the sample rules
const c = getWorkspace("custom789")!;
runIn(c, () => {
  store.caseFile = file;
  store.reset();
  store.rooms.daniel.startedAt = Date.now();
  CASE.interviewees[0].name = "Ada Lovelace";
  const r: any = handleTool("daniel", "record_claim", { subject: "location", about: "daniel", value: "At home all afternoon", time: "14:10", quote: "I was at home" }, ctx);
  assert.ok(r.claim_id);
  assert.equal(store.claim(r.claim_id)!.value, "At home all afternoon");
  assert.equal(store.claim(r.claim_id)!.time, "14:10");
  assert.equal(store.conflicts.length, 0);
  const empty: any = handleTool("daniel", "record_claim", { subject: "location", about: "daniel", value: "", quote: "" }, ctx);
  assert.equal(empty.error, "empty claim");
});
ok("custom case records free-text claims; sample rules stay off; empty claims refused");

// 5. PDF report builds for sample and custom workspaces, with odd characters
runIn(a, () => {
  CASE.interviewees[0].name = "Dánïel “Test” — O’Brien 😀";
});
const pdfA = await runIn(a, () => reportPdf(a, "daniel"));
const pdfC = await runIn(c, () => reportPdf(c, "daniel"));
assert.equal(pdfA.subarray(0, 5).toString(), "%PDF-");
assert.equal(pdfC.subarray(0, 5).toString(), "%PDF-");
ok(`PDF reports build (${pdfA.length} and ${pdfC.length} bytes), odd characters included`);

// 6. Per-person reset clears one session only
runIn(a, () => {
  store.rooms.tunde.startedAt = Date.now();
  handleTool("tunde", "record_claim", { subject: "companion", about: "tunde", value: "none", quote: "I was alone" }, ctx);
  store.resetRoom("daniel");
  assert.equal(store.claims.filter((x) => x.room === "daniel").length, 0);
  assert.equal(store.claims.filter((x) => x.room === "tunde").length, 1);
});
ok("resetting one person keeps the other's session");

console.log("hardening passed");
process.exit(0);
