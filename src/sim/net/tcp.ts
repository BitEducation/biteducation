import { hexN, known, type Layer, layerBuilder, u16, u32 } from "./bytes.ts";
import { inetChecksum } from "./checksum.ts";
import { PROTO, pseudoHeader } from "./ipv4.ts";

/** TCP header (RFC 9293) with the MSS option on SYNs and the pseudo-header checksum. */
export type TcpFlag = "FIN" | "SYN" | "RST" | "PSH" | "ACK";
const BITS: Record<TcpFlag, number> = { FIN: 0x01, SYN: 0x02, RST: 0x04, PSH: 0x08, ACK: 0x10 };

export interface TcpOpts {
  srcIp: string;
  dstIp: string;
  sport: number;
  dport: number;
  seq: number;
  ack: number;
  flags: TcpFlag[];
  window: number;
  mss?: number;
  payload?: readonly number[];
  /** Label for the sequence number (e.g. "ISN aleatório", "cookie"). */
  seqNote?: string;
}

const flagsText = (f: readonly TcpFlag[]) => (f.length ? f.join(", ") : "nenhuma");

export function tcp(o: TcpOpts): Layer {
  const payload = o.payload ?? [];
  const opts = o.mss !== undefined ? [2, 4, ...u16(o.mss)] : [];
  const hdrLen = 20 + opts.length;
  const b = layerBuilder("tcp", "TCP", "a");
  b.field("Porta de origem", String(o.sport), u16(o.sport));
  b.field(
    "Porta de destino",
    String(o.dport),
    u16(o.dport),
    o.dport === 80 ? { note: "80 = HTTP" } : o.dport === 443 ? { note: "443 = HTTPS" } : {},
  );
  b.field("Número de sequência", `${o.seq >>> 0}`, u32(o.seq), o.seqNote ? { note: o.seqNote } : {});
  b.field(
    "Número de confirmação (ACK)",
    o.flags.includes("ACK") ? `${o.ack >>> 0}` : "0 (sem ACK)",
    u32(o.flags.includes("ACK") ? o.ack : 0),
  );
  const flagBits = o.flags.reduce((acc, f) => acc | BITS[f], 0);
  b.field(
    "Tamanho do cabeçalho e flags",
    `${hdrLen} bytes; ${flagsText(o.flags)}`,
    u16(((hdrLen / 4) << 12) | flagBits),
  );
  b.field("Janela", `${o.window} bytes`, u16(o.window), {
    note: "Quanto o remetente deste segmento ainda aceita receber",
  });
  const at = b.field("Checksum", "", u16(0));
  b.field("Ponteiro de urgência", "0", u16(0));
  if (opts.length)
    b.field("Opção MSS", `${o.mss} bytes`, opts, { note: "Maior segmento que este lado aceita" });
  const segment = [...known(b.bytes), ...payload];
  const sum = inetChecksum([...pseudoHeader(o.srcIp, o.dstIp, PROTO.tcp, segment.length), ...segment]);
  b.patch(at, u16(sum), `${hexN(sum, 4)} (com pseudo-cabeçalho)`);
  return b.done();
}

/** Application payload as a layer (HTTP text, or opaque bytes). */
export function payloadLayer(
  id: string,
  label: string,
  bytes: (number | null)[],
  value: string,
  role: Layer["role"] = "s4",
): Layer {
  return { id, label, role, bytes, fields: [{ label, value, from: 0, to: bytes.length }] };
}
