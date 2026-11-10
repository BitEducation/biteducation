import { describe, expect, it } from "vitest";
import { expectDeterministic, expectFramesValid, expectTiles } from "../../../../tests/lesson-checks.ts";
import { inetChecksum } from "../../../sim/net/checksum.ts";
import lesson from "./encapsulamento.ts";

describe("lesson encapsulamento", () => {
  const run = lesson.build(lesson.params.defaults);
  it("has the 7 planned steps and a choice quiz on the gateway MAC", () => {
    expect(run.steps.map((s) => s.id)).toEqual([
      "s1-http",
      "s2-tcp",
      "s3-ip",
      "s4-ethernet",
      "s5-fio",
      "s6-roteadores",
      "s7-servidor",
    ]);
    const q = run.steps[3]?.quiz;
    expect(q?.kind === "choice" && q.answer).toBe(1);
    expectTiles(run);
    expectFramesValid(run);
    expectDeterministic(lesson);
  });
  it("frames grow layer by layer and keep valid IP checksums at each hop", () => {
    expect(["f-http", "f-tcp", "f-ip", "f-eth"].map((id) => run.frames[id]?.layers.length)).toEqual([
      1, 2, 3, 4,
    ]);
    for (const [id, ttl] of [
      ["f-eth", 64],
      ["f-hop1", 63],
      ["f-hop2", 62],
    ] as const) {
      const f = run.frames[id];
      const ip = f?.layers.find((l) => l.id === "ip");
      const hdr = f?.data.slice(ip?.from, ip?.to) as number[];
      expect(inetChecksum(hdr)).toBe(0);
      expect(hdr[8]).toBe(ttl);
    }
    expect(run.stats.bytes).toBe(14 + 20 + 20 + Number(run.stats.http));
  });
});
