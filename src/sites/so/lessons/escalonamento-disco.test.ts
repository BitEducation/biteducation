import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { diskSchedule } from "../../../sim/os/disk.ts";
import lesson, { parseReqs } from "./escalonamento-disco.ts";

describe("lesson escalonamento-disco", () => {
  it("matches the hand calculations (docs/revisao/so-escalonamento-disco.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      fcfs: 746,
      sstf: 301,
      scan: 313,
      look: 285,
      cscan: 390,
      clook: 332,
      first: 62,
    });
    expectLabSweep(lesson, [
      { inicio: 0, pedidos: "199 0 100", sobe: true },
      { inicio: 199, pedidos: "5 10 15", sobe: true },
      { inicio: 100, pedidos: "100 100 50 150", sobe: false },
      { inicio: 50, pedidos: "1", sobe: false },
    ]);
  });

  it("serves every request exactly once in every algorithm", () => {
    const reqs = [5, 199, 0, 87, 87, 140];
    for (const a of ["fcfs", "sstf", "scan", "look", "cscan", "clook"] as const)
      for (const up of [true, false]) {
        const r = diskSchedule(90, reqs, a, { max: 199, up });
        expect([...r.order].sort((x, y) => x - y)).toEqual([...reqs].sort((x, y) => x - y));
      }
  });

  it("falls back to the default queue on short input", () => {
    expect(parseReqs("1 2")).toEqual(parseReqs("120 15 160 62 90 30 185 80"));
  });
});
