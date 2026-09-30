// Dev-only: replays the demo sequence through the real tool router so the console can be checked without microphones.
import { store } from "../server/caseStore.js";
import { handleTool } from "../server/tools.js";
import type { RoomId } from "../server/types.js";

const ctx = { end: () => {}, inject: () => {} };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Step = [RoomId, "heard" | "said" | string, any];

const STEPS: Step[] = [
  ["daniel", "said", "Hello Daniel. I'm vllo, an AI interviewer working on an investigation. To begin, please tell me everything you did on Monday evening, from about eight o'clock."],
  ["tunde", "said", "Hello Tunde. I'm vllo, an AI interviewer working on an investigation. To begin, please tell me everything you did on Monday evening, from about eight o'clock."],
  ["daniel", "heard", "I finished work at half eight and drove my own car straight home. I was alone."],
  ["daniel", "record_claim", { subject: "location", about: "daniel", value: "work", time: "20:30", quote: "I finished work at half eight" }],
  ["daniel", "record_claim", { subject: "vehicle", about: "daniel", value: "own_car", quote: "drove my own car" }],
  ["daniel", "record_claim", { subject: "location", about: "daniel", value: "home", time: "20:50", quote: "straight home" }],
  ["daniel", "record_claim", { subject: "companion", about: "daniel", value: "none", quote: "I was alone" }],
  ["daniel", "set_next_question", { reason: "TIMELINE_GAP", question: "What did you do after you got home?", source_ids: ["C3"] }],
  ["daniel", "said", "What did you do after you got home?"],
  ["tunde", "heard", "I lent Daniel my Corolla on Monday. He brought it back after ten."],
  ["tunde", "record_claim", { subject: "car_handover", about: "tunde", value: "lent_to_daniel", quote: "I lent Daniel my Corolla on Monday" }],
  ["tunde", "log_lead", { kind: "relationship", text: "Owner lent the car for the evening; ask why the other person needed it that night.", source_ids: ["C5"] }],
  ["tunde", "set_next_question", { reason: "MISSING_DETAIL", question: "Why did he need the car that evening?", source_ids: ["C5"] }],
  ["daniel", "set_next_question", { reason: "CROSS_ACCOUNT_CONFLICT", question: "Tunde said you took his car, isn't it true?", source_ids: ["K3"] }],
  ["daniel", "set_next_question", { reason: "CROSS_ACCOUNT_CONFLICT", question: "We have information you may have used a different vehicle on Monday. Which vehicle did you drive?", source_ids: ["K3"] }],
  ["daniel", "said", "We have information you may have used a different vehicle on Monday. Which vehicle did you drive?"],
  ["daniel", "heard", "Okay, it was Tunde's car. Mine was at the mechanic in Ajah."],
  ["daniel", "record_claim", { subject: "vehicle", about: "daniel", value: "tunde_corolla", quote: "it was Tunde's car", revises_claim_id: "C2" }],
  ["daniel", "research", { query: "mechanic workshops Ajah Lagos", purpose: "Check the stated mechanic location is plausible" }],
];

export async function seed() {
  await wait(8000);
  const t0 = Date.now();
  for (const r of ["daniel", "tunde"] as RoomId[]) store.setRoom(r, { status: "LIVE", startedAt: t0, agentState: "LISTENING" });
  for (const [room, kind, payload] of STEPS) {
    await wait(900);
    if (kind === "said") {
      store.setRoom(room, { agentState: "SPEAKING", caption: payload });
      store.say(room, "agent", payload);
      store.log(room, { kind: "said", label: payload, status: "done" });
    } else if (kind === "heard") {
      store.setRoom(room, { agentState: "LISTENING", userPartial: payload });
      await wait(900);
      store.setRoom(room, { userPartial: "", agentState: "THINKING" });
      store.say(room, "interviewee", payload);
      store.log(room, { kind: "heard", label: payload, status: "done" });
    } else {
      store.setRoom(room, { agentState: "THINKING" });
      handleTool(room, kind, payload, ctx);
    }
  }
}
