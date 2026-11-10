import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { AFTER_INNER, AFTER_MAIN, factTrace, maxDepth } from "../../../sim/arch/stack.ts";
import lesson from "./pilha-chamadas.ts";

describe("lesson pilha-chamadas", () => {
  it("matches the hand calculations (docs/revisao/arq-pilha-chamadas.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      result: 24,
      frames: 4,
      bytes: 64,
      minSp: "0x7FC0",
      inner: 3,
      levels: 524288,
    });
    expectLabSweep(lesson, [
      { n: 1, pilha: 1 },
      { n: 12, pilha: 8192 },
      { n: 7, pilha: 64 },
    ]);
  });

  it("saves the caller's return address only in the first frame", () => {
    const t = factTrace(12);
    expect(t.result).toBe(479001600);
    expect(t.frames.map((f) => f.ra)).toEqual([AFTER_MAIN, ...Array(11).fill(AFTER_INNER)]);
    expect(t.events.filter((e) => e.kind === "return").map((e) => e.frame.n)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1),
    );
    expect(maxDepth(1024)).toBe(64);
  });
});
