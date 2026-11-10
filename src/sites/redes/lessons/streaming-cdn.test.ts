import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { originGbps, pick, play, startup } from "../../../sim/net/streaming.ts";
import lesson from "./streaming-cdn.ts";

describe("lesson streaming-cdn", () => {
  it("matches the hand calculations (docs/revisao/redes-streaming-cdn.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      far: "1,11",
      near: "0,78",
      top: 6,
      fixedStalls: 7,
      abrStalls: 1,
      afterRate: 1.5,
      origin: "60/3",
    });
    expectLabSweep(lesson, [
      { banda: 1, queda: 0 },
      { banda: 50, queda: 90 },
      { banda: 3, queda: 50 },
    ]);
  });

  it("picks rungs and plays segments", () => {
    expect(pick(8)).toBe(6);
    expect(pick(2)).toBe(1.5);
    expect(pick(0.3)).toBe(0.5);
    expect(startup(120, 8, 1.5).total).toBeCloseTo(1.11);
    expect(play(12, 8, 8, 5, false).stalls).toBe(0);
    expect(originGbps(10_000, 6, 0.95)).toBeCloseTo(3);
  });
});
