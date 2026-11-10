/**
 * Collision-free MAC protocols (CN 4.2.3): the bitmap protocol, token passing and binary
 * countdown. In binary countdown every station sends its address bit by bit, the channel ORs
 * the bits, and a station that sent 0 but heard 1 gives up.
 */

/** Bitmap: one contention slot per station, then the ready ones send in address order. */
export function bitmap(n: number, ready: number[]): { slots: boolean[]; order: number[] } {
  const slots = Array.from({ length: n }, (_, i) => ready.includes(i));
  return { slots, order: slots.flatMap((s, i) => (s ? [i] : [])) };
}

/** Token passing: starting at `holder`, the order in which ready stations get the token. */
export function token(n: number, ready: number[], holder: number): { order: number[]; passes: number } {
  const order: number[] = [];
  let passes = 0;
  for (let k = 0; k < n; k++) {
    const s = (holder + k) % n;
    if (ready.includes(s)) order.push(s);
    passes++;
  }
  return { order, passes };
}

export interface Round {
  bit: number;
  sent: Record<number, number>;
  channel: number;
  out: number[];
}

export function countdown(ids: number[], width: number): { rounds: Round[]; winner: number } {
  let alive = [...ids];
  const rounds: Round[] = [];
  for (let k = width - 1; k >= 0; k--) {
    const sent: Record<number, number> = {};
    for (const id of alive) sent[id] = (id >> k) & 1;
    const channel = Object.values(sent).some((v) => v === 1) ? 1 : 0;
    const out = alive.filter((id) => channel === 1 && sent[id] === 0);
    alive = alive.filter((id) => !out.includes(id));
    rounds.push({ bit: width - k, sent, channel, out });
  }
  return { rounds, winner: alive[0] ?? -1 };
}

export const bin = (x: number, w: number) => x.toString(2).padStart(w, "0");

/** Share of channel time carrying data: `d` data bits per frame, `k` frames per bitmap round. */
export const bitmapEfficiency = (d: number, n: number, k: number) => (k * d) / (k * d + n);
/** Binary countdown spends log2(n) bits of contention on every frame. */
export const countdownEfficiency = (d: number, n: number) => d / (d + Math.ceil(Math.log2(n)));
