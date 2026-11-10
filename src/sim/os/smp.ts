/**
 * Scheduling on two cores with round robin. A task that runs on a different core from the last one
 * first spends `warm` ticks reloading its data into that core's cache. "single" shares one ready
 * queue; "affinity" keeps a queue per core and never moves tasks; "steal" lets an idle core take
 * the last task waiting in the other core's queue.
 */
export type SmpPolicy = "single" | "affinity" | "steal";
export interface SmpTask {
  name: string;
  burst: number;
  /** Core whose queue the task starts in, for the per-core policies. */
  home: number;
}
export interface SmpSlice {
  core: number;
  task: string;
  kind: "run" | "warm";
  from: number;
  to: number;
}
export interface SmpRun {
  slices: SmpSlice[];
  finish: Record<string, number>;
  end: number;
  migrations: number;
  idle: number;
}

export const CORES = 2;

export function smp(tasks: SmpTask[], policy: SmpPolicy, quantum: number, warm: number): SmpRun {
  const rem = Object.fromEntries(tasks.map((t) => [t.name, t.burst]));
  const last: Record<string, number | undefined> = {};
  const finish: Record<string, number> = {};
  const queues: string[][] =
    policy === "single"
      ? [tasks.map((t) => t.name)]
      : Array.from({ length: CORES }, (_, c) => tasks.filter((t) => t.home === c).map((t) => t.name));
  const own = (c: number) => (policy === "single" ? 0 : c);
  const cur: ({ task: string; q: number; warm: number } | null)[] = new Array(CORES).fill(null);
  const ticks: SmpSlice[] = [];
  let migrations = 0;
  let t = 0;
  while (Object.keys(finish).length < tasks.length && t < 1000) {
    const take = (c: number, name: string | undefined) => {
      if (name === undefined) return;
      const moved = last[name] !== undefined && last[name] !== c;
      if (moved) migrations++;
      cur[c] = { task: name, q: quantum, warm: moved ? warm : 0 };
    };
    for (let c = 0; c < CORES; c++) if (!cur[c]) take(c, queues[own(c)]?.shift());
    // Only after every core has served its own queue does an idle core steal, so a task is
    // never pulled away from a core that was about to run it.
    if (policy === "steal") for (let c = 0; c < CORES; c++) if (!cur[c]) take(c, queues[1 - c]?.pop());
    for (let c = 0; c < CORES; c++) {
      const r = cur[c];
      if (!r) continue;
      if (r.warm > 0) {
        r.warm--;
        ticks.push({ core: c, task: r.task, kind: "warm", from: t, to: t + 1 });
      } else {
        rem[r.task] = (rem[r.task] ?? 0) - 1;
        r.q--;
        ticks.push({ core: c, task: r.task, kind: "run", from: t, to: t + 1 });
      }
    }
    t++;
    for (let c = 0; c < CORES; c++) {
      const r = cur[c];
      if (!r) continue;
      last[r.task] = c;
      if ((rem[r.task] ?? 0) <= 0) {
        finish[r.task] = t;
        cur[c] = null;
      } else if (r.q === 0 && r.warm === 0) {
        queues[own(c)]?.push(r.task);
        cur[c] = null;
      }
    }
  }
  // Consecutive ticks of the same task and kind on a core become one slice.
  const slices: SmpSlice[] = [];
  for (const s of ticks) {
    const prev = [...slices].reverse().find((x) => x.core === s.core);
    if (prev && prev.task === s.task && prev.kind === s.kind && prev.to === s.from) prev.to = s.to;
    else slices.push({ ...s });
  }
  slices.sort((a, b) => a.core - b.core || a.from - b.from);
  const end = Math.max(0, ...Object.values(finish));
  const work = ticks.length;
  return { slices, finish, end, migrations, idle: CORES * end - work };
}
