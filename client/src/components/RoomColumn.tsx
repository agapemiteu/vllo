import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Camera01Icon, CheckmarkCircle02Icon, Link01Icon, StopCircleIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProcessFeed } from "@/components/ProcessFeed";
import { Approval, Direct, ModeToggle } from "@/components/Assist";
import { uploadPhoto, usePhoto } from "@/components/Face";
import { activeWorkspace } from "@/lib/workspace";
import { avatar, cn, mmss, pretty } from "@/lib/utils";
import type { RoomId, Snapshot } from "@/lib/useConsole";

const STATUS_BADGE: Record<string, { v: any; l: string }> = {
  IDLE: { v: "muted", l: "Waiting" },
  CONNECTING: { v: "muted", l: "Connecting" },
  LIVE: { v: "green", l: "Live" },
  ENDED: { v: "outline", l: "Ended" },
  DISCONNECTED: { v: "red", l: "Disconnected" },
};

export function RoomColumn({
  s, id, highlight, onRef, onEnd, send,
}: {
  send: (m: unknown) => void;
  s: Snapshot;
  id: RoomId;
  highlight: string | null;
  onRef: (id: string) => void;
  onEnd: () => void;
}) {
  const room = s.rooms[id];
  const person = s.case.interviewees.find((p: any) => p.id === id);
  const activity = s.activity.filter((a) => a.room === id);
  const claims = s.claims.filter((c) => c.room === id).length;
  const asked = activity
    .filter((a) => a.kind === "gate" && a.detail)
    .map((a) => ({ id: a.id, q: a.detail!.replace(/^"|"$/g, ""), why: a.label.split(" · ")[1] ?? "" }));
  const latestRevision = s.revisions.filter((v) => v.room === id).at(-1);
  const [, setTick] = useState(0);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const photo = usePhoto(id);

  useEffect(() => {
    if (room.status !== "LIVE") return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [room.status]);

  useEffect(() => {
    if (!latestRevision) return;
    const v = latestRevision;
    setToast(`${pretty(v.subject)}: ${pretty(v.oldValue)}${v.oldTime ? ` ${v.oldTime}` : ""} → ${pretty(v.newValue)}${v.newTime ? ` ${v.newTime}` : ""}`);
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [latestRevision?.id]);

  const elapsed = room.startedAt ? (room.endedAt ?? Date.now()) - room.startedAt : 0;
  const plan = s.plan?.[id];
  const badge =
    room.status === "IDLE" && plan
      ? plan.checkedIn
        ? { v: "green", l: "Checked in" }
        : plan.scheduledAt
          ? { v: "amber", l: `Scheduled ${new Date(plan.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` }
          : { v: "muted", l: "Not checked in" }
      : STATUS_BADGE[room.status];
  const q = room.lastQuestion;

  return (
    <div className="flex min-h-0 flex-col bg-white">
      {/* Interviewee */}
      <div className="flex gap-4 border-b p-4">
        <button
          onClick={() => file.current?.click()}
          title={photo ? "Replace photo" : "Upload photo"}
          className="group relative size-[72px] shrink-0 cursor-pointer overflow-hidden rounded-lg border bg-stone-100"
        >
          <img src={photo ?? avatar(person.name)} alt={person.name} className="size-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center bg-stone-900/55 opacity-0 transition-opacity group-hover:opacity-100">
            <HugeiconsIcon icon={Camera01Icon} size={18} className="text-white" />
          </span>
        </button>
        <input
          ref={file}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) await uploadPhoto(activeWorkspace(), id, f).catch(() => {});
            e.target.value = "";
          }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[15px] font-semibold">{person.name}</span>
            <span className="font-mono text-[12px] text-muted-foreground tabular-nums">{mmss(elapsed)}</span>
          </div>
          <div className="truncate text-[12px] text-muted-foreground">{person.relation}</div>
          <div className="mt-2 flex items-center gap-1.5">
            <Badge variant={badge.v}>
              {(room.status === "LIVE" || badge.l === "Checked in") && <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />}
              {badge.l}
            </Badge>
            <span className="flex-1" />
            <ModeToggle room={room} onMode={(mode) => send({ type: "mode", room: id, mode })} />
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              title="Copy room link"
              onClick={() => {
                navigator.clipboard.writeText(`${location.origin}/room/${id}`);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
            >
              <HugeiconsIcon icon={copied ? CheckmarkCircle02Icon : Link01Icon} size={14} className={copied ? "text-emerald-600" : ""} />
            </Button>
            {room.status === "LIVE" && (
              <Button size="icon" variant="ghost" className="size-7" title="End this interview" onClick={onEnd}>
                <HugeiconsIcon icon={StopCircleIcon} size={15} />
              </Button>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mx-4 mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-[12px] text-amber-900"
          >
            Statement revised · {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Agent process */}
      <ProcessFeed activity={activity} room={room} name={person.name} claims={claims} highlight={highlight} onRef={onRef} />

      <Approval id={id} room={room} send={send} />

      {/* Next question + sequence */}
      <div className="border-t bg-stone-50">
        {room.status === "ENDED" ? (
          <div className="px-4 py-3 text-[13px] text-stone-600">
            Interview ended <span className="text-muted-foreground">· {pretty(room.endReason ?? "")}</span>
          </div>
        ) : (
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Next question
              {q && (
                <span className="rounded bg-stone-900 px-1.5 py-px font-mono tracking-normal text-white normal-case">
                  why: {pretty(q.reason).toLowerCase()}
                </span>
              )}
              {q?.sourceIds.slice(0, 3).map((sid) => (
                <button key={sid} onClick={() => onRef(sid)} className="cursor-pointer rounded bg-stone-200 px-1 font-mono tracking-normal text-stone-600 normal-case">
                  {sid}
                </button>
              ))}
            </div>
            <AnimatePresence mode="wait">
              <motion.p
                key={q?.question ?? "none"}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={cn("mt-1.5 text-[14px] leading-snug", q ? "font-medium text-stone-900" : "text-muted-foreground")}
              >
                {q?.question ?? (room.status === "LIVE" ? "Free account in progress." : "Not started.")}
              </motion.p>
            </AnimatePresence>
          </div>
        )}
        {asked.length > 1 && (
          <ol className="scroll-thin max-h-28 overflow-y-auto border-t px-4 py-2">
            {asked
              .slice(0, -1)
              .reverse()
              .map((a, i, arr) => (
                <li key={a.id} className="flex gap-2 py-0.5 text-[12px] text-stone-500">
                  <span className="w-5 shrink-0 font-mono text-stone-400 tabular-nums">{arr.length - i}.</span>
                  <span className="min-w-0 flex-1 truncate">{a.q}</span>
                  <span className="shrink-0 font-mono text-[10px] text-stone-400">{a.why}</span>
                </li>
              ))}
          </ol>
        )}
        {room.status === "LIVE" && <Direct id={id} send={send} />}
      </div>
    </div>
  );
}
