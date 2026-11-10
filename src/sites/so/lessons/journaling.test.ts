import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { outcome, recover, writesFor } from "../../../sim/os/journal.ts";
import lesson from "./journaling.ts";

describe("lesson journaling", () => {
  it("matches the hand calculations (docs/revisao/so-journaling.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      partial: 6,
      bad: 3,
      warn: 2,
      fsckMin: "5,2",
      action: "discard",
      full: 134,
      ordered: 70,
    });
    expectLabSweep(lesson, [
      { queda: 0, blocos: 1, disco: 1 },
      { queda: 5, blocos: 256, disco: 20 },
      { queda: 8, blocos: 2, disco: 4 },
      { queda: 7, blocos: 100, disco: 9 },
    ]);
  });

  it("classifies partial writes and recovery", () => {
    expect(outcome(["D"]).severity).toBe("ok");
    expect(outcome(["B"])).toMatchObject({ leak: true, severity: "warn" });
    expect(outcome(["B", "I"])).toMatchObject({ garbage: true, doubleUse: false, severity: "bad" });
    expect([0, 4, 5, 7, 8].map(recover)).toEqual(["nothing", "discard", "replay", "replay", "clean"]);
    expect(writesFor(1)).toEqual({ plain: 3, full: 8, ordered: 7 });
  });
});
