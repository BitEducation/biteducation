import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { addBits, bitsOf, signed } from "../../../sim/arch/ints.ts";
import lesson from "./inteiros.ts";

describe("lesson inteiros", () => {
  it("matches the hand calculations (docs/revisao/arq-inteiros.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ neg: "B3", sub: 23, add: -79, v: 1, ext: "FFB3" });
    expectLabSweep(lesson, [
      { a: 1, b: -128 },
      { a: 127, b: 127 },
      { a: 127, b: -128 },
      { a: 5, b: 3 },
    ]);
  });

  it("flags overflow exactly when the true sum leaves the 8-bit range", () => {
    for (let x = -128; x < 128; x += 7)
      for (let y = -128; y < 128; y += 11) {
        const r = addBits(bitsOf(x, 8), bitsOf(y, 8));
        expect(r.overflow).toBe(x + y > 127 || x + y < -128);
        if (!r.overflow) expect(signed(r.sum)).toBe(x + y);
      }
  });
});
