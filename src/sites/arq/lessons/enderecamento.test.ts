import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { operand, read, walk } from "../../../sim/arch/addressing.ts";
import lesson from "./enderecamento.ts";

describe("lesson enderecamento", () => {
  it("matches the hand calculations (docs/revisao/arq-enderecamento.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      direct: 120,
      viaReg: 7,
      based: 42,
      indirect: 13,
      reads: "0,1,0,1,1,2",
      sum: 174,
    });
    expectLabSweep(lesson, [
      { r2: 128, desloc: 28 },
      { r2: 100, desloc: 28 },
      { r2: 117, desloc: 3 },
    ]);
  });

  it("reads words and walks arrays", () => {
    expect(read(128)).toBe(99);
    expect(() => read(102)).toThrow();
    expect(operand("base-deslocamento", 112, 4).value).toBe(116);
    expect(walk(120, 3).map((x) => x.sum)).toEqual([13, 21, 120]);
  });
});
