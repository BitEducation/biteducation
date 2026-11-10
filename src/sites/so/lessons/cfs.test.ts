import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import lesson from "./cfs.ts";

describe("lesson cfs", () => {
  it("matches the hand trace (docs/revisao/so-cfs.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      before: "7,7,2",
      atArrival: "6,11",
      longestMin: 1,
      longestZero: 7,
      editorMin: 12,
      editorZero: 10,
    });
  });

  it("nice changes the backup's share", () => {
    expectLabSweep(lesson, [{ nice: "-5" }, { nice: "0" }, { nice: "10" }]);
    const lo = String(lesson.build({ nice: "10" }).stats.before)
      .split(",")
      .map(Number);
    const hi = String(lesson.build({ nice: "-5" }).stats.before)
      .split(",")
      .map(Number);
    expect(lo[2]).toBeLessThan(hi[2] as number);
  });
});
