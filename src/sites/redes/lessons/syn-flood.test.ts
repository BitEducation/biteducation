import { describe, expect, it } from "vitest";
import { expectDeterministic, expectFramesValid, expectTiles } from "../../../../tests/lesson-checks.ts";
import lesson from "./syn-flood.ts";

describe("lesson syn-flood", () => {
  const run = lesson.build(lesson.params.defaults);
  it("matches the hand-worked numbers", () => {
    expect(run.stats).toMatchObject({ liaOk: 1, liaRefused: 1, max: 8 });
    expect(run.steps.map((s) => s.id)).toEqual([
      "s1-normal",
      "s2-rajada",
      "s3-recusa",
      "s4-sinais",
      "s5-cookies",
      "s6-entra",
    ]);
    const q = run.steps[2]?.quiz;
    expect(q?.kind === "choice" && q.answer).toBe(1);
    expect(run.steps.some((s) => s.tags?.includes("signals"))).toBe(true);
    expect(run.steps.some((s) => s.tags?.includes("defense"))).toBe(true);
    expectTiles(run);
    expectFramesValid(run);
    expectDeterministic(lesson);
  });
  it("the queue never holds more than its capacity and Lia gets in with cookies", () => {
    let size = 0;
    let max = 0;
    for (const e of run.trace) {
      if (e.kind === "enqueue") size++;
      if (e.kind === "dequeue") size--;
      max = Math.max(max, size);
      expect(size).toBeGreaterThanOrEqual(0);
    }
    expect(max).toBe(8);
    const last = run.steps[5];
    expect(
      run.trace
        .slice(last?.events[0], last?.events[1])
        .some((e) => e.kind === "state" && e.text === "ESTABLISHED"),
    ).toBe(true);
  });
  it("lab extremes build", () => {
    for (const taxa of [1, 40])
      for (const fila of [4, 32])
        for (const cookies of [false, true]) {
          const r = lesson.build({ taxa, fila, cookies });
          expectTiles(r);
          if (cookies) expect(r.stats.liaRefused).toBe(0);
        }
  });
});
