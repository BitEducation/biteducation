import { describe, expect, it } from "vitest";
import { expectDeterministic, expectTiles } from "../../../../tests/lesson-checks.ts";
import { holes } from "../../../sim/os/partitions.ts";
import lesson from "./alocacao-particoes.ts";

describe("lesson alocacao-particoes", () => {
  it("matches the hand placement (docs/revisao/so-alocacao-particoes.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      firstFails: "J",
      nextFails: "I,J",
      bestFails: "J",
      worstFails: "I,J",
      worstLargest: 56,
      bestHoles: 1,
    });
  });

  it("finds holes", () => {
    expect(holes(["A", "", "", "B", ""])).toEqual([
      { start: 1, size: 2 },
      { start: 4, size: 1 },
    ]);
  });
});
