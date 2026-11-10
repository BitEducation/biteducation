/**
 * Hardware multithreading (SCO 8.1.2): two threads on one core, each a list of instructions
 * where "m" misses the cache and stalls that thread for `miss` cycles. The core issues by policy:
 *   single — runs A to the end, then B (no multithreading);
 *   coarse — stays on a thread until it misses, then switches paying `switchCost` idle cycles;
 *   fine   — picks a different ready thread every cycle (round robin);
 *   smt    — issues up to `width` instructions per cycle, at most one per thread.
 */

export type Policy = "single" | "coarse" | "fine" | "smt";

export interface Issue {
  cycle: number;
  slot: number;
  thread: number;
  /** 1-based index of the instruction inside its thread. */
  index: number;
  miss: boolean;
}

export interface Result {
  policy: Policy;
  issues: Issue[];
  cycles: number;
  /** Issue slots used ÷ slots offered, in percent (one decimal). */
  use: number;
}

export interface Opts {
  threads: string[];
  miss: number;
  switchCost: number;
  width: number;
}

export function run(policy: Policy, o: Opts): Result {
  const n = o.threads.length;
  const pc = Array(n).fill(0) as number[];
  const ready = Array(n).fill(0) as number[];
  const issues: Issue[] = [];
  const done = (t: number) => (pc[t] as number) >= (o.threads[t] as string).length;
  const canIssue = (t: number, cycle: number) => !done(t) && (ready[t] as number) <= cycle;
  const issue = (t: number, cycle: number, slot: number) => {
    const miss = (o.threads[t] as string)[pc[t] as number] === "m";
    pc[t] = (pc[t] as number) + 1;
    issues.push({ cycle, slot, thread: t, index: pc[t] as number, miss });
    ready[t] = cycle + 1 + (miss ? o.miss : 0);
    return miss;
  };
  let cycle = 0;
  let cur = 0;
  let last = -1;
  let blockedUntil = 0;
  while (pc.some((_, t) => !done(t))) {
    if (policy === "single") {
      const t = pc.findIndex((_, i) => !done(i));
      if (canIssue(t, cycle)) issue(t, cycle, 0);
    } else if (policy === "coarse") {
      if (cycle >= blockedUntil) {
        if (!canIssue(cur, cycle)) {
          const other = [...Array(n).keys()].find((t) => t !== cur && canIssue(t, cycle));
          if (other !== undefined) {
            cur = other;
            blockedUntil = cycle + o.switchCost;
          }
        }
        if (cycle >= blockedUntil && canIssue(cur, cycle)) issue(cur, cycle, 0);
      }
    } else if (policy === "fine") {
      for (let k = 1; k <= n; k++) {
        const t = (last + k) % n;
        if (canIssue(t, cycle)) {
          issue(t, cycle, 0);
          last = t;
          break;
        }
      }
    } else {
      let slot = 0;
      for (let k = 1; k <= n && slot < o.width; k++) {
        const t = (last + k) % n;
        if (canIssue(t, cycle)) issue(t, cycle, slot++);
      }
      last = (last + 1) % n;
    }
    cycle++;
    if (cycle > 10_000) throw new Error("smt: não terminou");
  }
  const end = Math.max(...issues.map((i) => i.cycle)) + 1;
  const width = policy === "smt" ? o.width : 1;
  return { policy, issues, cycles: end, use: Math.round((issues.length / (end * width)) * 1000) / 10 };
}
