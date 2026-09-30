import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Which workspace the current code path belongs to. Every request, socket event and timer runs inside one,
 * so the engine code can keep using `store` / `CASE` while each visitor's data stays isolated.
 */
export interface Ctx {
  id: string;
  store: any;
}

const als = new AsyncLocalStorage<Ctx>();
let fallback: (() => Ctx) | null = null;

export function setFallback(f: () => Ctx) {
  fallback = f;
}

export function current(): Ctx {
  const c = als.getStore();
  if (c) return c;
  if (!fallback) throw new Error("no workspace context");
  return fallback();
}

export function runIn<T>(ctx: Ctx, fn: () => T): T {
  return als.run(ctx, fn);
}
