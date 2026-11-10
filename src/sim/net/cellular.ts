import { prng } from "../shared/prng.ts";

/**
 * Cellular basics in numbers. Frequency reuse: channels split among the N cells of a cluster,
 * repeated over the city. Handover: a phone walks from cell A to cell B, signal quality falls
 * linearly with distance plus a fixed fading pattern, and the phone switches only when the other
 * cell beats the serving one by the hysteresis margin.
 */

export const CHANNELS = 420;
export const CITY_CELLS = 84;

export function reuse(n: number) {
  const perCell = Math.floor(CHANNELS / n);
  return { perCell, city: perCell * CITY_CELLS };
}

export const STEPS = 20;
const SLOPE = 2.2;
const TOP = 50;
export const WEAK_DB = 25;

/** Fading in dB, the same on every run: a few dB up or down at each position. */
const FADE = (() => {
  const r = prng(11);
  return Array.from({ length: STEPS + 1 }, () => Math.round((r() * 6 - 3) * 10) / 10);
})();
const FADE_B = (() => {
  const r = prng(29);
  return Array.from({ length: STEPS + 1 }, () => Math.round((r() * 6 - 3) * 10) / 10);
})();

export function signals() {
  return Array.from({ length: STEPS + 1 }, (_, x) => ({
    x,
    a: Math.round((TOP - SLOPE * x + (FADE[x] ?? 0)) * 10) / 10,
    b: Math.round((TOP - SLOPE * (STEPS - x) + (FADE_B[x] ?? 0)) * 10) / 10,
  }));
}

export function handoverRun(hysteresis: number) {
  const s = signals();
  let serving: "A" | "B" = "A";
  const switches: { x: number; to: "A" | "B" }[] = [];
  const track: ("A" | "B")[] = [];
  for (const p of s) {
    const mine = serving === "A" ? p.a : p.b;
    const other = serving === "A" ? p.b : p.a;
    if (other > mine + hysteresis) {
      serving = serving === "A" ? "B" : "A";
      switches.push({ x: p.x, to: serving });
    }
    track.push(serving);
  }
  // Positions where the phone stays on a cell whose quality is below the usable floor.
  const weak = s.filter((p, i) => (track[i] === "A" ? p.a : p.b) < WEAK_DB).length;
  return { signals: s, switches, track, count: switches.length, weak };
}
