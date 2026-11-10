/**
 * A server handling requests on one CPU. Each request computes, waits for I/O, then computes again.
 * "single" runs them one after another; "kernel" gives each request its own kernel thread, so the
 * CPU serves another request while one waits; "user" uses user-level threads, whose blocking
 * system call blocks the whole process, so the timeline matches "single".
 */
export type ThreadMode = "single" | "kernel" | "user";
export interface Slice {
  req: number;
  from: number;
  to: number;
}
export interface ThreadRun {
  slices: Slice[];
  finish: number[];
  end: number;
  busy: number;
  idle: number;
}

export function serve(requests: number, cpu: number, io: number, mode: ThreadMode): ThreadRun {
  const slices: Slice[] = [];
  const finish: number[] = new Array(requests).fill(0);
  if (mode !== "kernel") {
    let t = 0;
    for (let r = 0; r < requests; r++) {
      slices.push({ req: r, from: t, to: t + cpu });
      t += cpu + io;
      slices.push({ req: r, from: t, to: t + cpu });
      t += cpu;
      finish[r] = t;
    }
  } else {
    // phase 0 = first burst, 1 = second burst, 2 = done; ready = when the next burst may start.
    const phase = new Array(requests).fill(0);
    const ready = new Array(requests).fill(0);
    let t = 0;
    while (phase.some((p) => p < 2)) {
      const waiting = [...phase.keys()].filter((r) => phase[r] < 2);
      const now = waiting.filter((r) => ready[r] <= t);
      if (now.length === 0) {
        t = Math.min(...waiting.map((r) => ready[r]));
        continue;
      }
      // FCFS: the request that became ready first, ties by number.
      const r = now.reduce((a, x) => (ready[x] < ready[a] ? x : a));
      slices.push({ req: r, from: t, to: t + cpu });
      t += cpu;
      if (phase[r] === 0) {
        phase[r] = 1;
        ready[r] = t + io;
      } else {
        phase[r] = 2;
        finish[r] = t;
      }
    }
  }
  const end = Math.max(0, ...finish);
  const busy = slices.reduce((s, x) => s + x.to - x.from, 0);
  return { slices, finish, end, busy, idle: end - busy };
}
