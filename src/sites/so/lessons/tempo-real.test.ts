import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { rmsBound, rtRun } from "../../../sim/os/realtime.ts";
import lesson from "./tempo-real.ts";

describe("lesson tempo-real", () => {
  it("matches the hand calculations (docs/revisao/so-tempo-real.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ u: 0.971, rmsMisses: 1, edfMisses: 0, firstMiss: 7 });
    expectLabSweep(lesson, [{ custo2: 1 }, { custo2: 3 }, { custo2: 5 }]);
  });

  it("schedules and bound", () => {
    expect(rmsBound(2)).toBeCloseTo(0.8284, 4);
    const ts = [
      { name: "T1", c: 2, p: 5 },
      { name: "T2", c: 4, p: 7 },
    ];
    expect(rtRun(ts, "rms", 7).slices).toEqual([
      { task: "T1", from: 0, to: 2 },
      { task: "T2", from: 2, to: 5 },
      { task: "T1", from: 5, to: 7 },
    ]);
    expect(rtRun(ts, "edf", 8).slices.slice(0, 3)).toEqual([
      { task: "T1", from: 0, to: 2 },
      { task: "T2", from: 2, to: 6 },
      { task: "T1", from: 6, to: 8 },
    ]);
  });
});
