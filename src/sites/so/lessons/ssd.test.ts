import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { ssdRun } from "../../../sim/os/ssd.ts";
import lesson from "./ssd.ts";

describe("lesson ssd", () => {
  it("matches the hand calculations (docs/revisao/so-ssd.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ victim: 0, copies: 2, host: 2, flash: 4, wa: 2 });
    expectLabSweep(lesson, [
      { reescritas: 1, trim: "nao" },
      { reescritas: 3, trim: "nao" },
      { reescritas: 1, trim: "sim" },
      { reescritas: 3, trim: "sim" },
    ]);
  });

  it("TRIM lets GC erase the deleted file's block without copying", () => {
    expect(ssdRun(2, true)).toMatchObject({ victim: 1, copies: 0, wa: 1 });
    expect(ssdRun(1, false)).toMatchObject({ copies: 3, wa: 4 });
    expect(ssdRun(3, false).wa).toBe(1.33);
  });
});
