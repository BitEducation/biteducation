/**
 * VLIW / EPIC (SCO 5.8): the compiler packs independent operations into bundles of `width`
 * slots. List scheduling: each cycle, fill the bundle with ready ops, longest remaining path
 * first; empty slots become NOPs. Compared with an in-order scalar core issuing one op per cycle.
 */

export interface Op {
  id: string;
  text: string;
  kind: "ld" | "mul" | "add" | "st";
  deps: string[];
}

export const LATENCY: Record<Op["kind"], number> = { ld: 2, mul: 3, add: 1, st: 1 };

/** The loop body used by the lesson: z = a × b + c × d. */
export const BODY: Op[] = [
  { id: "1", text: "ld a", kind: "ld", deps: [] },
  { id: "2", text: "ld b", kind: "ld", deps: [] },
  { id: "3", text: "ld c", kind: "ld", deps: [] },
  { id: "4", text: "ld d", kind: "ld", deps: [] },
  { id: "5", text: "t1 = a × b", kind: "mul", deps: ["1", "2"] },
  { id: "6", text: "t2 = c × d", kind: "mul", deps: ["3", "4"] },
  { id: "7", text: "z = t1 + t2", kind: "add", deps: ["5", "6"] },
  { id: "8", text: "st z", kind: "st", deps: ["7"] },
];

/** Longest latency path from each op to the end (scheduling priority). */
function heights(ops: Op[]): Map<string, number> {
  const h = new Map<string, number>();
  const of = (id: string): number => {
    const known = h.get(id);
    if (known !== undefined) return known;
    const op = ops.find((o) => o.id === id) as Op;
    const users = ops.filter((o) => o.deps.includes(id));
    const v = LATENCY[op.kind] + Math.max(0, ...users.map((u) => of(u.id)));
    h.set(id, v);
    return v;
  };
  for (const o of ops) of(o.id);
  return h;
}

export interface Bundle {
  cycle: number;
  slots: (Op | null)[];
}

export function schedule(ops: Op[], width: number): Bundle[] {
  const h = heights(ops);
  const doneAt = new Map<string, number>();
  const bundles: Bundle[] = [];
  let cycle = 0;
  while (doneAt.size < ops.length) {
    const ready = ops
      .filter((o) => !doneAt.has(o.id) && o.deps.every((d) => (doneAt.get(d) ?? Infinity) <= cycle))
      .sort((a, z) => (h.get(z.id) as number) - (h.get(a.id) as number) || Number(a.id) - Number(z.id))
      .slice(0, width);
    for (const o of ready) doneAt.set(o.id, cycle + LATENCY[o.kind]);
    bundles.push({ cycle, slots: [...ready, ...Array(width - ready.length).fill(null)] });
    cycle++;
    if (cycle > 1000) throw new Error("vliw: não terminou");
  }
  return bundles;
}

/** Cycles until the last result is ready. */
export function finish(bundles: Bundle[]): number {
  let end = 0;
  for (const b of bundles) for (const o of b.slots) if (o) end = Math.max(end, b.cycle + LATENCY[o.kind]);
  return end;
}

/** In-order scalar core: one op per cycle, in program order, waiting for its operands. */
export function scalar(ops: Op[]): { issue: Map<string, number>; end: number } {
  const doneAt = new Map<string, number>();
  const issue = new Map<string, number>();
  let cycle = 0;
  for (const o of ops) {
    cycle = Math.max(cycle, ...o.deps.map((d) => doneAt.get(d) as number));
    issue.set(o.id, cycle);
    doneAt.set(o.id, cycle + LATENCY[o.kind]);
    cycle++;
  }
  return { issue, end: Math.max(...doneAt.values()) };
}

/**
 * if (a < b) x++ else y++ : with a branch, a misprediction costs `penalty` cycles `missPct`% of
 * the time; with predication both increments run, each guarded by a predicate, and nothing is
 * thrown away. Average cycles, one decimal.
 */
export function branchVsPredicate(penalty: number, missPct: number) {
  const branch = 1 + 1 + 1 + (penalty * missPct) / 100; // compare, branch, increment, flushes
  const predicated = 1 + 1; // compare sets p1/p2, one bundle with both guarded increments
  return { branch: Math.round(branch * 10) / 10, predicated };
}
