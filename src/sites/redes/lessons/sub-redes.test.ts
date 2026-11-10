import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { block, prefixFor, toIp, toNum, vlsm } from "../../../sim/net/cidr.ts";
import lesson from "./sub-redes.ts";

describe("lesson sub-redes", () => {
  it("matches the hand calculations (docs/revisao/redes-sub-redes.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      network: "192.168.10.64",
      broadcast: "192.168.10.127",
      hosts: 62,
      subnet: 2,
      used: 228,
      winner: 28,
      other: "prédio",
    });
    expectLabSweep(lesson, [
      { ip: "10.0.0.1", prefixo: 8 },
      { ip: "255.255.255.255", prefixo: 30 },
      { ip: "999.1.1.1", prefixo: 24 },
    ]);
  });

  it("allocates variable blocks aligned", () => {
    const lan = block(toNum("192.168.10.0"), 24);
    const a = vlsm(lan, [100, 50, 20, 2]) ?? [];
    expect(a.map((x) => `${toIp(x.b.network)}/${x.b.prefix}`)).toEqual([
      "192.168.10.0/25",
      "192.168.10.128/26",
      "192.168.10.192/27",
      "192.168.10.224/30",
    ]);
    expect(prefixFor(62)).toBe(26);
    expect(prefixFor(63)).toBe(25);
    expect(vlsm(lan, [200, 100])).toBeNull();
  });
});
