import { type Layer, layerBuilder, u32 } from "./bytes.ts";

/**
 * QUIC packet headers (RFC 9000 §17). Payloads are encrypted, so they appear as unknown bytes
 * of the right length; header protection is ignored so the packet number stays readable.
 */
export function varint(v: number): number[] {
  if (v < 64) return [v];
  if (v < 16384) return [0x40 | (v >>> 8), v & 0xff];
  if (v < 2 ** 30) return [0x80 | (v >>> 24), (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
  throw new Error("varint grande demais para a lição");
}

export type LongType = "initial" | "handshake";
const TYPE: Record<LongType, number> = { initial: 0, handshake: 2 };

export interface LongOpts {
  type: LongType;
  dcid: number[];
  scid: number[];
  pn: number;
  /** Encrypted payload size (frames + 16-byte AEAD tag). */
  payload: number;
  what: string;
}

export function quicLong(o: LongOpts): Layer {
  const b = layerBuilder("quic", "QUIC", "a");
  // Fixed bit set, 2-byte packet number (pn_len = 1).
  b.field(
    "Primeiro byte",
    `cabeçalho longo, ${o.type === "initial" ? "Initial" : "Handshake"}`,
    [0xc0 | (TYPE[o.type] << 4) | 0x01],
    {
      note: "Bit 7 = 1: cabeçalho longo, usado só no começo da conexão",
    },
  );
  b.field("Versão", "1", u32(1), { note: "QUIC versão 1 (RFC 9000); visível só nos cabeçalhos longos" });
  b.field("Tamanho do ID de destino", String(o.dcid.length), [o.dcid.length], {
    note: "Os IDs têm tamanho variável, então vem o tamanho antes",
  });
  b.field("ID de conexão de destino", o.dcid.map((x) => x.toString(16).padStart(2, "0")).join(""), o.dcid, {
    note: "Identifica a conexão, não o endereço: sobrevive à troca de IP",
  });
  b.field("Tamanho do ID de origem", String(o.scid.length), [o.scid.length]);
  b.field("ID de conexão de origem", o.scid.map((x) => x.toString(16).padStart(2, "0")).join(""), o.scid, {
    note: "O ID que o outro lado deve usar como destino ao responder",
    example: true,
  });
  if (o.type === "initial")
    b.field("Tamanho do token", "0", varint(0), {
      note: "Sem token: o servidor pode pedir um para provar que o endereço do cliente é real",
    });
  const len = 2 + o.payload;
  b.field("Tamanho", `${len} bytes (número do pacote + carga)`, varint(len), {
    note: "Vários pacotes QUIC podem viajar no mesmo datagrama UDP; este campo diz onde cada um acaba",
  });
  b.field("Número do pacote", String(o.pn), [(o.pn >>> 8) & 0xff, o.pn & 0xff], {
    note: "Nunca se repete, nem na retransmissão",
  });
  b.field("Carga cifrada", `${o.what} (${o.payload} bytes)`, Array(o.payload).fill(null), {
    note: "Quadros QUIC cifrados; até os pacotes Initial são cifrados, com chaves que vêm do ID de destino",
  });
  return b.done();
}

export function quicShort(o: { dcid: number[]; pn: number; payload: number; what: string }): Layer {
  const b = layerBuilder("quic", "QUIC", "a");
  b.field("Primeiro byte", "cabeçalho curto (1-RTT)", [0x40 | 0x01], { note: "Bit 7 = 0: cabeçalho curto" });
  b.field("ID de conexão de destino", o.dcid.map((x) => x.toString(16).padStart(2, "0")).join(""), o.dcid, {
    note: "Única coisa legível que sobra: o que basta para achar a conexão",
  });
  b.field("Número do pacote", String(o.pn), [(o.pn >>> 8) & 0xff, o.pn & 0xff], {
    note: "Na rede real vem embaralhado (proteção de cabeçalho); aqui aparece aberto",
  });
  b.field("Carga cifrada", `${o.what} (${o.payload} bytes)`, Array(o.payload).fill(null), {
    note: "Dados e confirmações, tudo cifrado: quem está no caminho não vê nem os ACKs",
  });
  return b.done();
}
