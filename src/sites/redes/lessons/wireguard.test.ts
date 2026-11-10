import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { accepts, encapsulate, route, safeMtu, segments } from "../../../sim/net/wireguard.ts";
import lesson from "./wireguard.ts";

describe("lesson wireguard", () => {
  it("matches the hand calculations (docs/revisao/redes-wireguard.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      inner: 1240,
      outer: 1308,
      padding: 8,
      extra: 68,
      full4: 1480,
      full6: 1500,
      fits6: "sim",
      server: "túnel",
      site: "direto",
      forged: "descartada",
    });
    expectLabSweep(lesson, [
      { carga: 1, mtu: 1280, tudo: true },
      { carga: 1460, mtu: 1500, tudo: false },
      { carga: 1400, mtu: 1440, tudo: true },
    ]);
  });

  it("pads to 16 bytes without passing the MTU and routes by longest prefix", () => {
    expect(encapsulate(1415, 1420).padding).toBe(5);
    expect(encapsulate(1419, 1420).padding).toBe(1);
    expect(encapsulate(1420, 1420, true).outer).toBe(1500);
    expect(safeMtu()).toBe(1420);
    expect(segments(1460, 1420)).toEqual([1380, 80]);
    const peers = [
      { name: "a", allowed: ["0.0.0.0/0"] },
      { name: "b", allowed: ["10.0.0.0/8"] },
    ];
    expect(route(peers, "10.1.2.3")?.peer.name).toBe("b");
    expect(route(peers, "8.8.8.8")?.peer.name).toBe("a");
    expect(accepts({ name: "c", allowed: ["10.8.0.3/32"] }, "10.8.0.2")).toBe(false);
  });
});
