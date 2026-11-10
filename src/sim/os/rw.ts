/**
 * Readers-writers over discrete ticks. Readers may share the resource; a writer needs it alone.
 * Each tick: finished requests leave first, then waiting requests are admitted by the policy,
 * always scanning in arrival order.
 */
export type RwPolicy = "mutex" | "leitores" | "escritores" | "justo";

export interface RwReq {
  id: string;
  kind: "R" | "W";
  arrive: number;
  dur: number;
}

export interface RwDone extends RwReq {
  start: number;
  end: number;
  wait: number;
}

export interface RwResult {
  done: RwDone[];
  /** Per tick [t, t+1): active readers, active writer id (or null) and waiting count. */
  ticks: { t: number; readers: number; writer: string | null; waiting: number }[];
  total: number;
  maxReaders: number;
}

export function runRw(reqs: readonly RwReq[], policy: RwPolicy, maxTicks = 500): RwResult {
  const order = [...reqs].sort((a, b) => a.arrive - b.arrive || a.id.localeCompare(b.id));
  const active: RwDone[] = [];
  const done: RwDone[] = [];
  const waiting: RwReq[] = [];
  const ticks: RwResult["ticks"] = [];
  let next = 0;
  let maxReaders = 0;
  for (let t = 0; t < maxTicks && done.length < order.length; t++) {
    for (let i = active.length - 1; i >= 0; i--)
      if ((active[i] as RwDone).end <= t) done.push(...active.splice(i, 1));
    while (next < order.length && (order[next] as RwReq).arrive <= t) waiting.push(order[next++] as RwReq);

    const admit = (r: RwReq) => {
      waiting.splice(waiting.indexOf(r), 1);
      active.push({ ...r, start: t, end: t + r.dur, wait: t - r.arrive });
    };
    const writerActive = () => active.some((a) => a.kind === "W");
    if (policy === "mutex" || policy === "justo") {
      // FIFO: the head enters when compatible; "justo" lets a run of readers at the head share
      for (;;) {
        const h = waiting[0];
        if (!h) break;
        const ok =
          h.kind === "W" ? active.length === 0 : policy === "justo" ? !writerActive() : active.length === 0;
        if (!ok) break;
        admit(h);
      }
    } else {
      for (const r of [...waiting]) {
        if (r.kind === "R") {
          const blocked = writerActive() || (policy === "escritores" && waiting.some((w) => w.kind === "W"));
          if (!blocked) admit(r);
        } else if (active.length === 0) admit(r);
      }
    }
    const readers = active.filter((a) => a.kind === "R").length;
    maxReaders = Math.max(maxReaders, readers);
    const w = active.find((a) => a.kind === "W");
    if (active.length > 0 || waiting.length > 0 || next < order.length)
      ticks.push({ t, readers, writer: w ? w.id : null, waiting: waiting.length });
  }
  const total = Math.max(0, ...done.map((d) => d.end), ...active.map((a) => a.end));
  done.push(...active);
  done.sort((a, b) => a.arrive - b.arrive || a.id.localeCompare(b.id));
  return { done, ticks: ticks.filter((k) => k.t < total), total, maxReaders };
}

/** The lesson's scenario: readers every 2 ticks from 0, writers at 1 and 7, 2 ticks each. */
export function scenario(readers: number, readDur: number): RwReq[] {
  const out: RwReq[] = [];
  for (let i = 0; i < readers; i++) out.push({ id: `L${i + 1}`, kind: "R", arrive: 2 * i, dur: readDur });
  out.push({ id: "E1", kind: "W", arrive: 1, dur: 2 }, { id: "E2", kind: "W", arrive: 7, dur: 2 });
  return out;
}
