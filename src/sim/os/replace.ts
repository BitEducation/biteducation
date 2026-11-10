/**
 * Page replacement on a fixed reference string. Frames keep their slot, so a table of
 * slots × accesses reads like the textbook exercises.
 * Clock: a page gets R = 1 when loaded or referenced; on a fault the hand clears R = 1 pages and
 * evicts the first R = 0; empty frames are filled in order and the hand follows them.
 */
export type ReplAlgo = "fifo" | "opt" | "lru" | "clock";

export interface ReplStep {
  page: number;
  hit: boolean;
  /** Slot that received the page (on a fault) or held it (on a hit). */
  slot: number;
  frames: (number | null)[];
  /** Page evicted on this access, if any. */
  victim?: number;
  /** Clock only: R bits per slot after the access, and the hand position. */
  ref?: boolean[];
  hand?: number;
}

export interface ReplResult {
  steps: ReplStep[];
  faults: number;
  hits: number;
}

export function replace(refs: readonly number[], nframes: number, algo: ReplAlgo): ReplResult {
  const frames: (number | null)[] = Array.from({ length: nframes }, () => null);
  const loaded: number[] = Array.from({ length: nframes }, () => -1); // time of load (FIFO)
  const used: number[] = Array.from({ length: nframes }, () => -1); // time of last use (LRU)
  const ref: boolean[] = Array.from({ length: nframes }, () => false);
  let hand = 0;
  const steps: ReplStep[] = [];
  let faults = 0;

  refs.forEach((page, t) => {
    const at = frames.indexOf(page);
    if (at >= 0) {
      used[at] = t;
      ref[at] = true;
      steps.push({
        page,
        hit: true,
        slot: at,
        frames: [...frames],
        ...(algo === "clock" ? { ref: [...ref], hand } : {}),
      });
      return;
    }
    faults++;
    let slot = frames.indexOf(null);
    if (algo === "clock") {
      if (slot < 0 || slot !== hand) {
        if (slot >= 0) hand = slot;
        else {
          while (ref[hand]) {
            ref[hand] = false;
            hand = (hand + 1) % nframes;
          }
        }
      }
      slot = hand;
      hand = (hand + 1) % nframes;
    } else if (slot < 0) {
      if (algo === "fifo") slot = argMin(loaded);
      else if (algo === "lru") slot = argMin(used);
      else {
        // optimal: the page used farthest in the future (or never again)
        const next = frames.map((p) => {
          const k = refs.indexOf(p as number, t + 1);
          return k < 0 ? Number.POSITIVE_INFINITY : k;
        });
        slot = next.reduce((a, v, i) => (v > (next[a] as number) ? i : a), 0);
      }
    }
    const victim = frames[slot];
    frames[slot] = page;
    loaded[slot] = t;
    used[slot] = t;
    ref[slot] = true;
    steps.push({
      page,
      hit: false,
      slot,
      frames: [...frames],
      ...(victim !== null && victim !== undefined ? { victim } : {}),
      ...(algo === "clock" ? { ref: [...ref], hand } : {}),
    });
  });
  return { steps, faults, hits: refs.length - faults };
}

function argMin(xs: readonly number[]): number {
  return xs.reduce((a, v, i) => (v < (xs[a] as number) ? i : a), 0);
}
