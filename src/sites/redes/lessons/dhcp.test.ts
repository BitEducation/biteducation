import { describe, expect, it } from "vitest";
import { expectDeterministic, expectFramesValid, expectTiles } from "../../../../tests/lesson-checks.ts";
import { expectChecksums } from "../../../../tests/net-checks.ts";
import lesson from "./dhcp.ts";

describe("lesson dhcp", () => {
  const run = lesson.build(lesson.params.defaults);
  it("runs DORA, the ARP probe and the renewal at T1", () => {
    expect(run.steps.map((s) => s.id)).toEqual([
      "s1-discover",
      "s2-offer",
      "s3-request",
      "s4-ack",
      "s5-sonda",
      "s6-renovacao",
      "s7-confianca",
    ]);
    expectTiles(run);
    expectFramesValid(run);
    expectDeterministic(lesson);
    expect(run.stats.t1).toBe(1800);
    expect(expectChecksums(run)).toBe(6);
  });
  it("DHCP messages keep the BOOTP layout: options start after 236 bytes and the magic cookie", () => {
    const f = run.frames["f-discover"];
    const d = f?.layers.find((l) => l.id === "dhcp");
    const bytes = f?.data.slice(d?.from) as number[];
    expect(bytes.slice(236, 240)).toEqual([99, 130, 83, 99]);
    expect(bytes.slice(240, 243)).toEqual([53, 1, 1]);
    expect(bytes.at(-1)).toBe(255);
  });
});
