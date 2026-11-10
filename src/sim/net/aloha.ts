/**
 * Random access on a shared channel: pure and slotted ALOHA throughput for an offered load G
 * (frames per frame time), a seeded slot-by-slot run, classic Ethernet CSMA/CD efficiency and
 * binary exponential backoff.
 */
import { prng } from "../shared/prng.ts";

/** Vulnerable for two frame times: success needs no other start in 2 frame times. */
export const pureAloha = (g: number) => g * Math.exp(-2 * g);
/** Slots shrink the vulnerable period to one. */
export const slottedAloha = (g: number) => g * Math.exp(-g);

/** Poisson draw by multiplying uniforms (Knuth); fine for small means. */
function poisson(rand: () => number, mean: number): number {
  const limit = Math.exp(-mean);
  let k = 0;
  let prod = rand();
  while (prod > limit) {
    k += 1;
    prod *= rand();
  }
  return k;
}

/** Frames that try in each slot. */
export function slots(g: number, count: number, seed = 12): number[] {
  const rand = prng(seed);
  return Array.from({ length: count }, () => poisson(rand, g));
}

export const ETH = { rate: 10e6, cable: 2500, speed: 2e8, slotBits: 512 } as const;

/** Classic 10 Mbit/s Ethernet efficiency: 1 / (1 + 2BLe / cF). */
export const csmaEfficiency = (frameBytes: number) =>
  1 / (1 + (2 * ETH.rate * ETH.cable * Math.E) / (ETH.speed * frameBytes * 8));

/** Microseconds of one contention slot (512 bit times). */
export const SLOT_US = (ETH.slotBits / ETH.rate) * 1e6;

/** After the i-th collision a station waits K slots, K uniform in [0, 2^min(i,10) - 1]. */
export function backoff(collisions: number) {
  const top = 2 ** Math.min(collisions, 10) - 1;
  return { top, meanUs: (top / 2) * SLOT_US };
}
