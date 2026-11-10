/**
 * A small direct-mapped cache (4 lines of 4 words) under the two classic write policies: write
 * through without write allocate, and write back with write allocate. Traffic is counted in words.
 */
export const LINES = 4;
export const WORDS = 4;

export interface Policy {
  through: boolean;
  allocate: boolean;
}
export const WT: Policy = { through: true, allocate: false };
export const WB: Policy = { through: false, allocate: true };

export interface Access {
  kind: "R" | "W";
  addr: number;
  label: string;
}

export interface Event {
  access: Access;
  line: number;
  hit: boolean;
  /** Block written back because it was dirty and got evicted. */
  writeback: number | null;
  /** Block fetched from memory. */
  fetched: number | null;
  /** Words written straight to memory by this access. */
  direct: number;
  dirty: boolean;
}

export class WriteCache {
  readonly tags: (number | null)[] = Array(LINES).fill(null);
  readonly dirty: boolean[] = Array(LINES).fill(false);
  hits = 0;
  misses = 0;
  readWords = 0;
  writeWords = 0;
  writebacks = 0;

  constructor(readonly policy: Policy) {}

  access(a: Access): Event {
    const block = Math.floor(a.addr / WORDS);
    const line = block % LINES;
    const hit = this.tags[line] === block;
    let writeback: number | null = null;
    let fetched: number | null = null;
    let direct = 0;
    const load = () => {
      const old = this.tags[line];
      if (old !== null && old !== undefined && this.dirty[line]) {
        writeback = old;
        this.writeWords += WORDS;
        this.writebacks++;
      }
      this.tags[line] = block;
      this.dirty[line] = false;
      fetched = block;
      this.readWords += WORDS;
    };
    if (hit) this.hits++;
    else this.misses++;
    if (a.kind === "R") {
      if (!hit) load();
    } else {
      if (!hit && this.policy.allocate) load();
      const cached = this.tags[line] === block;
      if (this.policy.through || !cached) {
        direct = 1;
        this.writeWords += 1;
      } else this.dirty[line] = true;
    }
    return { access: a, line, hit, writeback, fetched, direct, dirty: this.dirty[line] ?? false };
  }

  /** Writes every dirty line back, as when the data must reach memory (another core, a device). */
  flush(): number[] {
    const out: number[] = [];
    this.tags.forEach((t, i) => {
      if (t !== null && this.dirty[i]) {
        out.push(t);
        this.writeWords += WORDS;
        this.writebacks++;
        this.dirty[i] = false;
      }
    });
    return out;
  }
}

/** x is word 12 (line 3); a[i] starts at word 64, so a[12..15] also lands on line 3. */
export const X = 12;
export const A = 64;
export const B = 128;

export function sumLoop(n: number): Access[] {
  const out: Access[] = [];
  for (let i = 0; i < n; i++)
    out.push(
      { kind: "R", addr: A + i, label: `lê a[${i}]` },
      { kind: "R", addr: X, label: "lê x" },
      { kind: "W", addr: X, label: "escreve x" },
    );
  return out;
}

export function zeroLoop(n: number): Access[] {
  return Array.from({ length: n }, (_, i) => ({ kind: "W" as const, addr: B + i, label: `zera b[${i}]` }));
}

export function simulate(policy: Policy, accesses: Access[], flush = true) {
  const c = new WriteCache(policy);
  const events = accesses.map((a) => c.access(a));
  const flushed = flush ? c.flush() : [];
  return { cache: c, events, flushed };
}

/**
 * A burst of `writes` stores, one per cycle, into a write buffer of `depth` entries that memory
 * drains one entry every `drain` cycles. Returns the cycles the processor stalls.
 */
export function bufferStalls(writes: number, depth: number, drain: number): number {
  let stalls = 0;
  let queue = 0;
  let nextDrain = drain;
  let t = 0;
  let issued = 0;
  while (issued < writes) {
    if (t === nextDrain) {
      if (queue > 0) queue--;
      nextDrain += drain;
    }
    if (depth === 0) {
      // Without a buffer every store waits for the memory write to finish.
      stalls += drain - 1;
      t += drain;
      nextDrain = t + drain;
      issued++;
      continue;
    }
    if (queue < depth) {
      queue++;
      issued++;
      if (queue === 1 && nextDrain <= t) nextDrain = t + drain;
    } else stalls++;
    t++;
  }
  return stalls;
}
