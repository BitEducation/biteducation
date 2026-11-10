import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import lesson from "./rtp.ts";

describe("lesson rtp", () => {
  it("matches the hand trace (docs/revisao/redes-rtp.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ j1: "0,5", jEnd: "5,52", lateShort: "4,7,10", lateLong: 0 });
  });

  it("a longer wait drops fewer packets", () => {
    expectLabSweep(lesson, [{ espera: 40 }, { espera: 70 }]);
    expect(lesson.build({ espera: 45 }).stats.lateShort).toBe("2,4,7,8,10");
    expect(lesson.build({ espera: 70 }).stats.lateShort).toBe("nenhum");
  });
});
