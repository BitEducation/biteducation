import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { MACHINES, MIX, perfRun } from "../../../sim/arch/perf.ts";
import lesson from "./desempenho.ts";

describe("lesson desempenho", () => {
  it("matches the hand calculations (docs/revisao/arq-desempenho.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ cpiA: 2.1, timeA: 0.7, timeB: 0.7, mipsA: 1429, mipsA2: 1263 });
    expectLabSweep(lesson, [{ mhzB: 2000 }, { mhzB: 5000 }, { mhzB: 3300 }]);
  });

  it("optimizing lowers time and MIPS together", () => {
    const o0 = perfRun(3000, MACHINES.A.cpi, MIX.O0);
    const o2 = perfRun(3000, MACHINES.A.cpi, MIX.O2);
    expect(o2.seconds).toBeLessThan(o0.seconds);
    expect(o2.mips).toBeLessThan(o0.mips);
    expect(o2.cpi).toBeCloseTo(2.375, 6);
  });
});
