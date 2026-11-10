import { sha1, textBytes } from "../shared/hash.ts";
import { prng, randInt } from "../shared/prng.ts";

/**
 * Password storage, from plaintext to salted slow hashes. Hashes are real SHA-1, cut to 8 hex
 * digits so they fit on screen. The attack is counted, not performed: how many guesses match a
 * stolen table, and how long a large guess list takes at a given hash rate and cost.
 */

export const USERS: { name: string; pw: string }[] = [
  { name: "ana", pw: "sol2024" },
  { name: "bia", pw: "123456" },
  { name: "caio", pw: "123456" },
  { name: "duda", pw: "lagarto-azul-mesa-9" },
];
/** A tiny list of common passwords, like the ones published after real leaks. */
export const COMMON = ["123456", "senha", "qwerty", "sol2024", "admin"];
/** Guesses per second for a fast hash on one GPU: an order of magnitude, for the comparison. */
export const FAST_RATE = 1e9;
export const BIG_LIST = 1e7;

const hex = (bytes: number[]) => bytes.map((x) => x.toString(16).padStart(2, "0")).join("");
export const h8 = (s: string) => hex(sha1(textBytes(s))).slice(0, 8);

export function salts(seed = 7): string[] {
  const r = prng(seed);
  return USERS.map(() =>
    Array.from({ length: 4 }, () => randInt(r, 0, 255).toString(16).padStart(2, "0")).join(""),
  );
}

export function passwordsRun(cost: number) {
  const ss = salts();
  const plain = USERS.map((u) => ({ ...u, hash: h8(u.pw) }));
  const salted = USERS.map((u, i) => ({ ...u, salt: ss[i] ?? "", hash: h8(`${ss[i]}${u.pw}`) }));
  const table = new Map(COMMON.map((w) => [h8(w), w]));
  const crackedPlain = plain.filter((u) => table.has(u.hash)).map((u) => u.name);
  // With salt the precomputed table finds nothing; each user needs its own guesses.
  const crackedTable = salted.filter((u) => table.has(u.hash)).map((u) => u.name);
  const perUser = salted.filter((u) => COMMON.some((w) => h8(`${u.salt}${w}`) === u.hash)).map((u) => u.name);
  const iterations = 2 ** cost;
  const hashes = BIG_LIST * USERS.length;
  return {
    plain,
    salted,
    crackedPlain,
    crackedTable,
    perUser,
    guessesSalted: COMMON.length * USERS.length,
    iterations,
    /** Seconds to try BIG_LIST guesses against every salted user. */
    seconds: (hashes * iterations) / FAST_RATE,
  };
}

/** "0,04 s", "11 min", "7,6 dias", "21 anos": the unit a person would use. */
export function human(sec: number): string {
  const n = (x: number) => String(Number(x.toFixed(x < 10 ? 1 : 0))).replace(".", ",");
  if (sec < 60) return `${String(Number(sec.toFixed(2))).replace(".", ",")} s`;
  if (sec < 3600) return `${n(sec / 60)} min`;
  if (sec < 86400) return `${n(sec / 3600)} h`;
  if (sec < 86400 * 365) return `${n(sec / 86400)} dias`;
  return `${n(sec / (86400 * 365))} anos`;
}
