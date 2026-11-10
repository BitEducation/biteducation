/**
 * 802.11 distributed access (DCF) in numbers: inter-frame spaces, slotted random backoff that
 * freezes while the medium is busy, ACK after SIFS, and the RTS/CTS exchange that reserves the
 * medium against hidden terminals. OFDM timing (802.11a/g): 9 µs slots, SIFS 16 µs, DIFS 34 µs.
 */

export const SLOT = 9;
export const SIFS = 16;
export const DIFS = SIFS + 2 * SLOT;
export const RATE = 54;
export const PREAMBLE = 20;
export const RTS = 20;
export const CTS = 14;
export const ACK = 14;

/** Microseconds on air for a frame of `bytes` at RATE Mb/s, preamble included. */
export const airtime = (bytes: number) => PREAMBLE + (bytes * 8) / RATE;

export function exchange(bytes: number, rts: boolean) {
  const data = airtime(bytes);
  const base = DIFS + data + SIFS + airtime(ACK);
  const total = rts ? base + airtime(RTS) + SIFS + airtime(CTS) + SIFS : base;
  return { data, total, overhead: total - data };
}

/** Air time wasted when two stations collide: the data frame, or only the short RTS. */
export const collisionLoss = (bytes: number, rts: boolean) => (rts ? airtime(RTS) : airtime(bytes));

/**
 * Two stations count down their backoff after DIFS; the first to reach zero transmits and the
 * other freezes its counter, resuming after the next DIFS.
 */
export function backoffRace(a: number, b: number) {
  const first = a <= b ? "A" : "B";
  const lead = Math.min(a, b);
  return { first, waitedSlots: lead, frozenAt: Math.max(a, b) - lead, tie: a === b };
}
