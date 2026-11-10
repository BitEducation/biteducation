/**
 * Working set and thrashing (MOS 3.4.8, 3.5.2; Maziero 17.5 and 17.7): the working set
 * W(t, Δ) of a reference string, LRU faults per number of frames, and a load model where k
 * copies of the process share `frames` frames and one disk serves every fault.
 */

/** Distinct pages among the last `delta` references ending at each time t (1-based). */
export function workingSet(refs: number[], delta: number): number[] {
  return refs.map((_, t) => new Set(refs.slice(Math.max(0, t + 1 - delta), t + 1)).size);
}

export function lruFaults(refs: number[], frames: number): number {
  if (frames <= 0) return refs.length;
  const mem: number[] = [];
  let faults = 0;
  for (const p of refs) {
    const i = mem.indexOf(p);
    if (i >= 0) mem.splice(i, 1);
    else {
      faults++;
      if (mem.length >= frames) mem.shift();
    }
    mem.push(p);
  }
  return faults;
}

/**
 * k processes, each running `refs` with ⌊frames ÷ k⌋ frames. Every reference costs 1 time unit of
 * CPU; every fault costs `disk` units of the single disk. CPU and disk overlap across processes,
 * so the run takes as long as the busier of the two, but never less than one process alone
 * (its references and its faults happen one after the other). Returns CPU use in percent.
 */
export function load(refs: number[], frames: number, k: number, disk: number) {
  const each = Math.floor(frames / k);
  const faults = lruFaults(refs, each);
  const cpu = k * refs.length;
  const io = k * faults * disk;
  const alone = refs.length + faults * disk;
  const total = Math.max(cpu, io, alone);
  return { each, faults, cpu, io, total, use: Math.round((cpu / total) * 100) };
}
