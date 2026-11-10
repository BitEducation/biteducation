/**
 * Linux CFS (MOS 10.3.4): each task keeps a virtual runtime that grows by the real time it ran
 * scaled by 1024 / weight(nice); the scheduler always runs the task with the smallest one.
 * A task that arrives late starts at the current minimum vruntime ("min") rather than 0 ("zero").
 */

/** Kernel table sched_prio_to_weight, for the nice values used here. */
export const WEIGHT: Record<number, number> = { [-10]: 9548, [-5]: 3121, 0: 1024, 5: 335, 10: 110 };

export interface Task {
  name: string;
  nice: number;
  arrival: number;
}

export interface Slice {
  task: number;
  from: number;
  to: number;
}

export interface Result {
  slices: Slice[];
  /** vruntime of every task after each tick (null before it arrives). */
  vr: (number | null)[][];
  ran: number[];
  /** Longest uninterrupted run of the late arrival. */
  longest: number[];
}

export function run(tasks: Task[], ticks: number, place: "min" | "zero" = "min"): Result {
  const vr: (number | null)[] = tasks.map(() => null);
  const ran = tasks.map(() => 0);
  const longest = tasks.map(() => 0);
  const slices: Slice[] = [];
  const hist: (number | null)[][] = [];
  let streak = 0;
  for (let t = 0; t < ticks; t++) {
    tasks.forEach((k, i) => {
      if (k.arrival !== t) return;
      const live = vr.filter((v): v is number => v !== null);
      vr[i] = place === "min" && live.length ? Math.min(...live) : 0;
    });
    let pick = -1;
    vr.forEach((v, i) => {
      if (v !== null && (pick < 0 || v < (vr[pick] as number) - 1e-9)) pick = i;
    });
    if (pick < 0) continue;
    const w = WEIGHT[(tasks[pick] as Task).nice] as number;
    vr[pick] = (vr[pick] as number) + 1024 / w;
    ran[pick] = (ran[pick] as number) + 1;
    const last = slices[slices.length - 1];
    if (last && last.task === pick && last.to === t) {
      last.to = t + 1;
      streak++;
    } else {
      slices.push({ task: pick, from: t, to: t + 1 });
      streak = 1;
    }
    longest[pick] = Math.max(longest[pick] as number, streak);
    hist.push([...vr]);
  }
  return { slices, vr: hist, ran, longest };
}
