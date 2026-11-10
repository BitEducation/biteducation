import { describe, expect, it } from "vitest";
import { expectDeterministic, expectFramesValid, expectTiles } from "../../../../tests/lesson-checks.ts";
import lesson from "./doh.ts";

describe("lesson doh", () => {
  it("carries the same DNS message in clear and inside HTTPS", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectFramesValid(run);
    expectDeterministic(lesson);
    const inside = run.frames["f-inside"];
    const dnsLayer = inside?.layers.find((l) => l.id === "dns");
    const plain = run.frames["f-plain"]?.layers.find((l) => l.id === "dns");
    expect(dnsLayer && plain && dnsLayer.to - dnsLayer.from).toBe(plain && plain.to - plain.from);
    expect(dnsLayer && dnsLayer.to - dnsLayer.from).toBe(run.stats.query);
  });
});
