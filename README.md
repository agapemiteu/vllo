# vllo

vllo is an AI detective that interviews suspects and witnesses by voice. It checks every answer against your evidence and other statements in real time, follows up on contradictions, and delivers a sourced report.

Built for investigators, HR teams, legal and compliance teams, insurers and any organisation that needs to hear accounts and verify them.

- Live app: https://vllo.vercel.app
- Backend: https://vllo.onrender.com
- Built for the AssemblyAI Voice Agent Hackathon

## What vllo does

- **Interviews by voice.** A natural spoken conversation: the person gives their account, then vllo asks follow-up questions to pin down times, places, people and reasons.
- **Runs without anyone in the room.** Share a link; the interview starts when the person checks in, at a scheduled time, or after another interview ends.
- **Checks answers as they are given.** Every answer becomes a claim with a timestamp and the person's own words, checked in real time against the case evidence and other statements.
- **Follows up on contradictions.** Conflicts are raised with open, neutral questions, without revealing where the information came from.
- **Shows its reasoning live.** The investigator sees what vllo heard, what it checked, what conflicts, and why it is asking each question.
- **Delivers a report.** What was established, what changed, what still conflicts, every point traced to who said it and when. Can be emailed to the investigator.

## How to use it

1. Open https://vllo.vercel.app and click **Interview a suspect**.
2. Tap a sample person (Daniel O. or Tunde A.) or fill in your own. Add a photo if you like.
   Or choose **My own case**: a title, date, time, place, what happened, and your evidence (one item per line). Answers are then checked against your evidence.
3. Choose when: **as soon as they check in**, in 1 or 5 minutes, or after another interview finishes.
4. Choose how long: 1, 1.5 or 2 minutes (1.5 recommended).
5. Click **Create the link**. On the next page, scan the QR code with a phone, or click **Open interview room**.
6. On the interview device, tap **Check in**. The interview starts by itself.
7. Watch the investigation page: what vllo hears, what it checks, contradictions as they appear, and the question it is asking and why.
8. When it ends, click **Download PDF**, or type an email address and click **Email** to get the PDF in your inbox.

The demo includes one sample case with evidence on file. Answer in your own words; when an answer conflicts with the evidence, the contradiction appears on the investigation page and vllo asks about it.

## Fallbacks and known limits

| Situation | What to do |
|---|---|
| First page load is slow | The backend runs on Render's free tier and sleeps when idle. Wait up to a minute. |
| Interview does not start after check-in | Refresh the room page and tap Check in again. |
| The agent interrupts itself | Use headphones. Speaker sound is picked up as the person talking. |
| An old link says it isn't available | The server restarted or the investigation expired. Start a new one from the home page. |
| Start over | Once every interview in an investigation has finished, the home page starts a fresh one. "Reset demo" does it at any time. |
| Email didn't arrive | The PDF downloads instead whenever email can't be sent. Check spam; sending needs the server's Brevo settings. |
| Microphone blocked or missing | The room says exactly what to fix (permission, no mic, mic in use, unsupported browser). |

Other limits: the sample case uses hand-written, deterministic contradiction rules; your own cases are checked by a language model against the evidence you type in. Up to two people per investigation. Desktop Chrome and mobile Chrome/Safari are tested.

Every visitor works in their own isolated investigation, so several people can test at the same time without seeing each other's data.

## Tech used

| Part | Technology |
|---|---|
| Voice interview | AssemblyAI Voice Agent API (speech-to-text, turn detection, barge-in, text-to-speech, client-side tools) |
| Claim extraction and web checks | Groq (gpt-oss-20b, gpt-oss-120b with browser search) |
| Conflict detection, guardrails, report | Plain TypeScript rules, no model involved |
| Backend | Node.js, TypeScript, Express, WebSockets (`ws`) on Render |
| Frontend | React, Vite, Tailwind CSS, shadcn-style components, Motion, Hugeicons, DiceBear, on Vercel |

## How it works

```
Interview device (mic)  <-- WebSocket -->  Node server  <-- WebSocket -->  AssemblyAI Voice Agent
Investigator page       <-- WebSocket -->      |
                                               |-- Groq: each answer -> structured claims
                                               |-- Rules: claims vs evidence and other accounts -> contradictions
                                               |-- Guardrails: every question checked; rights stops enforced by the server
                                               '-- Report: built from recorded claims only
```

- The browser streams 24 kHz audio to the server; the server holds the AssemblyAI connection, so the API key never reaches the browser.
- After each answer, Groq turns it into claims (place, time, vehicle, companion, car handover). The rules compare them to the evidence and to other interviews.
- New contradictions and still-open objectives are passed to the agent between turns, so its next question goes after them.
- Every question the agent asks is checked against conduct rules (no accusing, leading, pressure or naming another person); a breach is flagged and corrected on its next turn. Asking for a lawyer, refusing to continue or a welfare concern ends the interview, enforced by the server.

## Principles

- vllo reports contradictions between statements and evidence. It does not judge truthfulness, emotion or guilt.
- It never accuses, never reveals a source, and stops when someone asks for a lawyer.
- A human investigator decides what the findings mean.

## Run it locally

```bash
npm install
cp .env.example .env     # add ASSEMBLYAI_API_KEY and GROQ_API_KEY
npm run dev              # server on :8787, app on :5173
npm run smoke            # tests the rules, no audio needed
npx tsx scripts/hardening.ts   # isolation, scheduling, custom cases, PDF, bad input
```

| Variable | Purpose |
|---|---|
| `ASSEMBLYAI_API_KEY` | Voice Agent API (required) |
| `GROQ_API_KEY` | Claim extraction and web checks |
| `VLLO_LLM` | `managed` (default), `groq` or `gateway`: which model runs the voice agent |
| `BREVO_API_KEY`, `REPORT_FROM_EMAIL` | Emailing the PDF report (Brevo free plan; the sender must be verified in Brevo) |
| `VITE_API_URL` | Backend URL when the frontend is hosted separately (defaults to the Render backend on vercel.app) |
