import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { expectedSeconds, human, sci, space } from "../../../sim/net/wpa.ts";
import lesson from "./wpa.ts";

describe("lesson wpa", () => {
  it("matches the hand calculations (docs/revisao/redes-wpa.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      combos: "2,1 × 10¹¹",
      offline: "1,2 dias",
      online: "331 anos",
      frame: 1516,
    });
    expectLabSweep(lesson, [
      { tamanho: 20, alfabeto: "ascii" },
      { tamanho: 8, alfabeto: "alfanum" },
      { tamanho: 12, alfabeto: "minusculas" },
    ]);
  });

  it("counts passphrases and formats durations", () => {
    expect(space(8, "minusculas")).toBe(208_827_064_576);
    expect(expectedSeconds(8, "minusculas", 1e6)).toBeCloseTo(104_413.532288);
    expect(human(90)).toBe("1,5 minutos");
    expect(human(3600)).toBe("1 hora");
    expect(sci(9.96e7)).toBe("1,0 × 10⁸");
    expect(sci(12345)).toBe("12.345");
  });
});
