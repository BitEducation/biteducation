import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { load, membersOf } from "../../../sim/net/multicast.ts";
import lesson from "./multicast.ts";

describe("lesson multicast", () => {
  it("matches the hand calculations (docs/revisao/redes-multicast.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ unicast: 14, multicast: 8, pruned: 4, source: 4 });
    expectLabSweep(lesson, [
      { membros: 1, taxa: 1 },
      { membros: 2, taxa: 20 },
      { membros: 5, taxa: 8 },
    ]);
  });

  it("one copy per tree link", () => {
    expect(load(membersOf(5))).toMatchObject({ uniTotal: 17, multiTotal: 9, fromSource: 5 });
    expect(load(["H1"])).toMatchObject({ uniTotal: 3, multiTotal: 3 });
  });
});
