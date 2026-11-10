/**
 * Polling against interrupts on one CPU over a fixed window. The device becomes ready at fixed
 * ticks. Polling checks every `period` ticks (1 tick per check) and handles what it finds;
 * interrupts let the current instruction finish, then save state, run the handler and restore.
 */

export const HORIZON = 100;
export const EVENTS = [13, 41, 77];
export const CHECK = 1;
export const HANDLE = 2;
/** Saving and restoring the context around an interrupt handler, one tick each. */
export const SAVE = 1;

export type SliceKind = "programa" | "consulta" | "tratamento" | "contexto";
export interface Slice {
  kind: SliceKind;
  from: number;
  to: number;
}

function fill(busy: Slice[], horizon: number): Slice[] {
  const out: Slice[] = [];
  let t = 0;
  for (const s of busy.sort((a, b) => a.from - b.from)) {
    if (s.from > t) out.push({ kind: "programa", from: t, to: s.from });
    out.push(s);
    t = s.to;
  }
  if (t < horizon) out.push({ kind: "programa", from: t, to: horizon });
  return out;
}

export function pollRun(period: number, events = EVENTS, horizon = HORIZON) {
  const busy: Slice[] = [];
  const latency: number[] = [];
  let checks = 0;
  let wasted = 0;
  let next = 0;
  for (let t = 0; t < horizon; t += period) {
    if (t < next) continue;
    checks++;
    busy.push({ kind: "consulta", from: t, to: t + CHECK });
    // Everything that became ready since the last look and is still waiting.
    const ready = events.slice(latency.length).filter((e) => e <= t);
    if (ready.length === 0) {
      wasted++;
      next = t + CHECK;
      continue;
    }
    let at = t + CHECK;
    for (const e of ready) {
      latency.push(at - e);
      busy.push({ kind: "tratamento", from: at, to: at + HANDLE });
      at += HANDLE;
    }
    next = at;
  }
  const overhead = busy.reduce((a, s) => a + (s.to - s.from), 0);
  return { slices: fill(busy, horizon), checks, wasted, latency, overhead, handled: latency.length };
}

export function irqRun(events = EVENTS, horizon = HORIZON) {
  const busy: Slice[] = [];
  const latency: number[] = [];
  for (const e of events) {
    // The instruction in progress finishes first: one tick.
    const at = e + 1;
    latency.push(at - e);
    busy.push({ kind: "contexto", from: at, to: at + SAVE });
    busy.push({ kind: "tratamento", from: at + SAVE, to: at + SAVE + HANDLE });
    busy.push({ kind: "contexto", from: at + SAVE + HANDLE, to: at + 2 * SAVE + HANDLE });
  }
  const overhead = busy.reduce((a, s) => a + (s.to - s.from), 0);
  return { slices: fill(busy, horizon), latency, overhead, handled: latency.length };
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0);
