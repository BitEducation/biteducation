/**
 * The CPU performance equation: time = instructions × CPI × cycle time. A fixed instruction mix
 * runs on machine A (slower clock, cheaper instructions) and B (faster clock, deeper pipeline,
 * dearer instructions), compiled as is or with an optimizer that removes cheap ALU instructions.
 */

export type Klass = "alu" | "mem" | "desvio";
export const KLASSES: Klass[] = ["alu", "mem", "desvio"];
export const KLASS_LABEL: Record<Klass, string> = { alu: "aritméticas", mem: "memória", desvio: "desvios" };
/** Instructions per class, in millions. */
export const MIX: Record<"O0" | "O2", Record<Klass, number>> = {
  O0: { alu: 500, mem: 300, desvio: 200 },
  O2: { alu: 300, mem: 300, desvio: 200 },
};
export const MACHINES = {
  A: { mhz: 3000, cpi: { alu: 1, mem: 4, desvio: 2 } as Record<Klass, number> },
  B: { cpi: { alu: 1, mem: 5, desvio: 4 } as Record<Klass, number> },
};

export function perfRun(mhz: number, cpi: Record<Klass, number>, mix: Record<Klass, number>) {
  const instr = KLASSES.reduce((a, k) => a + mix[k], 0);
  const cycles = KLASSES.reduce((a, k) => a + mix[k] * cpi[k], 0);
  const avg = cycles / instr;
  // instr and cycles are in millions, so seconds = cycles / mhz.
  const seconds = cycles / mhz;
  return { instr, cycles, cpi: avg, seconds, mips: mhz / avg };
}
