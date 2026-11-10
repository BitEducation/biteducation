/**
 * Set-associative cache (direct-mapped when ways = 1), read-only accesses.
 * Misses are classified with the 3 C's: compulsory (first touch of the block), capacity
 * (also misses in a fully associative LRU cache of the same size) and conflict (the rest).
 */
export interface CacheConfig {
  addrBits: number;
  /** Total lines (blocks) in the cache. */
  lines: number;
  blockSize: number;
  ways: number;
  policy: "lru" | "fifo";
}

export interface Line {
  valid: boolean;
  tag: number;
  lastUse: number;
  loadedAt: number;
}

export type MissKind = "compulsório" | "capacidade" | "conflito";

export interface CacheAccess {
  i: number;
  addr: number;
  tag: number;
  index: number;
  offset: number;
  hit: boolean;
  miss: MissKind | null;
  /** Way used inside the set. */
  way: number;
  /** Line number in a flat view (index * ways + way). */
  line: number;
  evictedTag: number | null;
  sets: Line[][];
}

export interface CacheResult {
  accesses: CacheAccess[];
  hits: number;
  misses: number;
  byKind: Record<MissKind, number>;
  offsetBits: number;
  indexBits: number;
  tagBits: number;
}

const log2i = (n: number) => {
  const l = Math.log2(n);
  if (!Number.isInteger(l)) throw new Error(`${n} não é potência de 2`);
  return l;
};

export function splitAddress(cfg: CacheConfig, addr: number) {
  const offsetBits = log2i(cfg.blockSize);
  const sets = cfg.lines / cfg.ways;
  const indexBits = log2i(sets);
  return {
    offset: addr & (cfg.blockSize - 1),
    index: (addr >>> offsetBits) & (sets - 1),
    tag: addr >>> (offsetBits + indexBits),
    offsetBits,
    indexBits,
    tagBits: cfg.addrBits - offsetBits - indexBits,
  };
}

export function runCache(cfg: CacheConfig, addrs: readonly number[]): CacheResult {
  if (cfg.lines % cfg.ways !== 0) throw new Error("Linhas devem ser múltiplo das vias");
  const nSets = cfg.lines / cfg.ways;
  const { offsetBits, indexBits, tagBits } = splitAddress(cfg, 0);
  if (tagBits < 1) throw new Error("A cache é grande demais para endereços desta largura");
  let sets: Line[][] = Array.from({ length: nSets }, () =>
    Array.from({ length: cfg.ways }, () => ({ valid: false, tag: 0, lastUse: -1, loadedAt: -1 })),
  );
  const seen = new Set<number>();
  // fully associative LRU shadow cache with the same number of lines (for the 3 C's)
  let shadow: number[] = [];
  const accesses: CacheAccess[] = [];
  const byKind: Record<MissKind, number> = { compulsório: 0, capacidade: 0, conflito: 0 };
  let hits = 0;
  addrs.forEach((addr, i) => {
    if (!Number.isInteger(addr) || addr < 0 || addr >= 2 ** cfg.addrBits)
      throw new Error(`Endereço fora do espaço: ${addr}`);
    const { tag, index, offset } = splitAddress(cfg, addr);
    const block = addr >>> offsetBits;
    const shadowHit = shadow.includes(block);
    shadow = [block, ...shadow.filter((b) => b !== block)].slice(0, cfg.lines);
    const set = (sets[index] as Line[]).map((l) => ({ ...l }));
    let way = set.findIndex((l) => l.valid && l.tag === tag);
    let miss: MissKind | null = null;
    let evictedTag: number | null = null;
    if (way >= 0) {
      hits++;
      (set[way] as Line).lastUse = i;
    } else {
      miss = !seen.has(block) ? "compulsório" : shadowHit ? "conflito" : "capacidade";
      byKind[miss]++;
      way = set.findIndex((l) => !l.valid);
      if (way < 0) {
        way = 0;
        for (let w = 1; w < set.length; w++) {
          const a = set[w] as Line;
          const b = set[way] as Line;
          if (cfg.policy === "fifo" ? a.loadedAt < b.loadedAt : a.lastUse < b.lastUse) way = w;
        }
        evictedTag = (set[way] as Line).tag;
      }
      set[way] = { valid: true, tag, lastUse: i, loadedAt: i };
    }
    seen.add(block);
    sets = sets.map((s, k) => (k === index ? set : s));
    accesses.push({
      i,
      addr,
      tag,
      index,
      offset,
      hit: miss === null,
      miss,
      way,
      line: index * cfg.ways + way,
      evictedTag,
      sets,
    });
  });
  return { accesses, hits, misses: addrs.length - hits, byKind, offsetBits, indexBits, tagBits };
}

export function amat(hitTime: number, missRate: number, penalty: number): number {
  return hitTime + missRate * penalty;
}
