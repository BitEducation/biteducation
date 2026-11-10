/**
 * Two learning switches joined by a trunk. Each switch learns (VLAN, source MAC) → port, forwards
 * known unicast to one port and floods unknown or broadcast frames to every port of the same VLAN.
 * Trunk ports carry every VLAN with an 802.1Q tag; access ports belong to one VLAN.
 */
export type Sw = "S1" | "S2";
export type Port = { kind: "access"; host: string; vlan: number } | { kind: "trunk"; peer: Sw | "R" };

export const BROADCAST = "FF";
export const TAG_BYTES = 4;
export const VID_BITS = 12;

export interface Hop {
  from: string;
  to: string;
  /** VLAN tag carried on this link, if it is a trunk. */
  tag?: number;
  /** The receiving host keeps the frame (it is the destination or a broadcast). */
  kept: boolean;
}

export interface Learned {
  sw: Sw;
  vlan: number;
  mac: string;
  port: number;
}

export interface Delivery {
  hops: Hop[];
  learned: Learned[];
  flooded: boolean;
}

export class Lan {
  readonly ports: Record<Sw, Map<number, Port>>;
  readonly tables: Record<Sw, Map<string, number>> = { S1: new Map(), S2: new Map() };

  /** Without VLANs (`tagged` false) every port is in VLAN 1 and the trunk sends plain frames. */
  constructor(
    vlans: Record<string, number>,
    router = false,
    readonly tagged = true,
  ) {
    const acc = (host: string): Port => ({ kind: "access", host, vlan: vlans[host] ?? 1 });
    this.ports = {
      S1: new Map<number, Port>([
        [1, acc("A")],
        [2, acc("B")],
        [3, acc("C")],
        [4, { kind: "trunk", peer: "S2" }],
      ]),
      S2: new Map<number, Port>([
        [1, acc("D")],
        [2, acc("E")],
        [3, acc("F")],
        [4, { kind: "trunk", peer: "S1" }],
      ]),
    };
    if (router) this.ports.S1.set(5, { kind: "trunk", peer: "R" });
  }

  /** Where a host is plugged in. The router hangs on a trunk of S1. */
  private home(host: string): { sw: Sw; port: number } {
    for (const sw of ["S1", "S2"] as const)
      for (const [n, p] of this.ports[sw])
        if ((p.kind === "access" && p.host === host) || (p.kind === "trunk" && p.peer === host))
          return { sw, port: n };
    throw new Error(`unknown host ${host}`);
  }

  vlanOf(host: string): number {
    const { sw, port } = this.home(host);
    const p = this.ports[sw].get(port);
    return p?.kind === "access" ? p.vlan : 0;
  }

  /** Sends one frame; `vlan` is required only when the sender sits on a trunk (the router). */
  send(src: string, dst: string, vlan = this.vlanOf(src)): Delivery {
    const hops: Hop[] = [];
    const learned: Learned[] = [];
    let flooded = false;
    const start = this.home(src);
    const tag = (v: number) => (this.tagged ? { tag: v } : {});
    hops.push({ from: src, to: start.sw, kept: false, ...(this.vlanOf(src) === 0 ? tag(vlan) : {}) });
    const queue: { sw: Sw; port: number }[] = [start];
    while (queue.length) {
      const at = queue.shift();
      if (!at) break;
      const table = this.tables[at.sw];
      const key = `${vlan}|${src}`;
      if (table.get(key) !== at.port) {
        table.set(key, at.port);
        learned.push({ sw: at.sw, vlan, mac: src, port: at.port });
      }
      const known = dst === BROADCAST ? undefined : table.get(`${vlan}|${dst}`);
      const outs =
        known !== undefined
          ? known === at.port
            ? []
            : [known]
          : [...this.ports[at.sw].keys()].filter((n) => {
              const p = this.ports[at.sw].get(n);
              return n !== at.port && (p?.kind === "trunk" || p?.vlan === vlan);
            });
      if (known === undefined && outs.length) flooded = true;
      for (const n of outs) {
        const p = this.ports[at.sw].get(n);
        if (!p) continue;
        if (p.kind === "access") {
          hops.push({ from: at.sw, to: p.host, kept: dst === BROADCAST || p.host === dst });
        } else if (p.peer === "R") {
          hops.push({ from: at.sw, to: "R", ...tag(vlan), kept: dst === BROADCAST || dst === "R" });
        } else {
          hops.push({ from: at.sw, to: p.peer, ...tag(vlan), kept: false });
          queue.push({ sw: p.peer, port: 4 });
        }
      }
    }
    return { hops, learned, flooded };
  }
}

/** Links a frame crosses, the sender's own cable included. */
export const copies = (d: Delivery) => d.hops.length;

/** With hubs every frame is repeated on all seven cables: six hosts plus the one between the hubs. */
export const HUB_COPIES = 7;

/** Parses "112122" into VLANs 10/20 for hosts A–F. */
export function parseVlans(s: string): Record<string, number> {
  const ok = /^[12]{6}$/.test(s) ? s : "112122";
  return Object.fromEntries([..."ABCDEF"].map((h, i) => [h, ok[i] === "2" ? 20 : 10]));
}

/** One flat LAN, as before VLANs. */
export const flatLan = () => new Lan(Object.fromEntries([..."ABCDEF"].map((h) => [h, 1])), false, false);

export const usableVlans = () => 2 ** VID_BITS - 2;
