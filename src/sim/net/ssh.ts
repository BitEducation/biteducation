import { ascii, type Layer, layerBuilder, u8, u32 } from "./bytes.ts";

/**
 * SSH transport layer (RFC 4253): the version line and binary packets
 * (length, padding length, payload, padding). Keys and signatures are unknown bytes.
 */
export const SSH_MSG = { kexinit: 20, newkeys: 21, ecdhInit: 30, ecdhReply: 31 } as const;

export function sshVersion(line: string): Layer {
  const b = layerBuilder("ssh", "SSH", "s4");
  b.field("Versão", line, ascii(`${line}\r\n`), { note: "Texto: a única parte do SSH que não é binária" });
  return b.done();
}

const str = (s: string) => [...u32(s.length), ...ascii(s)];

type Part = { label: string; value: string; bytes: (number | null)[]; note?: string };

/** A binary packet; padding brings the total to a multiple of 8 with at least 4 bytes. */
export function sshPacket(msg: number, name: string, parts: Part[], role: Layer["role"] = "s4"): Layer {
  const payloadLen = 1 + parts.reduce((n, p) => n + p.bytes.length, 0);
  let pad = 8 - ((5 + payloadLen) % 8);
  if (pad < 4) pad += 8;
  const b = layerBuilder("ssh", "SSH", role);
  b.field("Tamanho do pacote", `${1 + payloadLen + pad} bytes`, u32(1 + payloadLen + pad));
  b.field("Tamanho do enchimento", `${pad} bytes`, u8(pad));
  b.field("Tipo da mensagem", `${msg} (${name})`, u8(msg));
  for (const p of parts) b.field(p.label, p.value, p.bytes, p.note ? { note: p.note } : {});
  b.field("Enchimento", `${pad} bytes aleatórios`, Array(pad).fill(null));
  return b.done();
}

export const nameList = (label: string, names: string[], note?: string): Part => ({
  label,
  value: names.join(","),
  bytes: str(names.join(",")),
  ...(note ? { note } : {}),
});

export const blob = (label: string, n: number, value: string, note?: string): Part => ({
  label,
  value,
  bytes: [...u32(n), ...Array(n).fill(null)],
  ...(note ? { note } : {}),
});

export const raw = (label: string, bytes: (number | null)[], value: string, note?: string): Part => ({
  label,
  value,
  bytes,
  ...(note ? { note } : {}),
});
