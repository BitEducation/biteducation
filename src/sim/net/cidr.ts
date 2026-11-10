/**
 * IPv4 addressing with prefixes: mask, network, broadcast, splitting a block, variable-length
 * allocation and longest-prefix match. Addresses are unsigned 32-bit numbers.
 */
export const toNum = (ip: string): number =>
  ip.split(".").reduce((acc, o) => (acc * 256 + Number(o)) >>> 0, 0);

export const toIp = (n: number): string => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join(".");

export const isIp = (s: string): boolean =>
  /^(\d{1,3}\.){3}\d{1,3}$/.test(s) && s.split(".").every((o) => Number(o) <= 255);

export const mask = (prefix: number): number => (prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0);

export interface Block {
  network: number;
  prefix: number;
  broadcast: number;
  size: number;
  /** Usable hosts: the network and broadcast addresses are reserved (prefixes up to /30). */
  hosts: number;
}

export function block(addr: number, prefix: number): Block {
  const network = (addr & mask(prefix)) >>> 0;
  const size = 2 ** (32 - prefix);
  return { network, prefix, broadcast: network + size - 1, size, hosts: Math.max(0, size - 2) };
}

export const contains = (b: Block, addr: number) => addr >= b.network && addr <= b.broadcast;

export const bits = (n: number): string => (n >>> 0).toString(2).padStart(32, "0");

/** Splits `parent` into 2^extra equal blocks. */
export function split(parent: Block, extra: number): Block[] {
  const prefix = parent.prefix + extra;
  const step = 2 ** (32 - prefix);
  return Array.from({ length: 2 ** extra }, (_, i) => block(parent.network + i * step, prefix));
}

/** Smallest prefix (largest number) whose usable hosts cover `need`. */
export function prefixFor(need: number): number {
  for (let p = 30; p >= 0; p--) if (2 ** (32 - p) - 2 >= need) return p;
  return 0;
}

/** Variable-length allocation: largest need first, each block aligned right after the previous. */
export function vlsm(parent: Block, needs: readonly number[]): { need: number; b: Block }[] | null {
  let next = parent.network;
  const out: { need: number; b: Block }[] = [];
  for (const need of [...needs].sort((a, b) => b - a)) {
    const p = prefixFor(need);
    const size = 2 ** (32 - p);
    const start = Math.ceil(next / size) * size;
    const b = block(start, p);
    if (b.broadcast > parent.broadcast) return null;
    out.push({ need, b });
    next = b.broadcast + 1;
  }
  return out;
}

export interface Route {
  b: Block;
  via: string;
}

/** Longest-prefix match: every route that contains the address, and the winner. */
export function longest(routes: readonly Route[], addr: number): { matches: Route[]; win: Route | null } {
  const matches = routes.filter((r) => contains(r.b, addr));
  const win = matches.reduce<Route | null>((w, r) => (!w || r.b.prefix > w.b.prefix ? r : w), null);
  return { matches, win };
}

export const cidr = (b: Block) => `${toIp(b.network)}/${b.prefix}`;
