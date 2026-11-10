import { describe, expect, it } from "vitest";
import {
  expectDeterministic,
  expectFramesValid,
  expectLabSweep,
  expectTiles,
} from "../../../../tests/lesson-checks.ts";
import lesson from "./udp.ts";

describe("lesson udp", () => {
  const run = lesson.build(lesson.params.defaults);
  it("loses packet 3, drops late packet 6, and never retransmits", () => {
    expect(run.steps.length).toBe(6);
    expectTiles(run);
    expectFramesValid(run);
    expectDeterministic(lesson);
    expect(run.stats.bad).toBe(2);
    expect(run.trace.filter((e) => e.kind === "move" && e.label === "voz 3").length).toBe(1);
  });
  it("every lab combination still builds", () => {
    const vs = [];
    for (const pacotes of [4, 8])
      for (const perdido of [0, 1, 2, 4, 8])
        for (const atrasado of [0, 1, 3, 8]) vs.push({ pacotes, perdido, atrasado });
    expectLabSweep(lesson, vs);
  });
});
