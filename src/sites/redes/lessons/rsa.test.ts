import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { decrypt, encrypt, factor, inverse, keys, toyHash } from "../../../sim/net/rsa.ts";
import lesson from "./rsa.ts";

describe("lesson rsa", () => {
  it("matches the hand calculations (docs/revisao/redes-rsa.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      n: 55,
      e: 3,
      d: 27,
      cipher: 14,
      plain: 9,
      hash: 52,
      signature: 13,
      forged: 5,
      tries: 4,
    });
    expectLabSweep(lesson, [
      { primos: "7x13", mensagem: 2 },
      { primos: "17x19", mensagem: 322 },
      { primos: "11x17", mensagem: 500 },
    ]);
  });

  it("decrypts every message and verifies every signature for each key pair", () => {
    for (const [p, q] of [
      [5, 11],
      [7, 13],
      [11, 17],
      [17, 19],
    ] as const) {
      const k = keys(p, q);
      expect((k.e * k.d) % k.phi).toBe(1);
      for (let m = 0; m < k.n; m++) {
        expect(decrypt(encrypt(m, k.e, k.n), k.d, k.n)).toBe(m);
        expect(encrypt(decrypt(m, k.d, k.n), k.e, k.n)).toBe(m);
      }
    }
    expect(inverse(3, 40)).toBe(27);
    expect(toyHash("PAGAR 10", 55)).toBe(52);
    expect(factor(55)).toEqual({ factor: 5, tries: 4 });
  });
});
