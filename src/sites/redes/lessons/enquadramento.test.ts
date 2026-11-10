import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import lesson from "./enquadramento.ts";

describe("lesson enquadramento", () => {
  it("matches the hand trace (docs/revisao/redes-enquadramento.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      stuffed: "41 7D 5E 42 7D 5D 43",
      extraBytes: 2,
      bits: "011011111011111011111010010",
      inserted: 3,
      badFrames: 2,
      ok: "sim",
    });
    expectLabSweep(lesson, [{ dados: "7E 7E 7E" }, { dados: "00" }, { bits: "0" }, { bits: "1".repeat(32) }]);
  });

  it("explains in the lab when nothing needs stuffing", () => {
    const run = lesson.build({ dados: "01 02", bits: "0101" });
    expect(run.labNotes?.length).toBe(2);
  });
});
