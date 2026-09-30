import { Face } from "@/components/Face";
import { motion, AnimatePresence } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertDiamondIcon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { avatar, cn, mmss } from "@/lib/utils";
import type { Snapshot } from "@/lib/useConsole";

const TYPE_LABEL: Record<string, string> = {
  CROSS_ACCOUNT_CONFLICT: "Cross-account",
  EXTERNAL_CONFLICT: "Evidence",
  INTERNAL_CONFLICT: "Self",
};

export function Conflicts({ s, highlight, onClaim }: { s: Snapshot; highlight?: string | null; onClaim: (id: string) => void }) {
  const list = [...s.conflicts].sort((a, b) => (a.status === b.status ? b.createdAt - a.createdAt : a.status === "OPEN" ? -1 : 1));
  const name = (r: string) => s.case.interviewees.find((p: any) => p.id === r)?.name ?? r;

  if (!list.length)
    return <p className="px-4 pb-4 text-sm text-muted-foreground">No conflicts yet. Every claim is checked against the evidence and the other interview as it is spoken.</p>;

  return (
    <div className="space-y-2 px-4 pb-4">
      <AnimatePresence initial={false}>
        {list.map((c) => {
          const open = c.status === "OPEN";
          return (
            <motion.div
              key={c.id}
              layout
              initial={{ opacity: 0, x: -12, backgroundColor: "#fef3c7" }}
              animate={{ opacity: 1, x: 0, backgroundColor: "#ffffff" }}
              transition={{ duration: 0.4, backgroundColor: { duration: 1.6 } }}
              className={cn("rounded-lg border p-3", open ? "border-amber-200" : "border-stone-200")}
            >
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={open ? AlertDiamondIcon : CheckmarkCircle02Icon} size={15} className={open ? "text-amber-600" : "text-emerald-600"} />
                <span className="font-mono text-[11px] text-muted-foreground">{c.id}</span>
                <span className="text-[13px] font-medium capitalize">{c.topic}</span>
                <Badge variant={c.type === "CROSS_ACCOUNT_CONFLICT" ? "default" : "muted"}>{TYPE_LABEL[c.type]}</Badge>
                <span className="flex-1" />
                <Badge variant={open ? "amber" : "green"}>{open ? "Open" : `Resolved by ${c.resolvedBy}`}</Badge>
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-stone-600">{c.summary}</p>
              <div className="mt-2 space-y-1">
                {c.claimIds.map((id) => {
                  const cl = s.claims.find((x) => x.id === id);
                  if (!cl) return null;
                  return (
                    <button
                      key={id}
                      onClick={() => onClaim(id)}
                      className={cn("flex w-full cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-left hover:bg-stone-50", highlight === id && "bg-amber-50")}
                    >
                      <Face id={cl.room} name={name(cl.room)} className="mt-0.5 size-4" />
                      <span className={cn("flex-1 text-[12px] text-stone-700", cl.status === "REVISED" && "text-stone-400 line-through")}>"{cl.quote}"</span>
                      <span className="font-mono text-[10px] whitespace-nowrap text-muted-foreground">
                        {id} · {mmss(cl.saidAt)}
                      </span>
                    </button>
                  );
                })}
                {c.evidenceIds.map((e) => {
                  const ev = s.case.evidence.find((x: any) => x.id === e);
                  return (
                    <div key={e} className="flex items-start gap-2 px-1.5 py-0.5 text-[12px] text-stone-500">
                      <span className="mt-1 size-0 border-x-4 border-b-[7px] border-x-transparent border-b-red-500" />
                      <span className="flex-1">{ev?.detail}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{e}</span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
