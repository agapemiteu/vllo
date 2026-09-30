import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { motion, AnimatePresence } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertDiamondIcon, ArrowLeft01Icon, ArrowUpRight01Icon, CheckmarkCircle02Icon, Copy01Icon, Download04Icon, FileValidationIcon, Mail01Icon, PlayIcon, StopCircleIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { Face } from "@/components/Face";
import { ProcessFeed } from "@/components/ProcessFeed";
import { Report } from "@/components/Report";
import { Pill, firstName, status } from "@/components/Status";
import { useTick } from "@/components/Sequence";
import { cn, pretty } from "@/lib/utils";
import { useConsole, type RoomId, type Snapshot } from "@/lib/useConsole";
import { postJson, roomLink, slotOf, startFreshWorkspace, wsApi } from "@/lib/workspace";

function QR({ value }: { value: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: 240, color: { dark: "#1c1917", light: "#ffffff" } }).then(setSrc, () => setSrc(""));
  }, [value]);
  return src ? <img src={src} alt="Interview link QR code" className="size-32 shrink-0 rounded-xl border bg-white p-1.5" /> : <div className="size-32 shrink-0 rounded-xl border bg-white" />;
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

/** PDF download always works; email sends through the server and falls back to the download on any failure. */
function ReportActions({ ws, id, s }: { ws: string; id: RoomId; s: Snapshot }) {
  const [to, setTo] = useState(s.plan[id].email ?? "");
  const [state, setState] = useState<{ kind: "idle" | "sending" | "sent" | "failed"; msg?: string }>({ kind: "idle" });
  const pdf = wsApi(ws, `/report/${slotOf(id)}.pdf`);

  async function send() {
    if (!EMAIL.test(to.trim())) return setState({ kind: "failed", msg: "That email address doesn't look right." });
    setState({ kind: "sending" });
    const r = await postJson(wsApi(ws, `/email/${slotOf(id)}`), { to: to.trim() }, 40_000);
    if (r.ok) return setState({ kind: "sent", msg: `Sent to ${to.trim()}. Check the inbox (and spam) in a minute.` });
    setState({ kind: "failed", msg: r.data?.error ?? "The email couldn't be sent, so the report was downloaded instead." });
    if (r.status !== 400 && r.status !== 429) window.location.assign(pdf);
  }

  return (
    <div className="space-y-3 rounded-2xl border p-4">
      <div className="text-[13px] font-medium">Interview report</div>
      <a href={pdf} className="block">
        <Button className="w-full">
          <HugeiconsIcon icon={Download04Icon} size={15} /> Download PDF
        </Button>
      </a>
      <div className="flex gap-2">
        <input
          type="email"
          inputMode="email"
          value={to}
          maxLength={200}
          onChange={(e) => setTo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="you@example.com"
          className="h-10 min-w-0 flex-1 rounded-lg border bg-white px-3 text-[14px] outline-none focus:ring-2 focus:ring-stone-300"
        />
        <Button variant="outline" className="h-10" disabled={state.kind === "sending"} onClick={send}>
          <HugeiconsIcon icon={Mail01Icon} size={15} /> {state.kind === "sending" ? "Sending" : "Email"}
        </Button>
      </div>
      {state.msg && <p className={cn("text-[13px]", state.kind === "sent" ? "text-emerald-700" : "text-amber-800")}>{state.msg}</p>}
    </div>
  );
}

export default function Investigation({ ws, slot }: { ws: string; slot: RoomId | null }) {
  const { state: s, send } = useConsole(ws);
  const [copied, setCopied] = useState(false);
  const [wantReport, setWantReport] = useState(false);
  const reportRef = useRef<HTMLElement>(null);
  useTick(500);
  const hasReport = !!s?.report;
  useEffect(() => {
    if (wantReport && hasReport) {
      reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setWantReport(false);
    }
  }, [wantReport, hasReport]);

  if (!s)
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        <span className="shimmer-text">Waking up the server, this can take up to a minute</span>
      </div>
    );

  // No slot in the link: open whoever is registered first.
  const id: RoomId | undefined = slot ?? (["daniel", "tunde"] as RoomId[]).find((r) => s.registered[r] || s.claims.some((c) => c.room === r));
  const exists = !!id && (s.registered[id] || s.rooms[id].status !== "IDLE" || s.claims.some((c) => c.room === id));
  if (!id || !exists)
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <Logo />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">This investigation isn’t available anymore</h1>
        <p className="max-w-md text-[15px] text-muted-foreground">It may have expired or the server restarted. Start a new one; it only takes a minute.</p>
        <a
          href="/new"
          onClick={() => startFreshWorkspace()}
          className="mt-2"
        >
          <Button size="lg">Interview a suspect</Button>
        </a>
      </div>
    );

  const p = s.case.interviewees.find((x: any) => x.id === id);
  const room = s.rooms[id];
  const plan = s.plan[id];
  const st = status(s, id);
  const first = firstName(s, id);
  const link = roomLink(ws, id);
  const activity = s.activity.filter((a) => a.room === id);
  const conflicts = s.conflicts.filter((c) => c.rooms.includes(id) || c.claimIds.some((cid) => s.claims.find((x) => x.id === cid)?.room === id));
  const facts = s.insights.facts.filter((f) => f.sources.some((sid) => s.claims.find((x) => x.id === sid)?.room === id));
  const ended = room.status === "ENDED";
  const interrupted = room.status === "DISCONNECTED";

  return (
    <div className="flex min-h-full flex-col bg-white">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <a href="/" className="flex items-center gap-2 text-[14px] text-muted-foreground hover:text-stone-900">
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} /> Investigations
        </a>
        <Logo />
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {/* Subject + timer */}
        <section className="flex flex-wrap items-center gap-6">
          <Face id={id} name={p.name} square className="size-16 sm:size-24" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight break-words">{p.name}</h1>
              <Pill tone={st.tone}>{st.label}</Pill>
            </div>
            <p className="mt-1 text-[14px] text-muted-foreground">{p.relation}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {s.case.title} · {Math.round((plan.durationSec / 60) * 10) / 10} minute interview
            </p>
          </div>
          <div className="w-full text-left sm:w-auto sm:text-right">
            <div className={cn("font-mono text-3xl font-medium tabular-nums", st.key === "live" ? "text-emerald-700" : st.key === "scheduled" ? "text-amber-700" : "text-stone-400")}>
              {st.key === "live" || st.key === "scheduled" ? st.timer.replace("Starts in ", "").replace(" left", "") : st.key === "done" ? "Done" : st.key === "armed" ? "Ready" : "--:--"}
            </div>
            <div className="mt-1 text-[12px] text-muted-foreground">
              {st.key === "live" ? "remaining" : st.key === "scheduled" ? "until the interview starts" : st.timer}
            </div>
            <div className="mt-3 flex gap-2 sm:justify-end">
              {(room.status === "IDLE" && !plan.armed) || interrupted ? (
                <Button size="sm" onClick={() => send({ type: "start_room", room: slotOf(id) })}>
                  <HugeiconsIcon icon={PlayIcon} size={13} /> {interrupted ? "Restart interview" : plan.checkedIn ? "Start now" : "Start when they join"}
                </Button>
              ) : null}
              {st.key === "live" && (
                <Button size="sm" variant="outline" onClick={() => send({ type: "end_room", room: slotOf(id) })}>
                  <HugeiconsIcon icon={StopCircleIcon} size={14} /> End
                </Button>
              )}
            </div>
          </div>
        </section>

        {st.key === "live" && (
          <div className="mt-5 h-1 overflow-hidden rounded-full bg-stone-100">
            <motion.div className="h-full bg-emerald-500" animate={{ width: `${Math.min(100, Math.max(0, (st.progress ?? 0) * 100))}%` }} transition={{ ease: "linear", duration: 0.5 }} />
          </div>
        )}

        {interrupted && (
          <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[14px] text-amber-900">
            The connection to the interviewer was lost. What was said so far is kept. Restart the interview; {first} will need to tap Check in again.
          </p>
        )}

        {/* Invite */}
        {(room.status === "IDLE" || interrupted) && (
          <section className="mt-8 rounded-2xl border bg-stone-50 p-5">
            <div className="flex flex-col gap-5 sm:flex-row">
              <QR value={link} />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-medium">Next: {first} opens this link</div>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  Scan it with the phone {first} will use, send it, or open it here to try it yourself. Headphones recommended.
                </p>
                <div className="mt-3 flex gap-2">
                  <input readOnly value={link} className="h-10 min-w-0 flex-1 rounded-lg border bg-white px-3 font-mono text-[13px] text-stone-700" onFocus={(e) => e.target.select()} />
                  <Button
                    variant="outline"
                    className="h-10"
                    onClick={() => {
                      navigator.clipboard?.writeText(link).then(
                        () => {
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1500);
                        },
                        () => {},
                      );
                    }}
                  >
                    <HugeiconsIcon icon={copied ? CheckmarkCircle02Icon : Copy01Icon} size={15} /> {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <div className="mt-3 flex items-center gap-2 text-[13px]">
                  <span className={cn("size-2 rounded-full", plan.checkedIn ? "bg-emerald-500" : "bg-stone-300")} />
                  {plan.checkedIn ? `${first} has checked in` : `Waiting for ${first} to open the link`}
                </div>
                <a href={link} target="_blank" rel="noreferrer" className="mt-4 inline-block">
                  <Button>
                    <HugeiconsIcon icon={ArrowUpRight01Icon} size={15} /> Open interview room
                  </Button>
                </a>
              </div>
            </div>
          </section>
        )}

        {/* Live process + findings */}
        <section className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="flex h-[60vh] min-h-[420px] flex-col overflow-hidden rounded-2xl border">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-[13px] font-medium">Interview</span>
              <span className="text-[12px] text-muted-foreground">what vllo hears, thinks and asks</span>
            </div>
            {room.lastQuestion && !ended && (
              <div className="border-b bg-stone-50 px-4 py-2.5">
                <div className="text-[11px] text-muted-foreground">Asking because: {pretty(room.lastQuestion.reason).toLowerCase()}</div>
                <div className="text-[14px] font-medium">{room.lastQuestion.question}</div>
              </div>
            )}
            <ProcessFeed activity={activity} room={room} name={p.name} claims={s.claims.filter((c) => c.room === id).length} />
          </div>

          <div className="space-y-6">
            <div>
              <div className="mb-3 text-[13px] font-medium">Contradictions found</div>
              {conflicts.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">None yet. Every statement is checked against the evidence as it is spoken.</p>
              ) : (
                <ul className="space-y-2">
                  <AnimatePresence initial={false}>
                    {conflicts.map((c) => (
                      <motion.li key={c.id} layout initial={{ opacity: 0, y: 6, backgroundColor: "#fef3c7" }} animate={{ opacity: 1, y: 0, backgroundColor: "#ffffff" }} transition={{ duration: 0.4, backgroundColor: { duration: 1.5 } }} className="rounded-xl border p-3">
                        <div className="flex items-center gap-2">
                          <HugeiconsIcon icon={c.status === "OPEN" ? AlertDiamondIcon : CheckmarkCircle02Icon} size={15} className={c.status === "OPEN" ? "text-amber-600" : "text-emerald-600"} />
                          <span className="text-[13px] font-medium capitalize">{c.topic}</span>
                          <span className={cn("ml-auto text-[11px] font-medium", c.status === "OPEN" ? "text-amber-700" : "text-emerald-700")}>{c.status === "OPEN" ? "Open" : "Resolved"}</span>
                        </div>
                        <p className="mt-1 text-[12px] leading-relaxed text-stone-600">{c.summary}</p>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </div>
            {facts.length > 0 && (
              <div>
                <div className="mb-3 text-[13px] font-medium">Established</div>
                <ul className="space-y-1.5">
                  {facts.map((f) => (
                    <li key={f.id} className="flex gap-2 text-[13px] text-stone-700">
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                      {f.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(ended || interrupted) && (
              <>
                <ReportActions ws={ws} id={id} s={s} />
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    if (!s.report) send({ type: "report" });
                    setWantReport(true);
                  }}
                >
                  <HugeiconsIcon icon={FileValidationIcon} size={15} /> View the report here
                </Button>
              </>
            )}
          </div>
        </section>

        {s.report && (ended || interrupted) && (
          <section ref={reportRef} className="mt-8 scroll-mt-4 overflow-hidden rounded-2xl border">
            <Report r={s.report} onClose={() => send({ type: "close_report" })} />
          </section>
        )}
      </main>
    </div>
  );
}
