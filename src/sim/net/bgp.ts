/**
 * Path-vector routing between autonomous systems, with business relationships:
 * export rules (customer routes go to everyone; peer and provider routes only to customers),
 * local preference by relationship, loop rejection by AS_PATH and optional origin validation.
 */

export type Rel = "customer" | "peer" | "provider";

export interface AsLink {
  /** `a` sees `b` as `rel` (e.g. a=100, b=300, rel="provider": 300 is 100's provider). */
  a: number;
  b: number;
  rel: Rel;
}

export interface Announce {
  prefix: string;
  origin: number;
}

export interface Roa {
  prefix: string;
  maxLen: number;
  asn: number;
}

export interface BgpRoute {
  prefix: string;
  path: number[];
  from: number;
  rel: Rel | "self";
  lp: number;
}

export interface BgpOpts {
  /** Prefer customer > peer > provider; when false every route has the same local preference. */
  policy: boolean;
  roas?: Roa[];
  /** ASes that drop RPKI-invalid routes. */
  rov?: number[];
}

export interface BgpResult {
  /** asn → prefix → every route received. */
  rib: Map<number, Map<string, BgpRoute[]>>;
  /** asn → prefix → chosen route. */
  best: Map<number, Map<string, BgpRoute>>;
  /** Routes discarded, for the narrative. */
  dropped: { at: number; route: BgpRoute; why: "laço" | "rpki" }[];
  rounds: number;
}

const LP: Record<Rel | "self", number> = { self: 300, customer: 200, peer: 150, provider: 100 };
const flip: Record<Rel, Rel> = { customer: "provider", provider: "customer", peer: "peer" };

export function relOf(links: readonly AsLink[], a: number, b: number): Rel | null {
  for (const l of links) {
    if (l.a === a && l.b === b) return l.rel;
    if (l.a === b && l.b === a) return flip[l.rel];
  }
  return null;
}

export function neighbors(links: readonly AsLink[], a: number): number[] {
  return links.flatMap((l) => (l.a === a ? [l.b] : l.b === a ? [l.a] : [])).sort((x, y) => x - y);
}

export function parsePrefix(p: string): { net: number; len: number } {
  const [ip = "0.0.0.0", len = "32"] = p.split("/");
  const net = ip.split(".").reduce((n, o) => n * 256 + Number(o), 0);
  return { net, len: Number(len) };
}

export function contains(outer: string, inner: string): boolean {
  const o = parsePrefix(outer);
  const i = parsePrefix(inner);
  if (i.len < o.len) return false;
  const size = 2 ** (32 - o.len);
  return Math.floor(i.net / size) === Math.floor(o.net / size);
}

/** RPKI origin validation: "valid", "invalid" (covered by a ROA but not matching) or "unknown". */
export function rpki(roas: readonly Roa[], prefix: string, origin: number): "valid" | "invalid" | "unknown" {
  const covering = roas.filter((r) => contains(r.prefix, prefix));
  if (covering.length === 0) return "unknown";
  const len = parsePrefix(prefix).len;
  return covering.some((r) => r.asn === origin && len <= r.maxLen) ? "valid" : "invalid";
}

function better(x: BgpRoute, y: BgpRoute): boolean {
  if (x.lp !== y.lp) return x.lp > y.lp;
  if (x.path.length !== y.path.length) return x.path.length < y.path.length;
  return x.from < y.from;
}

export function runBgp(
  ases: readonly number[],
  links: readonly AsLink[],
  ann: readonly Announce[],
  o: BgpOpts,
  cap = 30,
): BgpResult {
  const rib = new Map<number, Map<string, BgpRoute[]>>(ases.map((a) => [a, new Map()]));
  const best = new Map<number, Map<string, BgpRoute>>(ases.map((a) => [a, new Map()]));
  const dropped: BgpResult["dropped"] = [];
  for (const x of ann)
    best
      .get(x.origin)
      ?.set(x.prefix, { prefix: x.prefix, path: [x.origin], from: x.origin, rel: "self", lp: LP.self });

  let rounds = 0;
  for (; rounds < cap; rounds++) {
    let changed = false;
    // synchronous round: every AS exports its current best routes
    const snapshot = new Map([...best].map(([a, m]) => [a, new Map(m)]));
    for (const a of ases) {
      for (const [prefix, r] of snapshot.get(a) ?? []) {
        for (const nb of neighbors(links, a)) {
          const relToNb = relOf(links, a, nb) as Rel;
          // export: own and customer routes to everyone; others only to customers
          if (r.rel !== "self" && r.rel !== "customer" && relToNb !== "customer") continue;
          const relFromNb = flip[relToNb];
          const route: BgpRoute = {
            prefix,
            path: r.rel === "self" ? [a] : [a, ...r.path],
            from: a,
            rel: relFromNb,
            lp: o.policy ? LP[relFromNb] : 100,
          };
          const list = rib.get(nb)?.get(prefix) ?? [];
          if (list.some((x) => x.from === a && x.path.join() === route.path.join())) continue;
          if (route.path.includes(nb)) {
            if (!dropped.some((d) => d.at === nb && d.route.path.join() === route.path.join()))
              dropped.push({ at: nb, route, why: "laço" });
            continue;
          }
          const origin = route.path[route.path.length - 1] ?? a;
          if (o.rov?.includes(nb) && o.roas && rpki(o.roas, prefix, origin) === "invalid") {
            if (!dropped.some((d) => d.at === nb && d.route.path.join() === route.path.join()))
              dropped.push({ at: nb, route, why: "rpki" });
            continue;
          }
          const kept = list.filter((x) => x.from !== a);
          kept.push(route);
          rib.get(nb)?.set(prefix, kept);
          const cur = best.get(nb)?.get(prefix);
          if (cur?.rel === "self") continue;
          const pick = kept.reduce((m, x) => (better(x, m) ? x : m));
          if (!cur || cur.path.join() !== pick.path.join() || cur.from !== pick.from) {
            best.get(nb)?.set(prefix, pick);
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
  }
  return { rib, best, dropped, rounds: rounds + 1 };
}

/** Forwarding at one AS: the longest prefix among its best routes that contains the address. */
export function lookup(res: BgpResult, asn: number, ip: string): BgpRoute | null {
  let hit: BgpRoute | null = null;
  for (const r of res.best.get(asn)?.values() ?? []) {
    if (!contains(r.prefix, `${ip}/32`)) continue;
    if (!hit || parsePrefix(r.prefix).len > parsePrefix(hit.prefix).len) hit = r;
  }
  return hit;
}
