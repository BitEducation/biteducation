/**
 * Circuit, message and packet switching (CN 2.x) over k store-and-forward links of rate R,
 * propagation ignored. Packet times are the classic pipeline: (n + k - 1) packet times.
 * Sharing: n users each active with probability p on a link that fits `fits` active users.
 */

export interface Path {
  links: number;
  /** Message size in kbit and link rate in kbit/ms (= Mbit/s). */
  message: number;
  rate: number;
  setup: number;
}

export const circuitTime = (p: Path) => p.setup + p.message / p.rate;
export const messageTime = (p: Path) => p.links * (p.message / p.rate);
export const packetTime = (p: Path, n: number) => (n + p.links - 1) * (p.message / n / p.rate);

/** Each packet's [from, to) on each link, for drawing the pipeline. */
export function packetSlots(
  p: Path,
  n: number,
): { link: number; packet: number; from: number; to: number }[] {
  const t = p.message / n / p.rate;
  const out: { link: number; packet: number; from: number; to: number }[] = [];
  for (let l = 0; l < p.links; l++)
    for (let i = 0; i < n; i++) out.push({ link: l, packet: i, from: (l + i) * t, to: (l + i + 1) * t });
  return out;
}

const choose = (n: number, k: number) => {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - i + 1)) / i;
  return r;
};

/** Probability that more than `fits` of n users are active at once. */
export function overload(n: number, p: number, fits: number): number {
  let s = 0;
  for (let k = fits + 1; k <= n; k++) s += choose(n, k) * p ** k * (1 - p) ** (n - k);
  return s;
}

/** Packet switching when every packet carries a header of `header` kbit. */
export const packetTimeWithHeader = (p: Path, n: number, header: number) =>
  (n + p.links - 1) * ((p.message / n + header) / p.rate);

/** The packet count with the shortest time, searched over 1..max. */
export function bestCount(p: Path, header: number, max: number): number {
  let best = 1;
  for (let n = 2; n <= max; n++)
    if (packetTimeWithHeader(p, n, header) < packetTimeWithHeader(p, best, header)) best = n;
  return best;
}
