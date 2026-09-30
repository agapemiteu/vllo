import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, SentIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { cn, pretty } from "@/lib/utils";
import type { RoomId, RoomState } from "@/lib/useConsole";

export function ModeToggle({ room, onMode }: { room: RoomState; onMode: (m: "auto" | "assisted") => void }) {
  return (
    <div className="flex rounded-md border bg-stone-100 p-0.5 text-[11px] font-medium">
      {(["auto", "assisted"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onMode(m)}
          className={cn("cursor-pointer rounded px-2 py-0.5 transition-colors", room.mode === m ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800")}
        >
          {m === "auto" ? "Autonomous" : "Assisted"}
        </button>
      ))}
    </div>
  );
}

/** Assisted mode: the drafted question waits here for the investigator. */
export function Approval({ id, room, send }: { id: RoomId; room: RoomState; send: (m: unknown) => void }) {
  const a = room.approval;
  const [draft, setDraft] = useState(a?.question ?? "");
  useEffect(() => setDraft(a?.question ?? ""), [a?.id]);
  if (!a) return null;
  const edited = draft.trim() !== a.question;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="border-t border-amber-200 bg-amber-50/70 px-4 py-3">
      <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.08em] text-amber-800 uppercase">
        <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
        Awaiting your approval
        <span className="rounded bg-amber-100 px-1.5 font-mono tracking-normal normal-case">why: {pretty(a.reason).toLowerCase()}</span>
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        className="mt-2 w-full resize-none rounded-md border border-amber-200 bg-white px-2.5 py-1.5 text-[13px] leading-snug outline-none focus:ring-2 focus:ring-amber-300"
      />
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={() => send({ type: "decide", room: id, decision: "approve", question: edited ? draft.trim() : undefined })}>
          <HugeiconsIcon icon={Tick02Icon} size={14} /> {edited ? "Ask edited" : "Approve"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => send({ type: "decide", room: id, decision: "reject" })}>
          <HugeiconsIcon icon={Cancel01Icon} size={14} /> Reject
        </Button>
      </div>
    </motion.div>
  );
}

/** Steer the agent in plain words. It still passes every guardrail. */
export function Direct({ id, send, disabled }: { id: RoomId; send: (m: unknown) => void; disabled?: boolean }) {
  const [text, setText] = useState("");
  const submit = () => {
    if (!text.trim()) return;
    send({ type: "direct", room: id, text: text.trim() });
    setText("");
  };
  return (
    <div className="flex items-center gap-2 border-t px-4 py-2">
      <input
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Direct the interviewer, e.g. ask why he went back"
        className="h-8 min-w-0 flex-1 rounded-md border bg-white px-2.5 text-[12px] outline-none placeholder:text-stone-400 focus:ring-2 focus:ring-stone-300 disabled:opacity-50"
      />
      <Button size="icon" variant="outline" disabled={disabled || !text.trim()} onClick={submit} title="Send direction">
        <HugeiconsIcon icon={SentIcon} size={14} />
      </Button>
    </div>
  );
}
