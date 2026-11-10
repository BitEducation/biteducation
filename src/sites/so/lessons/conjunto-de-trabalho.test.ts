import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { lruFaults, workingSet } from "../../../sim/os/workingset.ts";
import lesson from "./conjunto-de-trabalho.ts";

describe("lesson conjunto-de-trabalho", () => {
  it("matches the hand calculations (docs/revisao/so-conjunto-de-trabalho.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      steady: 4,
      peak: 8,
      at3: 72,
      at4: 12,
      oneUse: 55,
      crashK: 7,
      crashUse: 17,
      admit: 6,
    });
    expectLabSweep(lesson, [{ quadros: 8 }, { quadros: 32 }]);
  });

  it("counts working sets and LRU faults", () => {
    expect(workingSet([1, 2, 1, 3], 2)).toEqual([1, 2, 2, 2]);
    expect(lruFaults([1, 2, 3, 1, 2, 3], 2)).toBe(6);
  });
});
