import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { Buddy, roundUp } from "../../../sim/os/buddy.ts";
import lesson from "./buddy.ts";

describe("lesson buddy", () => {
  it("matches the hand calculations (docs/revisao/so-buddy.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      sizeA: 128,
      splitsA: 3,
      splits: 5,
      waste: 54,
      freeAtF: 576,
      largestAtF: 256,
      fOk: "não",
      merges: 5,
    });
    expectLabSweep(lesson, [
      { pedidoA: 1, pedidoF: 1 },
      { pedidoA: 256, pedidoF: 1024 },
      { pedidoA: 200, pedidoF: 600 },
    ]);
  });

  it("splits, merges with buddies and always returns to one block", () => {
    expect(roundUp(129, 64)).toBe(256);
    const b = new Buddy(1024, 64);
    expect(b.alloc("x", 64).splits).toHaveLength(4);
    expect(b.alloc("y", 64).block).toEqual({ addr: 64, size: 64 });
    expect(b.release("x")?.merges).toHaveLength(0);
    expect(b.release("y")?.final).toEqual({ addr: 0, size: 1024 });
    expect(b.alloc("z", 2048).ok).toBe(false);
  });
});
