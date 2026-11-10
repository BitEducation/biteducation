/**
 * RED (Floyd & Jacobson; CN 5.3) with ECN (RFC 3168). At each arrival the router updates the
 * average queue avg = (1 - w) avg + w q; below minTh nothing happens, above maxTh every packet
 * is marked, in between the probability grows linearly up to maxP. To stay deterministic the
 * probability is accumulated and a packet is marked each time the sum crosses 1.
 */

export interface RedOpts {
  w: number;
  minTh: number;
  maxTh: number;
  maxP: number;
}

export interface RedStep {
  q: number;
  avg: number;
  p: number;
  marked: boolean;
}

export function prob(avg: number, o: RedOpts): number {
  if (avg < o.minTh) return 0;
  if (avg >= o.maxTh) return 1;
  return (o.maxP * (avg - o.minTh)) / (o.maxTh - o.minTh);
}

export function red(queue: number[], o: RedOpts): RedStep[] {
  let avg = 0;
  let acc = 0;
  return queue.map((q) => {
    avg = (1 - o.w) * avg + o.w * q;
    const p = prob(avg, o);
    acc += p;
    const marked = acc >= 1;
    if (marked) acc -= 1;
    return { q, avg, p, marked };
  });
}
