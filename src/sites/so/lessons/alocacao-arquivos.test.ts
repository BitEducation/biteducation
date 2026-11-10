import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { allocRun, extents } from "../../../sim/os/alloc.ts";
import lesson from "./alocacao-arquivos.ts";

describe("lesson alocacao-arquivos", () => {
  it("matches the hand calculations (docs/revisao/so-alocacao-arquivos.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ free: 12, largest: 4, fits: 0, linked: 5, extents: 2 });
    expectLabSweep(lesson, [
      { tamanho: 2, bloco: 0 },
      { tamanho: 4, bloco: 3 },
      { tamanho: 7, bloco: 6 },
      { tamanho: 3, bloco: 6 },
    ]);
  });

  it("first fit and extents", () => {
    expect(allocRun(3, 0).contiguous).toEqual([7, 8, 9]);
    expect(allocRun(4, 0).contiguous).toEqual([14, 15, 16, 17]);
    expect(allocRun(5, 4)).toMatchObject({ chain: [2, 3, 7, 8, 9], index: 2, data: [3, 7, 8, 9, 14] });
    expect(extents([2, 3, 7, 8, 9, 14])).toEqual([
      { start: 2, len: 2 },
      { start: 7, len: 3 },
      { start: 14, len: 1 },
    ]);
  });
});
