import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { cgroupRun, kernelsRun } from "../../../sim/os/kernels.ts";
import lesson from "./conteineres.ts";

describe("lesson conteineres", () => {
  it("matches the hand calculations (docs/revisao/so-conteineres.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ mono: 300, micro: 1200, msgs: 4, killed: 1 });
    expectLabSweep(lesson, [
      { troca: 50, uso: 64 },
      { troca: 1000, uso: 256 },
      { troca: 300, uso: 400 },
    ]);
  });

  it("four messages cost four times the switches", () => {
    expect(kernelsRun(100)).toEqual({
      mono: { msgs: 0, switches: 2, ns: 200 },
      micro: { msgs: 4, switches: 8, ns: 800 },
    });
    expect(cgroupRun(256).killed).toBe(false);
    expect(cgroupRun(257).killed).toBe(true);
  });
});
