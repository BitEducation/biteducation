import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { airtime, backoffRace, exchange } from "../../../sim/net/wifi.ts";
import lesson from "./wifi-csma-ca.ts";

describe("lesson wifi-csma-ca", () => {
  it("matches the hand calculations (docs/revisao/redes-wifi-csma-ca.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ first: "A", frozen: 2, plain: 314.3, rts: 391.3, worth: 1 });
    expectLabSweep(lesson, [
      { quadro: 100, recuoA: 0, recuoB: 0 },
      { quadro: 2300, recuoA: 15, recuoB: 1 },
      { quadro: 300, recuoA: 7, recuoB: 7 },
    ]);
  });

  it("timing", () => {
    expect(airtime(1500)).toBeCloseTo(20 + 12000 / 54, 6);
    expect(exchange(1500, false).total).toBeCloseTo(34 + 242.22 + 16 + 22.07, 1);
    expect(backoffRace(3, 5)).toEqual({ first: "A", waitedSlots: 3, frozenAt: 2, tie: false });
  });
});
