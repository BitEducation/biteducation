import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { handoverRun, reuse } from "../../../sim/net/cellular.ts";
import lesson from "./celular.ts";

describe("lesson celular", () => {
  it("matches the hand calculations (docs/revisao/redes-celular.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toMatchObject({ perCell: 60, city: 5040, handovers: 1, pingPong: 3 });
    expectLabSweep(lesson, [
      { cluster: "3", histerese: 0 },
      { cluster: "4", histerese: 12 },
    ]);
  });

  it("reuse and hysteresis", () => {
    expect(reuse(3)).toEqual({ perCell: 140, city: 11760 });
    expect(handoverRun(0).count).toBe(3);
    expect(handoverRun(3).switches).toEqual([{ x: 12, to: "B" }]);
  });
});
