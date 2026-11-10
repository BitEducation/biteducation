import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { layout, locate5, rebuild } from "../../../sim/os/raid.ts";
import lesson from "./raid.ts";

describe("lesson raid", () => {
  it("matches the hand calculations (docs/revisao/so-raid.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      cap0: 16,
      cap10: 8,
      cap5: 12,
      loss0: "7,8%",
      parity: "81",
      rebuilt: "sim",
      hours: "5,6",
      newParity: "65",
      shortcut: "sim",
    });
    expectLabSweep(lesson, [
      { discos: 3, falha: 3, bloco: 0, valor: "00" },
      { discos: 8, falha: 8, bloco: 34, valor: "ff" },
      { discos: 5, falha: 9, bloco: 99, valor: "zz" },
    ]);
  });

  it("rotates parity and rebuilds every disk of every stripe", () => {
    for (const n of [3, 4, 5, 8]) {
      const rows = layout("5", n, n);
      expect(new Set(rows.map((r) => r.findIndex((c) => c.block === -1))).size).toBe(n);
      for (const r of rows) for (let d = 0; d < n; d++) expect(rebuild(r, d)).toBe(r[d]?.value);
    }
    expect(locate5(5, 4)).toEqual({ stripe: 1, disk: 1, parity: 2 });
  });
});
