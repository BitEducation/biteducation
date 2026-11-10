import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { patterns, serve } from "../../../sim/arch/dram.ts";
import lesson from "./dram.ts";

describe("lesson dram", () => {
  it("matches the hand calculations (docs/revisao/arq-dram.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ first: 8, seq: 36, same: 92, spread: 40, conflicts: 7, hitsSpread: 6 });
    expectLabSweep(lesson, [
      { cl: 1, rcd: 1, rp: 1 },
      { cl: 8, rcd: 8, rp: 8 },
      { cl: 2, rcd: 7, rp: 5 },
    ]);
  });

  it("classifies accesses by the open row of each bank", () => {
    const t = { cl: 3, rcd: 5, rp: 7 };
    const p = patterns();
    const same = serve(p.same, t);
    expect(same.served.map((s) => s.kind)).toEqual(["fechada", ...new Array(7).fill("conflito")]);
    expect(same.end).toBe(8 + 7 * 15);
    expect(serve(p.spread, t).end).toBe(16 + 6 * 3);
    expect(serve(p.seq, t).end).toBe(8 + 7 * 3);
  });
});
