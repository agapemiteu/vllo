import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon, Camera01Icon, CheckmarkCircle02Icon, Clock01Icon, Link01Icon, Location01Icon, PlayIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/Logo";
import { ModeToggle } from "@/components/Assist";
import { removePhoto, uploadPhoto, usePhoto } from "@/components/Face";
import { avatar, cn, now } from "@/lib/utils";
import { useConsole, type RoomId, type Snapshot } from "@/lib/useConsole";

export default function Plan() {
  const { state: s, send } = useConsole();
  if (!s)
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <span className="shimmer-text">Loading case file</span>
      </div>
    );
  const people = s.case.interviewees as any[];

  return (
    <div className="min-h-full bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b bg-white/90 px-6 py-3 backdrop-blur">
        <Logo />
        <span className="text-stone-300">/</span>
        <span className="text-sm text-muted-foreground">Investigations</span>
        <span className="text-stone-300">/</span>
        <span className="text-sm font-medium">Case {s.case.case_id}</span>
        <span className="flex-1" />
        <a href="/console">
          <Button size="sm">
            Open live console <HugeiconsIcon icon={ArrowRight01Icon} size={14} />
          </Button>
        </a>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">Case {s.case.case_id} · Investigation plan</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{s.case.title}</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          {s.case.incident.date} at {s.case.incident.time} · {s.case.incident.location}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="muted">{people.length} persons of interest</Badge>
          <Badge variant="muted">{s.case.evidence.length} evidence items</Badge>
          <Badge variant="muted">{s.objectives.length} objectives</Badge>
          <Badge variant="muted">{s.case.station}</Badge>
        </div>

        <Section n="01" title="Persons of interest" sub="Profiles on file. Add a photo so the interviewer, the room device and the console all show the same person.">
          <div className="grid gap-4 md:grid-cols-2">
            {people.map((p) => (
              <Dossier key={p.id} p={p} />
            ))}
          </div>
        </Section>

        <Section n="02" title="Schedule" sub="Run the interviews back to back, or set each slot yourself. The room device checks in on site; at the slot, vllo starts the interview by itself.">
          <RunSequence s={s} send={send} />
          <div className="mt-4 overflow-hidden rounded-lg border bg-white">
            {people.map((p, i) => (
              <ScheduleRow key={p.id} s={s} p={p} send={send} last={i === people.length - 1} />
            ))}
          </div>
          <ol className="mt-4 grid gap-3 text-[13px] text-stone-600 md:grid-cols-3">
            {[
              ["Open the room link on the interview-room device", "Tablet or laptop with headphones, one per room."],
              ["The interviewee checks in", "Rights are shown, the microphone is enabled, the device waits for the slot."],
              ["At the slot, the interview starts", "Both rooms run at once. Follow them live in the console."],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-3 rounded-lg border bg-white p-3">
                <span className="font-mono text-[11px] text-muted-foreground">{i + 1}</span>
                <span>
                  <span className="font-medium text-stone-800">{t}</span>
                  <span className="mt-0.5 block text-[12px] text-muted-foreground">{d}</span>
                </span>
              </li>
            ))}
          </ol>
        </Section>

        <Section n="03" title="Interview guide" sub="What every session is working toward, and what the interviewer knows going in.">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border bg-white p-4">
              <div className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Objectives</div>
              <ul className="space-y-2">
                {s.objectives.map((o) => (
                  <li key={o.id} className="flex gap-2 text-[13px]">
                    <span className="w-6 text-[11px] font-medium text-muted-foreground">{o.id}</span>
                    {o.text}
                  </li>
                ))}
              </ul>
              <div className="mt-4 mb-2 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Method</div>
              <ol className="space-y-1.5 text-[13px] text-stone-700">
                <li><span className="font-medium">Free account.</span> Their evening in their own words, uninterrupted.</li>
                <li><span className="font-medium">Clarify and dig.</span> Every new person, place and reason is a thread to verify.</li>
                <li><span className="font-medium">Challenge.</span> Conflicts with evidence and the other account, raised neutrally, source never revealed.</li>
              </ol>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <div className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Evidence held</div>
              <ul className="space-y-3">
                {s.case.evidence.map((e: any) => (
                  <li key={e.id} className="flex gap-3 text-[13px]">
                    <span className="mt-0.5 font-mono text-[11px] text-red-600">{e.id}</span>
                    <span className="flex-1">
                      <span className="font-medium">{e.label}</span>
                      {e.time && <span className="font-mono text-[11px] text-muted-foreground"> · {e.time}</span>}
                      <span className="block text-stone-600">{e.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t pt-3 text-[12px] text-muted-foreground">
                Evidence is withheld until the challenge phase. vllo reports conflicts; it does not assess truthfulness, emotion or guilt.
              </p>
            </div>
          </div>
        </Section>
      </main>
    </div>
  );
}

function Section({ n, title, sub, children }: { n: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="font-mono text-[12px] text-muted-foreground">{n}</span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="text-[13px] text-muted-foreground">{sub}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Dossier({ p }: { p: any }) {
  const photo = usePhoto(p.id);
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex gap-4 rounded-lg border bg-white p-4">
      <div className="shrink-0">
        <button
          onClick={() => file.current?.click()}
          className="group relative block size-28 cursor-pointer overflow-hidden rounded-lg border bg-stone-100"
          title={photo ? "Replace photo" : "Add photo"}
        >
          <img src={photo ?? avatar(p.name)} alt={p.name} className={cn("size-full object-cover", !photo && "opacity-60")} />
          <span
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-white transition-opacity",
              photo ? "bg-stone-900/55 opacity-0 group-hover:opacity-100" : "bg-stone-900/35",
            )}
          >
            <HugeiconsIcon icon={Camera01Icon} size={18} />
            {busy ? "Uploading" : photo ? "Replace" : "Add photo"}
          </span>
        </button>
        {photo && (
          <button onClick={() => removePhoto(p.id)} className="mt-1 w-full cursor-pointer text-center text-[11px] text-muted-foreground hover:text-stone-800">
            Remove
          </button>
        )}
        <input
          ref={file}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setBusy(true);
            await uploadPhoto(p.id, f).finally(() => setBusy(false));
          }}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold">{p.name}</span>
          <Badge variant="muted">{p.role}</Badge>
        </div>
        <dl className="mt-2 grid grid-cols-[80px_1fr] gap-y-1 text-[12px]">
          <dt className="text-muted-foreground">Age</dt>
          <dd>{p.age}</dd>
          <dt className="text-muted-foreground">Lives in</dt>
          <dd>{p.area}</dd>
          <dt className="text-muted-foreground">Occupation</dt>
          <dd>{p.occupation}</dd>
          <dt className="text-muted-foreground">Relation</dt>
          <dd>{p.relation}</dd>
        </dl>
        <p className="mt-2 border-t pt-2 text-[12px] leading-relaxed text-stone-600">{p.on_file}</p>
      </div>
    </div>
  );
}

const toLocalInput = (ms?: number) => {
  if (!ms) return "";
  const d = new Date(ms - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

function ScheduleRow({ s, p, send, last }: { s: Snapshot; p: any; send: (m: unknown) => void; last: boolean }) {
  const id = p.id as RoomId;
  const plan = s.plan[id];
  const room = s.rooms[id];
  const [when, setWhen] = useState(toLocalInput(plan.scheduledAt));
  const [location, setLocation] = useState(plan.location);
  const [copied, setCopied] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => setWhen(toLocalInput(plan.scheduledAt)), [plan.scheduledAt]);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const save = (at: number | null) => send({ type: "schedule", room: id, at, location });
  const inMin = (mins: number) => send({ type: "schedule", room: id, in: mins * 60_000, location });
  const left = plan.scheduledAt ? plan.scheduledAt - now() : null;

  const status =
    room.status === "LIVE" || room.status === "CONNECTING"
      ? { v: "green", l: "Live" }
      : room.status === "ENDED"
        ? { v: "outline", l: "Completed" }
        : plan.checkedIn
          ? { v: "green", l: "Checked in" }
          : plan.scheduledAt
            ? { v: "amber", l: "Scheduled" }
            : { v: "muted", l: "Manual start" };

  return (
    <div className={cn("grid grid-cols-[minmax(170px,1fr)_minmax(260px,1.4fr)_auto] items-center gap-4 p-4", !last && "border-b")}>
      <div className="flex items-center gap-3">
        <FaceSmall id={id} name={p.name} />
        <div>
          <div className="text-[13px] font-medium">{p.name}</div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <Badge variant={status.v as any}>
              {(status.l === "Live" || status.l === "Checked in") && <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />}
              {status.l}
            </Badge>
            {left != null && left > 0 && room.status === "IDLE" && (
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                in {Math.floor(left / 60000)}:{String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Clock01Icon} size={14} className="shrink-0 text-muted-foreground" />
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="h-8 min-w-0 flex-1 rounded-md border bg-white px-2 text-[12px] outline-none focus:ring-2 focus:ring-stone-300"
          />
          <Button size="sm" variant="outline" onClick={() => save(when ? new Date(when).getTime() : null)}>
            Save
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Location01Icon} size={14} className="shrink-0 text-muted-foreground" />
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onBlur={() => location !== plan.location && send({ type: "schedule", room: id, at: plan.scheduledAt ?? null, location })}
            className="h-8 min-w-0 flex-1 rounded-md border bg-white px-2 text-[12px] outline-none focus:ring-2 focus:ring-stone-300"
          />
          <div className="flex gap-1">
            {[1, 5].map((m) => (
              <button key={m} onClick={() => inMin(m)} className="h-8 cursor-pointer rounded-md border bg-white px-2 text-[11px] text-stone-600 hover:bg-stone-50">
                +{m}m
              </button>
            ))}
            <button onClick={() => save(null)} className="h-8 cursor-pointer rounded-md border bg-white px-2 text-[11px] text-stone-600 hover:bg-stone-50">
              Manual
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        <ModeToggle room={room} onMode={(mode) => send({ type: "mode", room: id, mode })} />
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              navigator.clipboard.writeText(`${location_origin()}/room/${id}`);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
          >
            <HugeiconsIcon icon={copied ? CheckmarkCircle02Icon : Link01Icon} size={14} /> {copied ? "Copied" : "Room link"}
          </Button>
          <Button size="sm" disabled={!plan.checkedIn || room.status !== "IDLE"} onClick={() => send({ type: "start_room", room: id })} title={plan.checkedIn ? "Start now" : "Waiting for check-in"}>
            <HugeiconsIcon icon={PlayIcon} size={13} /> Start now
          </Button>
        </div>
      </div>
    </div>
  );
}

const location_origin = () => window.location.origin;

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-md border bg-stone-100 p-0.5 text-[12px] font-medium">
      {options.map(([v, l]) => (
        <button key={String(v)} onClick={() => onChange(v)} className={cn("cursor-pointer rounded px-2.5 py-1 transition-colors", value === v ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800")}>
          {l}
        </button>
      ))}
    </div>
  );
}

/** One interview at a time: the second is briefed with what the first established. */
function RunSequence({ s, send }: { s: Snapshot; send: (m: unknown) => void }) {
  const [first, setFirst] = useState<RoomId>("tunde");
  const [startIn, setStartIn] = useState(15);
  const [duration, setDuration] = useState(120);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 500);
    return () => clearInterval(t);
  }, []);
  const seq = s.sequence;
  const name = (id: RoomId) => s.case.interviewees.find((p: any) => p.id === id).name;
  const ready = (["daniel", "tunde"] as RoomId[]).filter((r) => s.plan[r].checkedIn).length;
  const next = seq?.order.find((r) => s.rooms[r].status !== "ENDED");
  const nextAt = next ? s.plan[next].scheduledAt : undefined;
  const liveRoom = seq?.order.find((r) => s.rooms[r].status === "LIVE" || s.rooms[r].status === "CONNECTING");

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div>
          <div className="text-[14px] font-semibold">Run the interviews back to back</div>
          <p className="mt-0.5 max-w-md text-[12px] text-muted-foreground">
            The second interview starts briefed with what the first established, without ever revealing the source.
          </p>
        </div>
        <span className="flex-1" />
        {seq ? (
          <div className="flex items-center gap-3">
            <span className="font-mono text-[13px] tabular-nums">
              {liveRoom ? (
                <span className="text-emerald-700">{name(liveRoom)} live</span>
              ) : next && nextAt ? (
                <span className="text-amber-700">
                  {name(next)} {nextAt > now() ? `starts in ${Math.floor((nextAt - now()) / 60000)}:${String(Math.floor(((nextAt - now()) % 60000) / 1000)).padStart(2, "0")}` : "starting"}
                </span>
              ) : (
                <span className="text-stone-500">Sequence complete</span>
              )}
            </span>
            <Button size="sm" variant="outline" onClick={() => send({ type: "cancel_sequence" })}>
              Cancel
            </Button>
            <a href="/console">
              <Button size="sm">
                Watch live <HugeiconsIcon icon={ArrowRight01Icon} size={14} />
              </Button>
            </a>
          </div>
        ) : (
          <Button onClick={() => send({ type: "run_sequence", first, startInSec: startIn, durationSec: duration, gapSec: 20 })}>
            <HugeiconsIcon icon={PlayIcon} size={14} /> Run sequence
          </Button>
        )}
      </div>
      {!seq && (
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t pt-4 text-[12px] text-muted-foreground">
          <label className="flex items-center gap-2">
            First
            <Seg value={first} options={[["tunde", name("tunde")], ["daniel", name("daniel")]]} onChange={setFirst} />
          </label>
          <label className="flex items-center gap-2">
            Starts in
            <Seg value={startIn} options={[[15, "15s"], [30, "30s"], [60, "1m"]]} onChange={setStartIn} />
          </label>
          <label className="flex items-center gap-2">
            Each interview
            <Seg value={duration} options={[[90, "1:30"], [120, "2:00"], [180, "3:00"]]} onChange={setDuration} />
          </label>
          <span>Handoff 20s</span>
          <span className={cn("ml-auto", ready === 2 ? "text-emerald-700" : "text-amber-700")}>{ready}/2 room devices checked in</span>
        </div>
      )}
    </div>
  );
}

function FaceSmall({ id, name }: { id: string; name: string }) {
  const photo = usePhoto(id);
  return <img src={photo ?? avatar(name)} alt={name} className="size-10 rounded-lg border bg-stone-200 object-cover" />;
}
