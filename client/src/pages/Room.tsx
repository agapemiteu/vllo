import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { HeadphonesIcon, Mic01Icon, StopCircleIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { micError, micSupported, startMic, type Mic } from "@/audio/mic";
import { Player } from "@/audio/player";
import { avatar, cn, now, syncClock, wsUrl } from "@/lib/utils";
import { setPhotoVersions, usePhoto } from "@/components/Face";
import { Logo } from "@/components/Logo";
import { roomOf } from "@/lib/workspace";

const countdown = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

interface RoomView {
  id: string;
  name: string;
  status: "IDLE" | "CONNECTING" | "LIVE" | "ENDED" | "DISCONNECTED";
  agentState: "SPEAKING" | "LISTENING" | "THINKING";
  caption: string;
  scheduledAt?: number;
  location: string;
  checkedIn: boolean;
  photo: number;
  durationSec: number;
  startedAt?: number;
  serverNow: number;
}

/** The interviewee's screen: check in, wait for the slot, talk. Every failure path says what to do next. */
export default function Room({ ws, slot }: { ws: string; slot: string }) {
  const id = roomOf(slot)!;
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [starting, setStarting] = useState(false);
  const [, tick] = useState(0);
  const photo = usePhoto(id);
  const ws$ = useRef<WebSocket | null>(null);
  const player = useRef<Player | null>(null);
  const mic = useRef<Mic | null>(null);
  const orb = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    let retry: ReturnType<typeof setTimeout>;
    let delay = 1000;
    const open = () => {
      const sock = new WebSocket(wsUrl(`/ws/w/${ws}/room/${slot}`));
      sock.binaryType = "arraybuffer";
      ws$.current = sock;
      sock.onopen = () => {
        delay = 1000;
        setOnline(true);
        // Reconnected with the mic still open (server restart or network blip): re-announce the check-in.
        if (mic.current) sock.send(JSON.stringify({ type: "checkin" }));
      };
      sock.onmessage = (e) => {
        if (e.data instanceof ArrayBuffer) return player.current?.enqueue(e.data);
        let msg: any;
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        if (msg?.type === "room" && msg.room) {
          setPhotoVersions(ws, { [id]: msg.room.photo });
          syncClock(msg.room.serverNow);
          setRoom(msg.room);
          if (msg.room.status === "LIVE") setServerError(null);
        }
        if (msg?.type === "flush") player.current?.flush();
        if (msg?.type === "error" && typeof msg.message === "string") setServerError(msg.message);
        if (msg?.type === "ended") {
          mic.current?.stop();
          mic.current = null;
          setMicOn(false);
        }
      };
      sock.onclose = () => {
        setOnline(false);
        if (alive) {
          retry = setTimeout(open, delay);
          delay = Math.min(delay * 2, 10_000);
        }
      };
      sock.onerror = () => sock.close();
    };
    open();
    return () => {
      alive = false;
      clearTimeout(retry);
      ws$.current?.close();
      mic.current?.stop();
      player.current?.close();
    };
  }, [ws, slot]);

  // Drive the orb from real audio levels.
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      const p = player.current;
      const playing = !!p?.playing;
      setSpeaking((s) => (s !== playing ? playing : s));
      const lvl = playing ? p!.level() : mic.current?.level() ?? 0;
      orb.current?.style.setProperty("--lvl", Math.min(1, lvl * 5).toFixed(3));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  /** Check-in (or rejoin) unlocks audio and the microphone; the interview starts at the slot or on check-in. */
  async function checkIn() {
    setError(null);
    setStarting(true);
    try {
      player.current ??= new Player();
      await player.current.resume();
      mic.current ??= await startMic((buf) => {
        if (ws$.current?.readyState === WebSocket.OPEN) ws$.current.send(buf);
      });
      setMicOn(true);
      if (ws$.current?.readyState === WebSocket.OPEN) ws$.current.send(JSON.stringify({ type: "checkin" }));
      else setError("Still connecting to the server. You're checked in as soon as it connects.");
    } catch (e: any) {
      setError(micError(e));
    } finally {
      setStarting(false);
    }
  }

  const status = room?.status ?? "IDLE";
  const state = speaking ? "SPEAKING" : room?.agentState === "THINKING" ? "THINKING" : "LISTENING";
  const live = status === "LIVE" || status === "CONNECTING";
  const needsRejoin = live && !micOn;

  return (
    <div className="dark flex min-h-full flex-col bg-[#0f0e0d] text-stone-100">
      <header className="flex items-center justify-between px-6 py-5 sm:px-8 sm:py-6">
        <Logo dark />
        <span className="font-mono text-xs text-stone-500">Investigative interview</span>
      </header>

      {!online && (
        <div className="mx-auto mb-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-[13px] text-amber-300">Reconnecting to the server…</div>
      )}

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
        <AnimatePresence mode="wait">
          {(!live || needsRejoin) && status !== "ENDED" && (
            <motion.div key={micOn && room?.checkedIn ? "wait" : "idle"} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex flex-col items-center">
              <img src={photo ?? avatar(room?.name ?? id)} alt="" className="size-28 rounded-2xl border border-stone-800 bg-stone-800 object-cover" />
              <p className="mt-6 mb-2 text-xs tracking-[0.2em] text-stone-500 uppercase">Interview</p>
              <h1 className="text-4xl font-semibold tracking-tight break-words">{room?.name ?? "…"}</h1>
              {room?.scheduledAt && status === "IDLE" ? (
                <p className="mt-3 font-mono text-[12px] text-stone-500">Scheduled for {new Date(room.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
              ) : null}

              {needsRejoin ? (
                <>
                  <p className="mt-8 max-w-md text-[15px] leading-relaxed text-stone-400">Your interview is in progress. Tap below to reconnect your microphone.</p>
                  <Button size="lg" disabled={starting} onClick={checkIn} className="mt-8 rounded-full bg-stone-100 px-8 text-stone-900 hover:bg-white">
                    <HugeiconsIcon icon={Mic01Icon} size={18} /> Rejoin interview
                  </Button>
                </>
              ) : micOn && room?.checkedIn ? (
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
                  {micSupported() ? (
                    <Button size="lg" disabled={starting || !room} onClick={checkIn} className="mt-10 rounded-full bg-stone-100 px-8 text-stone-900 hover:bg-white">
                      <HugeiconsIcon icon={Mic01Icon} size={18} /> {starting ? "Starting microphone" : "Check in"}
                    </Button>
                  ) : (
                    <p className="mt-10 max-w-md text-sm text-amber-300">This browser can't use the microphone here. Open this link in Chrome or Safari.</p>
                  )}
                </>
              )}
              {status === "DISCONNECTED" && <p className="mt-6 text-sm text-amber-400">The connection to the interviewer was lost. The investigator can restart the interview.</p>}
              {serverError && status !== "LIVE" && <p className="mt-6 max-w-md text-sm text-amber-400">{serverError}</p>}
              {error && <p className="mt-6 max-w-md text-sm text-red-400">{error}</p>}
            </motion.div>
          )}

          {live && !needsRejoin && (
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
                  className={cn("absolute inset-8 rounded-full border transition-colors duration-500", state === "SPEAKING" ? "border-amber-300/40" : "border-stone-500/30", state === "LISTENING" && "animate-pulse")}
                  style={{ transform: "scale(calc(0.95 + var(--lvl) * 0.2))" }}
                />
                <div
                  className={cn(
                    "size-24 rounded-full transition-all duration-500",
                    state === "SPEAKING" ? "bg-amber-300 shadow-[0_0_60px_rgba(252,211,77,.35)]" : state === "THINKING" ? "animate-pulse bg-stone-300" : "bg-stone-100",
                  )}
                  style={{ transform: "scale(calc(1 + var(--lvl) * 0.25))" }}
                />
              </div>
              <p className="mt-6 font-mono text-[11px] tracking-[0.25em] text-stone-500 uppercase">
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
                    {room?.caption ?? ""}
                  </motion.p>
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {status === "ENDED" && (
            <motion.div key="ended" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center">
              <HugeiconsIcon icon={StopCircleIcon} size={28} className="text-stone-500" />
              <h1 className="mt-5 text-3xl font-semibold tracking-tight">This interview has ended.</h1>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {live && !needsRejoin && (
        <footer className="flex flex-wrap items-center justify-between gap-3 px-6 py-5 text-xs text-stone-500 sm:px-8 sm:py-6">
          <span>
            Interview in progress · You can stop at any time
            {room?.startedAt && room.durationSec ? (
              <span className="ml-3 font-mono text-stone-400 tabular-nums">{countdown(Math.max(0, room.startedAt + room.durationSec * 1000 - now()))} remaining</span>
            ) : null}
          </span>
          <button
            onClick={() => ws$.current?.readyState === WebSocket.OPEN && ws$.current.send(JSON.stringify({ type: "stop" }))}
            className="cursor-pointer rounded-full border border-stone-700 px-4 py-1.5 text-stone-300 hover:bg-stone-800"
          >
            Stop interview
          </button>
        </footer>
      )}
    </div>
  );
}
