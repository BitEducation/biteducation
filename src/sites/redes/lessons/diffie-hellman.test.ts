import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { discreteLog, modpow, powers, share, shared } from "../../../sim/net/dh.ts";
import lesson from "./diffie-hellman.ts";

describe("lesson diffie-hellman", () => {
  it("matches the hand calculations (docs/revisao/redes-diffie-hellman.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ A: 8, B: 19, key: 2, sameKey: "sim", tries: 6, middle: "6/5" });
    expectLabSweep(lesson, [
      { a: 2, b: 2 },
      { a: 21, b: 21 },
      { a: 11, b: 13 },
    ]);
  });

  it("agrees on the same key for every pair of secrets", () => {
    for (let a = 2; a <= 21; a++)
      for (let b = 2; b <= 21; b++) expect(shared(share(b), a)).toBe(shared(share(a), b));
    expect(new Set(powers()).size).toBe(22);
    expect(discreteLog(share(17)).x).toBe(17);
    expect(modpow(5, 21, 23)).toBe(Number(5n ** 21n % 23n));
  });
});
