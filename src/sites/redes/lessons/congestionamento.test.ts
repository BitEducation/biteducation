import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { runCc } from "../../../sim/net/congestion.ts";
import lesson from "./congestionamento.ts";

describe("lesson congestionamento", () => {
  it("matches the hand calculations (docs/revisao/redes-congestionamento.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      reached: 4,
      firstLoss: 13,
      afterLoss: 12,
      reno: 687,
      tahoe: 561,
      finalDiff: 0,
    });
    expectLabSweep(lesson, [
      { capacidade: 12, ssthresh: 4 },
      { capacidade: 32, ssthresh: 4 },
      { capacidade: 12, ssthresh: 32 },
      { capacidade: 32, ssthresh: 32 },
    ]);
  });

  it("always loses at least once and never delivers above capacity", () => {
    for (let cap = 12; cap <= 32; cap += 4)
      for (let ss = 4; ss <= 32; ss += 4) {
        const r = runCc("reno", { capacity: cap, ssthresh: ss, rounds: 40 });
        expect(r.losses).toBeGreaterThan(0);
        expect(r.rounds.findIndex((x) => x.loss)).toBeLessThan(39);
        for (const x of r.rounds) expect(x.delivered).toBeLessThanOrEqual(cap);
      }
  });
});
