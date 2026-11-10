import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { smp } from "../../../sim/os/smp.ts";
import lesson from "./escalonamento-multiprocessador.ts";

const TASKS = [
  { name: "A", burst: 6, home: 0 },
  { name: "B", burst: 6, home: 0 },
  { name: "C", burst: 6, home: 0 },
  { name: "D", burst: 2, home: 1 },
];

describe("lesson escalonamento-multiprocessador", () => {
  it("matches the hand calculations (docs/revisao/so-escalonamento-multiprocessador.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      single: 14,
      affinity: 18,
      steal: 12,
      migSingle: 3,
      migSteal: 2,
      idleAffinity: 16,
      free: 10,
    });
    expectLabSweep(lesson, [
      { quantum: 1, aquecimento: 0 },
      { quantum: 1, aquecimento: 4 },
      { quantum: 6, aquecimento: 4 },
    ]);
  });

  it("never migrates with affinity and conserves work", () => {
    for (let q = 1; q <= 6; q++)
      for (let w = 0; w <= 4; w++) {
        const a = smp(TASKS, "affinity", q, w);
        expect(a.migrations).toBe(0);
        expect(a.end).toBe(18);
        for (const p of ["single", "affinity", "steal"] as const) {
          const r = smp(TASKS, p, q, w);
          const run = r.slices.filter((s) => s.kind === "run").reduce((s, x) => s + x.to - x.from, 0);
          expect(run).toBe(20);
          expect(r.idle).toBeGreaterThanOrEqual(0);
        }
      }
    const st = smp(TASKS, "steal", 2, 2);
    expect(
      st.slices.filter((s) => s.core === 1).map((s) => `${s.task}${s.kind === "warm" ? "~" : ""}`),
    ).toEqual(["D", "A~", "A", "B~", "B"]);
  });
});
