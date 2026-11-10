import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { Mesi, pingPong } from "../../../sim/arch/mesi.ts";
import lesson from "./coerencia-mesi.ts";

describe("lesson coerencia-mesi", () => {
  it("matches the hand calculations (docs/revisao/arq-coerencia-mesi.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      stale: 0,
      transactions: 6,
      memWrites: 2,
      invalidated: 2,
      shared: 10,
      separate: 2,
    });
    expectLabSweep(lesson, [
      { escritas: 2, distancia: 4 },
      { escritas: 40, distancia: 128 },
      { escritas: 7, distancia: 64 },
    ]);
  });

  it("follows the MESI transitions", () => {
    const m = new Mesi(2);
    expect(m.run({ cpu: 0, kind: "R" }).states).toEqual(["E", "I"]);
    expect(m.run({ cpu: 0, kind: "W", value: 5 }).bus).toBe("");
    const r = m.run({ cpu: 1, kind: "R" });
    expect(r).toMatchObject({ bus: "BusRd", flushedBy: 0, states: ["S", "S"], memory: 5, read: 5 });
    expect(m.run({ cpu: 0, kind: "W", value: 6 })).toMatchObject({ bus: "BusUpgr", states: ["M", "I"] });
    expect(pingPong(2)).toEqual({ shared: 2, separate: 2 });
    expect(pingPong(9)).toEqual({ shared: 9, separate: 2 });
  });
});
