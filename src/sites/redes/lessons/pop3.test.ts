import { describe, expect, it } from "vitest";
import { expectDeterministic, expectFramesValid, expectTiles } from "../../../../tests/lesson-checks.ts";
import { expectChecksums } from "../../../../tests/net-checks.ts";
import lesson from "./pop3.ts";

describe("lesson pop3", () => {
  const run = lesson.build(lesson.params.defaults);
  it("tiles, is deterministic and every checksum verifies", () => {
    expectTiles(run);
    expectFramesValid(run);
    expectDeterministic(lesson);
    expect(expectChecksums(run)).toBe(Object.keys(run.frames).length);
  });
});
