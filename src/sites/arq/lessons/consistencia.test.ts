import { describe, expect, it } from "vitest";
import { expectDeterministic, expectTiles } from "../../../../tests/lesson-checks.ts";
import { schedules, tally } from "../../../sim/arch/consistency.ts";
import lesson from "./consistencia.ts";

describe("lesson consistencia", () => {
  it("matches the hand count (docs/revisao/arq-consistencia.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ sc: 6, tso: 80, tsoZero: 18, fence: 20, fenceZero: 0 });
  });

  it("never shows (0,0) under SC and shows every outcome under TSO", () => {
    expect(tally(schedules("sc"))).toEqual({ "0,0": 0, "0,1": 1, "1,0": 1, "1,1": 4 });
    const tso = tally(schedules("tso"));
    expect(Object.values(tso).every((n) => n > 0)).toBe(true);
  });
});
