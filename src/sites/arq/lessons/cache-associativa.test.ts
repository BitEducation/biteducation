import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import lesson, { amatChain } from "./cache-associativa.ts";

describe("lesson cache-associativa", () => {
  it("matches the hand calculations (docs/revisao/arq-cache-associativa.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ direct: 1, two: 5, chosen: 8, amat: 3.48 });
    expectLabSweep(lesson, [
      { vias: "2", falhaL1: 2 },
      { vias: "8", falhaL1: 20 },
    ]);
  });

  it("average access time through the hierarchy", () => {
    expect(amatChain(0.1)).toBeCloseTo(3.48, 6);
    expect(amatChain(0)).toBe(1);
  });
});
