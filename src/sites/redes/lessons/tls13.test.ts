import { describe, expect, it } from "vitest";
import { expectDeterministic, expectFramesValid, expectTiles } from "../../../../tests/lesson-checks.ts";
import lesson from "./tls13.ts";

describe("lesson tls13", () => {
  const run = lesson.build(lesson.params.defaults);
  it("has 6 steps, the chain is verified and the SNI quiz answers 1", () => {
    expect(run.steps.map((s) => s.id)).toEqual([
      "s1-clienthello",
      "s2-serverhello",
      "s3-certificado",
      "s4-finished",
      "s5-dados",
      "s6-vazamentos",
    ]);
    const q = run.steps[5]?.quiz;
    expect(q?.kind === "choice" && q.answer).toBe(1);
    const verified = run.trace.filter((e) => e.kind === "row" && e.table === "cadeia" && e.mark === "hit");
    expect(verified).toHaveLength(3);
    expectTiles(run);
    expectFramesValid(run);
    expectDeterministic(lesson);
  });
  it("hellos are in clear, everything after is unknown bytes", () => {
    const ch = run.frames["f-ch"];
    expect(ch?.data.every((b) => b !== null)).toBe(true);
    const app = run.frames["f-app"];
    const tls = app?.layers.find((l) => l.id === "tls");
    expect(app?.data.slice((tls?.from ?? 0) + 5, tls?.to).every((b) => b === null)).toBe(true);
  });
});
