/**
 * Interconnection networks (SCO 8.4.1): builds a topology of n nodes as an edge list and
 * measures it by brute force — links, degree, diameter and average distance by BFS, and the
 * bisection width as the fewest links crossing any split into two equal halves.
 */

export type Kind = "estrela" | "anel" | "grade" | "toro" | "hipercubo" | "completo";
export type Edge = readonly [number, number];

export function edges(kind: Kind, n: number): Edge[] {
  const out: Edge[] = [];
  const add = (a: number, b: number) => {
    if (a !== b && !out.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) out.push([a, b]);
  };
  const side = Math.round(Math.sqrt(n));
  for (let i = 0; i < n; i++) {
    if (kind === "estrela" && i > 0) add(0, i);
    if (kind === "anel") add(i, (i + 1) % n);
    if (kind === "completo") for (let j = i + 1; j < n; j++) add(i, j);
    if (kind === "hipercubo") for (let bit = 1; bit < n; bit <<= 1) add(i, i ^ bit);
    if (kind === "grade" || kind === "toro") {
      const r = Math.floor(i / side);
      const col = i % side;
      if (col + 1 < side) add(i, i + 1);
      else if (kind === "toro") add(i, r * side);
      if (r + 1 < side) add(i, i + side);
      else if (kind === "toro") add(i, col);
    }
  }
  return out;
}

function dist(n: number, es: Edge[], from: number): number[] {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of es) {
    adj[a]?.push(b);
    adj[b]?.push(a);
  }
  const d = Array(n).fill(-1) as number[];
  d[from] = 0;
  const q = [from];
  while (q.length) {
    const u = q.shift() as number;
    for (const v of adj[u] ?? [])
      if (d[v] === -1) {
        d[v] = (d[u] as number) + 1;
        q.push(v);
      }
  }
  return d;
}

/** Fewest edges crossing a split into halves of n/2 (node 0 fixed in the first half). */
export function bisection(n: number, es: Edge[]): number {
  let best = Number.POSITIVE_INFINITY;
  const half = n / 2;
  const pick = (start: number, chosen: number[]) => {
    if (chosen.length === half) {
      const inA = new Set(chosen);
      let cut = 0;
      for (const [a, b] of es) if (inA.has(a) !== inA.has(b)) cut++;
      best = Math.min(best, cut);
      return;
    }
    for (let i = start; i < n; i++) pick(i + 1, [...chosen, i]);
  };
  pick(1, [0]);
  return best;
}

export interface Metrics {
  kind: Kind;
  links: number;
  degree: number;
  diameter: number;
  /** Mean hops between distinct pairs, two decimals. */
  average: number;
  bisection: number;
}

export function measure(kind: Kind, n: number): Metrics {
  const es = edges(kind, n);
  const deg = Array(n).fill(0) as number[];
  for (const [a, b] of es) {
    deg[a] = (deg[a] as number) + 1;
    deg[b] = (deg[b] as number) + 1;
  }
  let diameter = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const d = dist(n, es, i);
    diameter = Math.max(diameter, ...d);
    sum += d.reduce((a, x) => a + x, 0);
  }
  return {
    kind,
    links: es.length,
    degree: Math.max(...deg),
    diameter,
    average: Math.round((sum / (n * (n - 1))) * 100) / 100,
    bisection: bisection(n, es),
  };
}
