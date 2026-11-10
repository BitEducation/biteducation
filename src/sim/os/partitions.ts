/**
 * Variable-partition allocation (MOS 3.2.3; Maziero, alocação de memória): a memory of `units`
 * blocks, requests and frees in order, and four placement policies for each request:
 *   first — the first hole from the bottom that fits;
 *   next  — like first, but the search starts at the hole holding the last placement's end;
 *   best  — the smallest hole that fits;               worst — the largest hole.
 */

export type Policy = "first" | "next" | "best" | "worst";
export type Req = { op: "alloc"; id: string; size: number } | { op: "free"; id: string };

export interface Hole {
  start: number;
  size: number;
}

export interface Step {
  req: Req;
  /** Start unit of the placement, or null when nothing fits (or for a free). */
  at: number | null;
  failed: boolean;
  /** Owner of each unit after this request ("" = free). */
  map: string[];
}

export function holes(map: string[]): Hole[] {
  const out: Hole[] = [];
  let i = 0;
  while (i < map.length) {
    if (map[i] === "") {
      const start = i;
      while (i < map.length && map[i] === "") i++;
      out.push({ start, size: i - start });
    } else i++;
  }
  return out;
}

export function run(policy: Policy, units: number, reqs: Req[]): Step[] {
  const map = Array(units).fill("") as string[];
  let cursor = 0;
  const steps: Step[] = [];
  for (const r of reqs) {
    if (r.op === "free") {
      for (let i = 0; i < units; i++) if (map[i] === r.id) map[i] = "";
      steps.push({ req: r, at: null, failed: false, map: [...map] });
      continue;
    }
    const fit = holes(map).filter((h) => h.size >= r.size);
    let pick: Hole | undefined;
    if (policy === "first") pick = fit[0];
    else if (policy === "next") pick = fit.find((h) => h.start + h.size > cursor) ?? fit[0];
    else if (policy === "best") pick = [...fit].sort((a, z) => a.size - z.size || a.start - z.start)[0];
    else pick = [...fit].sort((a, z) => z.size - a.size || a.start - z.start)[0];
    if (!pick) {
      steps.push({ req: r, at: null, failed: true, map: [...map] });
      continue;
    }
    const at = pick.start;
    for (let i = at; i < at + r.size; i++) map[i] = r.id;
    cursor = at + r.size;
    steps.push({ req: r, at, failed: false, map: [...map] });
  }
  return steps;
}

export function summary(map: string[]) {
  const hs = holes(map);
  const free = hs.reduce((n, h) => n + h.size, 0);
  const largest = Math.max(0, ...hs.map((h) => h.size));
  return { holes: hs.length, free, largest };
}
