import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { parseBits, settleSr, waves } from "../../../sim/arch/latch.ts";
import lesson from "./flip-flops.ts";

describe("lesson flip-flops", () => {
  it("matches the hand calculations (docs/revisao/arq-flip-flops.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      setDelays: 2,
      latchChanges: 6,
      ffChanges: 2,
      edges: "2,6,10,14",
      counterEnd: 1,
    });
    expectLabSweep(lesson, [
      { d: "0000000000000000", inicio: 0 },
      { d: "1111111111111111", inicio: 15 },
      { d: "0101010101010101", inicio: 7 },
    ]);
  });

  it("models the SR latch and the waveforms", () => {
    expect(settleSr(0, 1, { q: 1, nq: 0 }).states.at(-1)).toEqual({ q: 0, nq: 1 });
    expect(settleSr(1, 1, { q: 1, nq: 0 }).states.at(-1)).toEqual({ q: 0, nq: 0 });
    expect(settleSr(0, 0, { q: 0, nq: 0 }).stable).toBe(false);
    const w = waves(parseBits("0110001110011000"));
    expect(w.latch.join("")).toBe("0010001111011100");
    expect(w.ff.join("")).toBe("0011111111000000");
  });
});
