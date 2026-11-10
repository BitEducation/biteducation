/**
 * TCP congestion control, one round per RTT with the window in segments. Slow start doubles up to
 * ssthresh, congestion avoidance adds one; a round that sends more than the path holds loses a
 * segment, detected by three duplicate ACKs. Reno halves the window; Tahoe restarts from one.
 */
export type Variant = "reno" | "tahoe";

export interface Round {
  rtt: number;
  cwnd: number;
  ssthresh: number;
  phase: "partida lenta" | "prevenção";
  loss: boolean;
  delivered: number;
}

export interface CcResult {
  rounds: Round[];
  losses: number;
  delivered: number;
  /** RTT at which cwnd first reached the initial ssthresh. */
  reachedSsthresh: number | null;
}

export function runCc(variant: Variant, o: { capacity: number; ssthresh: number; rounds: number }): CcResult {
  let cwnd = 1;
  let ss = o.ssthresh;
  const rounds: Round[] = [];
  let reached: number | null = null;
  for (let rtt = 0; rtt < o.rounds; rtt++) {
    const loss = cwnd > o.capacity;
    const phase = cwnd < ss ? "partida lenta" : "prevenção";
    if (reached === null && cwnd >= o.ssthresh) reached = rtt;
    rounds.push({ rtt, cwnd, ssthresh: ss, phase, loss, delivered: Math.min(cwnd, o.capacity) });
    if (loss) {
      ss = Math.max(2, Math.floor(cwnd / 2));
      cwnd = variant === "reno" ? ss : 1;
    } else if (cwnd < ss) cwnd = Math.min(cwnd * 2, ss);
    else cwnd += 1;
  }
  return {
    rounds,
    losses: rounds.filter((r) => r.loss).length,
    delivered: rounds.reduce((s, r) => s + r.delivered, 0),
    reachedSsthresh: reached,
  };
}

/** Two AIMD flows on one bottleneck: both add one per RTT and both halve when the sum overflows. */
export function aimdPair(a0: number, b0: number, capacity: number, rounds: number) {
  let a = a0;
  let b = b0;
  const out: { rtt: number; a: number; b: number; loss: boolean }[] = [];
  for (let rtt = 0; rtt < rounds; rtt++) {
    const loss = a + b > capacity;
    out.push({ rtt, a, b, loss });
    if (loss) {
      a = Math.max(1, Math.floor(a / 2));
      b = Math.max(1, Math.floor(b / 2));
    } else {
      a += 1;
      b += 1;
    }
  }
  return out;
}
