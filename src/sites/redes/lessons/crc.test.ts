import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { check, encode, flip, toBits } from "../../../sim/net/crc.ts";
import lesson, { poly } from "./crc.ts";

describe("lesson crc", () => {
  it("matches the hand calculations (docs/revisao/redes-crc.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      remainder: "1110",
      frame: "11010110111110",
      xors: 4,
      caught: "sim",
      ghost: "9,12,13",
    });
    expectLabSweep(lesson, [
      { dados: 1, erro: 0 },
      { dados: 1023, erro: 14 },
      { dados: 512, erro: 1 },
    ]);
  });

  it("catches every single-bit error and writes polynomials", () => {
    const gen = [1, 0, 0, 1, 1];
    for (let d = 1; d < 1024; d += 37) {
      const { frame } = encode(toBits(d, 10), gen);
      expect(check(frame, gen)).toBe(true);
      for (let i = 0; i < frame.length; i++) expect(check(flip(frame, [i]), gen)).toBe(false);
    }
    expect(poly([1, 1, 0, 1, 0, 1, 1, 0, 1, 1])).toBe("x⁹ + x⁸ + x⁶ + x⁴ + x³ + x + 1");
  });
});
