import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { f32Bits, fields, fromBits, ulp } from "../../../sim/arch/float.ts";
import { hexOf } from "../../../sim/arch/ints.ts";
import lesson, { parseValue } from "./ponto-flutuante.ts";

describe("lesson ponto-flutuante", () => {
  it("matches the hand calculations (docs/revisao/arq-ponto-flutuante.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ hex: "C0CC0000", stored: 129, tenth: "3DCCCCCD", gap: 2, plus1: 16777216 });
    expectLabSweep(lesson, [
      { valor: "0,1" },
      { valor: "1" },
      { valor: "99999999" },
      { valor: "0.00000001" },
      { valor: "0" },
    ]);
  });

  it("encodes known patterns", () => {
    expect(hexOf(f32Bits(1))).toBe("3F800000");
    expect(hexOf(f32Bits(-0))).toBe("80000000");
    expect(hexOf(f32Bits(2 ** -149))).toBe("00000001");
    expect(hexOf(f32Bits(Number.POSITIVE_INFINITY))).toBe("7F800000");
    expect(fields(f32Bits(Number.NaN)).cls).toBe("nan");
    expect(fields(f32Bits(2 ** -149)).cls).toBe("subnormal");
    expect(fromBits(f32Bits(-6.375))).toBe(-6.375);
    expect(ulp(1)).toBe(2 ** -23);
    expect(ulp(2 ** 24)).toBe(2);
  });

  it("falls back on values the walk-through cannot show", () => {
    expect(parseValue("0")).toBe(-6.375);
    expect(parseValue("abc")).toBe(-6.375);
    expect(parseValue("2,5")).toBe(2.5);
  });
});
