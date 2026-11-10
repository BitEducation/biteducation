import { describe, expect, it } from "vitest";
import { expectDeterministic, expectFramesValid, expectTiles } from "../../../../tests/lesson-checks.ts";
import { expectChecksums } from "../../../../tests/net-checks.ts";
import lesson, { oneWay } from "./ping-traceroute.ts";

describe("lesson ping-traceroute", () => {
  const run = lesson.build(lesson.params.defaults);
  it("pings, then finds three routers and the destination", () => {
    expect(run.steps.map((s) => s.id)).toEqual([
      "s1-ping",
      "s2-varios",
      "s3-ttl1",
      "s4-ttl23",
      "s5-destino",
      "s6-cuidado",
    ]);
    expectTiles(run);
    expectFramesValid(run);
    expectDeterministic(lesson);
    // 1 + 6 + 9 + 4 = 20 ms one way, 40 ms round trip.
    expect(oneWay(4)).toBe(20);
    expect(run.stats.rtt).toBe(40);
    expect(expectChecksums(run)).toBe(Object.keys(run.frames).length);
  });
  it("ICMP errors quote the probe's header and its UDP ports", () => {
    const err = run.frames["f-err-2"];
    const icmp = err?.layers.find((l) => l.id === "icmp");
    const d = err?.data.slice(icmp?.from) as number[];
    expect(d[0]).toBe(11);
    // Quoted UDP destination port = 33434 + 2.
    expect((d[8 + 20 + 2] ?? 0) * 256 + (d[8 + 20 + 3] ?? 0)).toBe(33436);
  });
});
