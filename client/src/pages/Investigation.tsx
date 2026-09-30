import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { motion, AnimatePresence } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertDiamondIcon, ArrowLeft01Icon, ArrowUpRight01Icon, Mail01Icon, CheckmarkCircle02Icon, Copy01Icon, FileValidationIcon, PlayIcon, StopCircleIcon,
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

function QR({ value }: { value: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: 240, color: { dark: "#1c1917", light: "#ffffff" } }).then(setSrc);
  }, [value]);
  return src ? <img src={src} alt="Interview link QR code" className="size-32 shrink-0 rounded-xl border bg-white p-1.5" /> : <div className="size-32 shrink-0 rounded-xl border bg-white" />;
}

/** Plain-text report for the investigator's mail app. Sending via the user's own mail client needs no mail service. */
function mailto(s: Snapshot, id: RoomId) {
  const p = s.case.interviewees.find((x: any) => x.id === id);
  const conflicts = s.conflicts.filter((c) => c.rooms.includes(id) || c.claimIds.some((cid) => s.claims.find((x) => x.id === cid)?.room === id));
  const facts = s.insights.facts.filter((f) => f.sources.some((sid) => s.claims.find((x) => x.id === sid)?.room === id));
  const said = s.claims.filter((c) => c.room === id && c.status === "ACTIVE");
  const lines = [
    `vllo interview report: ${p.name}`,
    `${s.case.title} (case ${s.case.case_id}), ${s.case.incident.date} ${s.case.incident.time}`,
    `Ended: ${pretty(s.rooms[id].endReason ?? "")}`,
    "",
    "CONTRADICTIONS",
    ...(conflicts.length ? conflicts.map((c) => `- [${c.status === "OPEN" ? "open" : "resolved"}] ${c.topic}: ${c.summary}`) : ["- none"]),
    "",
    "ESTABLISHED",
    ...(facts.length ? facts.map((f) => `- ${f.text}`) : ["- nothing corroborated yet"]),
    "",
    "WHAT THEY SAID",
    ...said.map((c) => `- ${c.time ? c.time + " " : ""}${pretty(c.subject)}: "${c.quote}"`),
    "",
    `Full report: ${location.origin}/i/${id}`,
    "",
    "vllo reports conflicts between statements and evidence. It does not assess truthfulness, emotion or guilt.",
  ];
  const to = s.plan[id].email ?? "";
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(`vllo report: ${p.name}`)}&body=${encodeURIComponent(lines.join("\n"))}`;
}

export default function Investigation({ id }: { id: RoomId }) {
  const { state: s, send } = useConsole();
  const [copied, setCopied] = useState(false);
  useTick(500);

  if (!s)
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <span className="shimmer-text">Connecting</span>
      </div>
    );

  const p = s.case.interviewees.find((x: any) => x.id === id);
  const room = s.rooms[id];
  const plan = s.plan[id];
  const st = status(s, id);
  const first = firstName(s, id);
  const link = `${location.origin}/room/${id}`;
  const activity = s.activity.filter((a) => a.room === id);
  const conflicts = s.conflicts.filter((c) => c.rooms.includes(id) || c.claimIds.some((cid) => s.claims.find((x) => x.id === cid)?.room === id));
  const facts = s.insights.facts.filter((f) => f.sources.some((sid) => s.claims.find((x) => x.id === sid)?.room === id));
  const ended = room.status === "ENDED";

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
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
              <Pill tone={st.tone}>{st.label}</Pill>
            </div>
            <p className="mt-1 text-[14px] text-muted-foreground">{p.relation}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {s.case.title} · {plan.durationSec / 60} minute interview
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
              {room.status === "IDLE" && !plan.armed && (
                <Button size="sm" onClick={() => send({ type: "start_room", room: id })}>
                  <HugeiconsIcon icon={PlayIcon} size={13} /> {plan.checkedIn ? "Start now" : "Start when they join"}
                </Button>
              )}
              {st.key === "live" && (
                <Button size="sm" variant="outline" onClick={() => send({ type: "end_room", room: id })}>
                  <HugeiconsIcon icon={StopCircleIcon} size={14} /> End
                </Button>
              )}
            </div>
          </div>
        </section>

        {st.key === "live" && (
          <div className="mt-5 h-1 overflow-hidden rounded-full bg-stone-100">
            <motion.div className="h-full bg-emerald-500" animate={{ width: `${Math.min(100, (st.progress ?? 0) * 100)}%` }} transition={{ ease: "linear", duration: 0.5 }} />
          </div>
        )}

        {/* Invite */}
        {room.status === "IDLE" && (
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
                  navigator.clipboard.writeText(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
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
            {ended && (
              <div className="space-y-2">
                <a href={mailto(s, id)} className="block">
                  <Button className="w-full">
                    <HugeiconsIcon icon={Mail01Icon} size={15} /> {plan.email ? `Email report to ${plan.email}` : "Email report"}
                  </Button>
                </a>
                <Button variant="outline" className="w-full" onClick={() => send({ type: "report" })}>
                  <HugeiconsIcon icon={FileValidationIcon} size={15} /> View full report
                </Button>
              </div>
            )}
          </div>
        </section>

        {s.report && ended && (
          <section className="mt-8 overflow-hidden rounded-2xl border">
            <Report r={s.report} onClose={() => send({ type: "close_report" })} />
          </section>
        )}
      </main>
    </div>
  );
}
