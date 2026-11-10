import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { compact, holes, KIB, place, translate } from "../../../sim/os/segment.ts";
import lesson from "./segmentacao.ts";

describe("lesson segmentacao", () => {
  it("matches the hand calculations (docs/revisao/so-segmentacao.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ physical: 9716, bData: 2048, free: 6, largest: 2, copied: 3, stack: 10240 });
    expectLabSweep(lesson, [
      { segmento: 0, deslocamento: 0 },
      { segmento: 2, deslocamento: 4095 },
      { segmento: 1, deslocamento: 2047 },
    ]);
  });

  it("checks limits and permissions, and compacts", () => {
    const t = [{ name: "c", base: 100, limit: 10, perm: "r-x" as const }];
    expect(translate(t, 0, 9)).toEqual({ ok: true, physical: 109 });
    expect(translate(t, 0, 10)).toEqual({ ok: false, reason: "limite" });
    expect(translate(t, 0, 1, "escrita")).toEqual({ ok: false, reason: "proteção" });
    expect(translate(t, 3, 0)).toEqual({ ok: false, reason: "segmento" });
    let m = Array.from({ length: 4 }, () => "");
    m = place(m, "x", 2 * KIB, KIB);
    expect(holes(m)).toEqual([
      { at: 0, size: 2 * KIB },
      { at: 3 * KIB, size: KIB },
    ]);
    expect(compact(m, new Set()).copied).toBe(KIB);
  });
});
