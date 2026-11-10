import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { arbitrate, burstLine, mbps, singleLine } from "../../../sim/arch/bus.ts";
import lesson from "./barramentos.ts";

describe("lesson barramentos", () => {
  it("matches the hand calculations (docs/revisao/arq-barramentos.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      read: 3,
      single: 24,
      burst: 10,
      peak: 800,
      cpuDaisy: 18,
      cpuRotate: 6,
      end: 24,
    });
    expectLabSweep(lesson, [
      { latencia: 1, largura: "16" },
      { latencia: 5, largura: "4" },
      { latencia: 3, largura: "8" },
    ]);
  });

  it("burst beats single reads and rotation shares the bus", () => {
    for (let lat = 1; lat <= 5; lat++)
      for (const w of [4, 8, 16]) expect(burstLine(lat, w)).toBeLessThanOrEqual(singleLine(lat, w));
    expect(mbps(64, 10)).toBe(640);
    const r = arbitrate([4, 2, 2], 3, "rotate");
    expect(r.grants.map((g) => g.dev)).toEqual([0, 1, 2, 0, 1, 2, 0, 0]);
    expect(arbitrate([4, 2, 2], 3, "daisy").grants.map((g) => g.dev)).toEqual([0, 0, 0, 0, 1, 1, 2, 2]);
  });
});
