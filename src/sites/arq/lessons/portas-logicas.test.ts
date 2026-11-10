import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { fullAdder, ripple } from "../../../sim/arch/logic.ts";
import lesson from "./portas-logicas.ts";

describe("lesson portas-logicas", () => {
  it("matches the hand calculations (docs/revisao/arq-portas-logicas.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ half: "10", col: 2, cout: 1, sum: "0001", carry: 1, settle: 9, sub: 5 });
    expectLabSweep(lesson, [
      { a: 0, b: 0 },
      { a: 15, b: 15 },
      { a: 0, b: 15 },
      { a: 7, b: 8 },
    ]);
  });

  it("full adder matches arithmetic for all eight inputs", () => {
    for (const a of [0, 1] as const)
      for (const b of [0, 1] as const)
        for (const c of [0, 1] as const) {
          const f = fullAdder(a, b, c);
          expect(f.s + 2 * f.cout).toBe(a + b + c);
        }
  });

  it("ripple adds every pair of 4-bit numbers and settles after 2n + 1 delays", () => {
    for (let a = 0; a < 16; a++)
      for (let b = 0; b < 16; b++) {
        const r = ripple(a, b, 4);
        const v = r.sum.reduce<number>((n, x, i) => n + x * 2 ** i, 0) + r.carryOut * 16;
        expect(v).toBe(a + b);
      }
    expect(ripple(0, 0, 64).settle).toBe(129);
  });
});
