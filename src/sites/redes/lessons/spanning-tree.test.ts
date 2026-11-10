import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { spanningTree, storm } from "../../../sim/net/stp.ts";
import lesson from "./spanning-tree.ts";

describe("lesson spanning-tree", () => {
  it("matches the hand calculations (docs/revisao/redes-spanning-tree.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      storm: "3,4,6,10,14,22",
      root: "S1",
      dist: "0,4,4,8",
      blocked: "w34,w23",
      after: "w23",
      unblocked: "w34",
    });
    expectLabSweep(lesson, [
      { prioridade: 0, falha: "w12" },
      { prioridade: 61440, falha: "w34" },
      { prioridade: 32768, falha: "nada" },
    ]);
  });

  it("builds a tree on a triangle and floods a ring", () => {
    const br = ["A", "B", "C"].map((name, i) => ({ name, priority: 32768, mac: i + 1 }));
    const tri = [
      { id: "ab", a: "A", b: "B", cost: 4 },
      { id: "bc", a: "B", b: "C", cost: 4 },
      { id: "ca", a: "C", b: "A", cost: 4 },
    ];
    const t = spanningTree(br, tri);
    expect(t.root).toBe("A");
    expect(t.blocked).toEqual(["bc"]);
    expect(t.blocker.bc).toBe("C");
    expect(storm(tri, "A", 4)).toEqual([2, 2, 2, 2]);
  });
});
