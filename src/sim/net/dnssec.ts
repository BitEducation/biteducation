import { u8, u16, u32 } from "./bytes.ts";
import { name, QTYPE, type QType, type Rr } from "./dns.ts";

/**
 * DNSSEC records (RFC 4034) with algorithm 13 (ECDSA P-256 with SHA-256). Keys, digests and
 * signatures are unknown bytes of the right size; the fixed fields are real.
 */
const ALG = 13;
const T0 = 1793750400; // 2026-11-04 00:00 UTC, inception of every signature in the lessons
const T1 = T0 + 30 * 86400;

export function rrsig(owner: string, covered: QType, ttl: number, signer: string, keyTag: number): Rr {
  const labels = owner.replace(/\.$/, "").split(".").filter(Boolean).length;
  return {
    name: owner,
    type: "RRSIG",
    ttl,
    data: [
      ...u16(QTYPE[covered]),
      ...u8(ALG),
      ...u8(labels),
      ...u32(ttl),
      ...u32(T1),
      ...u32(T0),
      ...u16(keyTag),
      ...name(signer),
      ...Array(64).fill(null),
    ],
    show: `assina ${covered} com a chave ${keyTag} de ${signer}`,
    note: "Assinatura ECDSA P-256 (64 bytes) válida por 30 dias",
  };
}

export function dnskey(owner: string, ksk: boolean, keyTag: number): Rr {
  return {
    name: owner,
    type: "DNSKEY",
    ttl: 3600,
    data: [...u16(ksk ? 257 : 256), 3, ALG, ...Array(64).fill(null)],
    show: `${ksk ? "KSK" : "ZSK"}, etiqueta ${keyTag}`,
    note: ksk
      ? "Flags 257: chave que assina as chaves (KSK)"
      : "Flags 256: chave que assina os registros (ZSK)",
  };
}

export function ds(owner: string, keyTag: number): Rr {
  return {
    name: owner,
    type: "DS",
    ttl: 86400,
    data: [...u16(keyTag), ALG, 2, ...Array(32).fill(null)],
    show: `SHA-256 da KSK ${keyTag} de ${owner}`,
    note: "Fica na zona de cima: é o elo da cadeia",
  };
}
