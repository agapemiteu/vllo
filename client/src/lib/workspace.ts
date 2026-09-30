import type { RoomId } from "../../../server/types";
import { apiUrl } from "./utils";

/**
 * Each browser works in its own workspace (its own case, people and interviews), so visitors never see
 * each other's data. The id lives in the URL of every link, so links keep working after a server restart.
 */
const KEY = "vllo-ws";
const PREV = "vllo-ws-prev";
const VALID = /^[a-z0-9]{6,32}$/;

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode: the id then lives only for this page */
  }
};

export const newWorkspaceId = () => {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
};

let memory: string | null = null;

/** This browser's current workspace, created on first use. */
export function activeWorkspace(): string {
  const saved = read(KEY) ?? memory;
  if (saved && VALID.test(saved)) return saved;
  const id = newWorkspaceId();
  memory = id;
  write(KEY, id);
  return id;
}

/** Start over: a new empty workspace; the old one is kept as "previous" so its report stays reachable. */
export function startFreshWorkspace(): string {
  const old = activeWorkspace();
  write(PREV, old);
  const id = newWorkspaceId();
  memory = id;
  write(KEY, id);
  return id;
}

export const previousWorkspace = () => {
  const p = read(PREV);
  return p && VALID.test(p) ? p : null;
};

export const isWorkspaceId = (v: string) => VALID.test(v);

/** Neutral slots in URLs; internally the engine calls the two roles daniel/tunde. */
export const slotOf = (r: RoomId) => (r === "daniel" ? "p1" : "p2");
export const roomOf = (slot: string): RoomId | null => (slot === "p1" ? "daniel" : slot === "p2" ? "tunde" : null);

export const wsApi = (ws: string, path: string) => apiUrl(`/api/w/${ws}${path}`);
export const roomLink = (ws: string, r: RoomId) => `${location.origin}/room/${ws}/${slotOf(r)}`;
export const investigationPath = (ws: string, r: RoomId) => `/i/${ws}/${slotOf(r)}`;

/** POST JSON with a timeout and a readable error, whatever goes wrong. */
export async function postJson(url: string, body: unknown, timeoutMs = 25_000): Promise<{ ok: boolean; status: number; data: any }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Can't reach the server. It may be waking up; try again in a minute." } };
  }
}
