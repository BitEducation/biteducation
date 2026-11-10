import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { teRun } from "../../../sim/net/mpls.ts";
import lesson from "./mpls.ts";

describe("lesson mpls", () => {
  it("matches the hand calculations (docs/revisao/redes-mpls.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ labels: 1048576, short: 1100, over: 1, teLong: 500 });
    expectLabSweep(lesson, [{ video: 100 }, { video: 400 }, { video: 900 }]);
  });

  it("traffic engineering moves the video off the short path", () => {
    expect(teRun(400).ip.over).toBe(false);
    expect(teRun(500)).toMatchObject({
      ip: { short: 1100, over: true },
      te: { short: 600, long: 500, over: false },
    });
  });
});
