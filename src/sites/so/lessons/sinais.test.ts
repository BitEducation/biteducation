import { describe, expect, it } from "vitest";
import { expectDeterministic, expectTiles } from "../../../../tests/lesson-checks.ts";
import { run } from "../../../sim/os/signals.ts";
import lesson from "./sinais.ts";

describe("lesson sinais", () => {
  it("matches the hand trace (docs/revisao/so-sinais.md)", () => {
    const r = lesson.build(lesson.params.defaults);
    expectTiles(r);
    expectDeterministic(lesson);
    expect(r.stats).toEqual({ sent: 2, usr1Runs: 1, handled: 3, alive: "não" });
  });

  it("refuses to block SIGKILL", () => {
    const ev = run([{ op: "block", sig: "SIGKILL" }]);
    expect(ev[0]?.refused).toBe(true);
  });
});
