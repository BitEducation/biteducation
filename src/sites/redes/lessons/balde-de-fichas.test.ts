import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { burstTicks, maxDelay, simulate } from "../../../sim/net/bucket.ts";
import lesson from "./balde-de-fichas.ts";

describe("lesson balde-de-fichas", () => {
  it("matches the hand calculations (docs/revisao/redes-balde-de-fichas.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ first: 8, queue: 12, delayTb: 6, delayLeaky: 9, drops: 14, burst: "1" });
    expectLabSweep(lesson, [
      { taxa: 10, balde: 36 },
      { taxa: 1, balde: 1 },
      { taxa: 3, balde: 20 },
    ]);
  });

  it("never sends more than tokens allow", () => {
    const arr = [20, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const tb = simulate(arr, "fichas", 2, 8, 10);
    expect(tb.map((x) => x.sent)).toEqual([8, 2, 2, 2, 2, 2, 2, 0, 0, 0]);
    expect(maxDelay(tb)).toBe(6);
    expect(simulate(arr, "policia", 2, 8, 10)[0]?.dropped).toBe(12);
    expect(burstTicks(2, 8, 10)).toBe(1);
  });
});
