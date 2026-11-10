import { describe, expect, it } from "vitest";
import { expectDeterministic, expectFramesValid, expectTiles } from "../../../../tests/lesson-checks.ts";
import lesson from "./arp-spoofing.ts";

describe("lesson arp-spoofing", () => {
  const run = lesson.build(lesson.params.defaults);
  it("has the 7 planned steps, with signals and defense", () => {
    expect(run.steps.map((s) => s.id)).toEqual([
      "s1-normal",
      "s2-forjado",
      "s3-cache",
      "s4-mitm",
      "s5-sinais",
      "s6-defesa",
      "s7-tls",
    ]);
    expect(run.steps.some((s) => s.tags?.includes("signals"))).toBe(true);
    expect(run.steps.some((s) => s.tags?.includes("defense"))).toBe(true);
    const q = run.steps[2]?.quiz;
    expect(q?.kind === "pick" && q.answer).toBe("malu");
    expect(run.stats.alerts).toBe(2);
    expectTiles(run);
    expectFramesValid(run);
    expectDeterministic(lesson);
  });
  it("the forged ARP claims the gateway IP with Malu's MAC", () => {
    const f = run.frames["f-forjado"];
    const arp = f?.layers.find((l) => l.id === "arp");
    const b = f?.data.slice(arp?.from, arp?.to) as number[];
    expect(b.slice(8, 14)).toEqual([0x02, 0, 0, 0x20, 0, 0x66]);
    expect(b.slice(14, 18)).toEqual([10, 20, 0, 1]);
  });
  it("lab: with DAI the cache never turns bad; with a static entry neither", () => {
    for (const defesa of ["dai", "estatica"]) {
      const r = lesson.build({ defesa });
      expectTiles(r);
      expect(r.trace.some((e) => e.kind === "row" && e.table === "cache" && e.mark === "bad")).toBe(false);
      expect(r.steps.some((s) => s.tags?.includes("signals"))).toBe(true);
    }
  });
});
