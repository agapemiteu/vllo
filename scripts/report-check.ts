// Reproduces "View full report": build the report from a finished interview and check it serialises.
import { store } from "../server/caseStore.js";
import { handleTool } from "../server/tools.js";
import { buildReport } from "../server/report.js";

const ctx = { end() {}, inject() {} };
store.rooms.daniel.startedAt = Date.now() - 60000;
handleTool("daniel", "record_claim", { subject: "location", about: "daniel", value: "warehouse_area", time: "21:00", quote: "At 9 I was about to leave the warehouse" }, ctx);
handleTool("daniel", "record_claim", { subject: "vehicle", about: "daniel", value: "other", quote: "I ordered an Uber" }, ctx);
store.setRoom("daniel", { status: "ENDED", endReason: "time_limit", endedAt: Date.now() });
try {
  const r = buildReport();
  const json = JSON.stringify(r);
  console.log("report ok", json.length, "bytes; conflicts", r.conflicts.length, "interviews", r.interviews.map((i: any) => `${i.name}:${i.status}`).join(","));
} catch (e: any) {
  console.log("REPORT FAILED", e.stack);
}
process.exit(0);
