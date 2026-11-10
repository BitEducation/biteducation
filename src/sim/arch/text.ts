/**
 * Text encodings by hand: code points, UTF-8 (1 to 4 bytes chosen by the code point's size and
 * marked by prefix bits), UTF-16 code units (surrogate pairs above U+FFFF) and what UTF-8 bytes
 * look like when decoded as Windows-1252, the classic "Ã¡".
 */

export const codePoints = (s: string): number[] => [...s].map((ch) => ch.codePointAt(0) ?? 0);

export function utf8(cp: number): number[] {
  if (cp < 0x80) return [cp];
  if (cp < 0x800) return [0xc0 | (cp >> 6), 0x80 | (cp & 0x3f)];
  if (cp < 0x10000) return [0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)];
  return [0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)];
}

export function utf16(cp: number): number[] {
  if (cp < 0x10000) return [cp];
  const v = cp - 0x10000;
  return [0xd800 | (v >> 10), 0xdc00 | (v & 0x3ff)];
}

/** Windows-1252 differs from Latin-1 only in 0x80–0x9F; undefined slots become U+FFFD. */
const CP1252: Record<number, string> = {
  128: "€",
  130: "‚",
  131: "ƒ",
  132: "„",
  133: "…",
  134: "†",
  135: "‡",
  136: "ˆ",
  137: "‰",
  138: "Š",
  139: "‹",
  140: "Œ",
  142: "Ž",
  145: "‘",
  146: "’",
  147: "“",
  148: "”",
  149: "•",
  150: "–",
  151: "—",
  152: "˜",
  153: "™",
  154: "š",
  155: "›",
  156: "œ",
  158: "ž",
  159: "Ÿ",
};
export const cp1252 = (byte: number): string =>
  byte >= 0x80 && byte < 0xa0 ? (CP1252[byte] ?? "�") : String.fromCharCode(byte);

export const hex2 = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");
export const uplus = (cp: number) => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;

export function textRun(s: string) {
  const cps = codePoints(s);
  const chars = [...s];
  const u8 = cps.map(utf8);
  const u16 = cps.map(utf16);
  const bytes = u8.flat();
  return {
    chars,
    cps,
    u8,
    u16,
    bytes,
    utf8Len: bytes.length,
    utf16Units: u16.flat().length,
    ascii: cps.every((c) => c < 0x80),
    mojibake: bytes.map(cp1252).join(""),
  };
}
