// Registering a person whose interview is completed must start them clean.
import { store } from "../server/caseStore.js";
import { handleTool } from "../server/tools.js";

const ctx = { end() {}, inject() {} };
store.rooms.daniel.startedAt = Date.now();
handleTool("daniel", "record_claim", { subject: "vehicle", about: "daniel", value: "other", quote: "I ordered an Uber" }, ctx);
store.log("daniel", { kind: "heard", label: "I ordered an Uber", status: "done" });
store.setRoom("daniel", { status: "ENDED", endReason: "time_limit" });
console.log("before:", store.rooms.daniel.status, "claims", store.claims.length, "conflicts", store.conflicts.length, "activity", store.activity.length);
store.resetRoom("daniel");
console.log("after: ", store.rooms.daniel.status, "claims", store.claims.length, "conflicts", store.conflicts.length, "activity", store.activity.length);
process.exit(0);
