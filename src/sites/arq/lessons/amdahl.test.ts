import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { amdahl, ceiling, dec, gustafson, times } from "../../../sim/arch/amdahl.ts";
import lesson from "./amdahl.ts";

describe("lesson amdahl", () => {
  it("matches the hand calculations (docs/revisao/arq-amdahl.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      total: 21.25,
      speedup: "4,71",
      efficiency: "58,8",
      ceiling: "10",
      at64: "8,77",
      scaled: "7,3",
    });
    expectLabSweep(lesson, [
      { paralela: 50, nucleos: 1 },
      { paralela: 99, nucleos: 64 },
      { paralela: 75, nucleos: 2 },
    ]);
  });

  it("follows the formulas", () => {
    expect(amdahl(0.9, 1)).toBe(1);
    expect(ceiling(0.5)).toBe(2);
    expect(gustafson(0.9, 8)).toBeCloseTo(7.3);
    expect(times(100, 0.9, 8).total).toBeCloseTo(21.25);
    expect(dec(4.70588)).toBe("4,71");
  });
});
