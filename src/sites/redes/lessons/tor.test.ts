import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import lesson from "./tor.ts";

describe("lesson tor", () => {
  it("matches the hand trace (docs/revisao/redes-tor.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ built: 290, rttTor: 180, direct: 70 });
  });

  it("a far middle relay costs twice per round trip", () => {
    expectLabSweep(lesson, [{ meio: 5 }, { meio: 150 }]);
    expect(lesson.build({ meio: 130 }).stats).toEqual({ built: 690, rttTor: 380, direct: 70 });
  });
});
