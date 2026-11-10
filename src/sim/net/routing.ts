/**
 * Routing algorithms used by the lessons: longest-prefix match, synchronous distance vector
 * (Bellman-Ford, no split horizon, so count-to-infinity shows up) and Dijkstra for link state.
 */

export const INFINITY = 16; // RIP's "unreachable"

export interface Route {
  prefix: string;
  len: number;
  out: string;
}

function ipNum(ip: string): number {
  return ip.split(".").reduce((n, o) => n * 256 + Number(o), 0);
}

export function matches(r: Route, ip: string): boolean {
  if (r.len === 0) return true;
  const shift = 2 ** (32 - r.len);
  return Math.floor(ipNum(ip) / shift) === Math.floor(ipNum(r.prefix) / shift);
}

/** Every matching route and the winner (the longest prefix). */
export function longestMatch(
  table: readonly Route[],
  ip: string,
): { hits: Route[]; best: Route | undefined } {
  const hits = table.filter((r) => matches(r, ip));
  const best = hits.reduce<Route | undefined>((a, r) => (!a || r.len > a.len ? r : a), undefined);
  return { hits, best };
}

export interface Edge {
  a: string;
  b: string;
  cost: number;
}

export interface Entry {
  cost: number;
  via: string; // next hop; "-" for self or unreachable
}

export type Tables = Record<string, Record<string, Entry>>;

function neighbours(edges: readonly Edge[], x: string): { n: string; cost: number }[] {
  return edges.flatMap((e) =>
    e.a === x ? [{ n: e.b, cost: e.cost }] : e.b === x ? [{ n: e.a, cost: e.cost }] : [],
  );
}

/** Round 0: each router knows only itself and its direct neighbours. */
export function dvInit(nodes: readonly string[], edges: readonly Edge[]): Tables {
  const t: Tables = {};
  for (const x of nodes) {
    t[x] = {};
    for (const y of nodes) (t[x] as Record<string, Entry>)[y] = { cost: x === y ? 0 : INFINITY, via: "-" };
    for (const { n, cost } of neighbours(edges, x)) (t[x] as Record<string, Entry>)[n] = { cost, via: n };
  }
  return t;
}

/** One synchronous round: every router recomputes from its neighbours' previous vectors. */
export function dvRound(nodes: readonly string[], edges: readonly Edge[], prev: Tables): Tables {
  const t: Tables = {};
  for (const x of nodes) {
    const row: Record<string, Entry> = {};
    for (const y of nodes) {
      if (x === y) {
        row[y] = { cost: 0, via: "-" };
        continue;
      }
      let best: Entry = { cost: INFINITY, via: "-" };
      for (const { n, cost } of neighbours(edges, x)) {
        const c = Math.min(INFINITY, cost + (prev[n]?.[y]?.cost ?? INFINITY));
        if (c < best.cost) best = { cost: c, via: n };
      }
      row[y] = best;
    }
    t[x] = row;
  }
  return t;
}

function same(a: Tables, b: Tables): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Runs rounds from `start` until nothing changes; returns every table, start included. */
export function dvConverge(
  nodes: readonly string[],
  edges: readonly Edge[],
  start: Tables,
  cap = 40,
): Tables[] {
  const out = [start];
  for (let i = 0; i < cap; i++) {
    const next = dvRound(nodes, edges, out[out.length - 1] as Tables);
    if (same(next, out[out.length - 1] as Tables)) break;
    out.push(next);
  }
  return out;
}

/** Dijkstra from `src`: cost and first hop to every node, plus the order nodes were settled. */
export function dijkstra(
  nodes: readonly string[],
  edges: readonly Edge[],
  src: string,
): { table: Record<string, Entry>; order: string[] } {
  const table: Record<string, Entry> = {};
  for (const n of nodes) table[n] = { cost: n === src ? 0 : INFINITY, via: "-" };
  const done = new Set<string>();
  const order: string[] = [];
  while (done.size < nodes.length) {
    const u = nodes
      .filter((n) => !done.has(n))
      .reduce((a, n) => ((table[n]?.cost ?? INFINITY) < (table[a]?.cost ?? INFINITY) ? n : a));
    if ((table[u]?.cost ?? INFINITY) >= INFINITY) break;
    done.add(u);
    order.push(u);
    for (const { n, cost } of neighbours(edges, u)) {
      const c = (table[u]?.cost ?? INFINITY) + cost;
      if (!done.has(n) && c < (table[n]?.cost ?? INFINITY)) {
        table[n] = { cost: c, via: u === src ? n : (table[u]?.via ?? "-") };
      }
    }
  }
  return { table, order };
}
