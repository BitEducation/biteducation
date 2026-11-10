/**
 * CPU scheduling simulator, tick based and deterministic.
 * MVP scope: CPU bursts only (no I/O), one CPU. Ties are broken by arrival, then by input order.
 * Round Robin convention: a process arriving at the same tick a quantum expires enters the
 * ready queue BEFORE the preempted process (Silberschatz; Tanenbaum leaves it open).
 */
export interface Proc {
  pid: string;
  arrival: number;
  burst: number;
  /** Lower value = higher priority. */
  priority: number;
}

export type Algo = "fcfs" | "sjf" | "srtf" | "rr" | "prio";

export interface SchedOpts {
  algo: Algo;
  quantum?: number;
  /** Ticks spent on a context switch between two different processes. */
  switchCost?: number;
  maxTicks?: number;
}

export type SchedEvent =
  | { t: number; kind: "arrive"; pid: string }
  | { t: number; kind: "dispatch"; pid: string }
  | { t: number; kind: "preempt"; pid: string; reason: "quantum" | "better" }
  | { t: number; kind: "finish"; pid: string }
  | { t: number; kind: "switch"; from: string; to: string; until: number }
  | { t: number; kind: "idle"; until: number };

export interface Slice {
  pid: string | null;
  kind: "run" | "switch" | "idle";
  from: number;
  to: number;
}

export interface ProcStats {
  finish: number;
  turnaround: number;
  wait: number;
  response: number;
}

export interface SchedResult {
  events: SchedEvent[];
  slices: Slice[];
  stats: Record<string, ProcStats>;
  avgWait: number;
  avgTurnaround: number;
  avgResponse: number;
  makespan: number;
  /** Fraction of time running processes (switches and idle excluded). */
  utilization: number;
  switches: number;
}

export function schedule(procs: readonly Proc[], opts: SchedOpts): SchedResult {
  if (procs.length === 0) throw new Error("Nenhum processo");
  const ids = new Set(procs.map((p) => p.pid));
  if (ids.size !== procs.length) throw new Error("PIDs repetidos");
  for (const p of procs) if (p.burst <= 0 || p.arrival < 0) throw new Error(`Processo inválido: ${p.pid}`);
  const quantum = opts.quantum ?? 2;
  if (opts.algo === "rr" && quantum < 1) throw new Error("Quantum deve ser ≥ 1");
  const cost = opts.switchCost ?? 0;
  const maxTicks = opts.maxTicks ?? 10_000;
  const order = new Map(procs.map((p, i) => [p.pid, i]));
  const byId = new Map(procs.map((p) => [p.pid, p]));
  const remaining = new Map(procs.map((p) => [p.pid, p.burst]));
  const firstRun = new Map<string, number>();
  const finish = new Map<string, number>();
  const events: SchedEvent[] = [];
  const slices: Slice[] = [];
  const ready: string[] = [];
  let running: string | null = null;
  let used = 0;
  let switching: { until: number; to: string } | null = null;
  let lastRan: string | null = null;
  let lastEnd = -1;
  let switches = 0;

  const key = (pid: string): number[] => {
    const p = byId.get(pid) as Proc;
    const o = order.get(pid) ?? 0;
    if (opts.algo === "sjf" || opts.algo === "srtf") return [remaining.get(pid) ?? 0, p.arrival, o];
    if (opts.algo === "prio") return [p.priority, p.arrival, o];
    return [0];
  };
  const better = (a: number[], b: number[]) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (a[i] ?? 0) - (b[i] ?? 0);
      if (d !== 0) return d < 0;
    }
    return false;
  };
  const pick = (): string | undefined => {
    if (opts.algo === "fcfs" || opts.algo === "rr") return ready.shift();
    let best = 0;
    for (let i = 1; i < ready.length; i++)
      if (better(key(ready[i] as string), key(ready[best] as string))) best = i;
    return ready.splice(best, 1)[0];
  };
  const push = (pid: string | null, kind: Slice["kind"], t: number) => {
    const last = slices[slices.length - 1];
    if (last && last.pid === pid && last.kind === kind && last.to === t) last.to = t + 1;
    else slices.push({ pid, kind, from: t, to: t + 1 });
  };
  const dispatch = (pid: string, t: number) => {
    running = pid;
    used = 0;
    if (!firstRun.has(pid)) firstRun.set(pid, t);
    events.push({ t, kind: "dispatch", pid });
  };

  for (let t = 0; t <= maxTicks; t++) {
    for (const p of procs)
      if (p.arrival === t) {
        ready.push(p.pid);
        events.push({ t, kind: "arrive", pid: p.pid });
      }
    if (switching && switching.until === t) {
      const to = switching.to;
      switching = null;
      dispatch(to, t);
    }
    if (running && !switching) {
      const cur: string = running;
      if ((remaining.get(cur) ?? 0) === 0) {
        finish.set(cur, t);
        events.push({ t, kind: "finish", pid: cur });
        lastRan = cur;
        lastEnd = t;
        running = null;
      } else if (opts.algo === "rr" && used >= quantum) {
        if (ready.length > 0) {
          events.push({ t, kind: "preempt", pid: cur, reason: "quantum" });
          ready.push(cur);
          lastRan = cur;
          lastEnd = t;
          running = null;
        } else used = 0;
      } else if (opts.algo === "srtf" || opts.algo === "prio") {
        const challenger = ready.find((r) => better(key(r), key(cur)));
        if (challenger) {
          events.push({ t, kind: "preempt", pid: cur, reason: "better" });
          ready.push(cur);
          lastRan = cur;
          lastEnd = t;
          running = null;
        }
      }
    }
    if (!running && !switching && ready.length > 0) {
      const next = pick() as string;
      if (cost > 0 && lastRan !== null && lastEnd === t && next !== lastRan) {
        switching = { until: t + cost, to: next };
        switches++;
        events.push({ t, kind: "switch", from: lastRan, to: next, until: t + cost });
      } else {
        if (lastRan !== null && next !== lastRan) switches++;
        dispatch(next, t);
      }
    }
    if (finish.size === procs.length) {
      const makespan = t;
      return summarize(procs, events, slices, finish, firstRun, makespan, switches);
    }
    if (switching) push(null, "switch", t);
    else if (running) {
      remaining.set(running, (remaining.get(running) ?? 0) - 1);
      used++;
      push(running, "run", t);
    } else {
      const last = slices[slices.length - 1];
      if (last?.kind !== "idle") events.push({ t, kind: "idle", until: nextArrival(procs, t) });
      push(null, "idle", t);
    }
  }
  throw new Error("Simulação longa demais");
}

function nextArrival(procs: readonly Proc[], t: number): number {
  return Math.min(...procs.filter((p) => p.arrival > t).map((p) => p.arrival), Number.POSITIVE_INFINITY);
}

function summarize(
  procs: readonly Proc[],
  events: SchedEvent[],
  slices: Slice[],
  finish: Map<string, number>,
  firstRun: Map<string, number>,
  makespan: number,
  switches: number,
): SchedResult {
  const stats: Record<string, ProcStats> = {};
  for (const p of procs) {
    const f = finish.get(p.pid) ?? makespan;
    const turnaround = f - p.arrival;
    stats[p.pid] = {
      finish: f,
      turnaround,
      wait: turnaround - p.burst,
      response: (firstRun.get(p.pid) ?? f) - p.arrival,
    };
  }
  const n = procs.length;
  const sum = (k: keyof ProcStats) => Object.values(stats).reduce((a, s) => a + s[k], 0);
  const busy = slices.filter((s) => s.kind === "run").reduce((a, s) => a + s.to - s.from, 0);
  return {
    events,
    slices,
    stats,
    avgWait: sum("wait") / n,
    avgTurnaround: sum("turnaround") / n,
    avgResponse: sum("response") / n,
    makespan,
    utilization: makespan > 0 ? busy / makespan : 1,
    switches,
  };
}
