import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { FOUR_B_FIVE_B, manchester, nrzi, nyquist, shannon, zeroRun } from "../../../sim/net/physical.ts";
import lesson, { rate } from "./camada-fisica.ts";

describe("lesson camada-fisica", () => {
  it("matches the hand calculations (docs/revisao/redes-camada-fisica.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      nyquist: "12 kbit/s",
      shannon: "29,9 kbit/s",
      snr: "1.000",
      useful: "32",
      flatNrz: 4,
      flatMan: 1,
      khz: 3,
    });
    expectLabSweep(lesson, [
      { banda: 1, ruido: 0, bits: 1 },
      { banda: 1000, ruido: 60, bits: 6 },
      { banda: 20, ruido: 10, bits: 4 },
    ]);
  });

  it("follows the formulas and codes", () => {
    expect(nyquist(3000, 2)).toBe(6000);
    expect(shannon(3000, 0)).toBe(3000);
    expect(nrzi([1, 0, 1])).toEqual([1, 1, 1, 1, 0, 0]);
    expect(manchester([0, 1])).toEqual([1, 0, 0, 1]);
    for (const code of Object.values(FOUR_B_FIVE_B)) expect(zeroRun(code)).toBeLessThanOrEqual(2);
    expect(rate(2_500_000)).toBe("2,5 Mbit/s");
  });
});
