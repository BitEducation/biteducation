import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { aes, fromHex, gcm, hexOf } from "../../../sim/net/aes.ts";
import lesson from "./cifra-simetrica.ts";

describe("lesson cifra-simetrica", () => {
  it("matches the hand calculations (docs/revisao/redes-cifra-simetrica.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toMatchObject({
      out: "3925841d02dc09fbdc118597196a0b32",
      ecb: 2,
      cbc: 40,
      gcmOk: 0,
      ctr: "pagar R$ 900,00.",
    });
    expectLabSweep(lesson, [{ bit: 64 }, { bit: 127 }]);
  });

  it("standard test vectors", () => {
    expect(
      hexOf(aes(fromHex("000102030405060708090a0b0c0d0e0f"), fromHex("00112233445566778899aabbccddeeff"))),
    ).toBe("69c4e0d86a7b0430d8cdb78070b4c55a");
    const z = Array(16).fill(0);
    const g = gcm(z, Array(12).fill(0), z);
    expect(hexOf(g.c)).toBe("0388dace60b6a392f328c2b971b2fe78");
    expect(hexOf(g.tag)).toBe("ab6e47d42cec13bdf53a67b21257bddf");
    expect(hexOf(gcm(z, Array(12).fill(0), []).tag)).toBe("58e2fccefa7e3061367f1d57a4e7455a");
  });
});
