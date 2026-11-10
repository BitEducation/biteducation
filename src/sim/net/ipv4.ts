import { hexN, ip4, known, type Layer, layerBuilder, u8, u16 } from "./bytes.ts";
import { inetChecksum } from "./checksum.ts";

/** IPv4 header without options (RFC 791), checksum per RFC 1071. */
export interface Ipv4Opts {
  src: string;
  dst: string;
  proto: number;
  payloadLen: number;
  id?: number;
  ttl?: number;
  df?: boolean;
  dscp?: number;
}

export const PROTO = { icmp: 1, tcp: 6, udp: 17 } as const;
const PROTO_NAME: Record<number, string> = { 1: "ICMP", 6: "TCP", 17: "UDP" };

export function ipv4(o: Ipv4Opts): Layer {
  const total = 20 + o.payloadLen;
  if (total > 0xffff) throw new Error("Datagrama grande demais");
  const ttl = o.ttl ?? 64;
  const b = layerBuilder("ip", "IPv4", "b");
  b.field("Versão e IHL", "4 e 5 (20 bytes)", u8(0x45), {
    note: "IPv4, com cabeçalho de 5 palavras de 32 bits: o mínimo, sem opções",
  });
  b.field("DSCP/ECN", String(o.dscp ?? 0), u8((o.dscp ?? 0) << 2), {
    note: o.dscp
      ? "Marca de prioridade: a rede pode dar a este pacote uma fila preferencial"
      : "Prioridade e aviso de congestionamento; zero é tráfego comum",
  });
  b.field("Comprimento total", `${total} bytes`, u16(total), {
    note: "Este cabeçalho mais tudo o que vem dentro dele",
  });
  b.field("Identificação", hexN(o.id ?? 0, 4), u16(o.id ?? 0), {
    note: "Junta os pedaços de novo se o pacote for fragmentado no caminho",
    example: true,
  });
  const df = o.df ?? true;
  b.field("Flags e deslocamento", df ? "DF (não fragmentar), 0" : "0, 0", u16(df ? 0x4000 : 0), {
    note: df
      ? "DF: um roteador com enlace pequeno demais descarta e avisa por ICMP, em vez de partir o pacote"
      : "Sem DF: um roteador pode partir o pacote se o próximo enlace for pequeno demais",
  });
  b.field("TTL", String(ttl), u8(ttl), {
    note: `Cada roteador subtrai 1; em 0 o pacote é descartado${ttl === 64 ? ". Linux e macOS começam em 64" : ttl === 128 ? ". Windows começa em 128" : ""}`,
  });
  b.field("Protocolo", `${o.proto} (${PROTO_NAME[o.proto] ?? "?"})`, u8(o.proto), {
    note: "A quem o destino entrega o conteúdo",
  });
  const at = b.field("Checksum do cabeçalho", "", u16(0), {
    note: "Cobre só este cabeçalho; cada roteador recalcula depois de baixar o TTL",
  });
  b.field("IP de origem", o.src, ip4(o.src), { note: "Quem criou o pacote" });
  b.field("IP de destino", o.dst, ip4(o.dst), {
    note: "O destino final; cada roteador escolhe o próximo salto olhando este campo",
  });
  const sum = inetChecksum(known(b.bytes));
  b.patch(at, u16(sum), `${hexN(sum, 4)} (RFC 1071)`);
  return b.done();
}

/** Pseudo-header used by the TCP and UDP checksums (RFC 9293 §3.1). */
export function pseudoHeader(src: string, dst: string, proto: number, len: number): number[] {
  return [...ip4(src), ...ip4(dst), 0, proto, ...u16(len)];
}
