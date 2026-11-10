import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import lesson from "./filosofos.ts";

describe("lesson filosofos", () => {
  it("matches the hand calculations (docs/revisao/so-filosofos.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toMatchObject({ naiveDeadlock: 1, blocked: 5, naiveSteps: 15 });
    expectLabSweep(lesson, [
      { refeicoes: 1, quantum: 1 },
      { refeicoes: 3, quantum: 3 },
      { refeicoes: 2, quantum: 2 },
    ]);
  });

  it("the fixed protocols never deadlock", () => {
    for (let m = 1; m <= 3; m++)
      for (let q = 1; q <= 3; q++) {
        const s = lesson.build({ refeicoes: m, quantum: q }).stats;
        expect(Number(s.ordered)).toBeGreaterThan(0);
        expect(Number(s.waiter)).toBeGreaterThan(0);
      }
  });
});
