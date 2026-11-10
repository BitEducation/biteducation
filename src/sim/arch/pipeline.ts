/**
 * Classic in-order 5-stage pipeline timing: IF ID EX MEM WB.
 * The register file is written in the first half of WB and read in the second half of ID.
 * Without forwarding a dependent instruction waits in ID until the producer's WB;
 * with forwarding it only waits for a load's MEM (load-use hazard, one bubble).
 * Branches are not modelled here (lesson "predicao-desvio").
 */
export const STAGES = ["IF", "ID", "EX", "MEM", "WB"] as const;

export interface PipeInstr {
  label: string;
  rd?: number;
  srcs: number[];
  isLoad?: boolean;
}

export interface PipeTiming {
  label: string;
  /** Cycle numbers (1-based). id is the first cycle in ID; idEnd the last (> id when stalled). */
  if: number;
  id: number;
  idEnd: number;
  ex: number;
  mem: number;
  wb: number;
  stalls: number;
  /** Producer index that caused the stall, if any. */
  waitedFor: number | null;
}

export interface PipeResult {
  timings: PipeTiming[];
  cycles: number;
  bubbles: number;
  cpi: number;
  /** cycle -> stage contents (instruction label, "bolha" or null). */
  grid: (string | null)[][];
}

export function runPipeline(prog: readonly PipeInstr[], forwarding: boolean): PipeResult {
  if (prog.length === 0) throw new Error("Programa vazio");
  const t: PipeTiming[] = [];
  prog.forEach((ins, i) => {
    const prev = t[i - 1];
    const f = prev ? prev.id : 1;
    const idStart = prev ? Math.max(f + 1, prev.idEnd + 1) : 2;
    let need = idStart;
    let waitedFor: number | null = null;
    for (const src of ins.srcs) {
      if (src === 0) continue;
      // most recent earlier producer of this register
      for (let j = i - 1; j >= 0; j--) {
        const p = prog[j] as PipeInstr;
        if (p.rd !== src) continue;
        const pt = t[j] as PipeTiming;
        const ready = forwarding ? (p.isLoad ? pt.mem : pt.ex) : pt.wb;
        if (ready > need) {
          need = ready;
          waitedFor = j;
        }
        break;
      }
    }
    const idEnd = need;
    const ex = idEnd + 1;
    t.push({
      label: ins.label,
      if: f,
      id: idStart,
      idEnd,
      ex,
      mem: ex + 1,
      wb: ex + 2,
      stalls: idEnd - idStart,
      waitedFor,
    });
  });
  const cycles = (t[t.length - 1] as PipeTiming).wb;
  const grid: (string | null)[][] = Array.from({ length: cycles + 1 }, () => [null, null, null, null, null]);
  for (const x of t) {
    for (let c = x.if; c < x.id; c++) (grid[c] as (string | null)[])[0] = x.label;
    for (let c = x.id; c <= x.idEnd; c++) (grid[c] as (string | null)[])[1] = x.label;
    (grid[x.ex] as (string | null)[])[2] = x.label;
    (grid[x.mem] as (string | null)[])[3] = x.label;
    (grid[x.wb] as (string | null)[])[4] = x.label;
  }
  // bubbles travel down EX, MEM and WB after each stall cycle
  let bubbles = 0;
  for (const x of t)
    for (let k = 0; k < x.stalls; k++) {
      bubbles++;
      const c = x.id + 1 + k;
      for (let s = 2; s < 5; s++) {
        const row = grid[c + s - 2];
        if (row && row[s] === null) row[s] = "bolha";
      }
    }
  return { timings: t, cycles, bubbles, cpi: cycles / prog.length, grid };
}
