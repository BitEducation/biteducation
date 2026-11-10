/**
 * Sliding-window link protocols: stop-and-wait utilization, the window that fills the pipe, and
 * what Go-Back-N and Selective Repeat resend after one lost frame.
 */

/** Fraction of time the sender is transmitting: w frames per (frame time + RTT), capped at 1. */
export const utilization = (window: number, frameMs: number, rttMs: number) =>
  Math.min(1, (window * frameMs) / (frameMs + rttMs));

/** Smallest window that keeps the line busy for a whole round trip. */
export const fillWindow = (frameMs: number, rttMs: number) => Math.ceil(1 + rttMs / frameMs);

export interface Tx {
  frame: number;
  /** "perdido": lost on the way; "descartado": arrived but out of order (Go-Back-N); "guardado": buffered (SR). */
  fate: "entregue" | "perdido" | "descartado" | "guardado";
  retry: boolean;
}

/** Transmissions of `n` frames when the first copy of `lost` disappears. */
export function goBackN(n: number, window: number, lost: number): Tx[] {
  const first = Math.min(lost + window, n);
  const out: Tx[] = [];
  for (let i = 0; i < first; i++)
    out.push({ frame: i, fate: i < lost ? "entregue" : i === lost ? "perdido" : "descartado", retry: false });
  for (let i = lost; i < n; i++) out.push({ frame: i, fate: "entregue", retry: i < first });
  return out;
}

export function selectiveRepeat(n: number, window: number, lost: number): Tx[] {
  const first = Math.min(lost + window, n);
  const out: Tx[] = [];
  for (let i = 0; i < first; i++)
    out.push({ frame: i, fate: i < lost ? "entregue" : i === lost ? "perdido" : "guardado", retry: false });
  out.push({ frame: lost, fate: "entregue", retry: true });
  for (let i = first; i < n; i++) out.push({ frame: i, fate: "entregue", retry: false });
  return out;
}

/** With k-bit sequence numbers: Go-Back-N can use 2^k - 1, Selective Repeat only half the space. */
export const maxWindow = (bits: number) => ({ gbn: 2 ** bits - 1, sr: 2 ** (bits - 1) });
