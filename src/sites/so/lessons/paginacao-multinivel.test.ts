import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { split, X86_64 } from "../../../sim/os/multilevel.ts";
import lesson from "./paginacao-multinivel.ts";

describe("lesson paginacao-multinivel", () => {
  it("matches the hand calculations (docs/revisao/so-paginacao-multinivel.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      flatMiB: 4,
      dir: 40,
      table: 18,
      tables: 5,
      idx64: "255,500,145,325",
      eat4: 108,
    });
    expectLabSweep(lesson, [
      { endereco: "FFFFFFFF", heap: 64, acerto: 80 },
      { endereco: "0", heap: 1, acerto: 99 },
      { endereco: "zz", heap: 8, acerto: 90 },
    ]);
  });

  it("splits a canonical 48-bit address", () => {
    expect(split(0xffffn << 32n, X86_64).indices).toEqual([511, 508, 0, 0]);
  });
});
