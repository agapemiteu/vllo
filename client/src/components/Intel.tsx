import { Face } from "@/components/Face";
import { motion, AnimatePresence } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Globe02Icon, Idea01Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { avatar, cn } from "@/lib/utils";
import type { Snapshot } from "@/lib/useConsole";

const KIND_TONE: Record<string, string> = {
  motive: "text-rose-700 bg-rose-50",
  opportunity: "text-amber-800 bg-amber-50",
  means: "text-sky-700 bg-sky-50",
  relationship: "text-violet-700 bg-violet-50",
  lead: "text-stone-700 bg-stone-100",
};

export function Intel({ s }: { s: Snapshot }) {
  const name = (r: string) => s.case.interviewees.find((p: any) => p.id === r)?.name ?? r;
  const items = [
    ...s.leads.map((l) => ({ kind: "lead" as const, at: l.at, id: l.id, room: l.room, l })),
    ...s.intel.map((i) => ({ kind: "web" as const, at: i.at, id: i.id, room: i.room, i })),
  ].sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));

  if (!items.length)
    return <p className="px-4 pb-4 text-sm text-muted-foreground">The agents log lines of inquiry and run web checks on places and routes as the interviews unfold.</p>;

  return (
    <div className="space-y-1.5 px-4 pb-4">
      <AnimatePresence initial={false}>
        {items.map((it) => (
          <motion.div key={it.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2.5 rounded-md border bg-white p-2.5">
            <Face id={it.room} name={name(it.room)} className="size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              {it.kind === "lead" ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <HugeiconsIcon icon={Idea01Icon} size={12} className="text-stone-500" />
                    <span className={cn("rounded px-1.5 text-[10px] font-medium capitalize", KIND_TONE[it.l.kind])}>{it.l.kind}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{it.id}</span>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-stone-700">{it.l.text}</p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <HugeiconsIcon icon={it.i.status === "running" ? Loading03Icon : Globe02Icon} size={12} className={cn("text-sky-600", it.i.status === "running" && "animate-spin")} />
                    <span className={cn("text-[12px] font-medium", it.i.status === "running" && "shimmer-text text-stone-700")}>{it.i.query}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{it.i.purpose}</p>
                  {it.i.summary && <p className={cn("mt-1 text-[12px] leading-relaxed", it.i.status === "error" ? "text-red-600" : "text-stone-700")}>{it.i.summary}</p>}
                  {!!it.i.sources?.length && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {it.i.sources.map((src) => (
                        <a key={src.url} href={src.url} target="_blank" rel="noreferrer" className="max-w-48 truncate rounded bg-stone-100 px-1.5 text-[10px] text-stone-500 hover:text-stone-800">
                          {new URL(src.url).hostname.replace("www.", "")}
                        </a>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
