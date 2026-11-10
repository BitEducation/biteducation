import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { fillWindow, goBackN, maxWindow, selectiveRepeat, utilization } from "../../../sim/net/window.ts";
import lesson from "./janela-deslizante.ts";

describe("lesson janela-deslizante", () => {
  it("matches the hand calculations (docs/revisao/redes-janela-deslizante.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      stopWait: "16,7%",
      withWindow: "66,7%",
      fill: 6,
      gbn: 12,
      sr: 9,
      gbnMax: 7,
      srMax: 4,
    });
    expectLabSweep(lesson, [
      { janela: 1, perdido: 0 },
      { janela: 8, perdido: 7 },
      { janela: 6, perdido: 5 },
    ]);
  });

  it("resends what each protocol needs", () => {
    expect(utilization(10, 8, 40)).toBe(1);
    expect(fillWindow(8, 40)).toBe(6);
    expect(goBackN(8, 1, 0).length).toBe(9);
    expect(goBackN(8, 8, 0).length).toBe(16);
    expect(selectiveRepeat(8, 8, 0).length).toBe(9);
    expect(
      goBackN(8, 4, 2)
        .filter((t) => t.fate === "descartado")
        .map((t) => t.frame),
    ).toEqual([3, 4, 5]);
    expect(maxWindow(4)).toEqual({ gbn: 15, sr: 8 });
  });
});
