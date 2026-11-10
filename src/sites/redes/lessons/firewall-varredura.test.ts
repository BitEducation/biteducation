import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { scanAlert } from "../../../sim/net/firewall.ts";
import lesson from "./firewall-varredura.ts";

describe("lesson firewall-varredura", () => {
  it("matches the hand calculations (docs/revisao/redes-firewall-varredura.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      open0: 5,
      open1: 4,
      open2: 2,
      filtered2: 14,
      alert: 10,
      forged: "aceita/descarta",
    });
    expectLabSweep(lesson, [
      { intervalo: 2000, limiar: 16 },
      { intervalo: 50, limiar: 4 },
    ]);
  });

  it("slow scans stay under the threshold", () => {
    expect(scanAlert(16, 1000, 10)).toBeNull();
    expect(scanAlert(16, 500, 10)).toBe(9);
  });
});
