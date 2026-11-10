/**
 * Peer-to-peer (CN 7.5): distribution time client-server vs P2P, BitTorrent's rarest-first piece
 * choice, and a Kademlia-style lookup with XOR distance over 4-bit ids.
 */

export interface Swarm {
  /** File size in Mbit, server upload, peer upload and peer download in Mbit/s. */
  file: number;
  server: number;
  up: number;
  down: number;
}

export const clientServer = (s: Swarm, n: number) => Math.max((n * s.file) / s.server, s.file / s.down);
export const peerToPeer = (s: Swarm, n: number) =>
  Math.max(s.file / s.server, s.file / s.down, (n * s.file) / (s.server + n * s.up));

/** Count, for each piece I lack, how many neighbours have it; pick the rarest (lowest index on ties). */
export function rarest(mine: boolean[], peers: boolean[][]): { counts: (number | null)[]; pick: number } {
  const counts = mine.map((have, i) => (have ? null : peers.filter((p) => p[i]).length));
  let pick = -1;
  counts.forEach((n, i) => {
    if (n === null || n === 0) return;
    if (pick < 0 || n < (counts[pick] as number)) pick = i;
  });
  return { counts, pick };
}

export const xor = (a: number, b: number) => a ^ b;
export const bits = (x: number) => x.toString(2).padStart(4, "0");

/** Iterative lookup: ask the closest known node for its contacts until no one closer appears. */
export function lookup(
  start: number,
  key: number,
  contacts: Record<number, number[]>,
): { asked: number; best: number; heard: number[] }[] {
  const out: { asked: number; best: number; heard: number[] }[] = [];
  const known = new Set<number>(contacts[start] ?? []);
  const asked = new Set<number>();
  let best = start;
  for (;;) {
    const next = [...known].filter((n) => !asked.has(n)).sort((a, b) => xor(a, key) - xor(b, key))[0];
    if (next === undefined || xor(next, key) >= xor(best, key)) break;
    asked.add(next);
    best = next;
    const heard = contacts[next] ?? [];
    for (const h of heard) known.add(h);
    out.push({ asked: next, best, heard });
  }
  return out;
}
