/**
 * Multilevel machine (SCO 1.1): one C statement followed down the levels — assembly, ISA
 * (binary words from the RV32I assembler), microarchitecture (multicycle steps per instruction)
 * and digital logic (gates of a ripple-carry adder for the add).
 */
import { assemble } from "./riscv.ts";

export const C_LINE = "x = a + b;";
export const ASM = ["lw t0, 0(a0)", "lw t1, 4(a0)", "add t2, t0, t1", "sw t2, 8(a0)"];

/** Multicycle datapath: fetch, decode/read registers, execute, memory, write back. */
const STEPS: Record<string, string[]> = {
  lw: ["busca", "decodifica", "calcula endereço", "lê memória", "escreve registrador"],
  sw: ["busca", "decodifica", "calcula endereço", "escreve memória"],
  add: ["busca", "decodifica", "soma na ULA", "escreve registrador"],
};

export function levels() {
  const lines = assemble(ASM.join("\n"));
  const micro = lines.map((l) => ({ op: l.ins.op, steps: STEPS[l.ins.op] ?? [] }));
  const cycles = micro.reduce((n, m) => n + m.steps.length, 0);
  // full adder = 2 XOR + 2 AND + 1 OR
  const adderGates = 32 * 5;
  return {
    words: lines.map((l) => l.word >>> 0),
    micro,
    cycles,
    bits: lines.length * 32,
    adderGates,
  };
}
