import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import lesson from "./smt.ts";

describe("lesson smt", () => {
  it("matches the hand trace (docs/revisao/arq-smt.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ single: 34, coarse: 25, fine: 23, smt: 20, smtUse: "40" });
    expectLabSweep(lesson, [
      { falta: 1, troca: 0 },
      { falta: 12, troca: 4 },
    ]);
  });
});
