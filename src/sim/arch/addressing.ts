/**
 * Addressing modes on a tiny word-addressed memory: where the operand of `load r1, ...` comes from
 * and how many memory reads it costs beyond fetching the instruction.
 */
export const BASE = 100;
export const STEP = 4;
/** Word at 104 holds an address (120), so the indirect mode has something to follow. */
export const MEMORY = [7, 120, 42, 5, 116, 13, 8, 99] as const;
export const POINTER = 104;
export const LAST = BASE + STEP * (MEMORY.length - 1);

export const read = (addr: number): number => {
  const i = (addr - BASE) / STEP;
  const v = MEMORY[i];
  if (v === undefined || !Number.isInteger(i)) throw new Error(`no word at ${addr}`);
  return v;
};

export type Mode =
  | "imediato"
  | "direto"
  | "registrador"
  | "indireto-registrador"
  | "base-deslocamento"
  | "indireto";

export interface Operand {
  mode: Mode;
  syntax: string;
  /** Where the value came from, in words. */
  path: string;
  value: number;
  reads: number;
}

export function operand(mode: Mode, r2: number, disp: number): Operand {
  switch (mode) {
    case "imediato":
      return { mode, syntax: `load r1, #${POINTER}`, path: "o próprio campo", value: POINTER, reads: 0 };
    case "direto":
      return { mode, syntax: `load r1, ${POINTER}`, path: `M[${POINTER}]`, value: read(POINTER), reads: 1 };
    case "registrador":
      return { mode, syntax: "load r1, r2", path: "r2", value: r2, reads: 0 };
    case "indireto-registrador":
      return { mode, syntax: "load r1, (r2)", path: `M[r2] = M[${r2}]`, value: read(r2), reads: 1 };
    case "base-deslocamento":
      return {
        mode,
        syntax: `load r1, ${disp}(r2)`,
        path: `M[r2 + ${disp}] = M[${r2 + disp}]`,
        value: read(r2 + disp),
        reads: 1,
      };
    case "indireto": {
      const mid = read(POINTER);
      return {
        mode,
        syntax: `load r1, @${POINTER}`,
        path: `M[M[${POINTER}]] = M[${mid}]`,
        value: read(mid),
        reads: 2,
      };
    }
  }
}

/** Walks `count` words from r2 with base + displacement, displacement growing by one word. */
export function walk(r2: number, count: number) {
  let sum = 0;
  return Array.from({ length: count }, (_, i) => {
    const addr = r2 + i * STEP;
    const value = read(addr);
    sum += value;
    return { i, disp: i * STEP, addr, value, sum };
  });
}
