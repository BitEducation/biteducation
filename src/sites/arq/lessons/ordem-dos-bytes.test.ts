import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { fromBytes, toBytes } from "../../../sim/arch/bytes.ts";
import lesson from "./ordem-dos-bytes.ts";

describe("lesson ordem-dos-bytes", () => {
  it("matches the hand calculations (docs/revisao/arq-ordem-dos-bytes.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      little: "0D 0C 0B 0A",
      first: 13,
      wrong: 47873,
      touched: 2,
      size: 12,
      sorted: 8,
    });
    expectLabSweep(lesson, [
      { valor: "FFFFFFFF", porta: 1, endereco: 0 },
      { valor: "0", porta: 65535, endereco: 12 },
      { valor: "xyz", porta: 257, endereco: 3 },
    ]);
  });

  it("round-trips both orders", () => {
    for (const v of [0, 1, 0x12345678, 0xffffffff])
      for (const e of ["little", "big"] as const) expect(fromBytes(toBytes(v, 4, e), e)).toBe(v);
  });
});
