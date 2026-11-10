/**
 * Diffie-Hellman with toy numbers: public prime p and generator g, secret exponents, the shared
 * key, the eavesdropper's brute-force discrete log, and an active middle that runs two exchanges.
 */
export const P = 23;
export const G = 5;

/** Square-and-multiply, exact for these small numbers. */
export function modpow(base: number, exp: number, mod: number): number {
  let result = 1;
  let b = base % mod;
  let e = exp;
  while (e > 0) {
    if (e & 1) result = (result * b) % mod;
    b = (b * b) % mod;
    e >>= 1;
  }
  return result;
}

export const share = (secret: number, p = P, g = G) => modpow(g, secret, p);
export const shared = (other: number, secret: number, p = P) => modpow(other, secret, p);

/** Tries x = 1, 2, ... until g^x = target; returns the exponent and how many tries it took. */
export function discreteLog(target: number, p = P, g = G) {
  for (let x = 1; x < p; x++) if (modpow(g, x, p) === target) return { x, tries: x };
  return { x: null, tries: p - 1 };
}

/** Powers g^1 .. g^(p-1) mod p: a generator visits every nonzero value once. */
export const powers = (p = P, g = G) => Array.from({ length: p - 1 }, (_, i) => modpow(g, i + 1, p));
