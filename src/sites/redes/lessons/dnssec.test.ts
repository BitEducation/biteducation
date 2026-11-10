import { describe, expect, it } from "vitest";
import {
  expectDeterministic,
  expectFramesValid,
  expectLabSweep,
  expectTiles,
} from "../../../../tests/lesson-checks.ts";
import lesson from "./dnssec.ts";

describe("lesson dnssec", () => {
  it("walks the chain of trust and rejects a forged answer", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectFramesValid(run);
    expectDeterministic(lesson);
    expect(run.steps.map((s) => s.id)).toContain("s6-forjado");
    const plain = lesson.build({ ...lesson.params.defaults, forjar: false });
    expectTiles(plain);
    expect(plain.steps.length).toBe(run.steps.length - 1);
    expectLabSweep(lesson, [{ forjar: true }, { forjar: false }]);
  });
});
