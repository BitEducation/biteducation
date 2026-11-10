import { describe, expect, it } from "vitest";
import {
  expectDeterministic,
  expectFramesValid,
  expectLabSweep,
  expectTiles,
} from "../../../../tests/lesson-checks.ts";
import { expectChecksums } from "../../../../tests/net-checks.ts";
import lesson, { PASV_PORT } from "./ftp.ts";

describe("lesson ftp", () => {
  const run = lesson.build(lesson.params.defaults);
  it("announces the passive port as two bytes and transfers over a second connection", () => {
    expectTiles(run);
    expectFramesValid(run);
    expectDeterministic(lesson);
    expect(run.stats.pasv).toBe(PASV_PORT);
    expect(expectChecksums(run)).toBeGreaterThan(10);
    expect(run.steps.map((s) => s.id)).toContain("s2-pasv");
  });
  it("active mode fails behind NAT", () => {
    const a = lesson.build({ modo: "ativo" });
    expect(a.steps.map((s) => s.id)).toContain("s2-port");
    expectLabSweep(lesson, [{ modo: "ativo" }, { modo: "passivo" }]);
  });
});
