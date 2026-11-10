/**
 * Packet scheduling on one output link (CN 5.4): FIFO, fair queueing and strict priority.
 * Fair queueing is the self-clocked variant (SCFQ): each packet gets a finish tag
 * max(previous tag of its flow, tag in service) + size / weight, and the smallest tag goes next.
 * The link sends 1 byte per microsecond; nothing is preempted.
 */

export interface Packet {
  id: string;
  flow: string;
  size: number;
  arrival: number;
}

export type Policy =
  | { kind: "fifo" }
  | { kind: "fq"; weight: Record<string, number> }
  | { kind: "prio"; rank: Record<string, number> };

export interface Sent {
  id: string;
  flow: string;
  start: number;
  end: number;
  delay: number;
  tag?: number;
}

export function schedule(pkts: Packet[], pol: Policy): Sent[] {
  const pending = [...pkts].sort((a, b) => a.arrival - b.arrival);
  const queue: (Packet & { tag: number })[] = [];
  const lastTag: Record<string, number> = {};
  let vt = 0;
  let t = 0;
  const out: Sent[] = [];
  const admit = (now: number) => {
    while (pending.length && (pending[0] as Packet).arrival <= now) {
      const p = pending.shift() as Packet;
      const w = pol.kind === "fq" ? (pol.weight[p.flow] ?? 1) : 1;
      const tag = Math.max(lastTag[p.flow] ?? 0, vt) + p.size / w;
      lastTag[p.flow] = tag;
      queue.push({ ...p, tag });
    }
  };
  while (pending.length || queue.length) {
    admit(t);
    if (!queue.length) {
      t = (pending[0] as Packet).arrival;
      continue;
    }
    const key = (p: Packet & { tag: number }) =>
      pol.kind === "fifo" ? p.arrival : pol.kind === "fq" ? p.tag : (pol.rank[p.flow] ?? 9) * 1e9 + p.arrival;
    queue.sort((a, b) => key(a) - key(b) || a.arrival - b.arrival);
    const p = queue.shift() as Packet & { tag: number };
    vt = p.tag;
    const end = t + p.size;
    out.push({
      id: p.id,
      flow: p.flow,
      start: t,
      end,
      delay: end - p.arrival,
      ...(pol.kind === "fq" ? { tag: p.tag } : {}),
    });
    t = end;
  }
  return out;
}
