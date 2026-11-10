import { describe, expect, it } from "vitest";
import { expectDeterministic, expectTiles } from "../../../../tests/lesson-checks.ts";
import lesson from "./barreiras.ts";

describe("lesson barreiras", () => {
  it("matches the hand trace (docs/revisao/so-barreiras.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ stale: 3, total: 17, waited: 19, pct: 28 });
  });
});
