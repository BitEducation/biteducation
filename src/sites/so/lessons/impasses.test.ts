import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { bankerRequest, bankerSafe, findCycle } from "../../../sim/os/deadlock.ts";
import lesson, { BANK, FREE } from "./impasses.ts";

describe("lesson impasses", () => {
  it("matches the banker worked by hand (docs/revisao/so-impasses.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ safe: 1, order: "B, C, A", granted: 0, reason: "unsafe" });
    expect(bankerRequest(FREE, BANK, "B", 1).granted).toBe(true);
    expect(bankerRequest(FREE, BANK, "B", 2).granted).toBe(true);
    expect(bankerRequest(FREE, BANK, "B", 3).reason).toBe("claim");
    expect(bankerRequest(FREE, BANK, "C", 1).granted).toBe(true);
    expect(bankerRequest(FREE, BANK, "C", 2).reason).toBe("unsafe");
    const sweep = [];
    for (const quem of ["A", "B", "C"]) for (const quantidade of [1, 2, 3]) sweep.push({ quem, quantidade });
    expectLabSweep(lesson, sweep);
  });

  it("finds cycles only when there is one", () => {
    expect(findCycle({ a: ["b"], b: ["c"], c: ["a"] })).toEqual(["a", "b", "c"]);
    expect(findCycle({ a: ["b"], b: ["c"], c: [] })).toBeNull();
    expect(bankerSafe(0, [{ id: "x", has: 1, max: 2 }]).safe).toBe(false);
  });
});
