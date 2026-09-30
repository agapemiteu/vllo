import { motion, AnimatePresence } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { Face } from "@/components/Face";
import { cn } from "@/lib/utils";
import type { Snapshot } from "@/lib/useConsole";

const COVERAGE_TARGET = 80;

/** Targets the session is working toward, and the numbers so far. */
export function Targets({ s }: { s: Snapshot }) {
  const m = s.insights.metrics;
  const stats: [string, number | string][] = [
    ["Claims", m.claims],
    ["Facts", m.facts],
    ["Conflicts", m.conflicts],
    ["Resolved", m.resolved],
    ["Questions", m.questions],
    ["Blocked", m.blocked],
  ];
  return (
    <div className="grid grid-cols-[1.25fr_1fr] gap-px overflow-hidden rounded-lg border bg-stone-200">
      <div className="bg-white p-3">
        <div className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Targets</div>
        <ul className="space-y-1">
          {s.objectives.map((o) => (
            <li key={o.id} className="flex items-center gap-2 text-[12px]">
              <span className={cn("flex size-4 items-center justify-center rounded-full border transition-colors duration-500", o.resolved ? "border-emerald-500 bg-emerald-500 text-white" : "bg-white")}>
                {o.resolved && <HugeiconsIcon icon={CheckmarkCircle02Icon} size={10} />}
              </span>
              <span className={cn("flex-1", o.resolved ? "text-stone-400 line-through decoration-stone-300" : "text-stone-700")}>{o.text}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{o.id}</span>
            </li>
          ))}
          {(["daniel", "tunde"] as const).map((p) => {
            const v = m.coverage[p];
            return (
              <li key={p} className="flex items-center gap-2 text-[12px]">
                <Face id={p} name={s.case.interviewees.find((x: any) => x.id === p).name} className="size-4" />
                <span className="w-36 text-stone-700">{p === "daniel" ? "Daniel" : "Tunde"}, timeline coverage</span>
                <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
                  <motion.span className={cn("absolute inset-y-0 left-0 rounded-full", v >= COVERAGE_TARGET ? "bg-emerald-500" : "bg-stone-800")} animate={{ width: `${v}%` }} transition={{ duration: 0.6 }} />
                  <span className="absolute inset-y-0 w-px bg-stone-400" style={{ left: `${COVERAGE_TARGET}%` }} />
                </span>
                <span className="w-9 text-right font-mono text-[10px] text-muted-foreground tabular-nums">{v}%</span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="grid grid-cols-3 gap-px bg-stone-200">
        {stats.map(([k, v]) => (
          <div key={k} className="flex flex-col justify-center bg-white px-3 py-2">
            <motion.span key={String(v)} initial={{ opacity: 0.3, y: -3 }} animate={{ opacity: 1, y: 0 }} className="text-xl font-semibold tabular-nums">
              {v}
            </motion.span>
            <span className="text-[10px] text-muted-foreground">{k}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Facts({ s, onClaim }: { s: Snapshot; onClaim: (id: string) => void }) {
  const f = s.insights.facts;
  if (!f.length) return <p className="px-4 pb-4 text-sm text-muted-foreground">Facts appear once a statement is supported by the other account or the evidence.</p>;
  return (
    <ul className="space-y-1.5 px-4 pb-4">
      <AnimatePresence initial={false}>
        {f.map((x) => (
          <motion.li key={x.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-2.5 rounded-md border bg-white p-2.5">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={15} className={x.status === "corroborated" ? "mt-px text-emerald-600" : "mt-px text-stone-400"} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-stone-800">{x.text}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <span className={cn("rounded px-1.5 text-[10px]", x.status === "corroborated" ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500")}>
                  {x.status === "corroborated" ? "Corroborated" : "Single source"}
                </span>
                {x.sources.map((id) => (
                  <button key={id} onClick={() => onClaim(id)} className="cursor-pointer rounded bg-stone-100 px-1 font-mono text-[10px] text-stone-500 hover:bg-stone-200">
                    {id}
                  </button>
                ))}
              </div>
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

const VERDICT: Record<string, { l: string; c: string }> = {
  agree: { l: "Agree", c: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  diverge: { l: "Diverge", c: "bg-amber-50 text-amber-800 border-amber-200" },
  one_account: { l: "One account", c: "bg-stone-50 text-stone-500" },
  none: { l: "Not stated", c: "bg-stone-50 text-stone-400" },
};

export function Compare({ s, onClaim }: { s: Snapshot; onClaim: (id: string) => void }) {
  const name = (id: string) => s.case.interviewees.find((p: any) => p.id === id).name;
  const Cell = ({ v }: { v: { text: string; claimId?: string } | null }) =>
    v ? (
      <button onClick={() => v.claimId && onClaim(v.claimId)} className="cursor-pointer text-left text-[12px] text-stone-800 hover:underline">
        {v.text} {v.claimId && <span className="font-mono text-[10px] text-stone-400">{v.claimId}</span>}
      </button>
    ) : (
      <span className="text-[12px] text-stone-300">not stated</span>
    );
  return (
    <div className="px-4 pb-4">
      <div className="grid grid-cols-[1.1fr_1fr_1fr_auto] items-center gap-x-3 border-b pb-1.5 text-[11px] font-medium text-muted-foreground">
        <span>Topic</span>
        <span className="flex items-center gap-1.5">
          <Face id="daniel" name={name("daniel")} className="size-4" /> Daniel says
        </span>
        <span className="flex items-center gap-1.5">
          <Face id="tunde" name={name("tunde")} className="size-4" /> Tunde says
        </span>
        <span />
      </div>
      {s.insights.compare.map((r) => (
        <div key={r.topic} className="grid grid-cols-[1.1fr_1fr_1fr_auto] items-start gap-x-3 border-b py-2 last:border-0">
          <div>
            <div className="text-[12px] font-medium">{r.topic}</div>
            {r.evidence && <div className="mt-0.5 text-[10px] text-red-600">{r.evidence}</div>}
          </div>
          <Cell v={r.daniel} />
          <Cell v={r.tunde} />
          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap", VERDICT[r.verdict].c)}>{VERDICT[r.verdict].l}</span>
        </div>
      ))}
    </div>
  );
}
