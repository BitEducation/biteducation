/**
 * A slab cache for one object type: each slab is a page cut into equal objects with a free list.
 * Allocation prefers a partially used slab, then an empty one, and only then asks for a new page;
 * the free list is LIFO, so the slot freed last (still warm in the cache) is reused first.
 */
export const PAGE = 4096;

export const perSlab = (size: number) => Math.floor(PAGE / size);

/** Bytes the buddy allocator would hand out for one object: the next power of two. */
export const buddyBlock = (size: number) => {
  let s = 32;
  while (s < size) s *= 2;
  return s;
};

export interface Slot {
  slab: number;
  slot: number;
  newSlab: boolean;
}

export class SlabCache {
  readonly slabs: (string | null)[][] = [];
  /** Free slots of each slab, used as a stack: the last element is handed out next. */
  private readonly free: number[][] = [];
  readonly k: number;

  constructor(readonly size: number) {
    this.k = perSlab(size);
  }

  used(slab: number) {
    return (this.slabs[slab] ?? []).filter((x) => x !== null).length;
  }

  alloc(name: string): Slot {
    const live = [...this.slabs.keys()].filter((i) => this.slabs[i] !== undefined);
    let s = live.find((i) => this.used(i) > 0 && this.used(i) < this.k);
    s ??= live.find((i) => this.used(i) === 0);
    let newSlab = false;
    if (s === undefined) {
      s = this.slabs.length;
      this.slabs.push(new Array(this.k).fill(null));
      // Reverse order, so the first pop is slot 0.
      this.free.push([...Array(this.k).keys()].reverse());
      newSlab = true;
    }
    const slot = this.free[s]?.pop() ?? 0;
    (this.slabs[s] as (string | null)[])[slot] = name;
    return { slab: s, slot, newSlab };
  }

  release(slab: number, slot: number) {
    (this.slabs[slab] as (string | null)[])[slot] = null;
    this.free[slab]?.push(slot);
    return { empty: this.used(slab) === 0 };
  }

  state(slab: number): "cheio" | "parcial" | "vazio" {
    const u = this.used(slab);
    return u === this.k ? "cheio" : u === 0 ? "vazio" : "parcial";
  }
}
