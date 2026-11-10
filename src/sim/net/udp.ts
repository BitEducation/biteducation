import { hexN, known, type Layer, layerBuilder, u16 } from "./bytes.ts";
import { inetChecksum } from "./checksum.ts";
import { PROTO, pseudoHeader } from "./ipv4.ts";
import { pseudoHeader6 } from "./ipv6.ts";
import { portNote } from "./ports.ts";

/** UDP header (RFC 768): 8 bytes, checksum over the IPv4 or IPv6 pseudo-header. */
export interface UdpOpts {
  src: string;
  dst: string;
  sport: number;
  dport: number;
  payload: readonly number[];
  /** Port names for the inspector notes. */
  names?: { sport?: string; dport?: string };
}

export const PORT = {
  dns: 53,
  dhcpServer: 67,
  dhcpClient: 68,
  ntp: 123,
  https: 443,
  radius: 1812,
  wireguard: 51820,
  ike: 500,
  ikeNat: 4500,
} as const;

export function udp(o: UdpOpts): Layer {
  const len = 8 + o.payload.length;
  const b = layerBuilder("udp", "UDP", "a");
  b.field(
    "Porta de origem",
    String(o.sport),
    u16(o.sport),
    o.names?.sport ? { note: o.names.sport } : portNote(o.sport),
  );
  b.field(
    "Porta de destino",
    String(o.dport),
    u16(o.dport),
    o.names?.dport ? { note: o.names.dport } : portNote(o.dport),
  );
  b.field("Comprimento", `${len} bytes (cabeçalho + dados)`, u16(len), {
    note: "Cabeçalho de 8 bytes e os dados. É todo o UDP: sem numeração e sem confirmação",
  });
  const at = b.field("Checksum", "", u16(0), {
    note: "Cobre cabeçalho, dados e os endereços IP (o pseudo-cabeçalho)",
  });
  const v6 = o.src.includes(":");
  const pseudo = v6
    ? pseudoHeader6(o.src, o.dst, PROTO.udp, len)
    : pseudoHeader(o.src, o.dst, PROTO.udp, len);
  let sum = inetChecksum([...pseudo, ...known(b.bytes), ...o.payload]);
  // RFC 768: a computed zero is sent as all ones (zero means "no checksum").
  if (sum === 0) sum = 0xffff;
  b.patch(at, u16(sum), `${hexN(sum, 4)} (com pseudo-cabeçalho)`);
  return b.done();
}
