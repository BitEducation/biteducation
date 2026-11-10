import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { replace } from "../../../sim/os/replace.ts";
import lesson, { BELADY } from "./substituicao-paginas.ts";

describe("lesson substituicao-paginas", () => {
  it("matches the fault counts worked by hand (docs/revisao/so-substituicao-paginas.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ fifo: 9, opt: 6, lru: 7, clock: 8, f3: 9, f4: 10 });
    expectLabSweep(lesson, [
      { quadros: 2 },
      { quadros: 5 },
      { paginas: "1 1 1 1" },
      { paginas: "0 1 2 3 4 5 6 7 8 9 0 1 2 3" },
    ]);
  });

  it("LRU never gets worse with more frames on the Belady string; FIFO does", () => {
    const lru = [1, 2, 3, 4, 5].map((k) => replace(BELADY, k, "lru").faults);
    for (let i = 1; i < lru.length; i++) expect(lru[i]).toBeLessThanOrEqual(lru[i - 1] ?? 0);
    expect(replace(BELADY, 4, "fifo").faults).toBeGreaterThan(replace(BELADY, 3, "fifo").faults);
  });

  it("optimal is a lower bound for every algorithm", () => {
    const refs = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2];
    const o = replace(refs, 3, "opt").faults;
    for (const a of ["fifo", "lru", "clock"] as const)
      expect(replace(refs, 3, a).faults).toBeGreaterThanOrEqual(o);
  });
});
