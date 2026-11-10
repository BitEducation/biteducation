import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { mmapRun } from "../../../sim/os/mmap.ts";
import lesson from "./mmap.ts";

describe("lesson mmap", () => {
  it("matches the hand calculations (docs/revisao/so-mmap.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ major: 3, minor: 1, frames: 3, readCopyKiB: 12 });
    expectLabSweep(lesson, [
      { tocadas: 1, modo: "private" },
      { tocadas: 4, modo: "shared" },
      { tocadas: 4, modo: "private" },
    ]);
  });

  it("MAP_PRIVATE copies on write into a new frame", () => {
    expect(mmapRun(3, "private")).toMatchObject({ frames: 4, bSees: false });
    expect(mmapRun(3, "shared")).toMatchObject({ frames: 3, bSees: true });
  });
});
