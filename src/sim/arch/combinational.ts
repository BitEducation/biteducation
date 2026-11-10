/**
 * Combinational building blocks (SCO 3.2.2–3.2.3): decoder, multiplexer and barrel shifter on
 * n-bit values, with the gate counts of the textbook two-level designs.
 */

/** Bits of v, most significant first. */
export const bits = (v: number, n: number) => Array.from({ length: n }, (_, i) => (v >> (n - 1 - i)) & 1);

/** n → 2^n decoder: exactly one output high, the one numbered by the input. */
export function decoder(sel: number, n: number): number[] {
  return Array.from({ length: 2 ** n }, (_, i) => (i === sel ? 1 : 0));
}

/** 2^n → 1 multiplexer: an AND per input gated by the decoder line, then one OR. */
export function mux(data: number[], sel: number, n: number): number {
  const lines = decoder(sel, n);
  return data.reduce((acc, d, i) => acc | (d & (lines[i] as number)), 0);
}

/** Barrel shifter: stage k shifts left by 2^k when bit k of `amount` is set. Values after each stage. */
export function barrel(v: number, amount: number, n: number): number[] {
  const stages = Math.log2(n);
  const out = [v];
  let cur = v;
  for (let k = 0; k < stages; k++) {
    if ((amount >> k) & 1) cur = (cur << (1 << k)) & (2 ** n - 1);
    out.push(cur);
  }
  return out;
}

/** Gate counts: NOTs for the inverted inputs, one n-input AND per line; mux adds AND per input + OR. */
export function gates(n: number) {
  const decoderGates = n + 2 ** n;
  const muxGates = decoderGates + 2 ** n + 1;
  const width = 2 ** n;
  // each 2:1 mux = 2 AND + 1 OR, plus one NOT per stage for the inverted control bit
  const barrelGates = n * (width * 3 + 1);
  return { decoder: decoderGates, mux: muxGates, barrel: barrelGates, barrelMuxes: n * width };
}
