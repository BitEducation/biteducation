/**
 * File allocation on a 24-block disk that already holds files A, B and C. A new file F of n
 * blocks is placed contiguously (first hole that fits), as a linked list (first free blocks,
 * pointer in each block or in a FAT) or indexed (one index block plus data blocks). Costs are
 * counted to read F's block k.
 */

export const DISK = 24;
/** Owner of each block before F arrives; null = free. Holes of 2, 3, 4, 1 and 2 blocks. */
export const LAYOUT: (string | null)[] = [
  "A",
  "A",
  null,
  null,
  "B",
  "B",
  "B",
  null,
  null,
  null,
  "A",
  "C",
  "C",
  "C",
  null,
  null,
  null,
  null,
  "B",
  "B",
  null,
  "C",
  null,
  null,
];

export function holes(layout = LAYOUT): { start: number; len: number }[] {
  const out: { start: number; len: number }[] = [];
  for (let i = 0; i < layout.length; i++) {
    if (layout[i] !== null) continue;
    const start = i;
    while (i < layout.length && layout[i] === null) i++;
    out.push({ start, len: i - start });
  }
  return out;
}

/** Groups consecutive block numbers into (start, length) extents. */
export function extents(blocks: number[]): { start: number; len: number }[] {
  const out: { start: number; len: number }[] = [];
  for (const b of blocks) {
    const last = out.at(-1);
    if (last && last.start + last.len === b) last.len++;
    else out.push({ start: b, len: 1 });
  }
  return out;
}

export function allocRun(n: number, k: number) {
  const free = LAYOUT.flatMap((o, i) => (o === null ? [i] : []));
  const hs = holes();
  const fit = hs.find((h) => h.len >= n) ?? null;
  const largest = Math.max(...hs.map((h) => h.len));
  const chain = free.slice(0, n);
  const index = free[0] as number;
  const data = free.slice(1, n + 1);
  const kk = Math.min(n - 1, Math.max(0, k));
  return {
    free: free.length,
    largest,
    contiguous: fit ? Array.from({ length: n }, (_, i) => fit.start + i) : null,
    chain,
    index,
    data,
    k: kk,
    /** Disk reads to reach block k of F. */
    reads: { contiguous: fit ? 1 : null, linked: kk + 1, fat: 1, indexed: 2 },
    /** FAT entries followed in memory before the one disk read. */
    fatHops: kk,
    extents: extents(chain),
  };
}
