/**
 * Paging with a TLB. One-level page table, fully associative TLB with LRU,
 * page faults served from a free-frame list and then by FIFO replacement.
 * Addresses are small (≤ 20 bits) on purpose, so every bit fits in the inspector.
 */
export interface PagingConfig {
  /** Virtual address width in bits (8..20). */
  vaBits: number;
  /** Page size in bytes, power of two. */
  pageSize: number;
  tlbSize: number;
  frames: number;
  /** Pages already resident at start: vpn -> frame. */
  resident: Record<number, number>;
  tlbPolicy?: "lru" | "fifo";
}

export interface MemOp {
  addr: number;
  write?: boolean;
}

export interface TlbEntry {
  vpn: number;
  frame: number;
  lastUse: number;
  loadedAt: number;
}

export interface Pte {
  present: boolean;
  frame: number;
  accessed: boolean;
  dirty: boolean;
}

export interface Access {
  i: number;
  vaddr: number;
  write: boolean;
  vpn: number;
  offset: number;
  tlbHit: boolean;
  fault: boolean;
  /** Page evicted to make room (FIFO), if any. */
  victim: number | null;
  /** The victim was dirty and had to be written back to disk. */
  victimDirty: boolean;
  /** TLB entry replaced by this access (LRU), if any. */
  tlbEvicted: number | null;
  frame: number;
  paddr: number;
  tlb: TlbEntry[];
  table: Pte[];
}

export interface PagingResult {
  accesses: Access[];
  hits: number;
  misses: number;
  faults: number;
  offsetBits: number;
  vpnBits: number;
  pages: number;
}

export function log2(n: number): number {
  const l = Math.log2(n);
  if (!Number.isInteger(l)) throw new Error(`${n} não é potência de 2`);
  return l;
}

export function runPaging(cfg: PagingConfig, ops: readonly (number | MemOp)[]): PagingResult {
  const addrs = ops.map((o) => (typeof o === "number" ? { addr: o } : o));
  if (cfg.vaBits < 8 || cfg.vaBits > 20) throw new Error("Largura do endereço fora de 8..20 bits");
  const offsetBits = log2(cfg.pageSize);
  if (offsetBits >= cfg.vaBits) throw new Error("Página maior que o espaço de endereços");
  const vpnBits = cfg.vaBits - offsetBits;
  const pages = 2 ** vpnBits;
  if (cfg.frames < 1 || cfg.tlbSize < 1) throw new Error("Quadros e TLB devem ter ao menos 1 entrada");
  const empty = (): Pte => ({ present: false, frame: 0, accessed: false, dirty: false });
  const table: Pte[] = Array.from({ length: pages }, empty);
  const used = new Set<number>();
  const fifo: number[] = [];
  for (const [vs, f] of Object.entries(cfg.resident)) {
    const v = Number(vs);
    if (v < 0 || v >= pages || f < 0 || f >= cfg.frames || used.has(f))
      throw new Error("Mapeamento inicial inválido");
    table[v] = { present: true, frame: f, accessed: false, dirty: false };
    used.add(f);
    fifo.push(v);
  }
  const free = Array.from({ length: cfg.frames }, (_, f) => f).filter((f) => !used.has(f));
  let tlb: TlbEntry[] = [];
  const accesses: Access[] = [];
  let hits = 0;
  let faults = 0;

  addrs.forEach(({ addr: vaddr, write = false }, i) => {
    if (!Number.isInteger(vaddr) || vaddr < 0 || vaddr >= 2 ** cfg.vaBits)
      throw new Error(`Endereço fora do espaço: ${vaddr}`);
    const vpn = vaddr >>> offsetBits;
    const offset = vaddr & (cfg.pageSize - 1);
    let victim: number | null = null;
    let victimDirty = false;
    let tlbEvicted: number | null = null;
    let fault = false;
    const hitEntry = tlb.find((e) => e.vpn === vpn);
    let frame: number;
    if (hitEntry) {
      hits++;
      frame = hitEntry.frame;
      tlb = tlb.map((e) => (e === hitEntry ? { ...e, lastUse: i } : e));
    } else {
      const pte = table[vpn] as Pte;
      if (!pte.present) {
        fault = true;
        faults++;
        let f = free.shift();
        if (f === undefined) {
          victim = fifo.shift() ?? null;
          if (victim === null) throw new Error("Sem quadro para substituir");
          f = (table[victim] as Pte).frame;
          victimDirty = (table[victim] as Pte).dirty;
          table[victim] = empty();
          tlb = tlb.filter((e) => e.vpn !== victim);
        }
        table[vpn] = { present: true, frame: f, accessed: false, dirty: false };
        fifo.push(vpn);
      }
      frame = (table[vpn] as Pte).frame;
      if (tlb.length >= cfg.tlbSize) {
        const fifoMode = cfg.tlbPolicy === "fifo";
        const out = tlb.reduce((a, b) =>
          (fifoMode ? b.loadedAt < a.loadedAt : b.lastUse < a.lastUse) ? b : a,
        );
        tlbEvicted = out.vpn;
        tlb = tlb.filter((e) => e !== out);
      }
      tlb = [...tlb, { vpn, frame, lastUse: i, loadedAt: i }];
    }
    const pte = table[vpn] as Pte;
    table[vpn] = { ...pte, accessed: true, dirty: pte.dirty || write };
    accesses.push({
      i,
      vaddr,
      write,
      vpn,
      offset,
      tlbHit: Boolean(hitEntry),
      fault,
      victim,
      victimDirty,
      tlbEvicted,
      frame,
      paddr: frame * cfg.pageSize + offset,
      tlb: tlb.map((e) => ({ ...e })),
      table: table.map((e) => ({ ...e })),
    });
  });
  return { accesses, hits, misses: addrs.length - hits, faults, offsetBits, vpnBits, pages };
}
