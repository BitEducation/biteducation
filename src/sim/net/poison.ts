import { prng } from "../shared/prng.ts";

/**
 * Off-path DNS cache poisoning as a probability race: a forged answer is accepted only if it
 * matches the 16-bit transaction ID (and the source port, when the resolver randomizes it) and
 * arrives before the genuine one. Pure arithmetic plus seeded draws; no packets are built.
 */
export const TXID_SPACE = 65536;
/** Linux's default ephemeral port range, 32768 to 60999. */
export const PORT_RANGE = 28232;

export const space = (randomPort: boolean) => TXID_SPACE * (randomPort ? PORT_RANGE : 1);

/** Chance one race succeeds when the attacker fits `guesses` distinct forged answers in the window. */
export const raceChance = (guesses: number, randomPort: boolean) => Math.min(1, guesses / space(randomPort));

/** Chance of at least one success in `k` independent races. */
export const cumulative = (p: number, k: number) => 1 - (1 - p) ** k;

/** Seeded number of races until the first success, or null if none within `cap`. */
export function racesUntil(p: number, seed: number, cap = 200000): number | null {
  const rand = prng(seed);
  for (let k = 1; k <= cap; k++) if (rand() < p) return k;
  return null;
}

/** One race in detail: the genuine ID and the attacker's consecutive guesses from a random start. */
export function oneRace(guesses: number, seed: number) {
  const rand = prng(seed);
  const real = Math.floor(rand() * TXID_SPACE);
  const start = Math.floor(rand() * TXID_SPACE);
  const tried = Array.from({ length: guesses }, (_, i) => (start + i) % TXID_SPACE);
  return { real, tried, hit: tried.includes(real) };
}
