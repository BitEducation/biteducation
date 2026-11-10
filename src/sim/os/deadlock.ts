/**
 * Deadlock helpers: cycle detection in a single-instance resource graph and the banker's
 * algorithm for one resource type (safe-state check and request evaluation).
 */

/** Directed graph as adjacency lists; returns one cycle (list of nodes) or null. */
export function findCycle(edges: Readonly<Record<string, readonly string[]>>): string[] | null {
  const state = new Map<string, 1 | 2>(); // 1 = on stack, 2 = done
  const stack: string[] = [];
  const visit = (u: string): string[] | null => {
    state.set(u, 1);
    stack.push(u);
    for (const v of edges[u] ?? []) {
      if (state.get(v) === 1) return stack.slice(stack.indexOf(v));
      if (!state.has(v)) {
        const c = visit(v);
        if (c) return c;
      }
    }
    stack.pop();
    state.set(u, 2);
    return null;
  };
  for (const u of Object.keys(edges).sort()) {
    if (!state.has(u)) {
      const c = visit(u);
      if (c) return c;
    }
  }
  return null;
}

export interface BankProc {
  id: string;
  has: number;
  max: number;
}

export interface BankStep {
  id: string;
  before: number;
  after: number;
}

export interface BankCheck {
  safe: boolean;
  /** Processes that can finish, in the order the check found them. */
  steps: BankStep[];
  /** Processes left when the check got stuck (empty if safe). */
  stuck: string[];
}

/** Safe-state check: repeatedly pick the first process whose remaining need fits. */
export function bankerSafe(free: number, procs: readonly BankProc[]): BankCheck {
  let avail = free;
  const left = procs.map((p) => ({ ...p }));
  const steps: BankStep[] = [];
  for (;;) {
    const i = left.findIndex((p) => p.max - p.has <= avail);
    if (i < 0) break;
    const p = left[i] as BankProc;
    steps.push({ id: p.id, before: avail, after: avail + p.has });
    avail += p.has;
    left.splice(i, 1);
  }
  return { safe: left.length === 0, steps, stuck: left.map((p) => p.id) };
}

/** Grants the request only if it fits the claim, the free units and keeps the state safe. */
export function bankerRequest(
  free: number,
  procs: readonly BankProc[],
  who: string,
  amount: number,
): { granted: boolean; reason: "claim" | "wait" | "unsafe" | "ok"; check?: BankCheck } {
  const p = procs.find((x) => x.id === who);
  if (!p || p.has + amount > p.max) return { granted: false, reason: "claim" };
  if (amount > free) return { granted: false, reason: "wait" };
  const after = procs.map((x) => (x.id === who ? { ...x, has: x.has + amount } : x));
  const check = bankerSafe(free - amount, after);
  return { granted: check.safe, reason: check.safe ? "ok" : "unsafe", check };
}
