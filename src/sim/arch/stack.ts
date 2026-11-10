/**
 * The call stack of a recursive factorial in RISC-V style: every call that is not the base case
 * pushes a 16-byte frame with the saved return address and argument, and the stack grows down.
 */
export const FRAME = 16;
export const SP0 = 0x8000;
/** Address of fact and of the instruction after the recursive jal inside it. */
export const FACT = 0x0200;
export const AFTER_INNER = FACT + 7 * 4;
/** Instruction after `jal ra, fact` in main. */
export const AFTER_MAIN = 0x0108;

export interface Frame {
  n: number;
  sp: number;
  ra: number;
  depth: number;
}

export type Event = { kind: "call"; frame: Frame } | { kind: "return"; frame: Frame; value: number };

/** Every activation of fact(n) allocates a frame (the base case too), as unoptimized code does. */
export function factTrace(n: number): { events: Event[]; frames: Frame[]; result: number; maxBytes: number } {
  const events: Event[] = [];
  const frames: Frame[] = [];
  let sp = SP0;
  const go = (k: number, ra: number, depth: number): number => {
    sp -= FRAME;
    const frame: Frame = { n: k, sp, ra, depth };
    frames.push(frame);
    events.push({ kind: "call", frame });
    const value = k <= 1 ? 1 : k * go(k - 1, AFTER_INNER, depth + 1);
    events.push({ kind: "return", frame, value });
    sp += FRAME;
    return value;
  };
  const result = go(n, AFTER_MAIN, 1);
  return { events, frames, result, maxBytes: frames.length * FRAME };
}

/** Calls that fit in a stack of `bytes` with fixed-size frames. */
export const maxDepth = (bytes: number, frame = FRAME) => Math.floor(bytes / frame);
