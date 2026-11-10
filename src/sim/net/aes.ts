/**
 * AES-128 (FIPS-197) encryption of one block, plus ECB, CBC, CTR and GCM (NIST SP 800-38D) built
 * on it. Pure and synchronous, for showing real ciphertext in lessons; checked against the
 * standard test vectors. Not constant-time and not meant to protect anything.
 */

const SBOX: number[] = (() => {
  const s = new Array<number>(256);
  let p = 1;
  let q = 1;
  // Walk the multiplicative group with generator 3 to build inverses, then apply the affine map.
  do {
    p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0);
    q ^= q << 1;
    q ^= q << 2;
    q ^= q << 4;
    q &= 0xff;
    if (q & 0x80) q ^= 0x09;
    const x = q ^ rotl8(q, 1) ^ rotl8(q, 2) ^ rotl8(q, 3) ^ rotl8(q, 4);
    s[p] = (x ^ 0x63) & 0xff;
  } while (p !== 1);
  s[0] = 0x63;
  return s;
})();

function rotl8(x: number, n: number) {
  return ((x << n) | (x >> (8 - n))) & 0xff;
}
const xtime = (x: number) => ((x << 1) ^ (x & 0x80 ? 0x1b : 0)) & 0xff;

export function expandKey(key: readonly number[]): number[][] {
  const w: number[][] = [];
  for (let i = 0; i < 4; i++) w.push(key.slice(4 * i, 4 * i + 4) as number[]);
  let rcon = 1;
  for (let i = 4; i < 44; i++) {
    let t = [...(w[i - 1] as number[])];
    if (i % 4 === 0) {
      t = [t[1], t[2], t[3], t[0]].map((x) => SBOX[x as number] as number);
      t[0] = (t[0] as number) ^ rcon;
      rcon = xtime(rcon);
    }
    w.push((w[i - 4] as number[]).map((x, j) => x ^ (t[j] as number)));
  }
  // 11 round keys of 16 bytes.
  return Array.from({ length: 11 }, (_, r) => w.slice(4 * r, 4 * r + 4).flat());
}

/** Encrypts one 16-byte block; also returns the state after each round, for display. */
export function aesBlock(key: readonly number[], block: readonly number[]) {
  const rk = expandKey(key);
  let s = block.map((x, i) => x ^ ((rk[0] as number[])[i] as number));
  const rounds: number[][] = [[...s]];
  for (let r = 1; r <= 10; r++) {
    s = s.map((x) => SBOX[x] as number);
    // ShiftRows on a column-major state.
    const t = [...s];
    for (let c = 0; c < 4; c++)
      for (let row = 0; row < 4; row++) s[4 * c + row] = t[4 * ((c + row) % 4) + row] as number;
    if (r < 10)
      for (let c = 0; c < 4; c++) {
        const [a0, a1, a2, a3] = s.slice(4 * c, 4 * c + 4) as [number, number, number, number];
        const all = a0 ^ a1 ^ a2 ^ a3;
        s[4 * c] = a0 ^ all ^ xtime(a0 ^ a1);
        s[4 * c + 1] = a1 ^ all ^ xtime(a1 ^ a2);
        s[4 * c + 2] = a2 ^ all ^ xtime(a2 ^ a3);
        s[4 * c + 3] = a3 ^ all ^ xtime(a3 ^ a0);
      }
    s = s.map((x, i) => x ^ ((rk[r] as number[])[i] as number));
    rounds.push([...s]);
  }
  return { out: s, rounds };
}

export const aes = (key: readonly number[], block: readonly number[]) => aesBlock(key, block).out;
const xor = (a: readonly number[], b: readonly number[]) => a.map((x, i) => x ^ (b[i] ?? 0));

export function ecb(key: number[], blocks: number[][]) {
  return blocks.map((b) => aes(key, b));
}

export function cbc(key: number[], iv: number[], blocks: number[][]) {
  let prev = iv;
  return blocks.map((b) => {
    prev = aes(key, xor(b, prev));
    return prev;
  });
}

function inc32(counter: number[]): number[] {
  const c = [...counter];
  for (let i = 15; i >= 12; i--) {
    c[i] = ((c[i] as number) + 1) & 0xff;
    if (c[i] !== 0) break;
  }
  return c;
}

export function ctr(key: number[], start: number[], data: number[]): number[] {
  const out: number[] = [];
  let cnt = start;
  for (let i = 0; i < data.length; i += 16) {
    const ks = aes(key, cnt);
    for (let j = 0; j < 16 && i + j < data.length; j++) out.push((data[i + j] as number) ^ (ks[j] as number));
    cnt = inc32(cnt);
  }
  return out;
}

const toBig = (b: readonly number[]) => b.reduce((a, x) => (a << 8n) | BigInt(x), 0n);
const fromBig = (v: bigint) =>
  Array.from({ length: 16 }, (_, i) => Number((v >> BigInt(8 * (15 - i))) & 0xffn));
const R = 0xe1n << 120n;

function gmul(x: bigint, y: bigint): bigint {
  let z = 0n;
  let v = y;
  for (let i = 127; i >= 0; i--) {
    if ((x >> BigInt(i)) & 1n) z ^= v;
    v = v & 1n ? (v >> 1n) ^ R : v >> 1n;
  }
  return z;
}

function ghash(h: number[], data: number[]): number[] {
  const H = toBig(h);
  let y = 0n;
  for (let i = 0; i < data.length; i += 16) {
    const blk = [...data.slice(i, i + 16)];
    while (blk.length < 16) blk.push(0);
    y = gmul(y ^ toBig(blk), H);
  }
  return fromBig(y);
}

/** AES-128-GCM with a 96-bit IV and no associated data. */
export function gcm(key: number[], iv: number[], plain: number[]) {
  const h = aes(key, Array(16).fill(0));
  const j0 = [...iv, 0, 0, 0, 1];
  const c = ctr(key, inc32(j0), plain);
  const tag = gcmTag(key, h, j0, c);
  return { c, tag };
}

function gcmTag(key: number[], h: number[], j0: number[], c: number[]) {
  const padded = [...c];
  while (padded.length % 16) padded.push(0);
  const bits = c.length * 8;
  const len = [...Array(8).fill(0), ...fromBig(BigInt(bits)).slice(8)];
  const s = ghash(h, [...padded, ...len]);
  return xor(aes(key, j0), s);
}

/** Recomputes the tag for a received ciphertext; false means it was changed in transit. */
export function gcmCheck(key: number[], iv: number[], c: number[], tag: number[]) {
  const h = aes(key, Array(16).fill(0));
  const j0 = [...iv, 0, 0, 0, 1];
  const t = gcmTag(key, h, j0, c);
  return { ok: t.every((x, i) => x === tag[i]), plain: ctr(key, inc32(j0), c) };
}

export const hexOf = (b: readonly number[]) => b.map((x) => x.toString(16).padStart(2, "0")).join("");
export const fromHex = (s: string) => (s.match(/../g) ?? []).map((x) => Number.parseInt(x, 16));
export const bitsDiff = (a: readonly number[], b: readonly number[]) =>
  a.reduce((n, x, i) => {
    let v = x ^ (b[i] ?? 0);
    let k = 0;
    while (v) {
      k += v & 1;
      v >>= 1;
    }
    return n + k;
  }, 0);
