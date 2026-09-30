import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { HeadphonesIcon, Mic01Icon, StopCircleIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { startMic, type Mic } from "@/audio/mic";
import { Player } from "@/audio/player";
import { avatar, cn, now, syncClock, wsUrl } from "@/lib/utils";
import { setPhotoVersions, usePhoto } from "@/components/Face";

const countdown = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
import { Logo } from "@/components/Logo";

interface RoomView {
  id: string;
  name: string;
  status: "IDLE" | "CONNECTING" | "LIVE" | "ENDED" | "DISCONNECTED";
  agentState: "SPEAKING" | "LISTENING" | "THINKING";
  caption: string;
  endWords?: string;
  greeting: string;
  scheduledAt?: number;
  location: string;
  checkedIn: boolean;
  photo: number;
  station: string;
}

export default function Room({ id }: { id: string }) {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [checkedHere, setCheckedHere] = useState(false);
  const [, tick] = useState(0);
  const photo = usePhoto(id);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const ws = useRef<WebSocket | null>(null);
  const player = useRef<Player | null>(null);
  const mic = useRef<Mic | null>(null);
  const orb = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    let retry: ReturnType<typeof setTimeout>;
    const open = () => {
      const sock = new WebSocket(wsUrl(`/ws/room/${id}`));
      sock.binaryType = "arraybuffer";
      ws.current = sock;
      sock.onmessage = (e) => {
        if (e.data instanceof ArrayBuffer) return player.current?.enqueue(e.data);
        const msg = JSON.parse(e.data);
        if (msg.type === "room") {
          setPhotoVersions({ [id]: msg.room.photo });
          syncClock(msg.room.serverNow);
          setRoom(msg.room);
        }
        if (msg.type === "flush") player.current?.flush();
        if (msg.type === "ended") {
          mic.current?.stop();
          mic.current = null;
        }
      };
      sock.onclose = () => {
        if (alive) retry = setTimeout(open, 1000);
      };
    };
    open();
    return () => {
      alive = false;
      clearTimeout(retry);
      ws.current?.close();
      mic.current?.stop();
      player.current?.close();
    };
  }, [id]);

  // Drive the orb from real audio levels.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const p = player.current;
      const playing = !!p?.playing;
      setSpeaking((s) => (s !== playing ? playing : s));
      const lvl = playing ? p!.level() : mic.current?.level() ?? 0;
      orb.current?.style.setProperty("--lvl", Math.min(1, lvl * 5).toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  /** Check-in unlocks audio and the microphone; the interview itself starts at the slot or when the investigator starts it. */
  async function checkIn() {
    setError(null);
    try {
      player.current ??= new Player();
      await player.current.resume();
      mic.current ??= await startMic((buf) => {
        if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(buf);
      });
      ws.current?.send(JSON.stringify({ type: "checkin" }));
      setCheckedHere(true);
    } catch (e: any) {
      setError(e?.name === "NotAllowedError" ? "Microphone access is needed to take part." : String(e?.message ?? e));
    }
  }

  const status = room?.status ?? "IDLE";
  const state = speaking ? "SPEAKING" : room?.agentState === "THINKING" ? "THINKING" : "LISTENING";
  const live = status === "LIVE" || status === "CONNECTING";

  return (
    <div className="dark flex min-h-full flex-col bg-[#0f0e0d] text-stone-100">
      <header className="flex items-center justify-between px-8 py-6">
        <Logo dark />
        <span className="font-mono text-xs text-stone-500">Case 024 · Investigative interview</span>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
        <AnimatePresence mode="wait">
          {!live && status !== "ENDED" && (
            <motion.div key={checkedHere && room?.checkedIn ? "wait" : "idle"} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex flex-col items-center">
              <img src={photo ?? avatar(room?.name ?? id)} alt="" className="size-28 rounded-2xl border border-stone-800 bg-stone-800 object-cover" />
              <p className="mt-6 mb-2 text-xs tracking-[0.2em] text-stone-500 uppercase">Interview</p>
              <h1 className="text-4xl font-semibold tracking-tight">{room?.name ?? "…"}</h1>
              <p className="mt-3 font-mono text-[12px] text-stone-500">
                {room?.location}
                {room?.scheduledAt ? ` · ${new Date(room.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
              </p>

              {checkedHere && room?.checkedIn ? (
                <>
                  <div className="mt-10 flex items-center gap-2 text-sm text-emerald-400">
                    <span className="size-2 animate-pulse rounded-full bg-emerald-400" /> Checked in · microphone ready
                  </div>
                  <p className="mt-4 text-2xl font-medium text-stone-100 tabular-nums">
                    {room.scheduledAt && room.scheduledAt > now() ? `Your interview begins in ${countdown(room.scheduledAt - now())}` : "Your interview will begin shortly"}
                  </p>
                  <p className="mt-3 max-w-md text-[14px] leading-relaxed text-stone-500">
                    Please keep your headphones on. You don't have to answer any question, you can stop at any time, and you can ask for a lawyer.
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-8 max-w-lg text-[15px] leading-relaxed text-stone-400">
                    You are about to speak with an AI interviewer. You don't have to answer any question, you can stop at any time, and you can ask for a lawyer.
                  </p>
                  <div className="mt-6 flex items-center gap-2 text-xs text-stone-500">
                    <HugeiconsIcon icon={HeadphonesIcon} size={14} /> Please use headphones
                  </div>
                  <Button size="lg" onClick={checkIn} className="mt-10 rounded-full bg-stone-100 px-8 text-stone-900 hover:bg-white">
                    <HugeiconsIcon icon={Mic01Icon} size={18} /> Check in
                  </Button>
                </>
              )}
              {status === "DISCONNECTED" && <p className="mt-4 text-sm text-amber-400">The connection was lost. The investigator can restart the session.</p>}
              {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
            </motion.div>
          )}

          {live && (
            <motion.div key="live" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex w-full flex-col items-center">
              <div ref={orb} className="relative flex size-56 items-center justify-center" style={{ ["--lvl" as any]: 0 }}>
                <div
                  className={cn(
                    "absolute inset-0 rounded-full transition-colors duration-500",
                    state === "SPEAKING" ? "bg-amber-400/10" : state === "THINKING" ? "bg-stone-400/10" : "bg-emerald-400/10",
                  )}
                  style={{ transform: "scale(calc(0.85 + var(--lvl) * 0.35))", transition: "transform 80ms linear" }}
                />
                <div
                  className={cn(
                    "absolute inset-8 rounded-full border transition-colors duration-500",
                    state === "SPEAKING" ? "border-amber-300/40" : "border-stone-500/30",
                    state === "LISTENING" && "animate-pulse",
                  )}
                  style={{ transform: "scale(calc(0.95 + var(--lvl) * 0.2))" }}
                />
                <div
                  className={cn(
                    "size-24 rounded-full transition-all duration-500",
                    state === "SPEAKING" ? "bg-amber-300 shadow-[0_0_60px_rgba(252,211,77,.35)]" : state === "THINKING" ? "bg-stone-300 animate-pulse" : "bg-stone-100",
                  )}
                  style={{ transform: "scale(calc(1 + var(--lvl) * 0.25))" }}
                />
              </div>
              <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.25em] text-stone-500">
                {status === "CONNECTING" ? "Connecting" : state === "SPEAKING" ? "Speaking" : state === "THINKING" ? "Thinking" : "Listening"}
              </p>
              <div className="mt-10 min-h-28 max-w-xl">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={room?.caption?.slice(0, 24) ?? ""}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="text-2xl leading-snug font-medium text-stone-100"
                  >
                    {room?.caption || (status === "CONNECTING" ? "" : "")}
                  </motion.p>
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {status === "ENDED" && (
            <motion.div key="ended" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center">
              <HugeiconsIcon icon={StopCircleIcon} size={28} className="text-stone-500" />
              <h1 className="mt-5 text-3xl font-semibold tracking-tight">This interview has ended.</h1>
              {room?.endWords && <p className="mt-3 text-stone-400">{room.endWords}.</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {live && (
        <footer className="flex items-center justify-between px-8 py-6 text-xs text-stone-500">
          <span>Interview in progress · You can stop at any time</span>
          <button onClick={() => ws.current?.send(JSON.stringify({ type: "stop" }))} className="cursor-pointer rounded-full border border-stone-700 px-4 py-1.5 text-stone-300 hover:bg-stone-800">
            Stop interview
          </button>
        </footer>
      )}
    </div>
  );
}
