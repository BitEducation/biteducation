import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import lesson from "./vliw.ts";

describe("lesson vliw", () => {
  it("matches the hand schedule (docs/revisao/arq-vliw.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ scalar: 10, bundles: 8, cycles: 8, nops: 16, branch: "8" });
    expectLabSweep(lesson, [
      { vias: 1, penalidade: 1 },
      { vias: 4, penalidade: 20 },
    ]);
  });
});
