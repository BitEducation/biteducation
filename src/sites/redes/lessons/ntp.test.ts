import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { exchange, slewSeconds } from "../../../sim/net/ntp.ts";
import lesson from "./ntp.ts";

describe("lesson ntp", () => {
  it("matches the hand calculations (docs/revisao/redes-ntp.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      delay: 40,
      offset: 250,
      skewError: 15,
      best: 1,
      bestError: -1,
      step: "salto",
    });
    expectLabSweep(lesson, [
      { erro: 0, atraso: 5, assimetria: 0 },
      { erro: 100, atraso: 200, assimetria: 100 },
      { erro: -2000, atraso: 20, assimetria: 30 },
    ]);
  });

  it("recovers the offset exactly on symmetric paths", () => {
    for (const err of [-500, 0, 37]) {
      const e = exchange(1000, err, 25, 25);
      expect(e.offset + err).toBe(0);
      expect(e.delay).toBe(50);
    }
    expect(exchange(1000, 0, 40, 10).error).toBe(15);
    expect(slewSeconds(100)).toBe(200);
  });
});
