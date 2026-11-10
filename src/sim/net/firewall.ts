/**
 * A packet filter in front of one server, and what a port probe learns through it. Rules are
 * checked in order (first match wins) with a default policy; a stateful filter also keeps a
 * connection table. Probe outcomes are modelled, not sent.
 */
export type Action = "aceita" | "descarta" | "rejeita";
export type Verdict = "aberta" | "fechada" | "filtrada";

export interface FwRule {
  action: Action;
  port?: number;
  /** Source network prefix as a string match, e.g. "192.0.2.". */
  from?: string;
  /** Matches TCP segments that carry the ACK flag (the classic stateless "replies" rule). */
  ack?: boolean;
  note: string;
}

export interface Policy {
  name: string;
  rules: FwRule[];
  fallback: Action;
  stateful: boolean;
}

export interface Probe {
  port: number;
  from: string;
  ack?: boolean;
}

export function decide(
  p: Policy,
  pkt: Probe,
  table: ReadonlySet<string> = new Set(),
): { action: Action; why: string } {
  if (p.stateful && pkt.ack) {
    // a segment with ACK must belong to a known connection
    const key = `${pkt.from}:${pkt.port}`;
    return table.has(key)
      ? { action: "aceita", why: "pertence a uma conexão conhecida" }
      : { action: "descarta", why: "ACK sem conexão na tabela" };
  }
  for (const r of p.rules) {
    if (r.port !== undefined && r.port !== pkt.port) continue;
    if (r.from !== undefined && !pkt.from.startsWith(r.from)) continue;
    if (r.ack !== undefined && r.ack !== Boolean(pkt.ack)) continue;
    return { action: r.action, why: r.note };
  }
  return { action: p.fallback, why: "política padrão" };
}

/** A SYN probe: open answers SYN-ACK, closed answers RST, filtered stays silent. */
export function probe(p: Policy, services: ReadonlySet<number>, pkt: Probe): Verdict {
  const { action } = decide(p, pkt);
  if (action === "descarta") return "filtrada";
  if (action === "rejeita") return "fechada";
  return services.has(pkt.port) ? "aberta" : "fechada";
}

export function scan(p: Policy, services: ReadonlySet<number>, ports: readonly number[], from: string) {
  return ports.map((port) => ({ port, verdict: probe(p, services, { port, from }) }));
}

/**
 * Index of the probe that raises an alert: the first time `threshold` distinct ports from one source
 * fall inside a sliding window of `windowMs`. Probes are `intervalMs` apart.
 */
export function scanAlert(
  count: number,
  intervalMs: number,
  threshold: number,
  windowMs = 5000,
): number | null {
  for (let i = 0; i < count; i++) {
    const t = i * intervalMs;
    let inWindow = 0;
    for (let j = 0; j <= i; j++) if (j * intervalMs > t - windowMs) inWindow++;
    if (inWindow >= threshold) return i;
  }
  return null;
}
