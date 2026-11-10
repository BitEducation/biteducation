/**
 * Inter-process communication: a pipe as a bounded kernel buffer between a fast writer and a slow
 * reader, a priority message queue, and the copies each mechanism costs.
 */

export interface PipeTick {
  t: number;
  /** Chunk written this tick (1-based), if any. */
  wrote?: number;
  /** Chunk read this tick, if any. */
  read?: number;
  writerBlocked: boolean;
  readerBlocked: boolean;
  /** Writer closed its end this tick (it had nothing left to write). */
  closed?: boolean;
  /** The reader got 0 bytes: end of file. */
  eof?: boolean;
  level: number;
}

/**
 * The writer offers one chunk per tick and blocks when the buffer is full; the reader takes one
 * chunk every `readEvery` ticks and blocks when it is empty. Writer acts before reader each tick.
 */
export function pipeRun(chunks: number, capacity: number, readEvery: number): PipeTick[] {
  const out: PipeTick[] = [];
  const buf: number[] = [];
  let next = 1;
  let closed = false;
  for (let t = 1; t < 1000; t++) {
    const tick: PipeTick = { t, writerBlocked: false, readerBlocked: false, level: 0 };
    if (next <= chunks) {
      if (buf.length < capacity) {
        buf.push(next);
        tick.wrote = next++;
        if (next > chunks) {
          closed = true;
          tick.closed = true;
        }
      } else tick.writerBlocked = true;
    }
    if (t % readEvery === 0) {
      const c = buf.shift();
      if (c !== undefined) tick.read = c;
      else if (closed) tick.eof = true;
      else tick.readerBlocked = true;
    }
    tick.level = buf.length;
    out.push(tick);
    if (tick.eof) break;
  }
  return out;
}

export interface Message {
  text: string;
  prio: number;
}

/** A POSIX-style queue hands out the highest priority first, oldest first among equals. */
export function receiveOrder(sent: readonly Message[]): Message[] {
  return sent
    .map((m, i) => ({ m, i }))
    .sort((a, b) => b.m.prio - a.m.prio || a.i - b.i)
    .map((x) => x.m);
}

/** Bytes copied between user and kernel memory to move `bytes` from one process to another. */
export const copies = (mechanism: "pipe" | "fila" | "compartilhada", bytes: number) =>
  mechanism === "compartilhada" ? 0 : 2 * bytes;
