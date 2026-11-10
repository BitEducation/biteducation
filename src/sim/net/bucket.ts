/**
 * Traffic shaping tick by tick: a token bucket (rate r tokens per tick, room for b) in front of a
 * line that sends at most M packets per tick. Shaping queues what has no token; policing drops it.
 * The leaky bucket drains a constant r per tick, with no bursts at all.
 */
export interface Tick {
  t: number;
  arrived: number;
  sent: number;
  queued: number;
  dropped: number;
  tokens: number;
  inTotal: number;
  outTotal: number;
}

export type Mode = "sem" | "furado" | "fichas" | "policia";

export function simulate(arrivals: number[], mode: Mode, rate: number, bucket: number, line: number): Tick[] {
  let tokens = bucket;
  let queue = 0;
  let inTotal = 0;
  let outTotal = 0;
  return arrivals.map((arrived, t) => {
    if (t > 0) tokens = Math.min(bucket, tokens + rate);
    inTotal += arrived;
    let sent = 0;
    let dropped = 0;
    if (mode === "sem") {
      queue += arrived;
      sent = Math.min(queue, line);
    } else if (mode === "furado") {
      queue += arrived;
      sent = Math.min(queue, rate, line);
    } else if (mode === "fichas") {
      queue += arrived;
      sent = Math.min(queue, Math.floor(tokens), line);
      tokens -= sent;
    } else {
      sent = Math.min(arrived, Math.floor(tokens), line);
      dropped = arrived - sent;
      tokens -= sent;
    }
    if (mode !== "policia") queue -= sent;
    outTotal += sent;
    return { t, arrived, sent, queued: queue, dropped, tokens, inTotal, outTotal };
  });
}

/** How long a full bucket lets the line run at full speed: b / (M - r). */
export const burstTicks = (rate: number, bucket: number, line: number) =>
  line > rate ? bucket / (line - rate) : Number.POSITIVE_INFINITY;

/** Ticks the last packet of each arrival waits, FIFO: first tick when outTotal reaches inTotal. */
export function maxDelay(ticks: Tick[]): number {
  let worst = 0;
  ticks.forEach((x) => {
    if (!x.arrived) return;
    const done = ticks.find((y) => y.t >= x.t && y.outTotal >= x.inTotal);
    worst = Math.max(worst, done ? done.t - x.t : ticks.length - x.t);
  });
  return worst;
}
