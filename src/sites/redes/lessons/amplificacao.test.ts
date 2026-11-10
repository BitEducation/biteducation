import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import lesson from "./amplificacao.ts";

describe("lesson amplificacao", () => {
  it("matches the hand calculations (docs/revisao/redes-amplificacao.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ factor: 50, arriving: 5000, overload: 5, limited: 240 });
    expect(run.steps.filter((s) => s.tags?.includes("defense"))).toHaveLength(2);
    expectLabSweep(lesson, [
      { protocolo: "ntp", atacante: 1000, vitima: 100 },
      { protocolo: "dns", atacante: 10, vitima: 10000 },
    ]);
  });
});
