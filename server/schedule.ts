import type { RoomState, SessionPlan } from "./types.js";

/**
 * Should this interview start now? Pure, so every scheduling path is unit-tested.
 * - Nothing starts unless the interviewee's device is checked in (their mic is open).
 * - Armed, or no slot and not queued behind someone: start on check-in.
 * - A set time: start once it has passed.
 * - Queued after another interview: wait (its end sets scheduledAt).
 */
export function startReason(plan: SessionPlan, room: RoomState, now: number): "checkin" | "schedule" | null {
  if (room.status !== "IDLE" || !plan.checkedIn) return null;
  if (plan.scheduledAt) return now >= plan.scheduledAt ? "schedule" : null;
  if (plan.armed || !plan.after) return "checkin";
  return null;
}

/** When a queued interview's predecessor has ended, when should it start? */
export function afterSlot(plan: SessionPlan, predecessorEnded: boolean, room: RoomState, now: number): number | null {
  if (!plan.after || !predecessorEnded || plan.scheduledAt || room.status !== "IDLE") return null;
  return now + plan.after.gapSec * 1000;
}
