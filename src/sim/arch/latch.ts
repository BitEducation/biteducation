/**
 * One-bit memory. The SR latch is two cross-coupled NOR gates evaluated together, one gate delay
 * per round, so the forbidden input and its release show up as an oscillation. The D latch and
 * the edge-triggered D flip-flop are compared on the same waveform.
 */
export type Bit = 0 | 1;
export interface Sr {
  q: Bit;
  nq: Bit;
}

const nor = (a: Bit, b: Bit): Bit => (a === 1 || b === 1 ? 0 : 1);

/** Q = NOR(R, Q̄), Q̄ = NOR(S, Q). Returns every intermediate state until stable (or `max` rounds). */
export function settleSr(s: Bit, r: Bit, from: Sr, max = 6): { states: Sr[]; stable: boolean } {
  const states: Sr[] = [];
  let cur = from;
  for (let i = 0; i < max; i++) {
    const next: Sr = { q: nor(r, cur.nq), nq: nor(s, cur.q) };
    if (next.q === cur.q && next.nq === cur.nq) return { states, stable: true };
    states.push(next);
    cur = next;
  }
  return { states, stable: false };
}

/** Clock with the given period: low in the first half, high in the second. */
export const clockAt = (t: number, period = 4): Bit => (t % period >= period / 2 ? 1 : 0);

export interface Waves {
  clk: Bit[];
  d: Bit[];
  latch: Bit[];
  ff: Bit[];
  /** Times of the clock's rising edges. */
  edges: number[];
  latchChanges: number;
  ffChanges: number;
}

/** Level-sensitive latch (Q follows D while CLK = 1) against a flip-flop that samples D at the rising edge. */
export function waves(d: readonly Bit[], period = 4, q0: Bit = 0): Waves {
  const clk = d.map((_, t) => clockAt(t, period));
  const latch: Bit[] = [];
  const ff: Bit[] = [];
  const edges: number[] = [];
  let ql = q0;
  let qf = q0;
  d.forEach((v, t) => {
    if (clk[t] === 1) ql = v;
    if (clk[t] === 1 && (t === 0 ? 0 : clk[t - 1]) === 0) {
      qf = v;
      edges.push(t);
    }
    latch.push(ql);
    ff.push(qf);
  });
  const changes = (xs: Bit[]) => xs.filter((x, i) => x !== (i === 0 ? q0 : xs[i - 1])).length;
  return { clk, d: [...d], latch, ff, edges, latchChanges: changes(latch), ffChanges: changes(ff) };
}

/** A register fed by its own value plus one: the value after each rising edge, wrapping at 2^bits. */
export function counter(start: number, edges: number, bits = 4): number[] {
  const mod = 2 ** bits;
  return Array.from({ length: edges + 1 }, (_, i) => (start + i) % mod);
}

export const parseBits = (s: string): Bit[] => [...s].map((ch) => (ch === "1" ? 1 : 0));
