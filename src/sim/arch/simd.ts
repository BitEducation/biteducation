/**
 * SIMD on a row of pixels: a scalar loop does one element per instruction, a vector instruction
 * does `w` lanes at once, the last group may be partly empty, and a branch inside the loop makes
 * every group that holds both kinds of pixel run both paths with a mask.
 */
export const pixels = (n: number) => Array.from({ length: n }, (_, i) => (i * 37 + 11) % 100);

export const vectorOps = (n: number, w: number) => Math.ceil(n / w);

export interface Divergence {
  /** How many paths each group of w lanes had to run (1 or 2). */
  paths: number[];
  instr: number;
  /** Useful lane slots over all lane slots issued. */
  util: number;
}

export function diverge(values: number[], w: number, threshold: number): Divergence {
  const paths: number[] = [];
  for (let g = 0; g < values.length; g += w) {
    const grp = values.slice(g, g + w);
    const hi = grp.some((v) => v >= threshold);
    const lo = grp.some((v) => v < threshold);
    paths.push(Number(hi) + Number(lo));
  }
  const instr = paths.reduce((s, x) => s + x, 0);
  return { paths, instr, util: values.length / (instr * w) };
}
