/** Hamming(7,4) with positions 1..7: parity bits at 1, 2 and 4, data at 3, 5, 6 and 7. */

export const PARITY_POS = [1, 2, 4] as const;
export const DATA_POS = [3, 5, 6, 7] as const;

/** Positions covered by the parity bit at `p` (those whose index has that bit set). */
export const covers = (p: number) => [1, 2, 3, 4, 5, 6, 7].filter((i) => (i & p) !== 0);

/** Codeword indexed 1..7 (index 0 unused); data is 4 bits, most significant goes to position 3. */
export function encode(data: number): number[] {
  const w = new Array<number>(8).fill(0);
  DATA_POS.forEach((pos, k) => {
    w[pos] = (data >> (3 - k)) & 1;
  });
  for (const p of PARITY_POS)
    w[p] = covers(p)
      .filter((i) => i !== p)
      .reduce((x, i) => x ^ (w[i] ?? 0), 0);
  return w;
}

/** Each check recomputes even parity over its positions; the failing checks add up to the bad position. */
export function syndrome(word: readonly number[]): { checks: { p: number; ok: boolean }[]; pos: number } {
  const checks = PARITY_POS.map((p) => ({ p, ok: covers(p).reduce((x, i) => x ^ (word[i] ?? 0), 0) === 0 }));
  return { checks, pos: checks.reduce((s, c) => s + (c.ok ? 0 : c.p), 0) };
}

export const decodeData = (word: readonly number[]) =>
  DATA_POS.reduce((n, pos) => n * 2 + (word[pos] ?? 0), 0);

/** Check bits needed for m data bits with single-error correction: smallest r with 2^r ≥ m + r + 1. */
export function checkBits(m: number): number {
  let r = 1;
  while (2 ** r < m + r + 1) r++;
  return r;
}
