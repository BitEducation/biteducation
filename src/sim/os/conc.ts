import { prng, randInt } from "../shared/prng.ts";

/**
 * Interleaved execution of threads over counting semaphores and a bounded buffer
 *. Each op is atomic; the scheduler picks the next runnable thread.
 * V wakes the first waiter (FIFO), which then completes its P without touching the value.
 */
export type Op =
  | { op: "P" | "V"; sem: string }
  | { op: "put"; item: string }
  | { op: "take" }
  | { op: "work"; what: string };

export interface Thread {
  id: string;
  ops: Op[];
  /** Ops per turn in round robin (relative speed). Defaults to the global quantum. */
  weight?: number;
}

export interface ConcOpts {
  sems: Record<string, number>;
  capacity: number;
  /**
   * "rr": round robin, `weight` (or `quantum`) ops per turn; "seeded": random runnable thread per op;
   * "script": one op per entry of `script` (thread ids), skipping blocked threads, then round robin.
   */
  policy: "rr" | "seeded" | "script";
  script?: string[];
  quantum?: number;
  seed?: number;
  maxSteps?: number;
}

export interface ConcStep {
  t: number;
  tid: string;
  op: Op;
  outcome: "ok" | "block" | "wake";
  woke?: string;
  took?: string;
  sems: Record<string, number>;
  waiting: Record<string, string[]>;
  buffer: (string | null)[];
}

export interface ConcResult {
  steps: ConcStep[];
  deadlock: boolean;
  /** Threads still blocked at the end (deadlock), with the semaphore each waits on. */
  blocked: { tid: string; sem: string }[];
  consumed: string[];
  maxFill: number;
}

export function producerConsumer(items: number, opts: { invertProducer?: boolean } = {}): Thread[] {
  const prod: Op[] = [];
  const cons: Op[] = [];
  for (let i = 1; i <= items; i++) {
    const it = `i${i}`;
    prod.push({ op: "work", what: `produz ${it}` });
    if (opts.invertProducer) prod.push({ op: "P", sem: "mutex" }, { op: "P", sem: "vazias" });
    else prod.push({ op: "P", sem: "vazias" }, { op: "P", sem: "mutex" });
    prod.push({ op: "put", item: it }, { op: "V", sem: "mutex" }, { op: "V", sem: "cheias" });
    cons.push(
      { op: "P", sem: "cheias" },
      { op: "P", sem: "mutex" },
      { op: "take" },
      { op: "V", sem: "mutex" },
      { op: "V", sem: "vazias" },
      { op: "work", what: "consome" },
    );
  }
  return [
    { id: "Produtor", ops: prod },
    { id: "Consumidor", ops: cons },
  ];
}

export function runConc(threads: readonly Thread[], o: ConcOpts): ConcResult {
  if (o.capacity < 1 || o.capacity > 16) throw new Error("Capacidade fora de 1..16");
  const sems = { ...o.sems };
  const waiting: Record<string, string[]> = Object.fromEntries(Object.keys(sems).map((k) => [k, []]));
  const pc = new Map(threads.map((t) => [t.id, 0]));
  const blockedOn = new Map<string, string>();
  const buffer: (string | null)[] = Array.from({ length: o.capacity }, () => null);
  let head = 0;
  let tail = 0;
  let count = 0;
  let maxFill = 0;
  const consumed: string[] = [];
  const steps: ConcStep[] = [];
  const rand = prng(o.seed ?? 1);
  const quantum = o.quantum ?? 1;
  const maxSteps = o.maxSteps ?? 2000;
  let cur = 0;
  let usedQ = 0;

  const done = (t: Thread) => (pc.get(t.id) ?? 0) >= t.ops.length;
  const runnable = () => threads.filter((t) => !done(t) && !blockedOn.has(t.id));
  const snap = (
    t: number,
    tid: string,
    op: Op,
    outcome: ConcStep["outcome"],
    extra: Partial<ConcStep> = {},
  ) =>
    steps.push({
      t,
      tid,
      op,
      outcome,
      ...extra,
      sems: { ...sems },
      waiting: Object.fromEntries(Object.entries(waiting).map(([k, v]) => [k, [...v]])),
      buffer: [...buffer],
    });

  for (let t = 0; t < maxSteps; t++) {
    const ready = runnable();
    if (ready.length === 0) break;
    let th: Thread;
    const scripted = o.policy === "script" ? ready.find((x) => x.id === o.script?.[t]) : undefined;
    if (scripted) th = scripted;
    else if (o.policy === "seeded") th = ready[randInt(rand, 0, ready.length - 1)] as Thread;
    else {
      // round robin over the declared order, skipping blocked or finished threads
      let k = 0;
      while (k < threads.length) {
        const cand = threads[cur % threads.length] as Thread;
        if (!done(cand) && !blockedOn.has(cand.id) && usedQ < (cand.weight ?? quantum)) break;
        cur++;
        usedQ = 0;
        k++;
      }
      th = threads[cur % threads.length] as Thread;
      usedQ++;
    }
    const i = pc.get(th.id) ?? 0;
    const op = th.ops[i] as Op;
    if (op.op === "P") {
      if (!(op.sem in sems)) throw new Error(`Semáforo desconhecido: ${op.sem}`);
      if ((sems[op.sem] ?? 0) > 0) {
        sems[op.sem] = (sems[op.sem] ?? 0) - 1;
        pc.set(th.id, i + 1);
        snap(t, th.id, op, "ok");
      } else {
        blockedOn.set(th.id, op.sem);
        waiting[op.sem]?.push(th.id);
        snap(t, th.id, op, "block");
        usedQ = Number.POSITIVE_INFINITY;
      }
    } else if (op.op === "V") {
      if (!(op.sem in sems)) throw new Error(`Semáforo desconhecido: ${op.sem}`);
      pc.set(th.id, i + 1);
      const w = waiting[op.sem]?.shift();
      if (w) {
        blockedOn.delete(w);
        pc.set(w, (pc.get(w) ?? 0) + 1);
        snap(t, th.id, op, "wake", { woke: w });
      } else {
        sems[op.sem] = (sems[op.sem] ?? 0) + 1;
        snap(t, th.id, op, "ok");
      }
    } else if (op.op === "put") {
      if (count >= o.capacity) throw new Error("Buffer cheio: falta sincronização");
      buffer[tail] = op.item;
      tail = (tail + 1) % o.capacity;
      count++;
      maxFill = Math.max(maxFill, count);
      pc.set(th.id, i + 1);
      snap(t, th.id, op, "ok");
    } else if (op.op === "take") {
      if (count <= 0) throw new Error("Buffer vazio: falta sincronização");
      const item = buffer[head] as string;
      buffer[head] = null;
      head = (head + 1) % o.capacity;
      count--;
      consumed.push(item);
      pc.set(th.id, i + 1);
      snap(t, th.id, op, "ok", { took: item });
    } else {
      pc.set(th.id, i + 1);
      snap(t, th.id, op, "ok");
    }
  }
  const unfinished = threads.filter((t) => !done(t));
  const deadlock = unfinished.length > 0 && runnable().length === 0;
  return {
    steps,
    deadlock,
    blocked: [...blockedOn].map(([tid, sem]) => ({ tid, sem })),
    consumed,
    maxFill,
  };
}
