import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { loopOutcomes, predict } from "../../../sim/arch/branch.ts";
import lesson from "./previsao-desvio.ts";

describe("lesson previsao-desvio", () => {
  it("matches the hand calculations (docs/revisao/arq-previsao-desvio.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toMatchObject({ always: 3, one: 6, two: 4 });
    expect(Number(run.stats.sorted)).toBeLessThanOrEqual(2);
    expectLabSweep(lesson, [
      { iteracoes: 2, repeticoes: 1, penalidade: 1 },
      { iteracoes: 8, repeticoes: 4, penalidade: 20 },
    ]);
  });

  it("2-bit errs once per loop exit after warming up, 1-bit twice", () => {
    const out = loopOutcomes(5, 4);
    expect(predict(out, "taken").misses).toBe(4);
    expect(predict(out, "1bit").misses).toBe(8);
    expect(predict(out, "2bit").misses).toBe(5);
  });
});
