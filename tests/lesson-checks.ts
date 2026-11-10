import { expect } from "vitest";
import type { LessonModule, LessonRun } from "../src/contracts/types.ts";

/** Steps must tile the trace: contiguous, non-empty, covering every event. */
export function expectTiles(run: LessonRun) {
  let at = 0;
  for (const s of run.steps) {
    expect(s.events[0]).toBe(at);
    expect(s.events[1]).toBeGreaterThan(s.events[0]);
    at = s.events[1];
  }
  expect(at).toBe(run.trace.length);
  for (const s of run.steps) expect(s.id).toMatch(/^s\d+-[a-z0-9-]+$/);
  expect(new Set(run.steps.map((s) => s.id)).size).toBe(run.steps.length);
}

export function expectDeterministic(lesson: LessonModule, params = lesson.params.defaults) {
  expect(JSON.stringify(lesson.build(params))).toBe(JSON.stringify(lesson.build(params)));
}

/** Every frame referenced by an event exists, and every layer/field range is inside the data. */
export function expectFramesValid(run: LessonRun) {
  for (const e of run.trace) if (e.frame) expect(run.frames[e.frame], `frame ${e.frame}`).toBeDefined();
  for (const f of Object.values(run.frames)) {
    const walk = (fs: { from?: number; to?: number; children?: unknown[] }[]) => {
      for (const x of fs) {
        if (x.from !== undefined) expect(x.from).toBeGreaterThanOrEqual(0);
        if (x.to !== undefined) expect(x.to).toBeLessThanOrEqual(f.data.length);
        if (x.children) walk(x.children as typeof fs);
      }
    };
    for (const l of f.layers) {
      expect(l.to).toBeLessThanOrEqual(f.data.length);
      walk(l.fields);
    }
  }
}

/** Builds every parameter combination given and checks each run still tiles. */
export function expectLabSweep(lesson: LessonModule, variants: Record<string, unknown>[]) {
  for (const v of variants) {
    const run = lesson.build({ ...lesson.params.defaults, ...v } as LessonModule["params"]["defaults"]);
    expectTiles(run);
    expectFramesValid(run);
  }
}
