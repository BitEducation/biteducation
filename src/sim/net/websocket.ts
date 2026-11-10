import { hexN, type Layer, layerBuilder, u16 } from "./bytes.ts";

/** WebSocket frames (RFC 6455 §5.2). Client frames are masked with a 4-byte key. */
export const OPCODE = { text: 1, close: 8, ping: 9, pong: 10 } as const;
const NAME: Record<number, string> = { 1: "texto", 8: "fechar", 9: "ping", 10: "pong" };

export function wsFrame(o: {
  opcode: number;
  payload: readonly number[];
  mask?: readonly number[];
  show: string;
}): Layer {
  const b = layerBuilder("ws", "WebSocket", o.mask ? "a" : "b");
  b.field("FIN e opcode", `FIN=1, ${o.opcode} (${NAME[o.opcode] ?? "?"})`, [0x80 | o.opcode], {
    note: "FIN=1: esta é a última parte da mensagem",
  });
  const len = o.payload.length;
  if (len > 125) throw new Error("A lição só usa cargas curtas");
  b.field(
    "Máscara e tamanho",
    `${o.mask ? "MASK=1" : "MASK=0"}, ${len} bytes`,
    [(o.mask ? 0x80 : 0) | len],
    o.mask
      ? { note: "Todo quadro do cliente vai mascarado" }
      : { note: "Quadros do servidor não usam máscara" },
  );
  if (o.mask) {
    b.field(
      "Chave da máscara",
      hexN(
        (((o.mask[0] ?? 0) << 24) | ((o.mask[1] ?? 0) << 16) | ((o.mask[2] ?? 0) << 8) | (o.mask[3] ?? 0)) >>>
          0,
        8,
      ),
      [...o.mask],
      {
        note: "Sorteada a cada quadro",
      },
    );
    const masked = o.payload.map((x, i) => x ^ (o.mask?.[i % 4] ?? 0));
    b.field("Carga mascarada", `"${o.show}" depois do XOR com a chave`, masked, {
      note: "byte i XOR chave[i mod 4]: quem não lê a chave vê bytes sem sentido",
    });
  } else b.field("Carga", o.show, [...o.payload]);
  return b.done();
}

export const closePayload = (code: number, reason: string) => [
  ...u16(code),
  ...[...reason].map((c) => c.charCodeAt(0)),
];
