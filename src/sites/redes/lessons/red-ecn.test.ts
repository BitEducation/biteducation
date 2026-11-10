import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import lesson from "./red-ecn.ts";

describe("lesson red-ecn", () => {
  it("matches the hand trace (docs/revisao/redes-red-ecn.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ tailDrops: 4, marks: "9,13", pMid: "20", altMarks: "8,10,13" });
  });

  it("the weight changes which packets are hit", () => {
    expectLabSweep(lesson, [{ peso: 5 }, { peso: 10 }, { peso: 50 }]);
    expect(lesson.build({ peso: 10 }).stats.marks).toBe("15");
    expect(lesson.build({ peso: 50 }).stats.altMarks).toBe("15");
  });
});
