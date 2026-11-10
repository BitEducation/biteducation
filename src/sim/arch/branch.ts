/** Branch predictors over a sequence of outcomes (true = taken). */

export type Predictor = "taken" | "1bit" | "2bit";

export interface Guess {
  pred: boolean;
  actual: boolean;
  hit: boolean;
  /** Predictor state before this branch: 0/1 for 1-bit, 0..3 for 2-bit. */
  state: number;
}

export interface PredResult {
  guesses: Guess[];
  misses: number;
}

/**
 * Runs one predictor for one branch. 1-bit remembers the last outcome; 2-bit is a saturating
 * counter (0, 1 predict not taken; 2, 3 predict taken). Both start at "weakly not taken".
 */
export function predict(
  outcomes: readonly boolean[],
  kind: Predictor,
  start = kind === "2bit" ? 1 : 0,
): PredResult {
  let st = start;
  const guesses: Guess[] = [];
  for (const actual of outcomes) {
    const pred = kind === "taken" ? true : kind === "1bit" ? st === 1 : st >= 2;
    guesses.push({ pred, actual, hit: pred === actual, state: st });
    if (kind === "1bit") st = actual ? 1 : 0;
    else if (kind === "2bit") st = actual ? Math.min(3, st + 1) : Math.max(0, st - 1);
  }
  return { guesses, misses: guesses.filter((g) => !g.hit).length };
}

/** Outcomes of the backward branch of a loop that runs `iters` times, entered `reps` times. */
export function loopOutcomes(iters: number, reps: number): boolean[] {
  const out: boolean[] = [];
  for (let r = 0; r < reps; r++) for (let i = 0; i < iters; i++) out.push(i < iters - 1);
  return out;
}
