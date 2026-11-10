import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { assemble, cycles, run, SUM_LOOP } from "../../../sim/arch/ijvm.ts";
import lesson from "./ijvm.ts";

describe("lesson ijvm", () => {
  it("matches the hand calculations (docs/revisao/arq-ijvm.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      bytes: 25,
      instructions: 46,
      result: 15,
      perIter: 51,
      cycles: 298,
      cpi: "6,48",
      fast: 201,
      speedup: "1,48",
    });
    expectLabSweep(lesson, [{ n: 0 }, { n: 1 }, { n: 20 }]);
  });

  it("assembles relative branches and sums 1..n", () => {
    const prog = assemble(SUM_LOOP);
    expect(prog[3]?.bytes).toEqual([0x99, 0x00, 0x10]);
    expect(prog[9]?.bytes).toEqual([0xa7, 0xff, 0xf1]);
    expect(run(prog, [0, 0]).result).toBe(0);
    expect(run(prog, [10, 0]).execs.length).toBe(86);
    expect(run(prog, [10, 0]).result).toBe(55);
    expect(cycles("IFEQ", true, false)).toBe(11);
    expect(cycles("IFEQ", false, true)).toBe(4);
  });
});
