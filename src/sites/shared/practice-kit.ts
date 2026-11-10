import { prng, randInt } from "../../sim/shared/prng.ts";

/** Seeded dice for exercise generators: the same seed always rolls the same numbers. */
export function dice(seed: number) {
  // Spread nearby seeds apart: seeds 1, 2, 3 would otherwise start almost alike.
  const r = prng(Math.imul(seed, 2654435761) >>> 0 || 1);
  return {
    int: (min: number, max: number) => randInt(r, min, max),
    pick: <T>(xs: readonly T[]): T => xs[randInt(r, 0, xs.length - 1)] as T,
    /** k distinct values from [min, max]. */
    distinct: (k: number, min: number, max: number): number[] => {
      const out: number[] = [];
      while (out.length < k) {
        const v = randInt(r, min, max);
        if (!out.includes(v)) out.push(v);
      }
      return out;
    },
  };
}

/** pt-BR decimal: comma, at most `d` places, no trailing zeros. */
export const num = (n: number, d = 2): string => String(Number(n.toFixed(d))).replace(".", ",");

/** Thousands with a dot (65.536), without locale APIs. */
export const big = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export const hex = (n: number, width = 0): string =>
  `0x${(n >>> 0).toString(16).toUpperCase().padStart(width, "0")}`;

export const bin = (n: number, width: number): string => (n >>> 0).toString(2).padStart(width, "0");
