/**
 * RTP (RFC 3550): packets sent every `interval` ms with timestamps; the receiver estimates
 * interarrival jitter J += (|D| - J) / 16, where D is the change in transit time between
 * consecutive packets, and plays each packet `playout` ms after it was sent.
 */

export function jitter(transit: number[]): number[] {
  let j = 0;
  return transit.map((t, i) => {
    if (i > 0) j += (Math.abs(t - (transit[i - 1] as number)) - j) / 16;
    return j;
  });
}

export function late(transit: number[], playout: number): number[] {
  return transit.flatMap((t, i) => (t > playout ? [i] : []));
}

/** RTP timestamp units: 8 kHz audio gives 160 ticks per 20 ms packet. */
export const ticks = (ms: number, hz: number) => (ms * hz) / 1000;
