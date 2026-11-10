import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { BROADCAST, copies, flatLan, Lan, parseVlans } from "../../../sim/net/switching.ts";
import lesson from "./switch-vlan.ts";

describe("lesson switch-vlan", () => {
  it("matches the hand calculations (docs/revisao/redes-switch-vlan.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      flood: 7,
      reply: 3,
      unicast: 21,
      hub: 49,
      bcast: 7,
      vlanBcast: 4,
      viaRouter: 4,
    });
    expectLabSweep(lesson, [
      { vlans: "111111", origem: "A" },
      { vlans: "222222", origem: "F" },
      { vlans: "111112", origem: "F" },
      { vlans: "xyz", origem: "Z" },
    ]);
  });

  it("learns sources, floods unknowns and keeps VLANs apart", () => {
    const lan = flatLan();
    expect(lan.send("A", "D").flooded).toBe(true);
    const back = lan.send("D", "A");
    expect(back.flooded).toBe(false);
    expect(back.hops.map((h) => h.to)).toEqual(["S2", "S1", "A"]);
    expect(lan.tables.S2.get("1|A")).toBe(4);

    const v = new Lan(parseVlans("112122"));
    const b = v.send("C", BROADCAST);
    expect(copies(b)).toBe(4);
    expect(b.hops.find((h) => h.from === "S1" && h.to === "S2")?.tag).toBe(20);
    expect(v.send("A", "C").hops.some((h) => h.to === "C")).toBe(false);
  });
});
