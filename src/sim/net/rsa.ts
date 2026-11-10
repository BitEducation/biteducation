/**
 * RSA with toy primes: key generation (n, phi, e, d by the extended Euclid algorithm), encryption
 * with the public key, decryption and signatures with the private one, a toy hash for signing, and
 * factoring n by trial division to show why size matters.
 */
import { modpow } from "./dh.ts";

export const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Modular inverse of e mod m, by the extended Euclid algorithm. */
export function inverse(e: number, m: number): number {
  let [r0, r1] = [m, e];
  let [t0, t1] = [0, 1];
  while (r1 !== 0) {
    const q = Math.floor(r0 / r1);
    [r0, r1] = [r1, r0 - q * r1];
    [t0, t1] = [t1, t0 - q * t1];
  }
  return ((t0 % m) + m) % m;
}

export function keys(p: number, q: number) {
  const n = p * q;
  const phi = (p - 1) * (q - 1);
  const e = [3, 5, 7, 11, 13, 17].find((x) => gcd(x, phi) === 1) ?? 3;
  const d = inverse(e, phi);
  return { p, q, n, phi, e, d };
}

export const encrypt = (m: number, e: number, n: number) => modpow(m, e, n);
export const decrypt = (c: number, d: number, n: number) => modpow(c, d, n);

/** Toy digest: sum of the character codes, reduced mod n. Real hashes are SHA-256 and similar. */
export const toyHash = (text: string, n: number) => [...text].reduce((s, ch) => s + ch.charCodeAt(0), 0) % n;

/** Smallest factor of n by trying 2, 3, 4, ...; returns it and how many divisions it took. */
export function factor(n: number) {
  for (let k = 2; k * k <= n; k++) if (n % k === 0) return { factor: k, tries: k - 1 };
  return { factor: n, tries: Math.floor(Math.sqrt(n)) - 1 };
}
