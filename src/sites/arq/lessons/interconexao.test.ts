import { describe, expect, it } from "vitest";
import { expectDeterministic, expectTiles } from "../../../../tests/lesson-checks.ts";
import { edges, measure } from "../../../sim/arch/topology.ts";
import lesson from "./interconexao.ts";

describe("lesson interconexao", () => {
  it("matches the hand calculations (docs/revisao/arq-interconexao.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      anelDiam: 8,
      anelMedia: "4,27",
      gradeDiam: 6,
      toroBis: 8,
      hiperDiam: 4,
      completoLig: 120,
    });
  });

  it("measures known topologies", () => {
    expect(measure("estrela", 16)).toMatchObject({ links: 15, diameter: 2, bisection: 8 });
    expect(measure("grade", 16)).toMatchObject({ links: 24, bisection: 4, average: 2.67 });
    expect(edges("hipercubo", 8)).toHaveLength(12);
  });
});
