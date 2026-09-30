import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, Camera01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { fileToDataUrl, uploadPhoto } from "@/components/Face";
import { cn } from "@/lib/utils";
import { useConsole, type RoomId } from "@/lib/useConsole";
import { activeWorkspace, investigationPath, postJson, slotOf, wsApi } from "@/lib/workspace";

type Start = "join" | "in60" | "in300" | "after";
type CaseMode = "sample" | "custom";

const done = (st: string) => st === "ENDED" || st === "DISCONNECTED";

export default function New() {
  const ws = activeWorkspace();
  const { state: s } = useConsole(ws);
  const [caseMode, setCaseMode] = useState<CaseMode>("sample");
  const [own, setOwn] = useState({ title: "", date: "", time: "", location: "", summary: "", evidence: "" });
  const [role, setRole] = useState<RoomId | null>(null);
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [start, setStart] = useState<Start>("join");
  const [duration, setDuration] = useState(90);
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem("vllo-email") ?? "";
    } catch {
      return "";
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const rooms = ["daniel", "tunde"] as RoomId[];
  const free = s ? rooms.filter((r) => !s.registered[r] || done(s.rooms[r].status)) : [];
  const active = s ? rooms.filter((r) => s.registered[r] && !done(s.rooms[r].status)) : [];
  const slot = role && free.includes(role) ? role : free[0] ?? null;
  const other = active.find((r) => r !== slot);
  const otherName = other && s ? String(s.case.interviewees.find((p: any) => p.id === other)?.name ?? "").split(" ")[0] : "";
  // The case can be chosen only while nobody is registered, so a second person never wipes the first.
  const caseLocked = !!s && rooms.some((r) => s.registered[r]);
  const custom = caseLocked ? !!s?.case.custom : caseMode === "custom";

  useEffect(() => {
    if (other && start === "join") setStart("after");
  }, [other]);

  const sample = (id: RoomId) => {
    const p = s!.case.interviewees.find((x: any) => x.id === id);
    setRole(id);
    setName(p.name);
    setRelation(p.relation);
    setNotes(p.on_file ?? "");
  };

  async function create() {
    setError(null);
    if (!slot) return setError("This case already has two people in progress.");
    if (!name.trim()) return setError("Add the person's name.");
    if (!caseLocked && caseMode === "custom" && own.title.trim().length < 3) return setError("Give your case a short title.");
    setBusy(true);
    try {
      if (!caseLocked && (caseMode === "custom" || s?.case.custom)) {
        const r = await postJson(wsApi(ws, "/case"), caseMode === "custom" ? { mode: "custom", ...own } : { mode: "sample" });
        if (!r.ok) throw new Error(r.data?.error ?? "The case couldn't be saved.");
      }
      if (photo) await uploadPhoto(ws, slot, photo).catch(() => setError("The photo couldn't be uploaded; you can add it later."));
      const r = await postJson(wsApi(ws, `/register/${slotOf(slot)}`), {
        name, relation, notes, durationSec: duration, email,
        start: start === "join" ? "join" : start === "after" ? "after" : "in",
        inSec: start === "in60" ? 60 : 300,
        afterSlot: other ? slotOf(other) : undefined,
        gapSec: 60,
      });
      if (!r.ok) throw new Error(r.data?.error ?? "Couldn't create the interview.");
      try {
        if (email) localStorage.setItem("vllo-email", email);
      } catch {
        /* storage blocked */
      }
      location.href = investigationPath(ws, slot);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  const input = "h-11 w-full rounded-lg border bg-white px-3.5 text-[15px] outline-none transition-shadow focus:ring-2 focus:ring-stone-300";
  const area = "w-full rounded-lg border bg-white px-3.5 py-2.5 text-[14px] leading-relaxed outline-none focus:ring-2 focus:ring-stone-300";
  let n = 0;

  return (
    <div className="min-h-full bg-white">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-6 py-6">
        <a href="/" className="flex items-center gap-2 text-[14px] text-muted-foreground hover:text-stone-900">
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} /> Investigations
        </a>
        <Logo />
      </header>

      <main className="mx-auto max-w-2xl px-6 pt-6 pb-24">
        <h1 className="text-3xl font-semibold tracking-tight">Interview a suspect</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">Who you’re questioning, and when.</p>

        {!s && (
          <p className="mt-8 text-sm text-muted-foreground">
            <span className="shimmer-text">Waking up the server, this can take up to a minute</span>
          </p>
        )}

        {s && free.length === 0 && (
          <p className="mt-8 rounded-xl border bg-stone-50 p-4 text-[14px] text-stone-600">
            Two interviews are already set up in this investigation. Finish one, or start over from the home page.
          </p>
        )}

        {s && free.length > 0 && (
          <>
            <Step n={++n} title="The case">
              {caseLocked ? (
                <p className="text-[14px] text-stone-600">
                  Same case as the other interview: <span className="font-medium text-stone-900">{s.case.title}</span>
                </p>
              ) : (
                <>
                  <Options
                    value={caseMode}
                    onChange={setCaseMode}
                    options={[
                      ["sample", "Sample case: warehouse break-in"],
                      ["custom", "My own case"],
                    ]}
                  />
                  {caseMode === "sample" ? (
                    <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                      A break-in at a Lekki warehouse on Monday at 21:10, with CCTV, a phone record and a vehicle registry on file.
                    </p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      <input className={input} placeholder="Case title, e.g. Missing laptop at head office" maxLength={120} value={own.title} onChange={(e) => setOwn({ ...own, title: e.target.value })} />
                      <div className="grid gap-3 sm:grid-cols-3">
                        <input className={input} placeholder="Date, e.g. Friday 12 Sept" maxLength={40} value={own.date} onChange={(e) => setOwn({ ...own, date: e.target.value })} />
                        <input className={input} placeholder="Time, e.g. 14:30" maxLength={20} value={own.time} onChange={(e) => setOwn({ ...own, time: e.target.value })} />
                        <input className={input} placeholder="Place" maxLength={120} value={own.location} onChange={(e) => setOwn({ ...own, location: e.target.value })} />
                      </div>
                      <textarea className={cn(area, "min-h-20")} placeholder="What happened, in a sentence or two" maxLength={800} value={own.summary} onChange={(e) => setOwn({ ...own, summary: e.target.value })} />
                      <textarea
                        className={cn(area, "min-h-28")}
                        placeholder={"Evidence, one item per line, e.g.\n14:10 door B badge swipe by the finance team\nLaptop last seen on desk 3 at 13:50"}
                        maxLength={4000}
                        value={own.evidence}
                        onChange={(e) => setOwn({ ...own, evidence: e.target.value })}
                      />
                      <p className="text-[12px] text-muted-foreground">Up to 12 items. Add times where you have them; answers are checked against every item.</p>
                    </div>
                  )}
                </>
              )}
            </Step>

            <Step n={++n} title="Suspect or witness">
              {!custom && (
                <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
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
              )}
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
                    if (!f) return;
                    try {
                      setPhoto(await fileToDataUrl(f));
                    } catch (err: any) {
                      setError(err?.message ?? "That image couldn't be used.");
                    }
                  }}
                />
                <div className="flex-1 space-y-3">
                  <input className={input} placeholder="Full name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
                  <input className={input} placeholder="Relation to the case" maxLength={120} value={relation} onChange={(e) => setRelation(e.target.value)} />
                </div>
              </div>
              <textarea className={cn(area, "mt-3 min-h-20")} placeholder="Notes on file (optional)" maxLength={600} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Step>

            <Step n={++n} title="When">
              <Options
                value={start}
                onChange={setStart}
                options={[
                  ["join", "As soon as they check in"],
                  ["in60", "In 1 minute"],
                  ["in300", "In 5 minutes"],
                  ...(other ? ([["after", `1 min after ${otherName} finishes`]] as [Start, string][]) : []),
                ]}
              />
              <p className="mt-2 text-[13px] text-muted-foreground">You’ll get a link to send. The interview starts on its own once the person opens it and taps Check in.</p>
            </Step>

            <Step n={++n} title="How long">
              <Options value={duration} onChange={setDuration} options={[[60, "1 minute"], [90, "1.5 minutes"], [120, "2 minutes"]]} />
            </Step>

            <Step n={++n} title="Send the report to">
              <input className={input} type="email" inputMode="email" placeholder="you@example.com (optional)" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} />
            </Step>

            {error && <p className="mt-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-700">{error}</p>}

            <div className="mt-10 flex items-center justify-end gap-3">
              <a href="/">
                <Button variant="ghost">Cancel</Button>
              </a>
              <Button size="lg" disabled={busy} onClick={create}>
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
