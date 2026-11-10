import { describe, expect, it } from "vitest";
import { expectDeterministic, expectFramesValid, expectTiles } from "../../../../tests/lesson-checks.ts";
import { expectChecksums } from "../../../../tests/net-checks.ts";
import { eui64, ip6, ip6Text, multicastMac, solicitedNode } from "../../../sim/net/ipv6.ts";
import lesson from "./ipv6-slaac.ts";

describe("ipv6 helpers", () => {
  it("parse and print addresses canonically", () => {
    expect(ip6Text(ip6("2001:0db8:0000:0000:0000:0000:0000:0001"))).toBe("2001:db8::1");
    expect(ip6Text(ip6("fe80::1"))).toBe("fe80::1");
    expect(ip6Text(ip6("::"))).toBe("::");
    expect(ip6Text(ip6("2001:db8:0:1:0:0:0:1"))).toBe("2001:db8:0:1::1");
    expect(solicitedNode("fe80::1:2a3b:4c5d")).toBe("ff02::1:ff3b:4c5d");
    expect(multicastMac("ff02::1:ff3b:4c5d")).toBe("33:33:ff:3b:4c:5d");
    expect(eui64("02:00:00:20:00:42")).toEqual([0, 0, 0, 0xff, 0xfe, 0x20, 0, 0x42]);
  });
});

describe("lesson ipv6-slaac", () => {
  const run = lesson.build(lesson.params.defaults);
  it("builds link-local and global addresses from the same interface id", () => {
    expect(run.steps.length).toBe(7);
    expectTiles(run);
    expectFramesValid(run);
    expectDeterministic(lesson);
    const ll = String(run.stats.ll);
    const g = String(run.stats.global);
    expect(ll.startsWith("fe80::")).toBe(true);
    expect(g.startsWith("2001:db8:20:")).toBe(true);
    expect(ip6(ll).slice(8)).toEqual(ip6(g).slice(8));
    expect(expectChecksums(run)).toBe(Object.keys(run.frames).length);
  });
});
