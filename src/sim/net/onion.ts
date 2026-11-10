/**
 * Onion routing (Tor): the client builds a circuit hop by hop ("telescoping"), wraps each cell
 * in one layer per relay, and every relay learns only its neighbours on the path.
 */

export interface Hop {
  name: string;
  /** One-way latency from the previous point on the path, in ms. */
  ms: number;
}

/** Each extension is one round trip from the client to the newest hop. */
export function buildTime(path: Hop[]): { hop: string; rtt: number; total: number }[] {
  let reach = 0;
  let total = 0;
  return path.map((h) => {
    reach += h.ms;
    total += 2 * reach;
    return { hop: h.name, rtt: 2 * reach, total };
  });
}

/** Layers left on the cell as it arrives at each relay (the client adds them all). */
export function layers(relays: string[]): { at: string; layers: number; sees: string }[] {
  return relays.map((r, i) => ({
    at: r,
    layers: relays.length - i,
    sees:
      i === relays.length - 1 ? "o pedido em claro (ou TLS do site)" : `só o endereço de ${relays[i + 1]}`,
  }));
}

/** What each point on the path knows: who sent to it and where it forwards. */
export function knowledge(path: string[]): { who: string; from: string; to: string }[] {
  return path.slice(1, -1).map((p, i) => ({ who: p, from: path[i] as string, to: path[i + 2] as string }));
}
