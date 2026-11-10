import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import lesson from "./p2p.ts";

describe("lesson p2p", () => {
  it("matches the hand trace (docs/revisao/redes-p2p.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ cs: "500", pp: "143", pick: 3, hops: 2, found: "1010" });
  });

  it("slower peers stretch the swarm time", () => {
    expectLabSweep(lesson, [{ envio: 1 }, { envio: 20 }]);
    expect(lesson.build({ envio: 1 }).stats.pp).toBe("333");
    expect(lesson.build({ envio: 20 }).stats.pp).toBe("50");
  });
});
