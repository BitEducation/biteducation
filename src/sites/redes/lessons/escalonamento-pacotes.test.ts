import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import lesson from "./escalonamento-pacotes.ts";

describe("lesson escalonamento-pacotes", () => {
  it("matches the hand trace (docs/revisao/redes-escalonamento-pacotes.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ fifo: 9100, fq: 1600, prio: 1600, split: 600, bulkEnd: 9800 });
  });

  it("smaller backup packets shorten the voice wait", () => {
    expectLabSweep(lesson, [{ pacote: 600 }, { pacote: 900 }]);
    expect(lesson.build({ pacote: 600 }).stats.prio).toBe(700);
  });
});
