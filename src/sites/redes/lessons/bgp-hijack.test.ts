import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { contains, rpki } from "../../../sim/net/bgp.ts";
import lesson from "./bgp-hijack.ts";

describe("lesson bgp-hijack", () => {
  it("matches the hand calculations (docs/revisao/redes-bgp-hijack.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ via: 200, loops: 3, hijacked: "300 666", defended: "200 250 400" });
    expect(lesson.build({ politica: false, rov: true }).stats.via).toBe(300);
    expect(lesson.build({ politica: true, rov: false }).stats.defended).toBe("300 666");
    expectLabSweep(lesson, [
      { politica: false, rov: false },
      { politica: false, rov: true },
    ]);
  });

  it("validates origins like RFC 6811", () => {
    const roas = [{ prefix: "203.0.113.0/24", maxLen: 24, asn: 400 }];
    expect(rpki(roas, "203.0.113.0/24", 400)).toBe("valid");
    expect(rpki(roas, "203.0.113.0/25", 400)).toBe("invalid");
    expect(rpki(roas, "203.0.113.0/24", 666)).toBe("invalid");
    expect(rpki(roas, "198.51.100.0/24", 666)).toBe("unknown");
    expect(contains("203.0.113.0/24", "203.0.113.200/32")).toBe(true);
    expect(contains("203.0.113.0/25", "203.0.113.200/32")).toBe(false);
  });
});
