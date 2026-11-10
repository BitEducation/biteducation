import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import lesson from "./mac-sem-colisao.ts";

describe("lesson mac-sem-colisao", () => {
  it("matches the hand trace (docs/revisao/redes-mac-sem-colisao.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ order: "1,3,7", token: "3,7,1", winner: "1010", countdown: "90,9%" });
  });

  it("more ready stations share the contention", () => {
    expectLabSweep(lesson, [{ prontas: 1 }, { prontas: 8 }]);
    expect(lesson.build({ prontas: 1 }).stats.order).toBe("1");
    expect(lesson.build({ prontas: 8 }).stats.token).toBe("2,3,4,5,6,7,0,1");
  });
});
