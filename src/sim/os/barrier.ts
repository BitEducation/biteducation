/**
 * Barriers (MOS 2.3.9; Maziero, mecanismos de coordenação): n threads compute in phases, and in
 * each phase a thread reads what its right-hand neighbour produced in the previous phase.
 * Without a barrier every thread runs ahead; with one, a phase starts only when all finished.
 */

export interface Span {
  thread: number;
  phase: number;
  from: number;
  to: number;
}

export function free(work: number[][]): { spans: Span[]; stale: { thread: number; phase: number }[] } {
  const spans: Span[] = [];
  work.forEach((phases, t) => {
    let at = 0;
    phases.forEach((d, k) => {
      spans.push({ thread: t, phase: k, from: at, to: at + d });
      at += d;
    });
  });
  const end = (t: number, k: number) => (spans.find((s) => s.thread === t && s.phase === k) as Span).to;
  const start = (t: number, k: number) => (spans.find((s) => s.thread === t && s.phase === k) as Span).from;
  const n = work.length;
  const phases = (work[0] as number[]).length;
  const stale: { thread: number; phase: number }[] = [];
  for (let k = 1; k < phases; k++)
    for (let t = 0; t < n; t++)
      if (end((t + 1) % n, k - 1) > start(t, k)) stale.push({ thread: t, phase: k });
  return { spans, stale };
}

export function withBarrier(work: number[][]) {
  const spans: Span[] = [];
  const waits: { thread: number; phase: number; from: number; to: number }[] = [];
  const phases = (work[0] as number[]).length;
  let at = 0;
  const ends: number[] = [];
  for (let k = 0; k < phases; k++) {
    const len = Math.max(...work.map((w) => w[k] as number));
    work.forEach((w, t) => {
      const d = w[k] as number;
      spans.push({ thread: t, phase: k, from: at, to: at + d });
      if (d < len) waits.push({ thread: t, phase: k, from: at + d, to: at + len });
    });
    at += len;
    ends.push(at);
  }
  const waited = waits.reduce((s, w) => s + w.to - w.from, 0);
  return { spans, waits, ends, total: at, waited, busy: work.flat().reduce((a, x) => a + x, 0) };
}
