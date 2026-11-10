import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { guarded, runRace } from "../../../sim/os/race.ts";
import lesson from "./condicao-de-corrida.ts";

describe("lesson condicao-de-corrida", () => {
  it("matches the hand calculations (docs/revisao/so-condicao-de-corrida.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      race: 550,
      naive: 550,
      petersonSpins: 4,
      tslSpins: 4,
      mutexTicks: 10,
      first: "Ana",
    });
    expectLabSweep(lesson, [
      { quantum: 2, dep1: 100, dep2: 50 },
      { quantum: 3, dep1: 1, dep2: 900 },
      { quantum: 4, dep1: 900, dep2: 1 },
    ]);
  });

  it("keeps mutual exclusion for every protected version and quantum", () => {
    for (const g of ["peterson", "tsl", "mutex"] as const)
      for (let q = 1; q <= 6; q++)
        for (const first of [0, 1]) {
          const progs = [guarded(g, 7, 0), guarded(g, 11, 1)];
          if (first) progs.reverse();
          const r = runRace(progs, { saldo: 0 }, q);
          expect(r.maxInCS).toBe(1);
          expect(r.mem.saldo).toBe(18);
        }
  });

  it("loses an update without protection when switching every instruction", () => {
    const r = runRace([guarded("none", 7, 0), guarded("none", 11, 1)], { saldo: 0 }, 1);
    expect(r.maxInCS).toBe(2);
    expect(r.mem.saldo).toBe(11);
  });
});
