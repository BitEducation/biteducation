import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import lesson from "./ipsec.ts";

describe("lesson ipsec", () => {
  it("matches the hand trace (docs/revisao/redes-ipsec.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      tunnel: 1456,
      transport: 1436,
      over: 56,
      verdicts: "aceito,aceito,aceito,aceito,aceito,repetido,aceito,velho demais,aceito",
      natT: 1464,
      fit: 1438,
    });
  });

  it("a full-size packet no longer fits once wrapped", () => {
    expectLabSweep(lesson, [{ pacote: 40 }, { pacote: 1500 }]);
    expect(lesson.build({ pacote: 1500 }).stats.natT).toBe(1564);
  });
});
