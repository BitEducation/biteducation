import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { monitorRun } from "../../../sim/os/monitor.ts";
import lesson from "./monitores.ts";

describe("lesson monitores", () => {
  it("matches the hand calculations (docs/revisao/so-monitores.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ bug: 1, stolen: 1, final: -1, events: 11 });
    expectLabSweep(lesson, [
      { semantica: "mesa", teste: "while" },
      { semantica: "hoare", teste: "if" },
      { semantica: "hoare", teste: "while" },
    ]);
  });

  it("only Mesa with if reads an empty buffer", () => {
    expect(monitorRun("mesa", "if").bug).toBe(true);
    expect(monitorRun("mesa", "while")).toMatchObject({ bug: false, final: 0 });
    expect(monitorRun("hoare", "if")).toMatchObject({ bug: false, stolen: false, final: 0 });
  });
});
