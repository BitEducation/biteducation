import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { numaRun, place } from "../../../sim/arch/numa.ts";
import lesson from "./numa.ts";

describe("lesson numa", () => {
  it("matches the hand calculations (docs/revisao/arq-numa.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ main: 110, par: 80, chosen: 110, worstMain: 140 });
    expectLabSweep(lesson, [
      { remoto: 90, politica: "principal" },
      { remoto: 300, politica: "paralela" },
    ]);
  });

  it("first touch placement", () => {
    expect(place("principal")).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(place("paralela")).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    expect(numaRun("intercalada", 140).worst).toBe(110);
  });
});
