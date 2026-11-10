/**
 * A random-scanning worm on a small network (MOS 9.9): every tick each infected machine probes
 * a few random addresses, and a probe infects the target if it is still vulnerable.
 * Fully deterministic: the scan order comes from a fixed seed.
 */
import { prng, randInt } from "../shared/prng.ts";

export interface WormOpts {
  hosts: number;
  /** Fraction of machines patched (0..1); patched machines refuse the probe. */
  patched: number;
  probes: number;
  ticks: number;
  seed: number;
}

export interface WormResult {
  /** Infected machines at the end of each tick (index 0 = start). */
  infected: number[];
  vulnerable: number;
  /** Probes sent in the whole run. */
  probes: number;
}

export function spread(o: WormOpts): WormResult {
  const rand = prng(o.seed);
  const patchedSet = new Set<number>();
  const pr = prng(o.seed + 1);
  const target = Math.round(o.hosts * o.patched);
  while (patchedSet.size < target) patchedSet.add(randInt(pr, 1, o.hosts - 1));
  const sick = new Set<number>([0]);
  const infected = [1];
  let probes = 0;
  for (let t = 0; t < o.ticks; t++) {
    const now = [...sick].sort((a, b) => a - b);
    for (const _h of now) {
      for (let k = 0; k < o.probes; k++) {
        probes++;
        const dst = randInt(rand, 0, o.hosts - 1);
        if (!patchedSet.has(dst)) sick.add(dst);
      }
    }
    infected.push(sick.size);
  }
  return { infected, vulnerable: o.hosts - patchedSet.size, probes };
}
