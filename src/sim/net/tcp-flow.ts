/**
 * TCP data transfer with cumulative ACKs, fast retransmit after 3 duplicate ACKs and
 * retransmission timeout (RFC 9293 §3.8, RFC 5681 §3.2). Discrete-event, deterministic:
 * losses come from the `lose` callback (seeded by the caller). Simplifications: the window is
 * fixed (no congestion control), every segment is ACKed at once (no delayed ACK), ACKs are
 * never lost and RTO = 2 × RTT.
 */
export interface FlowCfg {
  segments: number;
  mss: number;
  /** Segments allowed in flight. */
  window: number;
  /** Round-trip time in ms. */
  rtt: number;
  /** First byte's sequence number (ISN + 1). */
  seq0: number;
  /** Decides whether transmission number `attempt` (0 = first) of segment `seg` is lost. */
  lose: (seg: number, attempt: number) => boolean;
  t0?: number;
}

export type FlowEv =
  | { t: number; kind: "send"; seg: number; seq: number; len: number; retx: false | "fast" | "timeout" }
  | { t: number; kind: "lost"; seg: number; seq: number }
  | { t: number; kind: "recv"; seg: number; seq: number; inOrder: boolean; ack: number }
  | { t: number; kind: "ack"; ack: number; dup: number; newlyAcked: number }
  | { t: number; kind: "timeout"; seg: number };

export interface FlowResult {
  events: FlowEv[];
  end: number;
  retransmits: number;
  fast: number;
  timeouts: number;
  lost: number;
}

type QBody = { type: "data"; seg: number } | { type: "ack"; ackSeg: number } | { type: "rto"; gen: number };
type Q = QBody & { t: number; n: number };

export function runFlow(cfg: FlowCfg): FlowResult {
  if (cfg.segments < 1 || cfg.segments > 60) throw new Error("De 1 a 60 segmentos");
  if (cfg.window < 1) throw new Error("Janela de ao menos 1 segmento");
  const half = Math.max(1, Math.round(cfg.rtt / 2));
  const gap = Math.max(1, Math.round(cfg.rtt / 20));
  const rto = 2 * cfg.rtt;
  const seqOf = (seg: number) => (cfg.seq0 + seg * cfg.mss) >>> 0;
  const events: FlowEv[] = [];
  const queue: Q[] = [];
  let n = 0;
  const push = (q: QBody & { t: number }) => queue.push({ ...q, n: n++ });
  const attempts = new Array<number>(cfg.segments).fill(0);
  const got = new Array<boolean>(cfg.segments).fill(false);
  let base = 0;
  let next = 0;
  let dup = 0;
  let gen = 0;
  let clock = cfg.t0 ?? 0;
  let lastSend = clock - gap;
  const res = { retransmits: 0, fast: 0, timeouts: 0, lost: 0 };

  const transmit = (seg: number, t: number, retx: false | "fast" | "timeout") => {
    const at = Math.max(t, lastSend + gap);
    lastSend = at;
    const attempt = attempts[seg] ?? 0;
    attempts[seg] = attempt + 1;
    events.push({ t: at, kind: "send", seg, seq: seqOf(seg), len: cfg.mss, retx });
    if (retx) res.retransmits++;
    if (cfg.lose(seg, attempt)) {
      res.lost++;
      events.push({ t: at + Math.round(half / 2), kind: "lost", seg, seq: seqOf(seg) });
    } else push({ t: at + half, type: "data", seg });
  };
  const armTimer = (t: number) => {
    gen++;
    push({ t: t + rto, type: "rto", gen });
  };

  while (next < Math.min(cfg.window, cfg.segments)) transmit(next++, clock, false);
  armTimer(clock);

  let guard = 0;
  while (base < cfg.segments) {
    if (++guard > 5000) throw new Error("Simulação não convergiu");
    queue.sort((a, b) => a.t - b.t || a.n - b.n);
    const q = queue.shift();
    if (!q) throw new Error("Fila vazia antes do fim");
    clock = q.t;
    if (q.type === "data") {
      const already = got[q.seg];
      got[q.seg] = true;
      let cum = 0;
      while (cum < cfg.segments && got[cum]) cum++;
      events.push({
        t: clock,
        kind: "recv",
        seg: q.seg,
        seq: seqOf(q.seg),
        inOrder: !already && cum > q.seg,
        ack: seqOf(cum),
      });
      push({ t: clock + half, type: "ack", ackSeg: cum });
    } else if (q.type === "ack") {
      if (q.ackSeg > base) {
        const newly = q.ackSeg - base;
        base = q.ackSeg;
        dup = 0;
        events.push({ t: clock, kind: "ack", ack: seqOf(q.ackSeg), dup: 0, newlyAcked: newly });
        while (next < cfg.segments && next < base + cfg.window) transmit(next++, clock, false);
        if (base < cfg.segments) armTimer(clock);
      } else if (base < cfg.segments) {
        dup++;
        events.push({ t: clock, kind: "ack", ack: seqOf(q.ackSeg), dup, newlyAcked: 0 });
        if (dup === 3) {
          res.fast++;
          transmit(base, clock, "fast");
          armTimer(clock);
        }
      }
    } else if (q.gen === gen && base < cfg.segments) {
      res.timeouts++;
      events.push({ t: clock, kind: "timeout", seg: base });
      dup = 0;
      transmit(base, clock, "timeout");
      armTimer(clock);
    }
  }
  events.sort((a, b) => a.t - b.t);
  return { events, end: clock, ...res };
}
