/**
 * Physical-layer limits and line codes: Nyquist's noiseless bound 2B log2 V, Shannon's capacity
 * B log2(1 + S/N), and how NRZ, NRZI, Manchester and 4B/5B put bits on a wire.
 */
export const nyquist = (bandHz: number, levels: number) => 2 * bandHz * Math.log2(levels);
export const snrLinear = (db: number) => 10 ** (db / 10);
export const shannon = (bandHz: number, db: number) => bandHz * Math.log2(1 + snrLinear(db));

/** Levels beyond which Nyquist would exceed Shannon: sqrt(1 + S/N). */
export const usefulLevels = (db: number) => Math.sqrt(1 + snrLinear(db));

export type Level = 0 | 1;

/** Two half-bit levels per bit, so every code can be drawn on the same grid. */
export function nrz(bits: Level[]): Level[] {
  return bits.flatMap((b) => [b, b]);
}

/** A 1 toggles the level, a 0 keeps it; starts low. */
export function nrzi(bits: Level[]): Level[] {
  let level: Level = 0;
  return bits.flatMap((b) => {
    if (b) level = level ? 0 : 1;
    return [level, level];
  });
}

/** IEEE 802.3: 0 is high then low, 1 is low then high; a transition in every bit. */
export function manchester(bits: Level[]): Level[] {
  return bits.flatMap((b): Level[] => (b ? [0, 1] : [1, 0]));
}

/** Longest stretch of half-bits without a level change. */
export function longestFlat(levels: Level[]): number {
  let best = 0;
  let run = 0;
  levels.forEach((l, i) => {
    run = i > 0 && l === levels[i - 1] ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

export const FOUR_B_FIVE_B: Record<string, string> = {
  "0000": "11110",
  "0001": "01001",
  "0010": "10100",
  "0011": "10101",
  "0100": "01010",
  "0101": "01011",
  "0110": "01110",
  "0111": "01111",
  "1000": "10010",
  "1001": "10011",
  "1010": "10110",
  "1011": "10111",
  "1100": "11010",
  "1101": "11011",
  "1110": "11100",
  "1111": "11101",
};

/** Longest run of zeros inside a bit string. */
export const zeroRun = (s: string) => Math.max(0, ...s.split("1").map((z) => z.length));
