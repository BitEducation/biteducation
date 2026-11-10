import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { irqRun, pollRun } from "../../../sim/arch/interrupts.ts";
import lesson from "./interrupcoes.ts";

describe("lesson interrupcoes", () => {
  it("matches the hand calculations (docs/revisao/arq-interrupcoes.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ checks: 10, wasted: 7, pollOverhead: 16, irqOverhead: 12, pollMean: 7.33 });
    expectLabSweep(lesson, [{ periodo: 2 }, { periodo: 5 }, { periodo: 40 }]);
  });

  it("polling latency and interrupt cost", () => {
    expect(pollRun(10).latency).toEqual([8, 10, 4]);
    expect(irqRun()).toMatchObject({ latency: [1, 1, 1], overhead: 12 });
  });
});
