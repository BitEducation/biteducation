import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { nestedSteps, nestedWalk, slowdown } from "../../../sim/os/virt.ts";
import lesson from "./virtualizacao.ts";

describe("lesson virtualizacao", () => {
  it("matches the hand calculations (docs/revisao/so-virtualizacao.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ slowdown: "1,5", native: 4, nested: 24, failsSilently: 1 });
    expectLabSweep(lesson, [
      { sensiveis: 0, niveis: 2 },
      { sensiveis: 50, niveis: 5 },
      { sensiveis: 10, niveis: 3 },
    ]);
  });

  it("counts the two-dimensional walk", () => {
    expect(nestedWalk(4, 4)).toBe(24);
    expect(nestedWalk(5, 5)).toBe(35);
    expect(nestedSteps(4, 4).reduce((s, x) => s + x.reads, 0)).toBe(24);
    expect(slowdown(0)).toBe(1);
  });
});
