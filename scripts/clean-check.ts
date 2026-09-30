// The caption sanitiser must strip spoken tool calls and leave normal speech alone.
import { clean } from "../server/bridge.js";

const cases = [
  "set_next_question{question:",
  'set_next_question{question: "Where were you at 9?"} Where were you at nine?',
  "end_interview(reason: lawyer_requested) Understood. This interview has ended.",
  "Hello Daniel, I'm vllo. Tell me what you did on Monday evening, from eight o'clock.",
  "What time did you reach the warehouse, and who was with you?",
];
for (const c of cases) console.log(JSON.stringify(c), "->", JSON.stringify(clean(c)));
process.exit(0);
