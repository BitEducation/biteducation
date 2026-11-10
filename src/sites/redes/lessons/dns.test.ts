import { describe, expect, it } from "vitest";
import { expectDeterministic, expectFramesValid, expectTiles } from "../../../../tests/lesson-checks.ts";
import { inetChecksum } from "../../../sim/net/checksum.ts";
import { pseudoHeader } from "../../../sim/net/ipv4.ts";
import lesson, { D } from "./dns.ts";

describe("lesson dns", () => {
  const run = lesson.build(lesson.params.defaults);
  it("walks root, TLD and authoritative, then answers from cache", () => {
    expect(run.steps.map((s) => s.id)).toEqual([
      "s1-pergunta",
      "s2-raiz",
      "s3-tld",
      "s4-autoritativo",
      "s5-cache",
      "s6-segunda",
      "s7-riscos",
    ]);
    expectTiles(run);
    expectFramesValid(run);
    expectDeterministic(lesson);
    // 2 × (1 + 10 + 15 + 8) = 68 ms, worked by hand.
    expect(run.stats.first).toBe(2 * (D.lan + D.root + D.tld + D.auth));
    expect(run.stats.first).toBe(68);
    expect(run.stats.left).toBe(240);
  });
  it("every UDP checksum verifies and answers repeat the query id", () => {
    for (const f of Object.values(run.frames)) {
      const ip = f.layers.find((l) => l.id === "ip");
      const u = f.layers.find((l) => l.id === "udp");
      const data = f.data as number[];
      expect(inetChecksum(data.slice(ip?.from, ip?.to))).toBe(0);
      const seg = data.slice(u?.from);
      const src = data.slice(12, 16).join(".");
      const dst = data.slice(16, 20).join(".");
      expect(inetChecksum([...pseudoHeader(src, dst, 17, seg.length), ...seg])).toBe(0);
    }
    const q = run.frames["f-q1"]?.data as number[];
    const r = run.frames["f-r1"]?.data as number[];
    expect(r.slice(28, 30)).toEqual(q.slice(28, 30));
  });
  it("an expired TTL sends the resolver back to the authoritative server", () => {
    const late = lesson.build({ ttl: 30, depois: 60 });
    expect(late.stats.hit).toBe(0);
    expect(late.steps[5]?.title).toBe("Cache expirado");
    expectTiles(late);
  });
});
