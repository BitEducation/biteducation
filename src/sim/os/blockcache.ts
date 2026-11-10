/**
 * VFS and the block cache (MOS 4.3.7, 4.4.4; Maziero, sistemas de arquivos): the mount table
 * picks the file system by longest path prefix; reads go through an LRU block cache with
 * sequential read-ahead; writes only dirty the cached block until a sync writes it back.
 */

export const MOUNTS = [
  { at: "/", fs: "ext4", disk: true },
  { at: "/mnt/pen", fs: "vfat", disk: true },
  { at: "/proc", fs: "proc", disk: false },
];

export function mountOf(path: string) {
  return [...MOUNTS]
    .filter((m) => path === m.at || path.startsWith(m.at === "/" ? "/" : `${m.at}/`))
    .sort((a, z) => z.at.length - a.at.length)[0] as (typeof MOUNTS)[number];
}

export type Op = { op: "read" | "write"; file: string; block: number } | { op: "sync" };

export interface Outcome {
  op: Op;
  hit: boolean;
  /** Blocks read from disk by this operation (the miss plus read-ahead). */
  diskReads: number;
  diskWrites: number;
  evicted: string[];
}

export function simulate(ops: Op[], capacity: number, readahead: number): Outcome[] {
  const lru: string[] = [];
  const dirty = new Set<string>();
  const key = (f: string, b: number) => `${f}#${b}`;
  const touch = (k: string, evicted: string[], writes: { n: number }) => {
    const i = lru.indexOf(k);
    if (i >= 0) lru.splice(i, 1);
    lru.push(k);
    while (lru.length > capacity) {
      const out = lru.shift() as string;
      if (dirty.has(out)) {
        dirty.delete(out);
        writes.n++;
      }
      evicted.push(out);
    }
  };
  const out: Outcome[] = [];
  for (const o of ops) {
    const evicted: string[] = [];
    const writes = { n: 0 };
    if (o.op === "sync") {
      writes.n = dirty.size;
      dirty.clear();
      out.push({ op: o, hit: false, diskReads: 0, diskWrites: writes.n, evicted });
      continue;
    }
    const k = key(o.file, o.block);
    const hit = lru.includes(k);
    let reads = 0;
    if (!hit && o.op === "read") {
      // read the block and the next ones not already cached, in one request
      for (let b = o.block; b < o.block + Math.max(1, readahead); b++) {
        const kb = key(o.file, b);
        if (b === o.block || !lru.includes(kb)) {
          reads++;
          touch(kb, evicted, writes);
        }
      }
    }
    touch(k, evicted, writes);
    if (o.op === "write") dirty.add(k);
    out.push({ op: o, hit, diskReads: reads, diskWrites: writes.n, evicted });
  }
  return out;
}
