import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { runRw, scenario } from "../../../sim/os/rw.ts";
import lesson from "./leitores-escritores.ts";

describe("lesson leitores-escritores", () => {
  it("matches the hand calculations (docs/revisao/so-leitores-escritores.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      mutex: 24,
      readers: 16,
      maxReaders: 2,
      e1Starved: 11,
      e1Writers: 3,
      worstWriters: "L2:4",
    });
    expectLabSweep(lesson, [
      { leitores: 2, leitura: 2 },
      { leitores: 6, leitura: 6 },
      { leitores: 3, leitura: 5 },
    ]);
  });

  it("never mixes a writer with anyone else", () => {
    for (let n = 2; n <= 6; n++)
      for (let d = 2; d <= 6; d++)
        for (const p of ["mutex", "leitores", "escritores", "justo"] as const) {
          const r = runRw(scenario(n, d), p);
          for (const k of r.ticks) if (k.writer) expect(k.readers).toBe(0);
          if (p === "mutex") expect(r.maxReaders).toBe(1);
          expect(r.done).toHaveLength(n + 2);
        }
  });
});
