import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { backoff, csmaEfficiency, pureAloha, SLOT_US, slots, slottedAloha } from "../../../sim/net/aloha.ts";
import lesson from "./aloha-csma.ts";

describe("lesson aloha-csma", () => {
  it("matches the hand calculations (docs/revisao/redes-aloha-csma.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    const s = run.stats;
    expect([s.pure, s.slotted, s.csma, s.csma1500]).toEqual(["18,4%", "30,3%", "43%", "94,6%"]);
    expect(Number(s.ok) + Number(s.collisions) + Number(s.idle)).toBe(20);
    expectLabSweep(lesson, [
      { carga: 1, quadro: 64 },
      { carga: 30, quadro: 1500 },
      { carga: 10, quadro: 512 },
    ]);
  });

  it("follows the textbook curves", () => {
    expect(pureAloha(0.5)).toBeCloseTo(1 / (2 * Math.E));
    expect(slottedAloha(1)).toBeCloseTo(1 / Math.E);
    expect(csmaEfficiency(64)).toBeCloseTo(0.4297, 3);
    expect(SLOT_US).toBeCloseTo(51.2);
    expect(backoff(10).top).toBe(1023);
    expect(backoff(16).top).toBe(1023);
    // Long-run average of the seeded draws approaches the offered load.
    const many = slots(1, 4000);
    expect(many.reduce((a, k) => a + k, 0) / many.length).toBeCloseTo(1, 1);
  });
});
