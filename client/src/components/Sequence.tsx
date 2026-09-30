import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { Face } from "@/components/Face";
import { cn, now } from "@/lib/utils";
import type { RoomId, Snapshot } from "@/lib/useConsole";

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function useTick(ms = 500) {
  const [, t] = useState(0);
  useEffect(() => {
    const i = setInterval(() => t((x) => x + 1), ms);
    return () => clearInterval(i);
  }, [ms]);
}

/** Where a room is in its run: waiting, counting down, live with time left, or done. */
export function phase(s: Snapshot, id: RoomId) {
  const room = s.rooms[id];
  const plan = s.plan[id];
  const t = now();
  if (room.status === "LIVE" || room.status === "CONNECTING") {
    const total = plan.durationSec * 1000;
    const elapsed = room.startedAt ? t - room.startedAt : 0;
    return { kind: "live" as const, left: total - elapsed, progress: Math.min(1, elapsed / total) };
  }
  if (room.status === "ENDED") return { kind: "done" as const, reason: room.endReason };
  if (plan.scheduledAt) return { kind: "countdown" as const, left: plan.scheduledAt - t, checkedIn: plan.checkedIn };
  return { kind: "idle" as const, checkedIn: plan.checkedIn };
}

/** Console strip: the interviews in order, with countdowns and the handoff between them. */
export function SequenceBar({ s }: { s: Snapshot }) {
  useTick();
  const order: RoomId[] = s.sequence?.order ?? ["tunde", "daniel"];
  const carried = s.activity.filter((a) => a.kind === "brief" && a.room === order[1]).length > 0;
  const carriedCount = s.activity.find((a) => a.kind === "brief" && a.room === order[1])?.refs?.length ?? 0;
  const first = phase(s, order[0]);

  return (
    <div className="flex items-center gap-3 border-b bg-stone-50 px-5 py-2">
      <span className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{s.sequence ? "Run" : "Sessions"}</span>
      <Segment s={s} id={order[0]} n={1} />
      <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className={cn("h-px w-6 bg-stone-300", first.kind === "done" && "bg-amber-400")} />
        <span className={cn("rounded-full border px-2 py-0.5 transition-colors", carried ? "border-amber-300 bg-amber-50 text-amber-800" : "bg-white")}>
          {carried ? `${carriedCount} finding${carriedCount === 1 ? "" : "s"} carried in` : "handoff"}
        </span>
        <HugeiconsIcon icon={ArrowRight01Icon} size={12} />
      </div>
      <Segment s={s} id={order[1]} n={2} />
    </div>
  );
}

function Segment({ s, id, n }: { s: Snapshot; id: RoomId; n: number }) {
  const p = phase(s, id);
  const person = s.case.interviewees.find((x: any) => x.id === id);
  return (
    <div className={cn("relative flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden rounded-md border bg-white px-2.5 py-1.5", p.kind === "live" && "border-emerald-300")}>
      {p.kind === "live" && (
        <motion.div className="absolute inset-y-0 left-0 bg-emerald-50" initial={false} animate={{ width: `${p.progress * 100}%` }} transition={{ duration: 0.5, ease: "linear" }} />
      )}
      <span className="relative font-mono text-[10px] text-muted-foreground">{n}</span>
      <Face id={id} name={person.name} className="relative size-6" />
      <span className="relative truncate text-[12px] font-medium">{person.name}</span>
      <span className="relative ml-auto shrink-0 font-mono text-[11px] tabular-nums">
        {p.kind === "live" && <span className="text-emerald-700">Live · {clock(p.left)} left</span>}
        {p.kind === "countdown" &&
          (p.left > 0 ? (
            <span className="text-amber-700">Starts in {clock(p.left)}</span>
          ) : (
            <span className="text-muted-foreground">{p.checkedIn ? "Starting" : "Waiting for check-in"}</span>
          ))}
        {p.kind === "idle" && <span className="text-muted-foreground">{p.checkedIn ? "Checked in" : "Not scheduled"}</span>}
        {p.kind === "done" && (
          <span className="flex items-center gap-1 text-stone-500">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={12} className="text-emerald-600" /> Completed
          </span>
        )}
      </span>
    </div>
  );
}
