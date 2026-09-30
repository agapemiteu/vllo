import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CheckmarkCircle02Icon, Download04Icon, FileValidationIcon, Link01Icon, Refresh01Icon, ShieldBlockchainIcon, StopCircleIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { ProcessFeed } from "@/components/ProcessFeed";
import { Timeline } from "@/components/Timeline";
import { Conflicts } from "@/components/Conflicts";
import { Intel } from "@/components/Intel";
import { Report } from "@/components/Report";
import { RoomColumn } from "@/components/RoomColumn";
import { SequenceBar } from "@/components/Sequence";
import { Compare, Facts, Targets } from "@/components/Session";
import { avatar, cn, mmss, pretty } from "@/lib/utils";
import { useConsole, type RoomId, type Snapshot } from "@/lib/useConsole";

const TABS = [
  ["conflicts", "Conflicts"],
  ["compare", "Compare"],
  ["facts", "Facts established"],
  ["intel", "Intelligence"],
] as const;

function exportSession(s: Snapshot) {
  const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `vllo-case${s.case.case_id}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function Console() {
  const { state: s, connected, send } = useConsole();
  const [highlight, setHighlight] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("conflicts");

  useEffect(() => {
    if (!highlight) return;
    const t = setTimeout(() => setHighlight(null), 4000);
    return () => clearTimeout(t);
  }, [highlight]);

  if (!s)
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <span className="shimmer-text">Connecting to case server</span>
      </div>
    );

  const done = s.objectives.filter((o) => o.resolved).length;
  const openConflicts = s.conflicts.filter((c) => c.status === "OPEN").length;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-6 border-b bg-white px-5 py-3">
        <a href="/" title="Investigation plan">
          <Logo />
        </a>
        <div className="h-5 w-px bg-stone-200" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="font-mono text-muted-foreground">Case {s.case.case_id}</span>
            <span>{s.case.title}</span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            {s.case.incident.date} {s.case.incident.time} · {s.case.incident.location}
          </div>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5">
          {s.objectives.map((o) => (
            <span
              key={o.id}
              title={o.text}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors duration-500",
                o.resolved ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-white text-muted-foreground",
              )}
            >
              {o.resolved && <HugeiconsIcon icon={CheckmarkCircle02Icon} size={11} />}
              {o.id}
            </span>
          ))}
          <span className="ml-1 text-[12px] font-medium tabular-nums">
            Objectives {done}/{s.objectives.length}
          </span>
        </div>
        <div className="h-5 w-px bg-stone-200" />
        <Button size="sm" variant="outline" onClick={() => exportSession(s)} title="Save the full session as JSON">
          <HugeiconsIcon icon={Download04Icon} size={14} /> Save session
        </Button>
        <Button size="sm" onClick={() => send({ type: s.report ? "close_report" : "report" })}>
          <HugeiconsIcon icon={FileValidationIcon} size={14} /> {s.report ? "Back to live" : "Generate report"}
        </Button>
        {confirmReset ? (
          <Button size="sm" variant="outline" className="border-red-200 text-red-700" onClick={() => { send({ type: "reset" }); setConfirmReset(false); }} onMouseLeave={() => setConfirmReset(false)}>
            Confirm reset
          </Button>
        ) : (
          <Button size="icon" variant="ghost" title="Reset case" onClick={() => setConfirmReset(true)}>
            <HugeiconsIcon icon={Refresh01Icon} size={15} />
          </Button>
        )}
        <span className={cn("size-2 rounded-full", connected ? "bg-emerald-500" : "bg-red-500")} title={connected ? "Live" : "Reconnecting"} />
      </header>

      <SequenceBar s={s} />

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(320px,1fr)_minmax(460px,1.45fr)_minmax(320px,1fr)]">
        <RoomColumn s={s} id="daniel" highlight={highlight} onRef={setHighlight} onEnd={() => send({ type: "end_room", room: "daniel" })} send={send} />

        <div className="min-h-0 border-x bg-stone-50/60">
          {s.report ? (
            <Report r={s.report} onClose={() => send({ type: "close_report" })} />
          ) : (
            <div className="scroll-thin h-full space-y-3 overflow-y-auto p-3">
              <Targets s={s} />
              <Card>
                <CardHeader>
                  <CardTitle>Shared timeline</CardTitle>
                  <span className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <Legend c="bg-stone-800" l="location" />
                    <Legend c="bg-sky-600" l="vehicle" />
                    <Legend c="bg-violet-600" l="companion" />
                    <span className="flex items-center gap-1"><span className="gap-hatch inline-block h-2 w-3 rounded-sm" />gap</span>
                  </span>
                </CardHeader>
                <Timeline s={s} highlight={highlight} onClaim={setHighlight} />
              </Card>
              <Card>
                <div className="flex items-center gap-1 border-b px-2 pt-2">
                  {TABS.map(([k, l]) => (
                    <button
                      key={k}
                      onClick={() => setTab(k)}
                      className={cn("-mb-px cursor-pointer border-b-2 px-3 pb-2 text-[12px] font-medium transition-colors", tab === k ? "border-stone-900 text-stone-900" : "border-transparent text-muted-foreground hover:text-stone-700")}
                    >
                      {l}
                      {k === "conflicts" && openConflicts > 0 && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-800">{openConflicts}</span>}
                      {k === "facts" && s.insights.metrics.facts > 0 && <span className="ml-1.5 rounded-full bg-emerald-50 px-1.5 text-[10px] text-emerald-700">{s.insights.metrics.facts}</span>}
                    </button>
                  ))}
                </div>
                <div className="pt-3">
                  {tab === "conflicts" && <Conflicts s={s} highlight={highlight} onClaim={setHighlight} />}
                  {tab === "compare" && <Compare s={s} onClaim={setHighlight} />}
                  {tab === "facts" && <Facts s={s} onClaim={setHighlight} />}
                  {tab === "intel" && <Intel s={s} />}
                </div>
              </Card>
              <p className="px-2 pb-2 text-center text-[11px] text-muted-foreground">
                vllo reports conflicts between statements and evidence. It does not assess truthfulness, emotion, or guilt.
              </p>
            </div>
          )}
        </div>

        <RoomColumn s={s} id="tunde" highlight={highlight} onRef={setHighlight} onEnd={() => send({ type: "end_room", room: "tunde" })} send={send} />
      </div>

      <GuardrailStrip s={s} />
    </div>
  );
}

function Legend({ c, l }: { c: string; l: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn("size-2 rounded-full", c)} />
      {l}
    </span>
  );
}

function GuardrailStrip({ s }: { s: Snapshot }) {
  const events = [...s.guardrails].reverse();
  const name = (r: string) => s.case.interviewees.find((p: any) => p.id === r)?.name.split(" ")[0];
  return (
    <div className="flex h-11 items-center gap-3 border-t bg-white px-5">
      <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        <HugeiconsIcon icon={ShieldBlockchainIcon} size={14} /> Guardrails
      </span>
      <div className="scroll-thin flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        {events.length === 0 && <span className="text-[12px] text-muted-foreground">No accusation, no leading, no source leaks, stop on request. Enforced in code on every question.</span>}
        <AnimatePresence initial={false}>
          {events.map((g) => (
            <motion.span
              key={g.id}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              title={g.detail}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px]",
                g.action === "FLAGGED" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-200 bg-red-50 text-red-700",
              )}
            >
              <span className="font-semibold">{g.action === "BLOCKED" ? "Blocked" : g.action === "ENDED" ? "Ended" : "Flagged"}</span>
              <span className="font-mono">{pretty(g.rule).toLowerCase()}</span>
              <span className="opacity-70">({name(g.room)})</span>
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
