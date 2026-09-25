import type { NextFunction, Request, Response } from "express";

/**
 * Short in-memory response cache for expensive PUBLIC GET endpoints (product search with facets).
 * Only anonymous requests are cached; the key is the full URL. Single-instance by design (per pod).
 */
const store = new Map<string, { exp: number; body: unknown }>();
const MAX_ENTRIES = 500;

export function anonCache(ttlMs = 60_000) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" || req.user) return next();
    const key = req.originalUrl;
    const hit = store.get(key);
    if (hit && hit.exp > Date.now()) {
      res.setHeader("X-Cache", "HIT");
      return res.json(hit.body);
    }
    const original = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (res.statusCode === 200) {
        if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value as string);
        store.set(key, { exp: Date.now() + ttlMs, body });
      }
      return original(body);
    }) as Response["json"];
    next();
  };
}

export function clearAnonCache() { store.clear(); }
