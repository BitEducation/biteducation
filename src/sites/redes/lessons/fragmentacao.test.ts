import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { fragment, refragment } from "../../../sim/net/fragment.ts";
import lesson from "./fragmentacao.ts";

describe("lesson fragmentacao", () => {
  it("matches the hand trace (docs/revisao/redes-fragmentacao.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      offsets: "0,185,370",
      sizes: "1500,1500,1040",
      second: "0,69,138,185,254,323,370,439",
      lost: "7,73%",
    });
    expectLabSweep(lesson, [{ tamanho: 600 }, { mtu: 576 }, { tamanho: 9000, mtu: 1000 }, { tamanho: 1500 }]);
  });

  it("keeps non-final fragments a multiple of 8 and refragments relative to the original", () => {
    for (const f of fragment(3000, 20, 1006).slice(0, -1)) expect(f.data % 8).toBe(0);
    const last = refragment({ offset: 370, data: 1020, total: 1040, mf: false }, 20, 576);
    expect(last.map((f) => [f.offset, f.mf])).toEqual([
      [370, true],
      [439, false],
    ]);
  });
});
