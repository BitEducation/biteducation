import { describe, expect, it } from "vitest";
import {
  expectDeterministic,
  expectFramesValid,
  expectLabSweep,
  expectTiles,
} from "../../../../tests/lesson-checks.ts";
import lesson from "./ssh.ts";

describe("lesson ssh", () => {
  const run = lesson.build(lesson.params.defaults);
  it("binary packets are padded to a multiple of 8", () => {
    expectTiles(run);
    expectFramesValid(run);
    expectDeterministic(lesson);
    for (const f of Object.values(run.frames)) {
      const l = f.layers.find((x) => x.id === "ssh");
      if (!l || f.data[l.from] === 0x53) continue; // version line ("S")
      if (l.fields[0]?.label !== "Tamanho do pacote") continue;
      expect((l.to - l.from) % 8, f.id).toBe(0);
    }
  });
  it("a changed host key stops before NEWKEYS", () => {
    const bad = lesson.build({ trocada: true });
    expect(bad.steps.length).toBe(5);
    expect(bad.stats.aborted).toBe(1);
    expectLabSweep(lesson, [{ conhecido: true }, { trocada: true }, { conhecido: true, trocada: true }]);
  });
});
