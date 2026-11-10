/**
 * CRC as long division modulo 2: append r zeros, XOR the generator under every leading 1, keep the
 * last r bits. Bits are arrays of 0/1, most significant first.
 */
export type Bits = number[];

export const toBits = (n: number, width: number): Bits =>
  Array.from({ length: width }, (_, i) => (n >> (width - 1 - i)) & 1);
export const str = (b: Bits) => b.join("");

export interface DivStep {
  /** Column where the generator was lined up. */
  at: number;
  /** Working bits after this XOR. */
  after: Bits;
}

/** Divides `dividend` by `gen` modulo 2; returns every XOR and the remainder. */
export function divide(dividend: Bits, gen: Bits) {
  const work = [...dividend];
  const steps: DivStep[] = [];
  for (let i = 0; i + gen.length <= work.length; i++) {
    if (work[i] !== 1) continue;
    gen.forEach((g, k) => {
      work[i + k] = (work[i + k] ?? 0) ^ g;
    });
    steps.push({ at: i, after: [...work] });
  }
  return { steps, remainder: work.slice(work.length - (gen.length - 1)) };
}

/** Frame sent: data followed by the remainder of data·x^r divided by the generator. */
export function encode(data: Bits, gen: Bits) {
  const r = gen.length - 1;
  const { steps, remainder } = divide([...data, ...Array(r).fill(0)], gen);
  return { steps, remainder, frame: [...data, ...remainder] };
}

/** The receiver divides the whole frame; a zero remainder means "no error seen". */
export const check = (frame: Bits, gen: Bits) => divide(frame, gen).remainder.every((b) => b === 0);

export const flip = (b: Bits, positions: number[]) => b.map((x, i) => (positions.includes(i) ? x ^ 1 : x));

/** An error pattern equal to the generator shifted: the remainder does not change, so it slips through. */
export const invisible = (frameLen: number, gen: Bits, shift: number) =>
  gen.flatMap((g, k) => (g ? [frameLen - gen.length - shift + k] : []));
