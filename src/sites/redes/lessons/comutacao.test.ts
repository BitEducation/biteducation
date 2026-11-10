import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import lesson from "./comutacao.ts";

describe("lesson comutacao", () => {
  it("matches the hand trace (docs/revisao/redes-comutacao.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      circ: 130,
      msg: 300,
      pk: 150,
      pkMany: 102,
      risk: "0,04%",
      best: 14,
      tBest: "130,3",
    });
    expectLabSweep(lesson, [{ pacotes: 1 }, { pacotes: 20, cabecalho: 50 }, { cabecalho: 1 }]);
  });
});
