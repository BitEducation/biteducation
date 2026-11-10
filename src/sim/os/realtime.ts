/**
 * Periodic real-time tasks on one CPU, deadline = period. Rate monotonic gives fixed priority to
 * the shorter period; EDF picks the job with the earliest absolute deadline. A job still running
 * at its deadline is a miss and is dropped, so later jobs start clean.
 */

export interface RtTask {
  name: string;
  c: number;
  p: number;
}
export type RtPolicy = "rms" | "edf";

export interface RtSlice {
  task: string;
  from: number;
  to: number;
}

export function utilization(ts: RtTask[]): number {
  return ts.reduce((a, t) => a + t.c / t.p, 0);
}

/** Liu & Layland: n(2^(1/n) − 1), sufficient for rate monotonic. */
export function rmsBound(n: number): number {
  return n * (2 ** (1 / n) - 1);
}

export function rtRun(ts: RtTask[], policy: RtPolicy, horizon: number) {
  type Job = { task: number; left: number; deadline: number };
  let jobs: Job[] = [];
  const slices: RtSlice[] = [];
  const misses: { task: string; at: number; left: number }[] = [];
  for (let t = 0; t < horizon; t++) {
    // Deadlines first: a job due now that still has work missed it.
    for (const j of jobs)
      if (j.deadline === t && j.left > 0) misses.push({ task: ts[j.task]?.name ?? "", at: t, left: j.left });
    jobs = jobs.filter((j) => j.deadline > t && j.left > 0);
    ts.forEach((x, i) => {
      if (t % x.p === 0) jobs.push({ task: i, left: x.c, deadline: t + x.p });
    });
    const pick = jobs
      .slice()
      .sort((a, b) =>
        policy === "rms"
          ? (ts[a.task]?.p ?? 0) - (ts[b.task]?.p ?? 0) || a.task - b.task
          : a.deadline - b.deadline || a.task - b.task,
      )[0];
    if (!pick) continue;
    pick.left--;
    const name = ts[pick.task]?.name ?? "";
    const last = slices.at(-1);
    if (last && last.task === name && last.to === t) last.to = t + 1;
    else slices.push({ task: name, from: t, to: t + 1 });
  }
  for (const j of jobs)
    if (j.deadline === horizon && j.left > 0)
      misses.push({ task: ts[j.task]?.name ?? "", at: horizon, left: j.left });
  return { slices, misses };
}
