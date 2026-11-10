import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import lesson from "./escalonamento.ts";

describe("lesson escalonamento", () => {
  it("matches the averages worked by hand (docs/revisao/so-escalonamento.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ fcfs: 7.5, sjf: 6.75, srtf: 3.75, prio: 5.75, rr: 7.25, rrResp: 1.75 });
    expectLabSweep(lesson, [
      { quantum: 1 },
      { quantum: 6 },
      { processos: "0:1:0 0:1:0" },
      { processos: "0:12:9 20:12:0 1:1:5 2:3:2 3:4:1 4:2:0" },
      { processos: "5:3:1 9:2:0" },
    ]);
  });
});
