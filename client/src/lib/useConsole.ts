import { useEffect, useRef, useState } from "react";
import type {
  Activity, Claim, Conflict, Gap, GuardrailEvent, Intel, Lead, Objective, Revision, RoomId, RoomState,
} from "../../../server/types";
import { syncClock, wsUrl } from "./utils";
import { setPhotoVersions } from "@/components/Face";

export type { Activity, Claim, Conflict, Gap, GuardrailEvent, Intel, Lead, Objective, Revision, RoomId, RoomState };

export interface Snapshot {
  case: any;
  now: number;
  rooms: Record<RoomId, RoomState>;
  claims: Claim[];
  conflicts: Conflict[];
  guardrails: GuardrailEvent[];
  revisions: Revision[];
  activity: Activity[];
  transcript: { room: RoomId; speaker: "agent" | "interviewee"; text: string; at: number; interrupted?: boolean }[];
  gaps: Gap[];
  leads: Lead[];
  intel: Intel[];
  objectives: Objective[];
  insights: {
    facts: { id: string; text: string; status: "corroborated" | "single_source"; sources: string[] }[];
    compare: { topic: string; daniel: { text: string; claimId?: string } | null; tunde: { text: string; claimId?: string } | null; evidence?: string; verdict: string }[];
    metrics: { claims: number; facts: number; conflicts: number; resolved: number; questions: number; blocked: number; breaches: number; research: number; coverage: { daniel: number; tunde: number } };
  };
  report: any;
  plan: Record<RoomId, { scheduledAt?: number; location: string; checkedIn: boolean; durationSec: number; after?: { room: RoomId; gapSec: number }; email?: string; armed?: boolean }>;
  registered: Record<RoomId, boolean>;
  sequence: { order: RoomId[]; gapSec: number } | null;
  photos: Record<RoomId, number>;
}

/** Live state of one workspace. Reconnects on its own; switching workspace reconnects there. */
export function useConsole(workspace: string) {
  const [state, setState] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    let alive = true;
    let retry: ReturnType<typeof setTimeout>;
    const open = () => {
      const sock = new WebSocket(wsUrl(`/ws/w/${workspace}/console`));
      ws.current = sock;
      sock.onopen = () => setConnected(true);
      sock.onmessage = (e) => {
        let msg: any;
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        if (msg?.type === "snapshot" && msg.state?.rooms) {
          setPhotoVersions(workspace, msg.state.photos ?? {});
          syncClock(msg.state.now);
          setState(msg.state);
        }
      };
      sock.onclose = () => {
        setConnected(false);
        if (alive) retry = setTimeout(open, 1000);
      };
    };
    setState(null);
    open();
    return () => {
      alive = false;
      clearTimeout(retry);
      ws.current?.close();
    };
  }, [workspace]);

  const send = (msg: unknown) => ws.current?.readyState === WebSocket.OPEN && ws.current.send(JSON.stringify(msg));
  return { state, connected, send };
}

/** Client-side arrival clock so fresh steps can play a brief "working" beat before settling. */
export function useArrivals(ids: string[]) {
  const seen = useRef(new Map<string, number>());
  const initialised = useRef(false);
  const [, force] = useState(0);
  const now = Date.now();
  let fresh = false;
  for (const id of ids) {
    if (!seen.current.has(id)) seen.current.set(id, initialised.current ? now : 0);
    if (now - (seen.current.get(id) ?? 0) < 900) fresh = true;
  }
  initialised.current = true;
  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => force((x) => x + 1), 250);
    return () => clearTimeout(t);
  });
  return (id: string) => now - (seen.current.get(id) ?? 0) < 900;
}
