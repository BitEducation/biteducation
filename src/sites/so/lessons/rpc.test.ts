import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { marshal, unmarshal } from "../../../sim/os/rpc.ts";
import lesson from "./rpc.ts";

describe("lesson rpc", () => {
  it("matches the hand trace (docs/revisao/so-rpc.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      bytes: "00 00 00 03 00 00 10 92 00 00 00 64",
      remote: 407,
      ratio: 81400,
      finalLeast: 700,
      finalMost: 600,
    });
  });

  it("the network decides the cost", () => {
    expectLabSweep(lesson, [{ rede: "50" }, { rede: "30000" }]);
    expect(lesson.build({ rede: "30000" }).stats.remote).toBe(30007);
  });

  it("round-trips large values", () => {
    expect(unmarshal(marshal({ proc: 0xffffffff, args: [1] }))).toEqual({ proc: 0xffffffff, args: [1] });
  });
});
