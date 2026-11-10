/**
 * Two NUMA nodes with two cores and one memory each. An 8-page array is split among 4 threads,
 * 2 pages each. The page placement policy decides which node holds each page; a thread pays the
 * local latency for pages on its node and the remote latency for the others.
 */

export const PAGES = 8;
export const THREADS = 4;
export const LOCAL_NS = 80;
export type Placement = "principal" | "paralela" | "intercalada";

export const threadNode = (t: number) => (t < THREADS / 2 ? 0 : 1);
export const pageOwner = (p: number) => Math.floor(p / (PAGES / THREADS));

export function place(policy: Placement): number[] {
  return Array.from({ length: PAGES }, (_, p) =>
    policy === "principal" ? 0 : policy === "paralela" ? threadNode(pageOwner(p)) : p % 2,
  );
}

export function numaRun(policy: Placement, remoteNs: number) {
  const nodes = place(policy);
  const threads = Array.from({ length: THREADS }, (_, t) => {
    const mine = Array.from({ length: PAGES }, (_, p) => p).filter((p) => pageOwner(p) === t);
    const local = mine.filter((p) => nodes[p] === threadNode(t)).length;
    const ns = (local * LOCAL_NS + (mine.length - local) * remoteNs) / mine.length;
    return { t, node: threadNode(t), local, total: mine.length, ns };
  });
  const avg = threads.reduce((a, x) => a + x.ns, 0) / THREADS;
  const remote = threads.reduce((a, x) => a + (x.total - x.local), 0);
  // The slowest thread decides when the parallel loop ends.
  const worst = Math.max(...threads.map((x) => x.ns));
  return { nodes, threads, avg, remote, worst };
}
