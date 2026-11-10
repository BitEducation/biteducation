/**
 * A synchronous bus: a read takes one cycle to place the address and `lat` cycles for the memory
 * to answer; a burst sends one address and then one word per cycle. Arbitration hands the bus to
 * one master per transaction, either by fixed position on a daisy chain or by rotating turns.
 */
export const LINE = 64;
export const CLOCK_MHZ = 100;

export const readCycles = (lat: number) => 1 + lat;
export const singleLine = (lat: number, width: number) => (LINE / width) * readCycles(lat);
export const burstLine = (lat: number, width: number) => readCycles(lat) + LINE / width - 1;
/** Megabytes per second for `bytes` moved in `cycles` at CLOCK_MHZ. */
export const mbps = (bytes: number, cycles: number) => (bytes * CLOCK_MHZ) / cycles;

export type Arbitration = "daisy" | "rotate";
export interface Grant {
  dev: number;
  from: number;
  to: number;
}

/** Each device wants `jobs[d]` transactions of `len` cycles; device 0 is nearest the arbiter. */
export function arbitrate(jobs: number[], len: number, mode: Arbitration) {
  const left = [...jobs];
  const grants: Grant[] = [];
  let t = 0;
  let turn = 0;
  while (left.some((x) => x > 0)) {
    let d = -1;
    if (mode === "daisy") d = left.findIndex((x) => x > 0);
    else
      for (let k = 0; k < left.length; k++) {
        const c = (turn + k) % left.length;
        if ((left[c] ?? 0) > 0) {
          d = c;
          break;
        }
      }
    grants.push({ dev: d, from: t, to: t + len });
    left[d] = (left[d] ?? 0) - 1;
    t += len;
    turn = (d + 1) % left.length;
  }
  const first = jobs.map((_, d) => grants.find((g) => g.dev === d)?.from ?? 0);
  const done = jobs.map((_, d) => Math.max(0, ...grants.filter((g) => g.dev === d).map((g) => g.to)));
  return { grants, first, done, end: t };
}
