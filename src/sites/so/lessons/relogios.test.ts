import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import lesson from "./relogios.ts";

describe("lesson relogios", () => {
  it("matches the hand calculations (docs/revisao/so-relogios.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ holding: 4773, deltas: "5,3,4,1,0", late: 4, worst: 3, cost: "0,05" });
    expectLabSweep(lesson, [{ hz: "100" }, { hz: "1000" }]);
  });
});
