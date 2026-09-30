import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const avatar = (seed: string) =>
  `https://api.dicebear.com/9.x/notionists-neutral/svg?seed=${encodeURIComponent(seed)}&backgroundColor=e7e5e4`;

export const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** Backend origin. Empty = same origin (local dev, or the Render build). Set VITE_API_URL when the client is hosted elsewhere (Vercel). */
export const API = (
  import.meta.env.VITE_API_URL ?? (location.hostname.endsWith(".vercel.app") ? "https://vllo.onrender.com" : "")
).replace(/\/$/, "");
export const apiUrl = (path: string) => `${API}${path}`;
export const wsUrl = (path: string) =>
  API ? `${API.replace(/^http/, "ws")}${path}` : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${path}`;

export const pretty = (v: string) => v.replace(/_/g, " ");

/** Server clock minus device clock, so countdowns are right on devices whose clock is off. */
let skew = 0;
export const syncClock = (serverNow?: number) => {
  if (serverNow) skew = serverNow - Date.now();
};
export const now = () => Date.now() + skew;
