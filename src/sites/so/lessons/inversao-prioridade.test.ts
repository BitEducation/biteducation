import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { run, tasks } from "../../../sim/os/inversion.ts";
import lesson from "./inversao-prioridade.ts";

describe("lesson inversao-prioridade", () => {
  it("matches the hand calculations (docs/revisao/so-inversao-prioridade.md)", () => {
    const run0 = lesson.build(lesson.params.defaults);
    expectTiles(run0);
    expectDeterministic(lesson);
    expect(run0.stats).toEqual({
      waitNone: 11,
      waitInherit: 3,
      waitCeiling: 0,
      respNone: 15,
      respInherit: 7,
      spinDone: "não",
    });
    expectLabSweep(lesson, [
      { media: 1, secao: 2 },
      { media: 20, secao: 8 },
      { media: 5, secao: 3 },
    ]);
  });

  it("bounds the wait by the critical section with inheritance", () => {
    for (const m of [1, 5, 20])
      for (const s of [2, 5, 8]) {
        const none = run(tasks(m, s), "none");
        const inh = run(tasks(m, s), "inherit");
        expect((none.hGot ?? 0) - (none.hAsked ?? 0)).toBe(m + s - 1);
        expect((inh.hGot ?? 0) - (inh.hAsked ?? 0)).toBe(s - 1);
      }
    expect(run(tasks(8, 4), "spin", 40).done).toBe(false);
  });
});
