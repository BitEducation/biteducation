import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { diverge, pixels, vectorOps } from "../../../sim/arch/simd.ts";
import lesson from "./simd-gpu.ts";

describe("lesson simd-gpu", () => {
  it("matches the hand calculations (docs/revisao/arq-simd-gpu.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      scalar: 18,
      vector: 5,
      tail: 2,
      mixed: 4,
      branchInstr: 9,
      util: "50%",
      sortedUtil: "90%",
    });
    expectLabSweep(lesson, [
      { pixels: 8, pistas: "4" },
      { pixels: 24, pistas: "8" },
      { pixels: 9, pistas: "8" },
    ]);
  });

  it("runs both paths only in mixed groups", () => {
    expect(pixels(4)).toEqual([11, 48, 85, 22]);
    expect(vectorOps(18, 4)).toBe(5);
    expect(diverge([60, 70, 80, 90], 4, 50)).toEqual({ paths: [1], instr: 1, util: 1 });
    expect(diverge([10, 70, 80, 90], 4, 50).instr).toBe(2);
  });
});
