import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { overflowRun } from "../../../sim/os/overflow.ts";
import lesson from "./estouro-de-buffer.ts";

describe("lesson estouro-de-buffer", () => {
  it("matches the hand calculations (docs/revisao/so-estouro-de-buffer.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ over: 12, touched: 5, outcome: "desvio", raw: "desvio" });
    expectLabSweep(lesson, [
      { entrada: 1, canario: "nao" },
      { entrada: 8, canario: "sim" },
      { entrada: 10, canario: "nao" },
      { entrada: 14, canario: "nao" },
      { entrada: 24, canario: "sim" },
    ]);
  });

  it("outcome by how far the copy reaches", () => {
    expect(overflowRun(8, false).outcome).toBe("ok");
    expect(overflowRun(12, false).outcome).toBe("latente");
    expect(overflowRun(16, false).outcome).toBe("quebra");
    expect(overflowRun(17, false).outcome).toBe("desvio");
    expect(overflowRun(9, true).outcome).toBe("abortado");
  });
});
