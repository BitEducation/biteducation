/**
 * Binary buddy allocator: sizes are powers of two, a larger free block is split in halves until it
 * fits, and a freed block merges with its buddy (address XOR size) whenever the buddy is free too.
 */
export interface Block {
  addr: number;
  size: number;
}

export interface AllocResult {
  ok: boolean;
  name: string;
  request: number;
  block?: Block;
  splits: Block[];
}

export interface FreeResult {
  name: string;
  block: Block;
  merges: Block[];
  final: Block;
}

export const roundUp = (n: number, min: number) => {
  let s = min;
  while (s < n) s *= 2;
  return s;
};

export class Buddy {
  /** Free blocks of each size, kept sorted by address. */
  readonly free = new Map<number, number[]>();
  readonly used = new Map<string, Block & { request: number }>();
  splits = 0;
  merges = 0;

  constructor(
    readonly total: number,
    readonly min: number,
  ) {
    for (let s = min; s <= total; s *= 2) this.free.set(s, []);
    this.free.get(total)?.push(0);
  }

  private take(size: number, addr: number) {
    const l = this.free.get(size) ?? [];
    l.splice(l.indexOf(addr), 1);
  }
  private put(size: number, addr: number) {
    const l = this.free.get(size) ?? [];
    l.push(addr);
    l.sort((a, b) => a - b);
  }

  alloc(name: string, request: number): AllocResult {
    const size = roundUp(request, this.min);
    const splits: Block[] = [];
    let s = size;
    while (s <= this.total && !(this.free.get(s) ?? []).length) s *= 2;
    if (s > this.total || size > this.total) return { ok: false, name, request, splits };
    const addr = (this.free.get(s) ?? [])[0] ?? 0;
    this.take(s, addr);
    while (s > size) {
      s /= 2;
      this.put(s, addr + s);
      splits.push({ addr: addr + s, size: s });
      this.splits++;
    }
    const block = { addr, size };
    this.used.set(name, { ...block, request });
    return { ok: true, name, request, block, splits };
  }

  release(name: string): FreeResult | undefined {
    const b = this.used.get(name);
    if (!b) return undefined;
    this.used.delete(name);
    let { addr, size } = b;
    const merges: Block[] = [];
    while (size < this.total) {
      const buddy = addr ^ size;
      if (!(this.free.get(size) ?? []).includes(buddy)) break;
      this.take(size, buddy);
      merges.push({ addr: buddy, size });
      this.merges++;
      addr = Math.min(addr, buddy);
      size *= 2;
    }
    this.put(size, addr);
    return { name, block: { addr: b.addr, size: b.size }, merges, final: { addr, size } };
  }

  freeTotal(): number {
    let t = 0;
    for (const [s, l] of this.free) t += s * l.length;
    return t;
  }
  largestFree(): number {
    let m = 0;
    for (const [s, l] of this.free) if (l.length && s > m) m = s;
    return m;
  }
  internal(): number {
    let w = 0;
    for (const b of this.used.values()) w += b.size - b.request;
    return w;
  }
  /** Owner of every min-sized slot ("" when free). */
  slots(): string[] {
    const out: string[] = Array(this.total / this.min).fill("");
    for (const [n, b] of this.used)
      for (let a = b.addr; a < b.addr + b.size; a += this.min) out[a / this.min] = n;
    return out;
  }
}
