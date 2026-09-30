import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { Face } from "@/components/Face";
import { Pill, status } from "@/components/Status";
import { useTick } from "@/components/Sequence";
import { useConsole, type RoomId } from "@/lib/useConsole";

export default function Home() {
  const { state: s, send } = useConsole();
  const [confirm, setConfirm] = useState(false);
  useTick(1000);
  const ids = s ? (["daniel", "tunde"] as RoomId[]).filter((r) => s.registered[r]) : [];
  const full = ids.length === 2;

  return (
    <div className="min-h-full bg-white">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <Logo />
        {s && !full && (
          <a href="/new">
            <Button>
              <HugeiconsIcon icon={Add01Icon} size={16} /> New investigation
            </Button>
          </a>
        )}
      </header>

      <main className="mx-auto max-w-3xl px-6 pt-10 pb-20">
        <h1 className="text-4xl font-semibold tracking-tight">Investigations</h1>
        <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-muted-foreground">
          Register a person of interest, send them a link, and an AI voice investigator runs the interview. You watch it reason, step by step.
        </p>
        {s && (
          <p className="mt-6 text-[13px] text-muted-foreground">
            <span className="font-mono">Case {s.case.case_id}</span> · {s.case.title} · {s.case.incident.date} {s.case.incident.time}
          </p>
        )}

        {!s ? (
          <p className="mt-12 text-sm text-muted-foreground">
            <span className="shimmer-text">Connecting</span>
          </p>
        ) : ids.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed px-8 py-14 text-center">
            <p className="text-[15px] font-medium">No one registered yet</p>
            <p className="mt-1 text-[14px] text-muted-foreground">Start by registering the person you need to interview.</p>
            <a href="/new" className="mt-6 inline-block">
              <Button size="lg">
                <HugeiconsIcon icon={Add01Icon} size={16} /> New investigation
              </Button>
            </a>
          </div>
        ) : (
          <ul className="mt-10 divide-y rounded-2xl border">
            {ids.map((id) => {
              const p = s.case.interviewees.find((x: any) => x.id === id);
              const st = status(s, id);
              return (
                <li key={id}>
                  <a href={`/i/${id}`} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-stone-50">
                    <Face id={id} name={p.name} square className="size-12" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-medium">{p.name}</div>
                      <div className="truncate text-[13px] text-muted-foreground">{p.relation}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Pill tone={st.tone}>{st.label}</Pill>
                      <span className="font-mono text-[12px] text-muted-foreground tabular-nums">{st.timer}</span>
                    </div>
                    <HugeiconsIcon icon={ArrowRight01Icon} size={16} className="text-stone-300 transition-transform group-hover:translate-x-0.5 group-hover:text-stone-500" />
                  </a>
                </li>
              );
            })}
          </ul>
        )}

        {s && ids.length > 0 && (
          <div className="mt-6 flex justify-end text-[12px] text-muted-foreground">
            {confirm ? (
              <span className="flex items-center gap-3">
                Clear every investigation?
                <button className="cursor-pointer font-medium text-red-600" onClick={() => { send({ type: "reset", full: true }); setConfirm(false); }}>
                  Clear
                </button>
                <button className="cursor-pointer" onClick={() => setConfirm(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button className="cursor-pointer hover:text-stone-800" onClick={() => setConfirm(true)}>
                Reset demo
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
