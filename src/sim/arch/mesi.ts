/**
 * MESI snooping coherence for one cache line shared by a few CPUs, invalidation based: a write in
 * S broadcasts an upgrade, a miss for writing reads with intent to modify, and a cache holding the
 * line in M supplies it and writes it back when someone else asks.
 */
export type State = "M" | "E" | "S" | "I";
export type Bus = "" | "BusRd" | "BusRdX" | "BusUpgr";

export interface Op {
  cpu: number;
  kind: "R" | "W";
  value?: number;
}

export interface Step {
  op: Op;
  bus: Bus;
  /** CPU that answered from its own cache (it held the line in M). */
  flushedBy: number | null;
  invalidated: number[];
  states: State[];
  values: (number | null)[];
  memory: number;
  read: number | null;
  memWrite: boolean;
}

export class Mesi {
  states: State[];
  values: (number | null)[];
  memory: number;
  transactions = 0;
  memWrites = 0;

  constructor(cpus: number, memory = 0) {
    this.states = Array(cpus).fill("I");
    this.values = Array(cpus).fill(null);
    this.memory = memory;
  }

  private others(cpu: number) {
    return this.states.map((_, i) => i).filter((i) => i !== cpu);
  }

  /** Any cache in M writes back and returns its CPU number. */
  private flush(cpu: number): number | null {
    const owner = this.others(cpu).find((j) => this.states[j] === "M");
    if (owner === undefined) return null;
    this.memory = this.values[owner] ?? this.memory;
    this.memWrites++;
    return owner;
  }

  run(op: Op): Step {
    const i = op.cpu;
    let bus: Bus = "";
    let flushedBy: number | null = null;
    let memWrite = false;
    const invalidated: number[] = [];
    let read: number | null = null;
    const st = this.states[i] ?? "I";
    if (op.kind === "R") {
      if (st === "I") {
        bus = "BusRd";
        flushedBy = this.flush(i);
        memWrite = flushedBy !== null;
        const sharers = this.others(i).filter((j) => this.states[j] !== "I");
        for (const j of sharers) this.states[j] = "S";
        this.states[i] = sharers.length ? "S" : "E";
        this.values[i] = this.memory;
      }
      read = this.values[i] ?? null;
    } else {
      if (st === "S") {
        bus = "BusUpgr";
      } else if (st === "I") {
        bus = "BusRdX";
        flushedBy = this.flush(i);
        memWrite = flushedBy !== null;
      }
      if (bus)
        for (const j of this.others(i))
          if (this.states[j] !== "I") {
            this.states[j] = "I";
            this.values[j] = null;
            invalidated.push(j);
          }
      this.states[i] = "M";
      this.values[i] = op.value ?? 0;
    }
    if (bus) this.transactions++;
    return {
      op,
      bus,
      flushedBy,
      invalidated,
      states: [...this.states],
      values: [...this.values],
      memory: this.memory,
      read,
      memWrite,
    };
  }
}

/** Private write-back caches with no coherence at all: each keeps whatever it loaded. */
export function incoherent(ops: Op[], cpus: number, memory = 0) {
  const vals: (number | null)[] = Array(cpus).fill(null);
  return ops.map((op) => {
    if (op.kind === "R") {
      if (vals[op.cpu] === null) vals[op.cpu] = memory;
    } else vals[op.cpu] = op.value ?? 0;
    return { op, values: [...vals], memory, read: op.kind === "R" ? (vals[op.cpu] ?? null) : null };
  });
}

/**
 * Two CPUs alternately writing different variables. In the same line every write steals the line
 * from the other cache; in separate lines each CPU misses once and then hits.
 */
export function pingPong(writes: number): { shared: number; separate: number } {
  const same = new Mesi(2);
  for (let k = 0; k < writes; k++) same.run({ cpu: k % 2, kind: "W", value: k });
  const a = new Mesi(2);
  const b = new Mesi(2);
  for (let k = 0; k < writes; k++) (k % 2 ? b : a).run({ cpu: k % 2, kind: "W", value: k });
  return { shared: same.transactions, separate: a.transactions + b.transactions };
}
