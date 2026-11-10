/**
 * Amdahl and Gustafson: how much n cores speed up a job of which a fraction f can run in parallel.
 */

/** Fixed problem size: the serial part (1 - f) never shrinks. */
export const amdahl = (f: number, n: number) => 1 / (1 - f + f / n);

/** With infinitely many cores only the serial part remains. */
export const ceiling = (f: number) => (f >= 1 ? Number.POSITIVE_INFINITY : 1 / (1 - f));

/** Problem grows with n so the run time stays the same (scaled speedup). */
export const gustafson = (f: number, n: number) => 1 - f + f * n;

export const efficiency = (f: number, n: number) => amdahl(f, n) / n;

/** Time of a job of `total` seconds on n cores. */
export function times(total: number, f: number, n: number) {
  const serial = total * (1 - f);
  const parallel = (total * f) / n;
  return { serial, parallel, total: serial + parallel };
}

/** Brazilian decimal comma, at most `d` digits, trailing zeros dropped. */
export function dec(x: number, d = 2): string {
  const r = Math.round(x * 10 ** d) / 10 ** d;
  return String(r).replace(".", ",");
}
