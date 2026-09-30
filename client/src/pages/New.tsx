import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, Camera01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { fileToDataUrl } from "@/components/Face";
import { apiUrl, cn } from "@/lib/utils";
import { useConsole, type RoomId } from "@/lib/useConsole";

type Start = "manual" | "in60" | "in300" | "after";

export default function New() {
  const { state: s } = useConsole();
  const [role, setRole] = useState<RoomId | null>(null);
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [start, setStart] = useState<Start>("manual");
  const [duration, setDuration] = useState(60);
  const [email, setEmail] = useState(() => { try { return localStorage.getItem("vllo-email") ?? ""; } catch { return ""; } });
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const free = s ? (["daniel", "tunde"] as RoomId[]).filter((r) => !s.registered[r]) : [];
  const taken = s ? (["daniel", "tunde"] as RoomId[]).filter((r) => s.registered[r]) : [];
  const slot = role ?? free[0] ?? null;
  const other = taken.find((r) => r !== slot);
  const otherName = other && s ? s.case.interviewees.find((p: any) => p.id === other).name.split(" ")[0] : "";

  useEffect(() => {
    if (other && start === "manual" && taken.length === 1) setStart("after");
  }, [other]);

  const sample = (id: RoomId) => {
    const p = s!.case.interviewees.find((x: any) => x.id === id);
    setRole(id);
    setName(p.name);
    setRelation(p.relation);
    setNotes(p.on_file ?? "");
  };

  async function create() {
    if (!slot || !name.trim()) return;
    setBusy(true);
    try {
      if (photo) {
        await fetch(apiUrl(`/api/photo/${slot}`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl: photo }) });
      }
      await fetch(apiUrl(`/api/register/${slot}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, relation, notes, durationSec: duration, email,
          start: start === "manual" ? "join" : start === "after" ? "after" : "in",
          inSec: start === "in60" ? 60 : 300,
          afterRoom: other, gapSec: 60,
        }),
      });
      try { if (email) localStorage.setItem("vllo-email", email); } catch { /* storage blocked */ }
      location.href = `/i/${slot}`;
    } finally {
      setBusy(false);
    }
  }

  const input = "h-11 w-full rounded-lg border bg-white px-3.5 text-[15px] outline-none transition-shadow focus:ring-2 focus:ring-stone-300";

  return (
    <div className="min-h-full bg-white">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-6 py-6">
        <a href="/" className="flex items-center gap-2 text-[14px] text-muted-foreground hover:text-stone-900">
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} /> Investigations
        </a>
        <Logo />
      </header>

      <main className="mx-auto max-w-2xl px-6 pt-6 pb-24">
        <h1 className="text-3xl font-semibold tracking-tight">Take a statement</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">Who you’re speaking to, and when.</p>

        {s && free.length === 0 && (
          <p className="mt-8 rounded-xl border bg-stone-50 p-4 text-[14px] text-stone-600">This case already has two people registered. Reset the demo from Investigations to start over.</p>
        )}

        {s && free.length > 0 && (
          <>
            <div className="mt-8 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
              Start from a sample on file:
              {free.map((id) => {
                const p = s.case.interviewees.find((x: any) => x.id === id);
                return (
                  <button
                    key={id}
                    onClick={() => sample(id)}
                    className={cn("cursor-pointer rounded-full border px-3 py-1 text-[13px] transition-colors", role === id ? "border-stone-900 bg-stone-900 text-white" : "hover:bg-stone-50")}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>

            <Step n={1} title="Person of interest">
              <div className="flex flex-col gap-4 sm:flex-row sm:gap-5">
                <button
                  onClick={() => file.current?.click()}
                  className="group relative flex size-28 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border border-dashed bg-stone-50 text-[12px] text-muted-foreground hover:bg-stone-100"
                >
                  {photo ? (
                    <img src={photo} alt="" className="absolute inset-0 size-full object-cover" />
                  ) : (
                    <>
                      <HugeiconsIcon icon={Camera01Icon} size={20} />
                      Add photo
                    </>
                  )}
                </button>
                <input
                  ref={file}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) setPhoto(await fileToDataUrl(f));
                  }}
                />
                <div className="flex-1 space-y-3">
                  <input className={input} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
                  <input className={input} placeholder="Relation to the case" value={relation} onChange={(e) => setRelation(e.target.value)} />
                </div>
              </div>
              <textarea
                className="mt-3 min-h-20 w-full rounded-lg border bg-white px-3.5 py-2.5 text-[14px] leading-relaxed outline-none focus:ring-2 focus:ring-stone-300"
                placeholder="Notes on file (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Step>

            <Step n={2} title="When">
              <Options
                value={start}
                onChange={setStart}
                options={[
                  ["manual", "As soon as they check in"],
                  ["in60", "In 1 minute"],
                  ["in300", "In 5 minutes"],
                  ...(other ? ([["after", `1 min after ${otherName} finishes`]] as [Start, string][]) : []),
                ]}
              />
              <p className="mt-2 text-[13px] text-muted-foreground">You will get a link to send. The interview starts on its own once the person opens it and taps Check in.</p>
            </Step>

            <Step n={3} title="How long">
              <Options value={duration} onChange={setDuration} options={[[60, "1 minute"], [90, "1.5 minutes"], [120, "2 minutes"]]} />
            </Step>

            <Step n={4} title="Send the report to">
              <input className={input} type="email" inputMode="email" placeholder="investigator@email.com (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Step>

            <div className="mt-10 flex items-center justify-end gap-3">
              <a href="/">
                <Button variant="ghost">Cancel</Button>
              </a>
              <Button size="lg" disabled={!name.trim() || busy} onClick={create}>
                {busy ? "Setting up" : "Create the link"}
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex size-6 items-center justify-center rounded-full bg-stone-900 text-[12px] font-medium text-white">{n}</span>
        <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Options<T extends string | number>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([v, l]) => (
        <button
          key={String(v)}
          onClick={() => onChange(v)}
          className={cn(
            "h-11 cursor-pointer rounded-lg border px-4 text-[14px] transition-colors",
            value === v ? "border-stone-900 bg-stone-900 text-white" : "bg-white text-stone-700 hover:bg-stone-50",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
