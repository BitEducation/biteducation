/**
 * Multi-level page tables: splitting a virtual address into per-level indices, counting how many
 * tables a sparse address space really needs, and what a TLB miss costs per level.
 */
export interface Layout {
  /** Index width per level, root first. */
  levels: number[];
  offset: number;
  pteBytes: number;
}

export const X86_32: Layout = { levels: [10, 10], offset: 12, pteBytes: 4 };
export const X86_64: Layout = { levels: [9, 9, 9, 9], offset: 12, pteBytes: 8 };

/** Indices per level and the offset. Uses BigInt so 48-bit addresses stay exact. */
export function split(addr: bigint, l: Layout): { indices: number[]; offset: number } {
  const offset = Number(addr & ((1n << BigInt(l.offset)) - 1n));
  let shift = BigInt(l.offset + l.levels.reduce((a, b) => a + b, 0));
  const indices = l.levels.map((w) => {
    shift -= BigInt(w);
    return Number((addr >> shift) & ((1n << BigInt(w)) - 1n));
  });
  return { indices, offset };
}

/** Bytes of a single flat table covering the whole address space. */
export function flatBytes(l: Layout): number {
  const vpnBits = l.levels.reduce((a, b) => a + b, 0);
  return 2 ** vpnBits * l.pteBytes;
}

export interface Region {
  name: string;
  start: number;
  bytes: number;
}

/**
 * Tables needed to map every page of the regions: one root plus one table per distinct index
 * prefix at each inner level. Each table is 2^width entries.
 */
export function tablesFor(regions: readonly Region[], l: Layout): { total: number; perRegion: number[] } {
  const seen = l.levels.slice(1).map(() => new Set<string>());
  const perRegion = regions.map((r) => {
    let fresh = 0;
    const page = 2 ** l.offset;
    for (let a = Math.floor(r.start / page) * page; a < r.start + r.bytes; a += page) {
      const { indices } = split(BigInt(a), l);
      for (let k = 1; k < l.levels.length; k++) {
        const key = indices.slice(0, k).join(".");
        const set = seen[k - 1] as Set<string>;
        if (!set.has(key)) {
          set.add(key);
          fresh++;
        }
      }
    }
    return fresh;
  });
  return { total: 1 + perRegion.reduce((a, b) => a + b, 0), perRegion };
}

/** Memory accesses on a TLB miss: one per level plus the data itself. */
export const walkAccesses = (levels: number) => levels + 1;

/** Effective access time with a TLB (lookup time ignored): hit = 1 access, miss = full walk. */
export function eat(hitRatio: number, memNs: number, levels: number): number {
  return hitRatio * memNs + (1 - hitRatio) * memNs * walkAccesses(levels);
}
