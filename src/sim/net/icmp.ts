import { hexN, known, type Layer, layerBuilder, mac, u8, u16, u32 } from "./bytes.ts";
import { inetChecksum } from "./checksum.ts";
import { ip6, NEXT, pseudoHeader6 } from "./ipv6.ts";

/** ICMP for IPv4 (RFC 792) and ICMPv6 with Neighbor Discovery (RFC 4443, RFC 4861). */

export function icmpEcho(o: { reply: boolean; id: number; seq: number; data: readonly number[] }): Layer {
  const b = layerBuilder("icmp", "ICMP", "b");
  b.field("Tipo", o.reply ? "0 (echo reply)" : "8 (echo request)", u8(o.reply ? 0 : 8));
  b.field("Código", "0", u8(0));
  const at = b.field("Checksum", "", u16(0));
  b.field("Identificador", String(o.id), u16(o.id), { note: "Separa os pings de programas diferentes" });
  b.field("Sequência", String(o.seq), u16(o.seq), { note: "Sobe 1 a cada pedido" });
  b.field("Dados", `${o.data.length} bytes`, [...o.data], { note: "A resposta devolve os mesmos bytes" });
  const sum = inetChecksum(known(b.bytes));
  b.patch(at, u16(sum), hexN(sum, 4));
  return b.done();
}

/** Time exceeded (type 11) or destination unreachable (type 3), quoting the original header + 8 bytes. */
export function icmpError(o: { type: 3 | 11; code: number; quoted: readonly number[] }): Layer {
  const b = layerBuilder("icmp", "ICMP", "warn");
  const name = o.type === 11 ? "11 (tempo excedido)" : "3 (destino inalcançável)";
  b.field("Tipo", name, u8(o.type));
  const codeName =
    o.type === 11
      ? "0 (TTL chegou a zero em trânsito)"
      : o.code === 3
        ? "3 (porta inalcançável)"
        : String(o.code);
  b.field("Código", codeName, u8(o.code));
  const at = b.field("Checksum", "", u16(0));
  b.field("Não usado", "0", u32(0));
  b.field("Início do pacote original", `${o.quoted.length} bytes`, [...o.quoted], {
    note: "Cabeçalho IP + 8 bytes: é assim que quem enviou descobre a qual pacote o erro se refere",
  });
  const sum = inetChecksum(known(b.bytes));
  b.patch(at, u16(sum), hexN(sum, 4));
  return b.done();
}

type NdOption =
  | { kind: "slla" | "tlla"; mac: string }
  | { kind: "mtu"; mtu: number }
  | { kind: "prefix"; prefix: string; len: number; valid: number; preferred: number };

export interface NdMsg {
  type: "rs" | "ra" | "ns" | "na" | "echo-req" | "echo-rep";
  src: string;
  dst: string;
  target?: string;
  /** RA: router lifetime (s) and the M/O flags; NA: solicited / override flags. */
  lifetime?: number;
  managed?: boolean;
  other?: boolean;
  solicited?: boolean;
  override?: boolean;
  router?: boolean;
  options?: NdOption[];
  id?: number;
  seq?: number;
  data?: readonly number[];
}

const TYPE: Record<NdMsg["type"], [number, string]> = {
  rs: [133, "133 (Router Solicitation)"],
  ra: [134, "134 (Router Advertisement)"],
  ns: [135, "135 (Neighbor Solicitation)"],
  na: [136, "136 (Neighbor Advertisement)"],
  "echo-req": [128, "128 (echo request)"],
  "echo-rep": [129, "129 (echo reply)"],
};

export function icmp6(m: NdMsg): Layer {
  const [code, name] = TYPE[m.type];
  const b = layerBuilder("icmp6", "ICMPv6", "b");
  b.field("Tipo", name, u8(code));
  b.field("Código", "0", u8(0));
  const at = b.field("Checksum", "", u16(0));
  if (m.type === "rs") b.field("Reservado", "0", u32(0));
  if (m.type === "ra") {
    b.field("Limite de saltos sugerido", "64", u8(64));
    const flags = (m.managed ? 0x80 : 0) | (m.other ? 0x40 : 0);
    b.field("Flags M e O", `M=${m.managed ? 1 : 0}, O=${m.other ? 1 : 0}`, u8(flags), {
      note: "M=1: use DHCPv6 para o endereço; O=1: use DHCPv6 só para outras configurações",
    });
    b.field("Vida útil do roteador", `${m.lifetime ?? 1800} s`, u16(m.lifetime ?? 1800), {
      note: "Maior que zero: este roteador pode ser o gateway padrão",
    });
    b.field("Tempo de alcance", "0 (não especificado)", u32(0));
    b.field("Intervalo de retransmissão", "0 (não especificado)", u32(0));
  }
  if (m.type === "ns") {
    b.field("Reservado", "0", u32(0));
    b.field("Alvo", m.target ?? "", ip6(m.target ?? "::"), { note: "O endereço cujo MAC se quer saber" });
  }
  if (m.type === "na") {
    const f = (m.router ? 0x80 : 0) | (m.solicited ? 0x40 : 0) | (m.override ? 0x20 : 0);
    b.field("Flags R, S, O", `R=${m.router ? 1 : 0}, S=${m.solicited ? 1 : 0}, O=${m.override ? 1 : 0}`, [
      f,
      0,
      0,
      0,
    ]);
    b.field("Alvo", m.target ?? "", ip6(m.target ?? "::"));
  }
  if (m.type === "echo-req" || m.type === "echo-rep") {
    b.field("Identificador", String(m.id ?? 0), u16(m.id ?? 0));
    b.field("Sequência", String(m.seq ?? 0), u16(m.seq ?? 0));
    b.field("Dados", `${(m.data ?? []).length} bytes`, [...(m.data ?? [])]);
  }
  for (const o of m.options ?? []) {
    if (o.kind === "slla" || o.kind === "tlla")
      b.field(o.kind === "slla" ? "Opção: MAC de origem" : "Opção: MAC do alvo", o.mac, [
        o.kind === "slla" ? 1 : 2,
        1,
        ...mac(o.mac),
      ]);
    if (o.kind === "mtu") b.field("Opção: MTU", `${o.mtu} bytes`, [5, 1, 0, 0, ...u32(o.mtu)]);
    if (o.kind === "prefix")
      b.field(
        "Opção: informação de prefixo",
        `${o.prefix}/${o.len}, L=1 A=1`,
        [3, 4, o.len, 0xc0, ...u32(o.valid), ...u32(o.preferred), 0, 0, 0, 0, ...ip6(o.prefix)],
        {
          note: `A=1 autoriza a autoconfiguração (SLAAC); válido ${o.valid} s, preferido ${o.preferred} s`,
        },
      );
  }
  const body = known(b.bytes);
  const sum = inetChecksum([...pseudoHeader6(m.src, m.dst, NEXT.icmp6, body.length), ...body]);
  b.patch(at, u16(sum), `${hexN(sum, 4)} (com pseudo-cabeçalho IPv6)`);
  return b.done();
}
