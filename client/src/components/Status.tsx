import { cn, now } from "@/lib/utils";
import type { RoomId, Snapshot } from "@/lib/useConsole";

export const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export const firstName = (s: Snapshot, id: RoomId) => String(s.case.interviewees.find((p: any) => p.id === id)?.name ?? id).split(" ")[0];

/** One source of truth for where an investigation is: drives pills, timers and actions. */
export function status(s: Snapshot, id: RoomId) {
  const room = s.rooms[id];
  const plan = s.plan[id];
  const t = now();
  if (room.status === "LIVE" || room.status === "CONNECTING") {
    const end = (room.startedAt ?? t) + plan.durationSec * 1000;
    return { key: "live", label: "Live", tone: "green", timer: `${clock(end - t)} left`, progress: 1 - (end - t) / (plan.durationSec * 1000) };
  }
  if (room.status === "ENDED") return { key: "done", label: "Completed", tone: "stone", timer: "" };
  if (plan.scheduledAt) {
    const left = plan.scheduledAt - t;
    if (left > 0) return { key: "scheduled", label: "Scheduled", tone: "amber", timer: `Starts in ${clock(left)}` };
    return { key: "due", label: plan.checkedIn ? "Starting" : "Waiting for check-in", tone: "amber", timer: plan.checkedIn ? "Starting" : "Link not opened yet" };
  }
  if (plan.after) {
    return { key: "after", label: "Queued", tone: "stone", timer: `After ${firstName(s, plan.after.room)} finishes` };
  }
  return { key: "manual", label: plan.checkedIn ? "Ready" : "Not started", tone: plan.checkedIn ? "green" : "stone", timer: plan.checkedIn ? "Checked in" : "Waiting for check-in" };
}

export function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium",
        tone === "green" && "bg-emerald-50 text-emerald-700",
        tone === "amber" && "bg-amber-50 text-amber-800",
        tone === "stone" && "bg-stone-100 text-stone-600",
      )}
    >
      {tone === "green" && <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />}
      {children}
    </span>
  );
}
