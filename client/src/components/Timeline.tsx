import { Face } from "@/components/Face";
import { motion, AnimatePresence } from "motion/react";
import { avatar, cn, pretty } from "@/lib/utils";
import type { Claim, Gap, RoomId, Snapshot } from "@/lib/useConsole";

const START = 20 * 60, END = 22 * 60;
const toMin = (t?: string | null) => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const pct = (t: number) => `${((Math.min(END, Math.max(START, t)) - START) / (END - START)) * 100}%`;

const SUBJECT_DOT: Record<string, string> = {
  location: "bg-stone-800",
  vehicle: "bg-sky-600",
  companion: "bg-violet-600",
  car_handover: "bg-sky-600",
  other: "bg-stone-400",
};

export function Timeline({ s, highlight, onClaim }: { s: Snapshot; highlight?: string | null; onClaim: (id: string) => void }) {
  const people: { id: RoomId; name: string }[] = s.case.interviewees.map((p: any) => ({ id: p.id, name: p.name }));
  const evidence = s.case.evidence.filter((e: any) => e.time);
  const ticks = [0, 30, 60, 90, 120].map((m) => START + m);
  const incident = toMin(s.case.incident.time)!;

  return (
    <div className="px-4 pb-4">
      <div className="relative ml-24">
        <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
          {ticks.map((t) => (
            <span key={t}>{`${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`}</span>
          ))}
        </div>
      </div>

      <div className="relative mt-1">
        {/* incident marker across all rows */}
        <div className="pointer-events-none absolute top-0 bottom-0 left-24 right-0">
          <div className="absolute top-0 bottom-0 border-l border-dashed border-red-400/70" style={{ left: pct(incident) }}>
            <span className="absolute -top-0.5 left-1 font-mono text-[9px] whitespace-nowrap text-red-500">incident {s.case.incident.time}</span>
          </div>
        </div>

        {people.map((p) => (
          <Row
            key={p.id}
            id={p.id}
            label={p.name}
            seed={p.name}
            claims={s.claims.filter((c) => c.about === p.id)}
            gaps={s.gaps.filter((g) => g.person === p.id)}
            highlight={highlight}
            onClaim={onClaim}
          />
        ))}

        <div className="flex h-11 items-center border-t">
          <div className="w-24 shrink-0 text-[11px] font-medium text-muted-foreground">Evidence</div>
          <div className="relative h-full flex-1">
            {[...evidence]
              .sort((a: any, b: any) => toMin(a.time)! - toMin(b.time)!)
              .map((e: any, i: number) => (
                <div key={e.id} className="absolute top-1.5 -translate-x-[5px]" style={{ left: pct(toMin(e.time)!) }} title={`${e.label}: ${e.detail}`}>
                  <span className="block size-0 border-x-[5px] border-b-[8px] border-x-transparent border-b-red-500" />
                  <span className={cn("absolute top-2.5 font-mono text-[9px] whitespace-nowrap text-red-600", i % 2 ? "left-0" : "right-0 -mr-2.5")}>
                    {e.id} {e.label.toLowerCase()} {e.time}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  id, label, seed, claims, gaps, highlight, onClaim,
}: {
  id: string;
  label: string;
  seed: string;
  claims: Claim[];
  gaps: Gap[];
  highlight?: string | null;
  onClaim: (id: string) => void;
}) {
  const timed = claims.filter((c) => toMin(c.time) != null);
  const untimed = claims.filter((c) => toMin(c.time) == null);

  return (
    <div className="flex items-stretch border-t">
      <div className="flex w-24 shrink-0 items-center gap-2">
        <Face id={id} name={seed} className="size-6" />
        <span className="text-[12px] font-medium">{label.split(" ")[0]}</span>
      </div>
      <div className="flex-1">
      <div className="relative h-[68px]">
        <div className="absolute top-[26px] right-0 left-0 h-px bg-stone-200" />
        {gaps.map((g) => (
          <div
            key={g.from}
            className="gap-hatch absolute top-[18px] h-4 rounded-sm"
            style={{ left: pct(toMin(g.from)!), width: `calc(${pct(toMin(g.to)!)} - ${pct(toMin(g.from)!)})` }}
            title={`${g.minutes} unaccounted minutes`}
          />
        ))}
        {timed
          .filter((c) => toMin(c.timeEnd) != null && c.status === "ACTIVE")
          .map((c) => (
            <div
              key={`${c.id}-span`}
              className={cn("absolute top-[24px] h-1 rounded-full opacity-30", SUBJECT_DOT[c.subject])}
              style={{ left: pct(toMin(c.time)!), width: `calc(${pct(toMin(c.timeEnd)!)} - ${pct(toMin(c.time)!)})` }}
            />
          ))}
        <AnimatePresence>
          {timed.map((c, i) => {
            const t = toMin(c.time)!;
            const revised = c.status === "REVISED";
            return (
              <motion.button
                key={c.id}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: revised ? 0.45 : 1, y: 0 }}
                transition={{ duration: 0.3 }}
                onClick={() => onClaim(c.id)}
                className="absolute top-[20px] flex -translate-x-[6px] cursor-pointer flex-col items-start"
                style={{ left: pct(t), zIndex: highlight === c.id ? 20 : 10 }}
                title={`${c.id} "${c.quote}"`}
              >
                <span className="flex items-center">
                  <span className={cn("size-3 rounded-full border-2 border-white shadow-sm", SUBJECT_DOT[c.subject], highlight === c.id && "ring-2 ring-amber-400")} />
                </span>
                <span
                  className={cn(
                    "mt-1 max-w-24 truncate rounded bg-white/90 px-1 text-[10px] leading-tight whitespace-nowrap",
                    revised ? "text-stone-400 line-through" : "text-stone-700",
                    i % 2 === 1 && "mt-3.5",
                  )}
                >
                  {pretty(c.value)} <span className="font-mono text-stone-400">{c.time}</span>
                </span>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
        {untimed.length > 0 && (
          <div className="flex flex-wrap gap-1 pb-2">
            <span className="text-[10px] text-muted-foreground">No time:</span>
            {untimed.map((c) => (
              <button
                key={c.id}
                onClick={() => onClaim(c.id)}
                className={cn(
                  "cursor-pointer rounded-full border bg-white px-1.5 text-[10px]",
                  c.status === "REVISED" ? "text-stone-400 line-through" : "text-stone-600",
                  highlight === c.id && "ring-2 ring-amber-400",
                )}
                title={`"${c.quote}"`}
              >
                {pretty(c.subject)}: {pretty(c.value)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
