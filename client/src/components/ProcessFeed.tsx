import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { cn, mmss } from "@/lib/utils";
import { useArrivals, type Activity, type RoomState } from "@/lib/useConsole";

/** Tool-style verb + argument for each reasoning step. */
function describe(a: Activity): { verb: string; arg: string; out?: string } {
  const after = (s: string) => s.split(" · ").slice(1).join(" · ") || s;
  switch (a.kind) {
    case "claim":
      return { verb: "Record", arg: a.label, out: a.detail };
    case "check":
      return { verb: "CrossCheck", arg: "evidence, both accounts", out: a.detail };
    case "conflict":
      return { verb: "Conflict", arg: a.label, out: a.detail };
    case "resolved":
      return { verb: a.label.startsWith("Statement revised") ? "Revise" : "Resolve", arg: a.label.replace(/^Statement revised: |^Resolved /, ""), out: a.detail };
    case "gate":
      if (a.label.startsWith("Redirected to ")) return { verb: "Prioritise", arg: a.label.replace("Redirected to ", ""), out: a.detail };
      return { verb: "Ask", arg: after(a.label), out: a.detail };
    case "blocked":
      return { verb: "Guardrail", arg: `blocked ${after(a.label)}`, out: a.detail };
    case "lookup":
      if (a.label.toLowerCase().includes("web") || a.label.toLowerCase().includes("search")) return { verb: "WebSearch", arg: a.status === "running" ? a.detail ?? "" : a.refs?.[0] ?? "", out: a.status === "running" ? undefined : a.detail };
      if (a.label.startsWith("New thread")) return { verb: "Thread", arg: a.label.replace("New thread · ", ""), out: a.detail };
      if (a.label.startsWith("New ")) return { verb: "Lead", arg: a.label.replace(/^New | lead$/g, ""), out: a.detail };
      return { verb: "OpenItems", arg: "", out: undefined };
    case "brief":
      return { verb: "Briefing", arg: a.label, out: a.detail };
    case "end":
      return { verb: "End", arg: after(a.label) };
    default:
      return { verb: "Session", arg: a.label, out: a.detail };
  }
}

const DOT: Record<Activity["status"], string> = {
  done: "text-emerald-600",
  running: "text-stone-400",
  warn: "text-amber-500",
  error: "text-red-600",
};

export function ProcessFeed({
  activity, room, name, claims, highlight, onRef,
}: {
  activity: Activity[];
  room: RoomState;
  name: string;
  claims: number;
  highlight?: string | null;
  onRef?: (id: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const isFresh = useArrivals(activity.map((a) => a.id));

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [activity.length, room.agentState, room.userPartial]);

  const first = name.split(" ")[0];

  return (
    <div ref={scroller} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3 font-mono text-[12px] leading-[1.6]">
      {activity.length === 0 && (
        <p className="text-stone-400">{room.status === "IDLE" ? `Waiting for ${first} to begin.` : "Connecting…"}</p>
      )}

      {activity.map((a) => {
        const lit = !!highlight && a.refs?.includes(highlight);
        const running = a.status === "running" || (isFresh(a.id) && ["claim", "check", "gate"].includes(a.kind));
        return (
          <motion.div
            key={a.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className={cn("mb-2", lit && "-mx-2 rounded bg-amber-50 px-2")}
          >
            {a.kind === "heard" ? (
              <div className="flex gap-2 rounded bg-stone-100 px-2 py-1 text-stone-700">
                <span className="text-stone-400 select-none">›</span>
                <span className="font-sans text-[13px]">
                  <span className="mr-1.5 text-[11px] text-stone-400">{first}</span>
                  {a.label}
                </span>
              </div>
            ) : a.kind === "said" ? (
              <div className="flex gap-2">
                <span className="text-stone-900 select-none">●</span>
                <span className={cn("font-sans text-[13px] text-stone-900", a.interrupted && "text-stone-400")}>
                  {a.label}
                  {a.interrupted && <span className="ml-1 font-mono text-[11px] text-amber-600">[interrupted]</span>}
                </span>
              </div>
            ) : (
              <Step a={a} running={running} onRef={onRef} />
            )}
          </motion.div>
        );
      })}

      {room.status === "LIVE" && <StatusLine room={room} claims={claims} />}
    </div>
  );
}

function Step({ a, running, onRef }: { a: Activity; running: boolean; onRef?: (id: string) => void }) {
  const d = describe(a);
  return (
    <div>
      <div className="flex gap-2">
        <span className={cn("select-none", running ? "animate-pulse text-stone-400" : DOT[a.status])}>●</span>
        <span className="min-w-0 flex-1 text-stone-800">
          <span className="font-semibold">{d.verb}</span>
          {d.arg && <span className="text-stone-500">({d.arg})</span>}
          {!running &&
            a.refs?.slice(0, 3).map((r) => (
              <button key={r} onClick={() => onRef?.(r)} className="ml-1.5 cursor-pointer text-[11px] text-stone-400 underline-offset-2 hover:text-stone-700 hover:underline">
                {r}
              </button>
            ))}
        </span>
      </div>
      {(running || d.out) && (
        <div className="flex gap-2 pl-[3px] text-stone-500">
          <span className="text-stone-300 select-none">⎿</span>
          <span className={cn("min-w-0 flex-1", running && "shimmer-text", a.status === "warn" && !running && "text-amber-700", a.status === "error" && !running && "text-red-600")}>
            {running ? (a.kind === "gate" && a.status === "running" ? "Waiting for investigator" : "Running…") : d.out}
          </span>
        </div>
      )}
    </div>
  );
}

const SPIN = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"];

function StatusLine({ room, claims }: { room: RoomState; claims: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => x + 1), 120);
    return () => clearInterval(t);
  }, []);
  const verb = room.agentState === "THINKING" ? "Reasoning" : room.agentState === "SPEAKING" ? "Speaking" : "Listening";
  const elapsed = room.startedAt ? Date.now() - room.startedAt : 0;
  return (
    <div className="mt-1">
      <div className="flex gap-2 text-amber-600">
        <span className="w-[1ch] select-none">{room.agentState === "LISTENING" ? "·" : SPIN[i % SPIN.length]}</span>
        <span>
          <span className={cn(room.agentState !== "LISTENING" && "shimmer-text")}>{verb}…</span>
          <span className="text-stone-400">
            {" "}
            ({mmss(elapsed)} · {claims} claim{claims === 1 ? "" : "s"})
          </span>
        </span>
      </div>
      {room.agentState === "LISTENING" && room.userPartial && (
        <div className="flex gap-2 pl-[3px] text-stone-500">
          <span className="text-stone-300 select-none">⎿</span>
          <span className="font-sans text-[13px] italic">{room.userPartial}</span>
        </div>
      )}
    </div>
  );
}
