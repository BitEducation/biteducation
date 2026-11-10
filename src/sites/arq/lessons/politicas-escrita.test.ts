import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { bufferStalls, simulate, sumLoop, WB, WT, zeroLoop } from "../../../sim/arch/writepolicy.ts";
import lesson from "./politicas-escrita.ts";

describe("lesson politicas-escrita", () => {
  it("matches the hand calculations (docs/revisao/arq-politicas-escrita.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      misses: 12,
      wtWrites: 16,
      wbWrites: 20,
      writebacks: 5,
      zeroRead: 16,
      stalls0: 72,
      stalls: 33,
    });
    expectLabSweep(lesson, [
      { iteracoes: 4, buffer: 0 },
      { iteracoes: 32, buffer: 8 },
      { iteracoes: 12, buffer: 1 },
      { iteracoes: 13, buffer: 3 },
    ]);
  });

  it("counts traffic for both policies", () => {
    expect(simulate(WB, sumLoop(12)).cache).toMatchObject({ writeWords: 4, writebacks: 1, misses: 4 });
    expect(simulate(WT, sumLoop(12)).cache).toMatchObject({ writeWords: 12, readWords: 16 });
    expect(simulate(WT, zeroLoop(16)).cache.readWords).toBe(0);
    expect(simulate(WB, zeroLoop(16)).cache.readWords).toBe(16);
    expect([0, 1, 8].map((d) => bufferStalls(8, d, 10))).toEqual([72, 63, 0]);
  });
});
