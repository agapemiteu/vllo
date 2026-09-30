# vllo

**The AI investigative interviewer that interviews everyone at once.**

vllo runs one autonomous voice interviewer per person of interest, at the same time, in separate rooms. Every spoken claim becomes structured timeline data. Each claim is checked live against the case evidence, against the person's own earlier statements, and against what the other person is saying right now in the other room. When stories diverge, the interviewer asks about it, neutrally, without revealing the source.

Inspired by how Listen Labs runs customer research interviews at scale, applied to investigations, where comparing accounts is the whole job.

Built on the **AssemblyAI Voice Agent API**.

## What it does

- **Two concurrent Voice Agent sessions.** `/room/daniel` and `/room/tunde` each hold a live, full-duplex voice interview with turn detection and barge-in.
- **Client-side tools drive all state.** The agent calls `record_claim` for every time, place, vehicle, companion and car handover. Claims are slot-filled with enums, so conflict detection is deterministic.
- **Cross-account conflicts.** A claim in one room can open a conflict in the other. It is delivered to the other agent as a redacted hint in its next tool result, never with names or quotes.
- **Investigator mindset.** The agent logs lines of inquiry (`log_lead`: motive, opportunity, means, relationship) and runs background web checks (`research`) on named places and routes, via Groq's web-search models. Findings come back into the conversation without stalling it.
- **Guardrails in code.** Every question goes through `set_next_question` first. Accusatory, leading, coercive, double or overlong questions and source leaks are blocked. A request for a lawyer, a refusal or a welfare concern ends the interview, and a server-side backstop enforces it even if the model does not. What the agent actually says is monitored too, and live corrections are pushed via `session.update`.
- **Autonomous or Assisted.** In Assisted mode, every question the agent drafts waits on the investigator, who can approve, edit or reject it. In either mode the investigator can direct the interviewer in plain words.
- **Investigator console** (`/console`). Both rooms live as step-by-step reasoning trails, a shared 20:00 to 22:00 timeline with evidence pins and gaps, conflicts, a compare/contrast grid, facts established, targets and metrics, and a guardrail log.
- **Report and session save.** A deterministic case report with per-claim provenance (who said it, and when). Sessions are saved to `sessions/` as JSON and can be exported from the console.

## How AssemblyAI is used

| Voice Agent API feature | Where |
|---|---|
| WebSocket session per room, `session.update` with prompt, greeting, voice, tools | `server/bridge.ts` |
| Client-side function tools: `tool.call` → `tool.result` after `reply.done` | `server/bridge.ts`, `server/tools.ts` |
| Barge-in: `reply.done` with `status: "interrupted"` flushes browser playback instantly | `server/bridge.ts`, `client/src/audio/player.ts` |
| `transcript.user` / `transcript.agent` for provenance, rights backstops and conduct monitoring | `server/bridge.ts`, `server/guardrails.ts` |
| `conversation.message` to feed web findings and investigator direction into context | `server/bridge.ts` |
| Custom LLM (`llm`, OpenAI-compatible) pointed at Groq, falling back to the managed model | `server/bridge.ts` |
| `input.keyterms` for names and places, `session.resume` on a dropped socket | `server/bridge.ts` |

The API key never leaves the server. Browsers stream PCM16 24 kHz audio to the Node bridge, which holds the authenticated upstream socket.

## Architecture

```
 /room/daniel  (mic + playback)      /room/tunde  (mic + playback)       /console
        │  ws                                 │  ws                          │  ws (snapshots)
        ▼                                     ▼                              │
 ┌───────────────────────────────── Node server ─────────────────────────────┴──┐
 │ RoomBridge(daniel) ── AssemblyAI Voice Agent session A                        │
 │ RoomBridge(tunde)  ── AssemblyAI Voice Agent session B                        │
 │ ToolRouter → CaseStore · ConflictEngine · Guardrails · Insights · Report      │
 │ research → Groq (web search), async                                           │
 └──────────────────────────────────────────────────────────────────────────────┘
```

Conflict rules, guardrails, facts, comparisons and the report are plain TypeScript. No model decides whether two statements conflict.

## Run it

```bash
npm install
cp .env.example .env    # add ASSEMBLYAI_API_KEY (and GROQ_API_KEY for Groq + web research)
npm run dev             # server :8787, client :5173
npm run smoke           # engine test, no audio
```

Open `/console` on the recording screen and `/room/daniel`, `/room/tunde` on two devices. Rooms need a microphone; use headphones so the agent's voice is not picked up as an interruption.

Production: `npm run build && npm start` serves the client from the same Node process. Deploy on a host that supports long-lived WebSockets (Railway, Render, Fly).

## Principles

- vllo reports conflicts between statements and evidence. It does not assess truthfulness, emotion, tone, hesitation or guilt.
- Open questions only, no accusation, no pressure, no source disclosure. Rights stop the interview.
- A human investigator owns the case. Assisted mode puts every question in their hands.
- Case 024 and all evidence are synthetic.
