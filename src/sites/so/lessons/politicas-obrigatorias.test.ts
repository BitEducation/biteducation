import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { allowed } from "../../../sim/os/mac.ts";
import lesson from "./politicas-obrigatorias.ts";

describe("lesson politicas-obrigatorias", () => {
  it("matches the hand calculations (docs/revisao/so-politicas-obrigatorias.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ blpRead: 6, blpWrite: 6, bibaRead: 6, subject: "analista" });
    expectLabSweep(lesson, [{ sujeito: "0" }, { sujeito: "2" }]);
  });

  it("no read up, no write down; Biba is the mirror", () => {
    expect(allowed("blp", 2, 0, "ler")).toBe(true);
    expect(allowed("blp", 2, 0, "escrever")).toBe(false);
    expect(allowed("blp", 0, 2, "escrever")).toBe(true);
    expect(allowed("biba", 2, 0, "ler")).toBe(false);
    expect(allowed("biba", 0, 2, "escrever")).toBe(false);
  });
});
