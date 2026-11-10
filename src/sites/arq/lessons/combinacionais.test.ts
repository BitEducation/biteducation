import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { barrel, decoder, gates, mux } from "../../../sim/arch/combinational.ts";
import lesson from "./combinacionais.ts";

describe("lesson combinacionais", () => {
  it("matches the hand calculations (docs/revisao/arq-combinacionais.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ line: 5, out: 1, shifted: "10010000", decoder: 11, mux: 20, barrel: 75 });
    expectLabSweep(lesson, [
      { selecao: 0, dados: 0, deslocamento: 0 },
      { selecao: 7, dados: 255, deslocamento: 7 },
    ]);
  });

  it("behaves like the textbook blocks", () => {
    expect(decoder(2, 2)).toEqual([0, 0, 1, 0]);
    expect(mux([0, 1, 0, 0], 1, 2)).toBe(1);
    expect(barrel(1, 7, 8)).toEqual([1, 2, 8, 128]);
    expect(gates(3).barrelMuxes).toBe(24);
  });
});
