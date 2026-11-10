/**
 * Video streaming in segments: start-up time from near and far servers, the load a CDN takes off
 * the origin, and a player that downloads 4-second segments while the bandwidth drops, with a fixed
 * quality versus adaptive bitrate (pick the highest rung under 80% of the last measured speed).
 */
export const SEGMENT_S = 4;
export const LADDER = [0.5, 1.5, 3, 6];
/** Connection setup before the first byte: TCP, TLS and the GET. */
export const SETUP_RTTS = 3;
export const BUFFER_CAP = 20;

export const pick = (mbps: number) =>
  [...LADDER].reverse().find((r) => r <= 0.8 * mbps) ?? (LADDER[0] as number);

export function startup(rttMs: number, mbps: number, firstRate: number) {
  const setup = (SETUP_RTTS * rttMs) / 1000;
  const download = (firstRate * SEGMENT_S) / mbps;
  return { setup, download, total: setup + download };
}

export interface Point {
  t: number;
  buffer: number;
  rate: number;
  stall: boolean;
}

/** Plays `count` segments; the link drops to `after` Mb/s from segment `dropAt` on. */
export function play(count: number, before: number, after: number, dropAt: number, adaptive: boolean) {
  let t = 0;
  let buffer = 0;
  let playing = false;
  let stalls = 0;
  let stallTime = 0;
  let measured = before;
  const fixed = pick(before);
  const points: Point[] = [{ t: 0, buffer: 0, rate: 0, stall: false }];
  const rates: number[] = [];
  for (let i = 0; i < count; i++) {
    // Do not hoard: wait while the buffer is full.
    if (buffer > BUFFER_CAP - SEGMENT_S) {
      const wait = buffer - (BUFFER_CAP - SEGMENT_S);
      t += wait;
      buffer -= wait;
      points.push({ t, buffer, rate: rates[rates.length - 1] ?? 0, stall: false });
    }
    const bw = i < dropAt ? before : after;
    const rate = adaptive ? pick(measured) : fixed;
    rates.push(rate);
    const dl = (rate * SEGMENT_S) / bw;
    let stalled = false;
    if (playing) {
      if (buffer < dl) {
        stalled = true;
        stalls += 1;
        stallTime += dl - buffer;
        buffer = 0;
      } else buffer -= dl;
    }
    t += dl;
    points.push({ t, buffer, rate, stall: stalled });
    buffer += SEGMENT_S;
    playing = true;
    measured = bw;
    points.push({ t, buffer, rate, stall: false });
  }
  return { points, rates, stalls, stallTime, end: t };
}

/** Origin egress for `viewers` watching at `mbps`, when the edge serves `hit` of the requests. */
export const originGbps = (viewers: number, mbps: number, hit: number) => (viewers * mbps * (1 - hit)) / 1000;
