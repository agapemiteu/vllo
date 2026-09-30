import type { WebSocket } from "ws";
import { RoomBridge } from "./bridge.js";
import { CaseStore, sampleCase } from "./caseStore.js";
import { runIn, type Ctx } from "./context.js";
import { ROOMS, type RoomId } from "./types.js";

/**
 * One visitor's investigation: its own case file, interviews, photos and live connections.
 * Created on first contact from a browser-generated id, so links keep working after a server restart.
 */
export interface Workspace extends Ctx {
  store: CaseStore;
  bridges: Record<RoomId, RoomBridge>;
  photos: Map<RoomId, Buffer>;
  consoles: Set<WebSocket>;
  lastActive: number;
  /** recent email sends, for rate limiting */
  emails: number[];
}

export const WORKSPACE_ID = /^[a-z0-9]{6,32}$/;
const MAX_WORKSPACES = 300;
const IDLE_MS = 3 * 60 * 60 * 1000;
const spaces = new Map<string, Workspace>();

/** URL slots are neutral (p1/p2) so a registered person never appears as a sample name in a link. */
export const SLOT: Record<string, RoomId> = { p1: "daniel", p2: "tunde", daniel: "daniel", tunde: "tunde" };
export const slotOf = (r: RoomId) => (r === "daniel" ? "p1" : "p2");

const live = (w: Workspace) => ROOMS.some((r) => ["LIVE", "CONNECTING"].includes(w.store.rooms[r].status));

function dispose(w: Workspace) {
  runIn(w, () => {
    for (const r of ROOMS) w.bridges[r].hardReset();
  });
  for (const c of w.consoles) c.close();
  w.store.removeAllListeners();
  spaces.delete(w.id);
}

export function getWorkspace(id: string, onCreate?: (w: Workspace) => void): Workspace | null {
  if (!WORKSPACE_ID.test(id)) return null;
  let w = spaces.get(id);
  if (!w) {
    if (spaces.size >= MAX_WORKSPACES) {
      const oldest = [...spaces.values()].filter((x) => !live(x)).sort((a, b) => a.lastActive - b.lastActive)[0];
      if (oldest) dispose(oldest);
      else return null;
    }
    const store = new CaseStore(sampleCase());
    const ws = { id, store, photos: new Map(), consoles: new Set(), lastActive: Date.now(), emails: [] } as unknown as Workspace;
    runIn(ws, () => {
      ws.bridges = Object.fromEntries(ROOMS.map((r) => [r, new RoomBridge(r)])) as Record<RoomId, RoomBridge>;
    });
    spaces.set(id, ws);
    w = ws;
    onCreate?.(w);
  }
  w.lastActive = Date.now();
  return w;
}

export function allWorkspaces() {
  return [...spaces.values()];
}

// Drop workspaces nobody has touched for hours (never one with a live interview).
setInterval(() => {
  const now = Date.now();
  for (const w of spaces.values()) if (now - w.lastActive > IDLE_MS && !live(w) && w.consoles.size === 0) dispose(w);
}, 10 * 60 * 1000).unref();
