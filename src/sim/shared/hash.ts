/** SHA-1 (FIPS 180-4) and Base64, pure and synchronous, for protocol examples (WebSocket). */
export function sha1(bytes: readonly number[]): number[] {
  const ml = bytes.length * 8;
  const msg = [...bytes, 0x80];
  while (msg.length % 64 !== 56) msg.push(0);
  const hi = Math.floor(ml / 2 ** 32);
  for (const v of [hi, ml >>> 0]) msg.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
  let [h0, h1, h2, h3, h4] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const rol = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0;
  for (let i = 0; i < msg.length; i += 64) {
    const w: number[] = [];
    for (let j = 0; j < 16; j++)
      w[j] =
        (((msg[i + 4 * j] ?? 0) << 24) |
          ((msg[i + 4 * j + 1] ?? 0) << 16) |
          ((msg[i + 4 * j + 2] ?? 0) << 8) |
          (msg[i + 4 * j + 3] ?? 0)) >>>
        0;
    for (let j = 16; j < 80; j++)
      w[j] = rol(((w[j - 3] ?? 0) ^ (w[j - 8] ?? 0) ^ (w[j - 14] ?? 0) ^ (w[j - 16] ?? 0)) >>> 0, 1);
    let [a, b, c, d, e] = [h0, h1, h2, h3, h4];
    for (let j = 0; j < 80; j++) {
      const [f, k] =
        j < 20
          ? [(b & c) | (~b & d), 0x5a827999]
          : j < 40
            ? [b ^ c ^ d, 0x6ed9eba1]
            : j < 60
              ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc]
              : [b ^ c ^ d, 0xca62c1d6];
      const t = (rol(a, 5) + (f >>> 0) + e + k + (w[j] ?? 0)) >>> 0;
      e = d;
      d = c;
      c = rol(b, 30);
      b = a;
      a = t;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].flatMap((h) => [
    (h >>> 24) & 0xff,
    (h >>> 16) & 0xff,
    (h >>> 8) & 0xff,
    h & 0xff,
  ]);
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function base64(bytes: readonly number[]): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >>> 18) & 63];
    out += B64[(n >>> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >>> 6) & 63] : "=";
    out += i + 2 < bytes.length ? B64[n & 63] : "=";
  }
  return out;
}

export const textBytes = (s: string) => [...new TextEncoder().encode(s)];
