/**
 * Memory consistency litmus test ("store buffering", SCO 8.3.2): core 0 runs x = 1; r1 = y and
 * core 1 runs y = 1; r2 = x. Every legal schedule is enumerated under three models:
 *   sc    — each operation hits memory in program order (sequential consistency);
 *   tso   — stores wait in a per-core FIFO buffer and drain later (x86-TSO);
 *   fence — TSO with a fence after each store, so the buffer drains before the load.
 */

export type Model = "sc" | "tso" | "fence";
export type Op = "s0" | "l0" | "d0" | "s1" | "l1" | "d1";

export interface Schedule {
  order: Op[];
  r1: number;
  r2: number;
}

/** Ordering constraints: [before, after]. Under SC the store is its own drain. */
function constraints(m: Model): [Op, Op][] {
  if (m === "sc")
    return [
      ["s0", "l0"],
      ["s1", "l1"],
    ];
  const base: [Op, Op][] = [
    ["s0", "l0"],
    ["s0", "d0"],
    ["s1", "l1"],
    ["s1", "d1"],
  ];
  return m === "tso" ? base : [...base, ["d0", "l0"], ["d1", "l1"]];
}

export function ops(m: Model): Op[] {
  return m === "sc" ? ["s0", "l0", "s1", "l1"] : ["s0", "l0", "d0", "s1", "l1", "d1"];
}

/** Value each load sees: memory holds a variable once its store has drained (or, under SC, run). */
function outcome(m: Model, order: Op[]): { r1: number; r2: number } {
  const at = (o: Op) => order.indexOf(o);
  const visible = (core: 0 | 1, load: Op) => at(m === "sc" ? `s${core}` : `d${core}`) < at(load);
  return { r1: visible(1, "l0") ? 1 : 0, r2: visible(0, "l1") ? 1 : 0 };
}

/** Every linear extension of the constraints, in lexicographic order of `ops(m)`. */
export function schedules(m: Model): Schedule[] {
  const all = ops(m);
  const cons = constraints(m);
  const out: Schedule[] = [];
  const walk = (done: Op[]) => {
    if (done.length === all.length) {
      out.push({ order: done, ...outcome(m, done) });
      return;
    }
    for (const o of all) {
      if (done.includes(o)) continue;
      if (cons.some(([a, z]) => z === o && !done.includes(a))) continue;
      walk([...done, o]);
    }
  };
  walk([]);
  return out;
}

/** How many schedules end with each (r1, r2), keyed "r1,r2". */
export function tally(list: Schedule[]): Record<string, number> {
  const t: Record<string, number> = { "0,0": 0, "0,1": 0, "1,0": 0, "1,1": 0 };
  for (const s of list) t[`${s.r1},${s.r2}`] = (t[`${s.r1},${s.r2}`] ?? 0) + 1;
  return t;
}

const NAMES: Record<Op, string> = {
  s0: "x = 1",
  l0: "r1 = y",
  d0: "x chega à memória",
  s1: "y = 1",
  l1: "r2 = x",
  d1: "y chega à memória",
};
export const opName = (o: Op) => NAMES[o];
