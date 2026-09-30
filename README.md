# vllo

**Voice AI for criminal investigations.** An AI detective that interviews your suspects by voice, checks every answer against the evidence while they are still talking, and gives you the contradictions and a report.

- Live app: https://vllo.vercel.app
- Backend: https://vllo.onrender.com
- Built for the AssemblyAI Voice Agent Hackathon

## The problem

Statements are taken, typed up, and compared days later, if anyone has the time. By then the person has left, and the question that would have cleared up the gap never got asked.

## What vllo does

1. You register the person: name, photo, what is already on file.
2. You send them a link (or they scan a QR code on the interview device).
3. They check in, and vllo interviews them by voice.
4. Every answer becomes a claim with a time and a quote, and is checked against the case evidence (CCTV, phone records, vehicle registry) and against anyone else interviewed.
5. When something does not add up, vllo asks about it, neutrally, without revealing where the information came from.
6. When it ends, you get a report: what held up, what changed, what still does not fit, every line quoted and timed.

## How to use it

1. Open https://vllo.vercel.app and click **Interview a suspect**.
2. Tap a sample person (Daniel O. or Tunde A.) or fill in your own. Add a photo if you like.
3. Choose when: **as soon as they check in**, in 1 or 5 minutes, or after another interview finishes.
4. Choose how long: 1, 1.5 or 2 minutes (1.5 recommended).
5. Click **Create the link**. On the next page, scan the QR code with a phone, or click **Open interview room**.
6. On the interview device, tap **Check in**. The interview starts by itself.
7. Watch the investigation page: what vllo hears, what it checks, contradictions as they appear, and the question it is asking and why.
8. When it ends, click **View full report** or **Email report**.

Try saying things that clash with the evidence, for example "I took an Uber home" or "I was alone all evening", and watch the contradiction appear.

## Fallbacks and known limits

| Situation | What to do |
|---|---|
| First page load is slow | The backend runs on Render's free tier and sleeps when idle. Wait up to a minute. |
| Interview does not start after check-in | Refresh the room page and tap Check in again. |
| The agent interrupts itself | Use headphones. Speaker sound is picked up as the person talking. |
| Registrations or photos disappeared | The server keeps state in memory; a restart clears it. Register again. The interview link still works on its own. |
| Start over | "Reset demo" at the bottom of the Investigations page. |
| Email report | Opens your mail app with the report written. Automatic sending needs an email provider and is not set up. |

Other limits: the conflict rules are written for one demo case (case 024, a warehouse break-in) with two roles; evidence is synthetic; desktop Chrome and mobile Chrome/Safari are tested.

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
                                               |-- Guardrails: every challenge question checked before it is asked
                                               '-- Report: built from recorded claims only
```

- The browser streams 24 kHz audio to the server; the server holds the AssemblyAI connection, so the API key never reaches the browser.
- After each answer, Groq turns it into claims (place, time, vehicle, companion, car handover). The rules compare them to the evidence and to other interviews.
- New contradictions and still-open objectives are passed to the agent between turns, so its next question goes after them.
- Questions that accuse, lead, pressure or name another person are blocked in code. Asking for a lawyer ends the interview, with a server-side backstop if the model does not.

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
```

| Variable | Purpose |
|---|---|
| `ASSEMBLYAI_API_KEY` | Voice Agent API (required) |
| `GROQ_API_KEY` | Claim extraction and web checks |
| `VLLO_LLM` | `managed` (default), `groq` or `gateway`: which model runs the voice agent |
| `VITE_API_URL` | Backend URL when the frontend is hosted separately (defaults to the Render backend on vercel.app) |
