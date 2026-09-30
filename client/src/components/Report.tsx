import { Face } from "@/components/Face";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, PrinterIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { avatar, cn, pretty } from "@/lib/utils";

export function Report({ r, onClose }: { r: any; onClose: () => void }) {
  const name = (id: string) => r.interviews.find((i: any) => i.id === id)?.name ?? id;
  return (
    <div className="scroll-thin h-full overflow-y-auto bg-white">
      <div className="mx-auto max-w-3xl px-8 py-8">
        <div className="no-print mb-6 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <HugeiconsIcon icon={PrinterIcon} size={14} /> Print
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <HugeiconsIcon icon={Cancel01Icon} size={14} /> Close
          </Button>
        </div>

        <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">Case report · {new Date(r.generatedAt).toLocaleString()}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{r.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {r.incident.date} {r.incident.time} · {r.incident.location}
        </p>

        <div className="mt-6 grid grid-cols-5 gap-px overflow-hidden rounded-lg border bg-stone-200">
          {[
            ["Interviews", r.interviews.length],
            ["Claims", r.totals.claims],
            ["Conflicts", r.totals.conflicts],
            ["Resolved", r.totals.resolved],
            ["Open", r.totals.open],
          ].map(([k, v]) => (
            <div key={k} className="bg-white px-4 py-3">
              <div className="text-2xl font-semibold tabular-nums">{v}</div>
              <div className="text-[11px] text-muted-foreground">{k}</div>
            </div>
          ))}
        </div>

        <Section title="Interviews">
          <div className="grid grid-cols-2 gap-3">
            {r.interviews.map((i: any) => (
              <div key={i.id} className="flex items-center gap-3 rounded-lg border p-3">
                <Face id={i.id} name={i.name} className="size-9" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{i.name}</div>
                  <div className="text-[12px] text-muted-foreground">
                    {i.duration} · {i.claims} claims · {i.endReason}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Converged timeline">
          {r.timeline.map((t: any) => (
            <div key={t.person} className="mb-3">
              <div className="mb-1 text-[12px] font-medium">{name(t.person)}</div>
              {t.entries.length === 0 && <p className="text-[12px] text-muted-foreground">No timed statements.</p>}
              {t.entries.map((e: any) => (
                <div key={e.id} className="flex gap-3 border-l py-0.5 pl-3 text-[12px]">
                  <span className="w-20 font-mono text-muted-foreground">
                    {e.time}
                    {e.timeEnd ? `–${e.timeEnd}` : ""}
                  </span>
                  <span className={cn("flex-1", e.status === "REVISED" && "text-stone-400 line-through")}>
                    {pretty(e.subject)}: {pretty(e.value)}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {e.id} · said by {name(e.speaker).split(" ")[0]} at {e.at}
                  </span>
                </div>
              ))}
            </div>
          ))}
          <div className="mt-2 flex flex-wrap gap-2">
            {r.evidence.map((e: any) => (
              <span key={e.id} className="rounded border px-2 py-0.5 text-[11px] text-stone-600">
                <span className="font-mono">{e.id}</span> {e.label}
                {e.time ? ` ${e.time}` : ""}: {e.detail}
              </span>
            ))}
          </div>
        </Section>

        <Section title="Conflicts">
          <div className="space-y-3">
            {r.conflicts.map((c: any) => (
              <div key={c.id} className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground">{c.id}</span>
                  <span className="text-sm font-medium capitalize">{c.topic}</span>
                  <Badge variant="muted">{pretty(c.type).toLowerCase()}</Badge>
                  <span className="flex-1" />
                  <Badge variant={c.status === "OPEN" ? "amber" : "green"}>{c.status === "OPEN" ? "Open" : `Resolved by ${c.resolvedBy}`}</Badge>
                </div>
                <p className="mt-1 text-[12px] text-stone-600">{c.summary}</p>
                {c.statements.map((st: any) => (
                  <div key={st.id} className="mt-1 flex gap-2 text-[12px]">
                    <span className="w-16 font-medium">{name(st.speaker).split(" ")[0]}</span>
                    <span className={cn("flex-1 text-stone-700", st.status === "REVISED" && "line-through text-stone-400")}>"{st.quote}"</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {st.id} · {st.at}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Section>

        {r.revisions.length > 0 && (
          <Section title="Revised statements">
            {r.revisions.map((v: any) => (
              <div key={v.id} className="mb-1 text-[12px]">
                <span className="font-medium">{name(v.room).split(" ")[0]}</span> · {pretty(v.subject)}:{" "}
                <span className="text-stone-400 line-through">{pretty(v.oldValue)}</span> → <span className="font-medium">{pretty(v.newValue)}</span>{" "}
                <span className="text-muted-foreground">
                  ("{v.oldQuote}" → "{v.newQuote}", at {v.at})
                </span>
              </div>
            ))}
          </Section>
        )}

        <Section title="Objectives">
          {r.objectives.map((o: any) => (
            <div key={o.id} className="flex gap-2 text-[12px]">
              <span className="w-8 font-mono text-muted-foreground">{o.id}</span>
              <span className="flex-1">{o.text}</span>
              <Badge variant={o.resolved ? "green" : "amber"}>{o.resolved ? "Resolved" : "Open"}</Badge>
            </div>
          ))}
        </Section>

        {(r.leads.length > 0 || r.research.length > 0) && (
          <Section title="Lines of inquiry and research">
            {r.leads.map((l: any) => (
              <div key={l.id} className="text-[12px]">
                <span className="font-mono text-muted-foreground">{l.id}</span> <span className="capitalize">{l.kind}</span> ({name(l.room).split(" ")[0]}): {l.text}
              </div>
            ))}
            {r.research.map((i: any) => (
              <div key={i.id} className="mt-1 text-[12px]">
                <span className="font-mono text-muted-foreground">{i.id}</span> {i.query}: <span className="text-stone-600">{i.summary}</span>
              </div>
            ))}
          </Section>
        )}

        <Section title="Guardrail log">
          {r.guardrails.length === 0 && <p className="text-[12px] text-muted-foreground">No guardrail events.</p>}
          {r.guardrails.map((g: any) => (
            <div key={g.id} className="flex gap-2 text-[12px]">
              <Badge variant={g.action === "FLAGGED" ? "amber" : "red"}>{g.action}</Badge>
              <span className="font-mono">{g.rule}</span>
              <span className="flex-1 truncate text-stone-600">{g.detail}</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {name(g.room).split(" ")[0]} · {g.at}
              </span>
            </div>
          ))}
        </Section>

        <p className="mt-10 border-t pt-4 text-[12px] text-muted-foreground">{r.principle}</p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  );
}
