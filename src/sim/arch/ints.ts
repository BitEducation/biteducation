/** Fixed-width integer helpers: bit patterns, two's complement and an adder with flags. */

/** Bits of `n` in `w` bits, most significant first (n may be negative: two's complement). */
export function bitsOf(n: number, w: number): number[] {
  const m = ((n % 2 ** w) + 2 ** w) % 2 ** w;
  return Array.from({ length: w }, (_, i) => Math.floor(m / 2 ** (w - 1 - i)) % 2);
}

export function unsigned(bits: readonly number[]): number {
  return bits.reduce((n, b) => n * 2 + b, 0);
}

export function signed(bits: readonly number[]): number {
  const u = unsigned(bits);
  return bits[0] ? u - 2 ** bits.length : u;
}

export function hexOf(bits: readonly number[]): string {
  const out: string[] = [];
  for (let i = 0; i < bits.length; i += 4)
    out.push(
      unsigned(bits.slice(i, i + 4))
        .toString(16)
        .toUpperCase(),
    );
  return out.join("");
}

export interface AddResult {
  sum: number[];
  /** carries[i] is the carry INTO bit column i (MSB first); carries[0] is into the sign bit. */
  carries: number[];
  carryOut: number;
  overflow: boolean;
}

/** Ripple-carry addition of two w-bit patterns, column by column from the right. */
export function addBits(a: readonly number[], b: readonly number[]): AddResult {
  const w = a.length;
  const sum = new Array<number>(w).fill(0);
  const carries = new Array<number>(w).fill(0);
  let c = 0;
  for (let i = w - 1; i >= 0; i--) {
    carries[i] = c;
    const s = (a[i] ?? 0) + (b[i] ?? 0) + c;
    sum[i] = s % 2;
    c = s >= 2 ? 1 : 0;
  }
  // signed overflow: carry into the sign bit differs from the carry out of it
  return { sum, carries, carryOut: c, overflow: carries[0] !== c };
}
