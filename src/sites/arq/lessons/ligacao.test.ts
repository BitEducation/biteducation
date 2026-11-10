import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { forward, layout, PRINCIPAL, pass1, resolve, SOMA } from "../../../sim/arch/link.ts";
import lesson from "./ligacao.ts";

describe("lesson ligacao", () => {
  it("matches the hand calculations (docs/revisao/arq-ligacao.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      forward: 2,
      pending: 2,
      soma: 1048,
      total: 1044,
      call: 20,
      jump: 4,
      changed: 1,
    });
    expectLabSweep(lesson, [
      { base: 0, ordem: "soma" },
      { base: 8192, ordem: "principal" },
      { base: 300, ordem: "x" },
    ]);
  });

  it("assembles and links", () => {
    expect(pass1(PRINCIPAL).externals).toEqual(["soma"]);
    expect(forward(PRINCIPAL)).toEqual([
      { at: 8, sym: "total" },
      { at: 12, sym: "fim" },
    ]);
    const r = resolve(layout([SOMA, PRINCIPAL], 0));
    expect(r.find((x) => x.sym === "soma")?.value).toBe(-12);
    expect(r.find((x) => x.sym === "total")?.value).toBe(28);
  });
});
