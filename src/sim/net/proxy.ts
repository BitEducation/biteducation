import { prng } from "../shared/prng.ts";

/**
 * A caching forward proxy (LRU, freshness by max-age, revalidation with a conditional GET) and a
 * reverse proxy spreading requests over back ends by round robin or least connections.
 */
export const LAN_MS = 5;
export const ORIGIN_MS = 80;

export interface Req {
  t: number;
  client: number;
  obj: string;
}

/** Requests every second from 3 clients; popular objects come up far more often (Zipf-like). */
export function workload(n: number, objects = 8, seed = 11): Req[] {
  const r = prng(seed);
  const weights = Array.from({ length: objects }, (_, i) => 1 / (i + 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const pick = () => {
    let x = r() * total;
    for (let i = 0; i < objects; i++) {
      x -= weights[i] ?? 0;
      if (x <= 0) return i;
    }
    return objects - 1;
  };
  return Array.from({ length: n }, (_, i) => ({ t: i, client: i % 3, obj: `/obj${pick() + 1}` }));
}

export type Result = "miss" | "hit" | "revalidated";

export interface Served {
  req: Req;
  result: Result;
  ms: number;
  evicted: string | null;
}

/** `capacity` objects in LRU order; an entry is fresh for `maxAge` seconds after it was fetched. */
export function runCache(reqs: Req[], capacity: number, maxAge: number) {
  const lru: { obj: string; at: number }[] = [];
  const out: Served[] = [];
  for (const req of reqs) {
    const i = lru.findIndex((e) => e.obj === req.obj);
    let result: Result;
    let evicted: string | null = null;
    if (i < 0) {
      result = "miss";
      if (lru.length >= capacity) evicted = lru.shift()?.obj ?? null;
      lru.push({ obj: req.obj, at: req.t });
    } else {
      const [e] = lru.splice(i, 1);
      if (!e) throw new Error("unreachable");
      if (req.t - e.at >= maxAge) {
        result = "revalidated";
        e.at = req.t;
      } else result = "hit";
      lru.push(e);
    }
    out.push({ req, result, ms: result === "hit" ? LAN_MS : LAN_MS + ORIGIN_MS, evicted });
  }
  const count = (r: Result) => out.filter((s) => s.result === r).length;
  const meanMs = out.reduce((a, s) => a + s.ms, 0) / out.length;
  return {
    served: out,
    hits: count("hit"),
    misses: count("miss"),
    revalidated: count("revalidated"),
    meanMs,
  };
}

/** Request durations at the back ends: mostly quick pages, every fifth a slow report. */
export const durations = (n: number) => Array.from({ length: n }, (_, i) => (i % 5 === 4 ? 9 : 1));

/** One request arrives per tick; returns which back end got each one and the mean response time. */
export function balance(policy: "rr" | "least", backends: number, durs: number[]) {
  const busyUntil: number[][] = Array.from({ length: backends }, () => []);
  const picks: number[] = [];
  let total = 0;
  durs.forEach((d, t) => {
    const active = busyUntil.map((l) => l.filter((end) => end > t));
    let k = t % backends;
    if (policy === "least") {
      const min = Math.min(...active.map((l) => l.length));
      k = active.findIndex((l) => l.length === min);
    }
    // A back end serves one request at a time: a new one waits for those in progress.
    const queue = active[k] ?? [];
    const start = Math.max(t, ...queue);
    const end = start + d;
    busyUntil[k] = [...queue, end];
    picks.push(k);
    total += end - t;
  });
  return { picks, mean: total / durs.length };
}
