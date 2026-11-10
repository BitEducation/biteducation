/**
 * SDN in the OpenFlow style (CN 5.x): the switch only matches packets against its flow table.
 * A miss becomes a packet-in to the controller, which applies the policy and installs a
 * flow-mod; later packets of the same flow match in the switch and never reach the controller.
 */

export interface Pkt {
  src: string;
  dst: string;
  port: number;
}

export interface Rule {
  match: Pkt;
  action: string;
  hits: number;
}

export type Policy = (p: Pkt) => string;

export interface Step {
  pkt: Pkt;
  miss: boolean;
  action: string;
  /** Index of the rule used (after installation, on a miss). */
  rule: number;
}

const same = (a: Pkt, b: Pkt) => a.src === b.src && a.dst === b.dst && a.port === b.port;

/**
 * With a table of `capacity` rules (switch hardware is small), installing a new rule evicts the
 * least recently used one, so an evicted flow goes back to the controller.
 */
export function simulate(
  pkts: Pkt[],
  policy: Policy,
  capacity = Number.POSITIVE_INFINITY,
): { steps: Step[]; table: Rule[]; evicted: number } {
  const table: Rule[] = [];
  const steps: Step[] = [];
  const used: number[] = [];
  let evicted = 0;
  let clock = 0;
  for (const p of pkts) {
    clock++;
    let i = table.findIndex((r) => same(r.match, p));
    const miss = i < 0;
    if (miss) {
      if (table.length >= capacity) {
        let lru = 0;
        used.forEach((u, k) => {
          if (u < (used[lru] as number)) lru = k;
        });
        table[lru] = { match: p, action: policy(p), hits: 0 };
        i = lru;
        evicted++;
      } else {
        table.push({ match: p, action: policy(p), hits: 0 });
        i = table.length - 1;
      }
    }
    used[i] = clock;
    const r = table[i] as Rule;
    r.hits++;
    steps.push({ pkt: p, miss, action: r.action, rule: i });
  }
  return { steps, table, evicted };
}
