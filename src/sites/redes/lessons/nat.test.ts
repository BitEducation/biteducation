import { describe, expect, it } from "vitest";
import { expectDeterministic, expectFramesValid, expectTiles } from "../../../../tests/lesson-checks.ts";
import { expectChecksums } from "../../../../tests/net-checks.ts";
import lesson, { FIRST_PORT } from "./nat.ts";

describe("lesson nat", () => {
  const run = lesson.build(lesson.params.defaults);
  it("translates both hosts to distinct public ports and recomputes checksums", () => {
    expect(run.steps.length).toBe(6);
    expectTiles(run);
    expectFramesValid(run);
    expectDeterministic(lesson);
    expect([run.stats.pubL, run.stats.pubM]).toEqual([FIRST_PORT, FIRST_PORT + 1]);
    expect(expectChecksums(run)).toBe(Object.keys(run.frames).length);
    const before = run.frames["f-l-in"]?.data as number[];
    const after = run.frames["f-l-out"]?.data as number[];
    // Source port changes (bytes 20-21), payload-free SYN keeps its sequence number.
    expect(before.slice(20, 22)).not.toEqual(after.slice(20, 22));
    expect(before.slice(24, 28)).toEqual(after.slice(24, 28));
  });
});
