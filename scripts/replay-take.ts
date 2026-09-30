// Replays the user's freestyle take through the engine: "at 9 I was leaving the warehouse", "I ordered an Uber".
import { store } from "../server/caseStore.js";
import { handleTool } from "../server/tools.js";

const ctx = { end() {}, inject() {} };
store.rooms.daniel.startedAt = Date.now();
handleTool("daniel", "record_claim", { subject: "location", about: "daniel", value: "warehouse_area", time: "21:00", quote: "At 9 I was about to leave the warehouse" }, ctx);
handleTool("daniel", "record_claim", { subject: "vehicle", about: "daniel", value: "other", quote: "I ordered an Uber" }, ctx);
console.log(store.conflicts.map((c) => `${c.rule}:${c.status} ${c.summary}`).join("\n") || "no conflicts");
process.exit(0);
