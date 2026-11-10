import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import lesson from "./sdn.ts";

describe("lesson sdn", () => {
  it("matches the hand trace (docs/revisao/redes-sdn.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ misses: 3, packets: 6, rules: 3, smallMiss: 6 });
    expect(lesson.build({ capacidade: 3 }).stats.smallMiss).toBe(3);
    expectLabSweep(lesson, [{ capacidade: 1 }, { capacidade: 6 }]);
  });
});
