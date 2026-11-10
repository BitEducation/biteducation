import { block, cidr, contains, longest, toNum } from "./cidr.ts";

/**
 * WireGuard's data path: sizes of the handshake and transport messages, how an inner IP packet
 * is padded and wrapped in UDP, and cryptokey routing (AllowedIPs) in both directions.
 */
export const PORT = 51820;
export const INIT_BYTES = 148;
export const RESP_BYTES = 92;
/** Transport header: type (4), receiver index (4), counter (8). */
export const DATA_HEADER = 16;
export const TAG = 16;
export const UDP = 8;
export const IPV4 = 20;
export const IPV6 = 40;
export const REKEY_AFTER_S = 120;
export const REJECT_AFTER_S = 180;
export const PATH_MTU = 1500;
const INNER_HEADERS = 40;

const roundUp16 = (n: number) => Math.ceil(n / 16) * 16;

/** The plaintext is padded to a multiple of 16 bytes, but never past the tunnel MTU. */
export const padded = (inner: number, mtu: number) => Math.max(inner, Math.min(roundUp16(inner), mtu));

/** Bytes WireGuard adds around a full-size inner packet (no padding), by outer IP version. */
export const overhead = (v6: boolean) => (v6 ? IPV6 : IPV4) + UDP + DATA_HEADER + TAG;

export function encapsulate(inner: number, mtu: number, v6 = false) {
  const plain = padded(inner, mtu);
  const wg = DATA_HEADER + plain + TAG;
  const udp = UDP + wg;
  const outer = udp + (v6 ? IPV6 : IPV4);
  return { inner, plain, padding: plain - inner, wg, udp, outer, extra: outer - inner };
}

/** The largest TCP segment that fits in one inner packet (IPv4 + TCP headers). */
export const mss = (mtu: number) => mtu - INNER_HEADERS;

/** Splits application data into TCP segments of at most `mss` bytes. */
export function segments(data: number, mtu: number): number[] {
  const m = mss(mtu);
  const out: number[] = [];
  for (let left = data; left > 0; left -= m) out.push(Math.min(left, m));
  return out;
}

export const fits = (mtu: number, v6: boolean, path = PATH_MTU) => mtu + overhead(v6) <= path;

/** The largest tunnel MTU whose packets cross a path of `path` bytes with either outer version. */
export const safeMtu = (path = PATH_MTU) => path - overhead(true);

export interface Peer {
  name: string;
  allowed: string[];
}

const parse = (c: string) => {
  const [ip, len] = c.split("/");
  return block(toNum(ip ?? "0.0.0.0"), Number(len));
};

/** Outgoing: the peer whose AllowedIPs has the longest prefix matching the destination. */
export function route(peers: Peer[], dst: string): { peer: Peer; prefix: string } | null {
  const routes = peers.flatMap((p) => p.allowed.map((a) => ({ b: parse(a), via: p.name })));
  const { win } = longest(routes, toNum(dst));
  const peer = win ? peers.find((p) => p.name === win.via) : undefined;
  return peer && win ? { peer, prefix: cidr(win.b) } : null;
}

/** Incoming: after decryption, the inner source must be inside the sender's AllowedIPs. */
export const accepts = (peer: Peer, src: string) => peer.allowed.some((a) => contains(parse(a), toNum(src)));
