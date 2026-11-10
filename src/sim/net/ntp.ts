import { prng, randInt } from "../shared/prng.ts";

/**
 * One NTP exchange: the client stamps T1 when it sends and T4 when the answer arrives (its own
 * clock), the server stamps T2 and T3 (the reference clock). Offset and delay follow RFC 5905.
 */
export interface Exchange {
  t1: number;
  t2: number;
  t3: number;
  t4: number;
  /** Round-trip delay δ = (T4 − T1) − (T3 − T2). */
  delay: number;
  /** Offset θ = ((T2 − T1) + (T3 − T4)) / 2: what the client must add to its clock. */
  offset: number;
  /** θ minus the true correction: half the difference between the two one-way delays. */
  error: number;
}

/** `clientErr` is client clock minus true time; `out`/`back` are one-way delays; all in ms. */
export function exchange(start: number, clientErr: number, out: number, back: number, server = 1): Exchange {
  const t1 = start + clientErr;
  const t2 = start + out;
  const t3 = t2 + server;
  const t4 = t3 + back + clientErr;
  const delay = t4 - t1 - (t3 - t2);
  const offset = (t2 - t1 + (t3 - t4)) / 2;
  return { t1, t2, t3, t4, delay, offset, error: offset - -clientErr };
}

/** Eight polls with random queueing on each direction; NTP keeps the one with the smallest delay. */
export function samples(base: number, clientErr: number, seed = 7, n = 8, jitter = 40) {
  const r = prng(seed);
  const list = Array.from({ length: n }, (_, i) =>
    exchange(
      10000 + i * 64000,
      clientErr,
      base + randInt(r, 0, jitter - 1),
      base + randInt(r, 0, jitter - 1),
    ),
  );
  const best = list.reduce((a, b) => (b.delay < a.delay ? b : a));
  const mean = list.reduce((a, b) => a + Math.abs(b.error), 0) / n;
  return { list, best, bestIndex: list.indexOf(best), meanAbsError: mean };
}

/** Offsets above this are stepped at once; smaller ones are slewed (ntpd default, 128 ms). */
export const STEP_MS = 128;
/** Maximum slew rate: 500 ppm, half a millisecond per second. */
export const SLEW_PPM = 500;
export const slewSeconds = (ms: number) => Math.abs(ms) / 1000 / (SLEW_PPM / 1e6);
