import { describe, expect, it } from "vitest";
import { expectDeterministic, expectTiles } from "../../../../tests/lesson-checks.ts";
import lesson from "./niveis.ts";

describe("lesson niveis", () => {
  it("matches the hand encoding (docs/revisao/arq-niveis.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      words: "0x00052283 0x00452303 0x006283B3 0x00752423",
      cycles: 18,
      gates: 160,
    });
  });
});
