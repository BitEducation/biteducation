/**
 * Two threads updating a shared variable, one micro-operation per tick, under round robin.
 * Entry protocols: none, a naive flag, Peterson, test-and-set (TSL) and a blocking mutex.
 */

export type ROp =
  | { k: "load"; v: string }
  | { k: "add"; n: number }
  | { k: "store"; v: string }
  /** mem[v] ← val; "other" writes the other thread's index (Peterson's turn). */
  | { k: "set"; v: string; val: number | "other" }
  /** Busy wait: advances only when `ok` holds, otherwise burns the tick. */
  | { k: "spin"; ok: (mem: Readonly<Record<string, number>>, self: number) => boolean; what: string }
  /** Atomic: R ← mem[v]; mem[v] ← 1. Advances only if R was 0. */
  | { k: "tsl"; v: string }
  | { k: "lock"; v: string }
  | { k: "unlock"; v: string };

export interface Prog {
  ops: ROp[];
  /** Critical section is ops[csFrom .. csTo). */
  csFrom: number;
  csTo: number;
}

export interface Tick {
  t: number;
  tid: number;
  op: ROp;
  outcome: "ok" | "spin" | "block" | "wake";
  reg: number;
  mem: Record<string, number>;
  inCS: number;
}

export interface RaceResult {
  ticks: Tick[];
  mem: Record<string, number>;
  /** Final value of `saldo` (0 if never written). */
  saldo: number;
  /** Most threads inside the critical section at the same time. */
  maxInCS: number;
  spins: number;
  blocks: number;
}

/**
 * Runs the programs with round robin of `quantum` ticks (Infinity = one after the other).
 * A blocked thread is skipped; a spin uses its tick.
 */
export function runRace(
  progs: readonly Prog[],
  init: Record<string, number>,
  quantum: number,
  cap = 200,
): RaceResult {
  const mem = { ...init };
  const pc = progs.map(() => 0);
  const reg = progs.map(() => 0);
  const blocked = progs.map(() => false);
  const queue: Record<string, number[]> = {};
  const ticks: Tick[] = [];
  let cur = 0;
  let used = 0;
  let maxInCS = 0;
  let spins = 0;
  let blocks = 0;
  const adv = (i: number) => {
    pc[i] = (pc[i] ?? 0) + 1;
  };
  const done = (i: number) => (pc[i] ?? 0) >= (progs[i]?.ops.length ?? 0);
  const runnable = (i: number) => !done(i) && !blocked[i];
  // Inside once past the entry protocol (pc == csFrom only counts when there is a protocol).
  const inCS = () =>
    progs.filter((p, i) => {
      const at = pc[i] ?? 0;
      return !blocked[i] && at < p.csTo && (at > p.csFrom || (at === p.csFrom && p.csFrom > 0));
    }).length;

  for (let t = 1; t <= cap; t++) {
    if (progs.every((_, i) => done(i))) break;
    if (!runnable(cur) || used >= quantum) {
      // next runnable thread after cur, cur itself last
      let n = -1;
      for (let k = 1; k <= progs.length && n < 0; k++)
        if (runnable((cur + k) % progs.length)) n = (cur + k) % progs.length;
      if (n < 0) break; // everyone blocked
      cur = n;
      used = 0;
    }
    const i = cur;
    const op = progs[i]?.ops[pc[i] ?? 0] as ROp;
    let outcome: Tick["outcome"] = "ok";
    switch (op.k) {
      case "load":
        reg[i] = mem[op.v] ?? 0;
        adv(i);
        break;
      case "add":
        reg[i] = (reg[i] ?? 0) + op.n;
        adv(i);
        break;
      case "store":
        mem[op.v] = reg[i] ?? 0;
        adv(i);
        break;
      case "set":
        mem[op.v] = op.val === "other" ? 1 - i : op.val;
        adv(i);
        break;
      case "spin":
        if (op.ok(mem, i)) adv(i);
        else {
          outcome = "spin";
          spins++;
        }
        break;
      case "tsl":
        reg[i] = mem[op.v] ?? 0;
        mem[op.v] = 1;
        if (reg[i] === 0) adv(i);
        else {
          outcome = "spin";
          spins++;
        }
        break;
      case "lock":
        if ((mem[op.v] ?? 0) === 0) {
          mem[op.v] = 1;
          adv(i);
        } else {
          blocked[i] = true;
          const q = queue[op.v] ?? [];
          q.push(i);
          queue[op.v] = q;
          outcome = "block";
          blocks++;
        }
        break;
      case "unlock": {
        const w = queue[op.v]?.shift();
        if (w === undefined) mem[op.v] = 0;
        else {
          // ownership passes straight to the waiter, which resumes after its lock
          blocked[w] = false;
          adv(w);
          outcome = "wake";
        }
        adv(i);
        break;
      }
    }
    used++;
    const n = inCS();
    maxInCS = Math.max(maxInCS, n);
    ticks.push({ t, tid: i, op, outcome, reg: reg[i] ?? 0, mem: { ...mem }, inCS: n });
  }
  return { ticks, mem, saldo: mem.saldo ?? 0, maxInCS, spins, blocks };
}

/** saldo += amount, as the three instructions a compiler emits. */
export const deposit = (n: number): ROp[] => [
  { k: "load", v: "saldo" },
  { k: "add", n },
  { k: "store", v: "saldo" },
];

export type Guard = "none" | "naive" | "peterson" | "tsl" | "mutex";

export function guarded(g: Guard, amount: number, self: number): Prog {
  const body = deposit(amount);
  const wrap = (pre: ROp[], post: ROp[]): Prog => ({
    ops: [...pre, ...body, ...post],
    csFrom: pre.length,
    csTo: pre.length + body.length,
  });
  switch (g) {
    case "none":
      return wrap([], []);
    case "naive":
      return wrap(
        [
          { k: "spin", ok: (m) => (m.ocupado ?? 0) === 0, what: "ocupado = 0?" },
          { k: "set", v: "ocupado", val: 1 },
        ],
        [{ k: "set", v: "ocupado", val: 0 }],
      );
    case "peterson": {
      const me = `quer${self}`;
      const other = `quer${1 - self}`;
      return wrap(
        [
          { k: "set", v: me, val: 1 },
          { k: "set", v: "vez", val: "other" },
          {
            k: "spin",
            ok: (m, s) => !((m[other] ?? 0) === 1 && (m.vez ?? 0) === 1 - s),
            what: "outra quer e é a vez dela?",
          },
        ],
        [{ k: "set", v: me, val: 0 }],
      );
    }
    case "tsl":
      return wrap([{ k: "tsl", v: "trava" }], [{ k: "set", v: "trava", val: 0 }]);
    case "mutex":
      return wrap([{ k: "lock", v: "m" }], [{ k: "unlock", v: "m" }]);
  }
}
