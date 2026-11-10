import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { dijkstra, dvConverge, dvInit, longestMatch } from "../../../sim/net/routing.ts";
import lesson, { edgesOf } from "./roteamento.ts";

const N = ["A", "B", "C", "D"];

describe("lesson roteamento", () => {
  it("converges to the shortest paths and counts up after the failure", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    // hand check (docs/revisao/redes-roteamento.md): A-B 1, B-C 2, C-D 1 gives A to D = 4
    expect(run.stats.costAD).toBe(4);
    expect(run.stats.rounds).toBe(2);
    expect(run.stats.best).toBe(24);
    const e = edgesOf(7);
    const last = dvConverge(N, e, dvInit(N, e)).at(-1);
    expect(last?.A?.D).toEqual({ cost: 4, via: "B" });
    const after = e.filter((x) => !(x.a === "B" && x.b === "C"));
    const f = dvConverge(N, after, last ?? {});
    expect(f.at(-1)?.A?.D).toEqual({ cost: 8, via: "C" });
    expect(dijkstra(N, after, "A").table.D).toEqual({ cost: 8, via: "C" });
    expect(f.length - 1).toBeGreaterThan(2);
    expectLabSweep(lesson, [
      { custoAC: 1 },
      { custoAC: 2 },
      { custoAC: 15 },
      { falha: false },
      { custoAC: 1, falha: false },
    ]);
    expect(lesson.build({ ...lesson.params.defaults, falha: false }).steps.length).toBe(5);
  });

  it("picks the longest prefix", () => {
    const t = [
      { prefix: "0.0.0.0", len: 0, out: "B" },
      { prefix: "10.30.0.0", len: 16, out: "B" },
      { prefix: "10.30.5.0", len: 24, out: "C" },
    ];
    expect(longestMatch(t, "10.30.5.9").best?.len).toBe(24);
    expect(longestMatch(t, "10.30.6.9").best?.len).toBe(16);
    expect(longestMatch(t, "8.8.8.8").best?.len).toBe(0);
  });
});
