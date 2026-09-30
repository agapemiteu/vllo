import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { Face } from "@/components/Face";
import { Pill, status } from "@/components/Status";
import { useTick } from "@/components/Sequence";
import { useConsole, type RoomId } from "@/lib/useConsole";
import { activeWorkspace, investigationPath, previousWorkspace, startFreshWorkspace } from "@/lib/workspace";

const STEPS: [string, string][] = [
  ["Add the suspect", "Name, photo, what’s already on file. You get an interview link to send them."],
  ["vllo questions them", "It hears their side first, then asks what a good detective would: where exactly, who saw you, why then."],
  ["Every answer checked live", "Each answer becomes a timestamped claim, checked against your evidence and other statements while they’re still talking."],
  ["The case report", "What held up, what changed, and what still doesn’t fit. Every line quoted and timed, sent to your email."],
];

export default function Home() {
  const [ws, setWs] = useState(activeWorkspace);
  const { state: s, send } = useConsole(ws);
  const [confirm, setConfirm] = useState(false);
  const [prev, setPrev] = useState(previousWorkspace);
  useTick(1000);
  const ids = s ? (["daniel", "tunde"] as RoomId[]).filter((r) => s.registered[r]) : [];

  // Everyone in this workspace has finished: coming back starts a clean one (the old report stays linked).
  useEffect(() => {
    if (!s || !ids.length) return;
    const finished = ids.every((r) => s.rooms[r].status === "ENDED" || s.rooms[r].status === "DISCONNECTED");
    if (finished) {
      setWs(startFreshWorkspace());
      setPrev(previousWorkspace());
    }
  }, [s, ids.length]);

  return (
    <div className="min-h-full bg-white">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <Logo />
        {(
          <a href="/new">
            <Button>
              <HugeiconsIcon icon={Add01Icon} size={16} /> Interview a suspect
            </Button>
          </a>
        )}
      </header>

      <main className="mx-auto max-w-3xl px-6 pt-10 pb-20">
        <p className="text-[13px] font-medium tracking-wide text-amber-700">Voice AI for investigations and verification</p>
        <h1 className="mt-3 text-[40px] leading-[1.05] font-semibold tracking-tight sm:text-5xl">An AI detective that interviews suspects and witnesses.</h1>
        <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-stone-600">
          vllo interviews people by voice, checks every answer against your evidence and other statements in real time, follows up on contradictions, and delivers a sourced report.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[14px] font-medium text-stone-500">Built for</span>
          {["Investigators", "HR teams", "Legal teams", "Compliance", "Insurers"].map((t) => (
            <span key={t} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[14px] font-medium text-amber-900">
              {t}
            </span>
          ))}
        </div>
        {(
          <a href="/new" className="mt-8 inline-block">
            <Button size="lg">
              <HugeiconsIcon icon={Add01Icon} size={16} /> Interview a suspect
            </Button>
          </a>
        )}

        {prev && prev !== ws && ids.length === 0 && (
          <p className="mt-6 text-[14px] text-stone-600">
            Your last investigation:{" "}
            <a className="font-medium text-stone-900 underline underline-offset-4" href={`/i/${prev}`}>
              open its report
            </a>
          </p>
        )}

        {!s ? (
          <p className="mt-12 text-sm text-muted-foreground">
            <span className="shimmer-text">Waking up the server, this can take up to a minute</span>
          </p>
        ) : ids.length === 0 ? null : (
          <>
          <h2 className="mt-14 text-[13px] font-medium text-muted-foreground">
            Your investigations · <span className="font-mono">Case {s.case.case_id}</span> {s.case.title}
          </h2>
          <ul className="mt-3 divide-y rounded-2xl border">
            {ids.map((id) => {
              const p = s.case.interviewees.find((x: any) => x.id === id);
              const st = status(s, id);
              return (
                <li key={id}>
                  <a href={investigationPath(ws, id)} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-stone-50">
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
          </>
        )}

        <ol className="mt-16 grid gap-px overflow-hidden rounded-2xl border bg-stone-200 sm:grid-cols-2">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="bg-white p-5">
              <span className="font-mono text-[12px] text-muted-foreground">0{i + 1}</span>
              <div className="mt-2 text-[15px] font-semibold tracking-tight">{t}</div>
              <p className="mt-1 text-[14px] leading-relaxed text-stone-600">{d}</p>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-[13px] text-muted-foreground">
          It never accuses anyone, never says who told it what, and stops the second someone asks for a lawyer. It points out what doesn’t add up. What that means is your call.
        </p>

        {s && ids.length > 0 && (
          <div className="mt-6 flex justify-end text-[12px] text-muted-foreground">
            {confirm ? (
              <span className="flex items-center gap-3">
                Clear every investigation?
                <button className="cursor-pointer font-medium text-red-600" onClick={() => { send({ type: "reset", full: true }); setWs(startFreshWorkspace()); setConfirm(false); }}>
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
