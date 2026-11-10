import { type Layer, layerBuilder, u8, u16, u32 } from "./bytes.ts";

/** IPv6 addresses and the fixed 40-byte header (RFC 8200). */
export function ip6(s: string): number[] {
  const [head = "", tail] = s.split("::");
  const part = (x: string) => (x ? x.split(":") : []);
  const h = part(head);
  const t = tail === undefined ? [] : part(tail);
  const fill = tail === undefined ? 0 : 8 - h.length - t.length;
  const groups = [...h, ...Array(fill).fill("0"), ...t];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g)))
    throw new Error(`IPv6 inválido: ${s}`);
  return groups.flatMap((g) => u16(Number.parseInt(g, 16)));
}

/** Canonical text form (RFC 5952): lower case, longest run of zero groups as "::". */
export function ip6Text(b: readonly number[]): string {
  const g = Array.from({ length: 8 }, (_, i) => ((b[2 * i] ?? 0) << 8) | (b[2 * i + 1] ?? 0));
  let best = -1;
  let bestLen = 1;
  for (let i = 0; i < 8; ) {
    if (g[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && g[j] === 0) j++;
    if (j - i > bestLen) {
      best = i;
      bestLen = j - i;
    }
    i = j;
  }
  const hex = (xs: number[]) => xs.map((x) => x.toString(16)).join(":");
  if (best < 0) return hex(g);
  return `${hex(g.slice(0, best))}::${hex(g.slice(best + bestLen))}`;
}

/** Solicited-node multicast group of an address (RFC 4291 §2.7.1): ff02::1:ffXX:XXXX. */
export function solicitedNode(addr: string): string {
  const b = ip6(addr);
  return ip6Text([0xff, 0x02, ...Array(9).fill(0), 0x01, 0xff, ...b.slice(13)]);
}

/** Ethernet multicast MAC of an IPv6 multicast group (RFC 2464): 33:33 + last 32 bits. */
export function multicastMac(group: string): string {
  const b = ip6(group).slice(12);
  return ["33", "33", ...b.map((x) => x.toString(16).padStart(2, "0"))].join(":");
}

/** Modified EUI-64 interface id from a MAC (RFC 4291 Appendix A): flip the U/L bit, insert ff:fe. */
export function eui64(mac: string): number[] {
  const m = mac.split(":").map((x) => Number.parseInt(x, 16));
  return [(m[0] ?? 0) ^ 0x02, m[1] ?? 0, m[2] ?? 0, 0xff, 0xfe, m[3] ?? 0, m[4] ?? 0, m[5] ?? 0];
}

export const NEXT = { tcp: 6, udp: 17, icmp6: 58 } as const;
const NEXT_NAME: Record<number, string> = { 6: "TCP", 17: "UDP", 58: "ICMPv6" };

export interface Ipv6Opts {
  src: string;
  dst: string;
  next: number;
  payloadLen: number;
  hopLimit?: number;
  flow?: number;
}

export function ipv6(o: Ipv6Opts): Layer {
  const hop = o.hopLimit ?? 64;
  const b = layerBuilder("ip", "IPv6", "b");
  b.field(
    "Versão, classe e fluxo",
    `6, 0, ${hexN5(o.flow ?? 0)}`,
    u32((6 << 28) | ((o.flow ?? 0) & 0xfffff)),
    {
      note: "Versão 6, prioridade (como o DSCP do IPv4) e um rótulo que marca pacotes da mesma conversa",
    },
  );
  b.field("Tamanho da carga", `${o.payloadLen} bytes`, u16(o.payloadLen), {
    note: "Sem contar estes 40 bytes de cabeçalho",
  });
  b.field("Próximo cabeçalho", `${o.next} (${NEXT_NAME[o.next] ?? "?"})`, u8(o.next), {
    note: "Como o campo Protocolo do IPv4: diz o que vem a seguir",
  });
  b.field("Limite de saltos", String(hop), u8(hop), { note: "O TTL do IPv6; não há checksum no cabeçalho" });
  b.field("Origem", o.src, ip6(o.src), { note: "Quem criou o pacote: 128 bits" });
  b.field("Destino", o.dst, ip6(o.dst), {
    note: "O destino final; o cabeçalho tem tamanho fixo, por isso os roteadores o leem rápido",
  });
  return b.done();
}

const hexN5 = (n: number) => `0x${n.toString(16).padStart(5, "0")}`;

/** Pseudo-header for upper-layer checksums over IPv6 (RFC 8200 §8.1). */
export function pseudoHeader6(src: string, dst: string, next: number, len: number): number[] {
  return [...ip6(src), ...ip6(dst), ...u32(len), 0, 0, 0, next];
}
