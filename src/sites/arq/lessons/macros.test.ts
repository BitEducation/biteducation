import { describe, expect, it } from "vitest";
import { expectDeterministic, expectTiles } from "../../../../tests/lesson-checks.ts";
import { breakEven, cost, expand } from "../../../sim/arch/macro.ts";
import lesson from "./macros.ts";

describe("lesson macros", () => {
  it("matches the hand count (docs/revisao/arq-macros.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ expanded: 12, macroSize: 12, procSize: 14, procRun: 24, even: 5 });
  });

  it("substitutes the formal parameters", () => {
    const out = expand([".macro m x", "add \\x, \\x, \\x", ".endm", "m a0", "nop"]);
    expect(out.map((e) => e.line)).toEqual(["add a0, a0, a0", "nop"]);
    expect(cost(5, 4, 2)).toMatchObject({ macroSize: 20, procSize: 20 });
    expect(breakEven(4, 2)).toBe(5);
  });
});
