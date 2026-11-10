/**
 * Mini-IDS: declarative rules over packet summaries plus two stateful detectors
 * (IP→MAC binding changes, in the spirit of arpwatch, and a SYN_RECV threshold).
 */
export interface PacketMeta {
  i: number;
  t: number;
  proto: "arp" | "tcp" | "ip";
  op?: "request" | "reply";
  /** ARP reply that answers no pending request. */
  unsolicited?: boolean;
  senderIp?: string;
  senderMac?: string;
  flags?: string[];
}

export interface Rule {
  id: string;
  match: { proto?: PacketMeta["proto"]; op?: PacketMeta["op"]; unsolicited?: boolean; flag?: string };
  alert: string;
}

export interface Alert {
  i: number;
  t: number;
  rule: string;
  text: string;
}

export const DEFAULT_RULES: Rule[] = [
  {
    id: "arp-unsolicited",
    match: { proto: "arp", op: "reply", unsolicited: true },
    alert: "ARP reply não solicitado",
  },
];

function matches(r: Rule, p: PacketMeta): boolean {
  const m = r.match;
  if (m.proto !== undefined && m.proto !== p.proto) return false;
  if (m.op !== undefined && m.op !== p.op) return false;
  if (m.unsolicited !== undefined && Boolean(p.unsolicited) !== m.unsolicited) return false;
  if (m.flag !== undefined && !(p.flags ?? []).includes(m.flag)) return false;
  return true;
}

export function runIds(packets: readonly PacketMeta[], rules: readonly Rule[] = DEFAULT_RULES): Alert[] {
  const alerts: Alert[] = [];
  const binding = new Map<string, string>();
  for (const p of packets) {
    for (const r of rules) if (matches(r, p)) alerts.push({ i: p.i, t: p.t, rule: r.id, text: r.alert });
    if (p.proto === "arp" && p.senderIp && p.senderMac) {
      const prev = binding.get(p.senderIp);
      if (prev && prev !== p.senderMac)
        alerts.push({
          i: p.i,
          t: p.t,
          rule: "arp-flip",
          text: `${p.senderIp} mudou de ${prev} para ${p.senderMac}`,
        });
      binding.set(p.senderIp, p.senderMac);
    }
  }
  return alerts;
}

/** Threshold alert on a series of half-open counts (one per tick). */
export function synRecvAlerts(series: readonly number[], max: number): Alert[] {
  const out: Alert[] = [];
  let above = false;
  series.forEach((v, t) => {
    if (v > max && !above)
      out.push({ i: t, t, rule: "syn-recv", text: `${v} conexões em SYN_RECV (limite ${max})` });
    above = v > max;
  });
  return out;
}
