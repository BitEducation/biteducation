/**
 * Three ways to move a block from a device controller to memory: busy waiting (programmed I/O),
 * one interrupt per word, and DMA with a single interrupt at the end. Times in microseconds.
 */
export const WORD = 4;
/** Saving context, running the handler and returning. */
export const INT_COST = 2;
/** Writing address, count and command into the DMA controller. */
export const DMA_SETUP = 5;

export type IoMode = "espera" | "interrupcao" | "dma";

export interface IoCost {
  words: number;
  /** How long the device takes to deliver the whole block. */
  transfer: number;
  /** CPU time spent on this transfer; null when interrupts arrive faster than they can be served. */
  cpu: number | null;
  share: number | null;
}

export function cost(mode: IoMode, bytes: number, interval: number): IoCost {
  const words = Math.ceil(bytes / WORD);
  const transfer = words * interval;
  let cpu: number | null;
  if (mode === "espera") cpu = transfer;
  else if (mode === "interrupcao") cpu = INT_COST < interval ? words * INT_COST : null;
  else cpu = DMA_SETUP + INT_COST;
  return { words, transfer, cpu, share: cpu === null ? null : cpu / transfer };
}

export interface Slice {
  from: number;
  to: number;
  item: "E/S" | "outro" | "int" | "prepara";
}

/** CPU timeline over the first `n` words, for drawing. */
export function timeline(mode: IoMode, interval: number, n: number): Slice[] {
  const end = n * interval;
  const out: Slice[] = [];
  const push = (from: number, to: number, item: Slice["item"]) => {
    if (to > from) out.push({ from, to: Math.min(to, end), item });
  };
  if (mode === "espera") push(0, end, "E/S");
  else if (mode === "dma") {
    push(0, DMA_SETUP, "prepara");
    push(DMA_SETUP, end, "outro");
  } else {
    let t = 0;
    for (let i = 1; i <= n && t < end; i++) {
      const arrive = i * interval;
      push(t, arrive, "outro");
      const start = Math.max(t, arrive);
      push(start, start + INT_COST, "int");
      t = start + INT_COST;
    }
  }
  return out.filter((s) => s.from < end);
}
