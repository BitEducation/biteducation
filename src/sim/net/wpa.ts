/**
 * WPA2/WPA3 personal: the key hierarchy, the four-way handshake, CCMP framing overhead and the
 * cost of guessing a passphrase offline (WPA2-PSK) versus online, one exchange per guess (SAE).
 */
export const PBKDF2_ROUNDS = 4096;
export const CCMP_HEADER = 8;
export const CCMP_MIC = 8;

export interface Key {
  name: string;
  bits: number;
  from: string;
}

/** Keys for CCMP-128 (WPA2); the PTK is split into KCK, KEK and TK. */
export const KEYS: Key[] = [
  { name: "PMK", bits: 256, from: "PBKDF2(senha, SSID, 4096)" },
  { name: "PTK", bits: 384, from: "PRF(PMK, nonces, MACs)" },
  { name: "KCK", bits: 128, from: "PTK: assina o handshake" },
  { name: "KEK", bits: 128, from: "PTK: cifra a GTK" },
  { name: "TK", bits: 128, from: "PTK: cifra os dados" },
  { name: "GTK", bits: 128, from: "sorteada pelo AP" },
];

export const ALPHABETS = { minusculas: 26, alfanum: 62, ascii: 95 } as const;
export type Alphabet = keyof typeof ALPHABETS;

/** Passphrases of exactly `len` characters drawn from the alphabet. */
export const space = (len: number, alphabet: Alphabet) => ALPHABETS[alphabet] ** len;

/** Seconds to try half the space (the expected time) at `rate` guesses per second. */
export const expectedSeconds = (len: number, alphabet: Alphabet, rate: number) =>
  space(len, alphabet) / 2 / rate;

export const ccmpFrame = (payload: number) => payload + CCMP_HEADER + CCMP_MIC;

const UNITS: [string, string, number][] = [
  ["segundo", "segundos", 1],
  ["minuto", "minutos", 60],
  ["hora", "horas", 3600],
  ["dia", "dias", 86400],
  ["ano", "anos", 365 * 86400],
];

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const sup = (n: number) =>
  String(n)
    .split("")
    .map((d) => SUP[Number(d)] ?? d)
    .join("");

/** Brazilian digits without depending on the runtime's locale data: 12.345 and 2,4. */
const br = (x: number) => {
  const [int, frac] = String(x).split(".");
  const grouped = (int ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return frac ? `${grouped},${frac}` : grouped;
};

/** 2,1 × 10¹¹ style for big counts; plain digits with thousands dots below a million. */
export function sci(x: number): string {
  if (x < 1e6) return br(Math.round(x));
  let e = Math.floor(Math.log10(x));
  let m = Math.round((x / 10 ** e) * 10) / 10;
  // 9,96 rounds up to 10,0: carry into the exponent.
  if (m >= 10) {
    m /= 10;
    e += 1;
  }
  return `${m.toFixed(1).replace(".", ",")} × 10${sup(e)}`;
}

/** A duration in the largest unit that keeps the number at least 1. */
export function human(seconds: number): string {
  if (seconds < 1) return "menos de 1 segundo";
  let pick = UNITS[0] ?? ["segundo", "segundos", 1];
  for (const u of UNITS) if (seconds >= u[2]) pick = u;
  const v = seconds / pick[2];
  const shown = v < 10 ? Math.round(v * 10) / 10 : Math.round(v);
  const num = v < 1e6 ? br(shown) : sci(v);
  return `${num} ${shown === 1 ? pick[0] : pick[1]}`;
}
