import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { checkBits, decodeData, encode, syndrome } from "../../../sim/arch/hamming.ts";
import lesson from "./hamming.ts";

describe("lesson hamming", () => {
  it("matches the hand calculations (docs/revisao/arq-hamming.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      sent: "1010101",
      recv: "1010111",
      syndrome: 6,
      fixed: 13,
      double: 6,
      ecc: 8,
    });
    expectLabSweep(lesson, [
      { dados: 0, erro: 0 },
      { dados: 15, erro: 1 },
      { dados: 6, erro: 4 },
    ]);
  });

  it("corrects every single-bit error of every data word", () => {
    for (let d = 0; d < 16; d++) {
      expect(syndrome(encode(d)).pos).toBe(0);
      for (let pos = 1; pos <= 7; pos++) {
        const w = encode(d);
        w[pos] = 1 - (w[pos] ?? 0);
        expect(syndrome(w).pos).toBe(pos);
      }
    }
    expect(decodeData(encode(9))).toBe(9);
    expect(checkBits(4)).toBe(3);
    expect(checkBits(64)).toBe(7);
  });
});
