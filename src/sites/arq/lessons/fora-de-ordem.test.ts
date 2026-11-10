import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { renamed, schedule } from "../../../sim/arch/ooo.ts";
import lesson from "./fora-de-ordem.ts";

const prog = (load: number) => [
  { text: "lw", dst: "x1", srcs: ["x10"], lat: load },
  { text: "add", dst: "x2", srcs: ["x1", "x3"], lat: 1 },
  { text: "mul", dst: "x3", srcs: ["x4", "x5"], lat: 3 },
  { text: "add", dst: "x6", srcs: ["x4", "x5"], lat: 1 },
  { text: "sub", dst: "x2", srcs: ["x6", "x4"], lat: 1 },
  { text: "addi", dst: "x7", srcs: ["x7"], lat: 1 },
];

describe("lesson fora-de-ordem", () => {
  it("matches the hand calculations (docs/revisao/arq-fora-de-ordem.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      inorder: 10,
      scoreboard: 9,
      rename: 6,
      waited: 4,
      blocked: "I3:WAR,I5:WAW",
      commit: "5,6,6,6,6,6",
    });
    expectLabSweep(lesson, [{ latencia: 1 }, { latencia: 2 }, { latencia: 10 }]);
  });

  it("orders the policies and respects true dependencies", () => {
    for (let load = 1; load <= 10; load++) {
      const p = prog(load);
      const [io, sb, rn] = (["inorder", "scoreboard", "rename"] as const).map((x) => schedule(p, x));
      expect(sb?.end).toBeLessThanOrEqual(io?.end ?? 0);
      expect(rn?.end).toBeLessThanOrEqual(sb?.end ?? 0);
      for (const r of [io, sb, rn]) {
        expect(r?.start[1]).toBeGreaterThanOrEqual(r?.done[0] ?? 0);
        expect(r?.start[4]).toBeGreaterThanOrEqual(r?.done[3] ?? 0);
        expect(new Set(r?.start).size).toBe(6);
      }
    }
    expect(renamed(prog(5)).map((x) => `${x.dst}<-${x.srcs.join(",")}`)).toEqual([
      "P1<-x10",
      "P2<-P1,x3",
      "P3<-x4,x5",
      "P4<-x4,x5",
      "P5<-P4,x4",
      "P6<-x7",
    ]);
  });
});
