import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { cumulative, raceChance } from "../../../sim/net/poison.ts";
import lesson from "./dns-poisoning.ts";

describe("lesson dns-poisoning", () => {
  it("matches the hand calculations (docs/revisao/redes-dns-poisoning.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toMatchObject({ expected: 655, races: 808, half: 454 });
    expect(run.steps.some((s) => s.tags?.includes("signals"))).toBe(true);
    expect(run.steps.some((s) => s.tags?.includes("defense"))).toBe(true);
    expectLabSweep(lesson, [
      { palpites: 10, ttl: 300 },
      { palpites: 1000, ttl: 86400 },
    ]);
  });

  it("random ports shrink the chance by the port range", () => {
    expect(raceChance(100, false) / raceChance(100, true)).toBeCloseTo(28232);
    expect(cumulative(raceChance(100, false), 655)).toBeGreaterThan(0.6);
  });
});
