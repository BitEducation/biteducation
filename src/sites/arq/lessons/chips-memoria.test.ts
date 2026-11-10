import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { layout, split } from "../../../sim/arch/memorg.ts";
import lesson from "./chips-memoria.ts";

describe("lesson chips-memoria", () => {
  it("matches the hand calculations (docs/revisao/arq-chips-memoria.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ chips: 32, perRank: 4, ranks: 8, rank: 5, row: 107, col: 457 });
    expectLabSweep(lesson, [{ organizacao: "x1" }, { organizacao: "x4" }]);
  });

  it("keeps 32 chips in every format", () => {
    const l = layout(2 ** 24, 32, 2 ** 22, { depth: 2 ** 22, width: 1 });
    expect(l).toMatchObject({ chips: 32, perRank: 32, ranks: 1, pins: 11 });
    expect(split(0xa35f26, l)).toEqual({ rank: 0, row: 1306, col: 1993, byte: 2 });
  });
});
