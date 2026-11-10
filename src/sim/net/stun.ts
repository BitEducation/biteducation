import { hexN, ip4, type Layer, layerBuilder, u16, u32 } from "./bytes.ts";

/** STUN (RFC 8489): 20-byte header with the magic cookie, and XOR-MAPPED-ADDRESS. */
export const MAGIC = 0x2112a442;

export function xorAddress(ip: string, port: number): number[] {
  const m = u32(MAGIC);
  return [0, 0x01, ...u16(port ^ (MAGIC >>> 16)), ...ip4(ip).map((x, i) => x ^ (m[i] ?? 0))];
}

export function stun(o: {
  response: boolean;
  tid: number[];
  mapped?: { ip: string; port: number };
  note?: string;
}): Layer {
  const attrs = o.mapped ? [...u16(0x0020), ...u16(8), ...xorAddress(o.mapped.ip, o.mapped.port)] : [];
  const b = layerBuilder("stun", "STUN", "s4");
  b.field(
    "Tipo",
    o.response ? "0x0101 (resposta de sucesso)" : "0x0001 (pedido de vínculo)",
    u16(o.response ? 0x0101 : 0x0001),
    {
      note: o.response
        ? "O servidor responde dizendo de que endereço o pedido chegou"
        : "Pergunta ao servidor: de que endereço público você me vê?",
    },
  );
  b.field("Tamanho dos atributos", `${attrs.length} bytes`, u16(attrs.length), {
    note: "Quanto vem depois destes 20 bytes de cabeçalho",
  });
  b.field("Cookie mágico", hexN(MAGIC, 8), u32(MAGIC), {
    note: "Valor fixo: separa STUN de outros dados na mesma porta",
  });
  b.field("ID da transação", `${o.tid.length} bytes`, o.tid, o.note ? { note: o.note } : {});
  if (o.mapped)
    b.field("XOR-MAPPED-ADDRESS", `${o.mapped.ip}:${o.mapped.port} (com XOR)`, attrs, {
      note: "Endereço como o servidor o viu, embaralhado com o cookie para que nenhum NAT o reescreva",
    });
  return b.done();
}
