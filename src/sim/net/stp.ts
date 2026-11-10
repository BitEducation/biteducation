/**
 * Spanning Tree Protocol on a few switches: elect the lowest bridge ID as root, compute each
 * switch's cost to the root and its root port, pick one designated port per link, block the rest.
 * Also counts how a broadcast multiplies around loops when nothing is blocked.
 */
export interface Bridge {
  name: string;
  priority: number;
  /** Lower MAC breaks priority ties; here a small number stands for it. */
  mac: number;
}

export interface Wire {
  id: string;
  a: string;
  b: string;
  cost: number;
}

export const bridgeId = (x: Bridge) => x.priority * 1000 + x.mac;
export const idText = (x: Bridge) => `${x.priority}.${String(x.mac).padStart(2, "0")}`;

export interface Tree {
  root: string;
  dist: Record<string, number>;
  /** Wire id each non-root bridge uses towards the root. */
  rootPort: Record<string, string>;
  /** Wire id -> bridge whose port is designated on it. */
  designated: Record<string, string>;
  /** Wires with one end blocked (no frames forwarded), and which bridge blocks. */
  blocked: string[];
  blocker: Record<string, string>;
}

export function spanningTree(bridges: Bridge[], wires: Wire[]): Tree {
  const byName = Object.fromEntries(bridges.map((x) => [x.name, x]));
  const id = (n: string) => bridgeId(byName[n] as Bridge);
  const root = [...bridges].sort((x, y) => bridgeId(x) - bridgeId(y))[0]?.name ?? "";
  // Dijkstra with ties broken by the lower bridge ID of the upstream neighbour, as BPDUs do.
  const dist: Record<string, number> = { [root]: 0 };
  const via: Record<string, string> = {};
  const up: Record<string, string> = {};
  const done = new Set<string>();
  while (done.size < bridges.length) {
    const next = bridges
      .map((x) => x.name)
      .filter((n) => !done.has(n) && dist[n] !== undefined)
      .sort((x, y) => (dist[x] ?? 0) - (dist[y] ?? 0) || id(x) - id(y))[0];
    if (!next) break;
    done.add(next);
    for (const w of wires) {
      if (w.a !== next && w.b !== next) continue;
      const other = w.a === next ? w.b : w.a;
      if (done.has(other)) continue;
      const d = (dist[next] ?? 0) + w.cost;
      const cur = dist[other];
      const prev = up[other];
      if (cur === undefined || d < cur || (d === cur && prev !== undefined && id(next) < id(prev))) {
        dist[other] = d;
        up[other] = next;
        via[other] = w.id;
      }
    }
  }
  const designated: Record<string, string> = {};
  for (const w of wires) {
    const da = dist[w.a] ?? Number.POSITIVE_INFINITY;
    const db = dist[w.b] ?? Number.POSITIVE_INFINITY;
    designated[w.id] = da < db || (da === db && id(w.a) < id(w.b)) ? w.a : w.b;
  }
  const rootWires = new Set(Object.values(via));
  const blocked = wires.filter((w) => !rootWires.has(w.id)).map((w) => w.id);
  const blocker = Object.fromEntries(
    blocked.map((wid) => {
      const w = wires.find((x) => x.id === wid) as Wire;
      return [wid, designated[wid] === w.a ? w.b : w.a];
    }),
  );
  return { root, dist, rootPort: via, designated, blocked, blocker };
}

/**
 * Copies of one broadcast in flight after each hop when every port forwards: each copy leaves a
 * switch on all wires except the one it came in on.
 */
export function storm(wires: Wire[], start: string, hops: number): number[] {
  let copies: { at: string; from: string }[] = [];
  for (const w of wires)
    if (w.a === start || w.b === start) copies.push({ at: w.a === start ? w.b : w.a, from: w.id });
  const out = [copies.length];
  for (let h = 1; h < hops; h++) {
    const next: typeof copies = [];
    for (const c of copies)
      for (const w of wires)
        if ((w.a === c.at || w.b === c.at) && w.id !== c.from)
          next.push({ at: w.a === c.at ? w.b : w.a, from: w.id });
    copies = next;
    out.push(copies.length);
  }
  return out;
}
