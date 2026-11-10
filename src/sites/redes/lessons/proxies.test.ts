import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { balance, runCache } from "../../../sim/net/proxy.ts";
import lesson from "./proxies.ts";

describe("lesson proxies", () => {
  it("matches the hand calculations (docs/revisao/redes-proxies.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      hits: 10,
      meanMs: "31,7",
      originKb: "250",
      revalidated: 5,
      rr: "3,8",
      least: "2,6",
    });
    expectLabSweep(lesson, [
      { capacidade: 1, validade: 1, servidores: 2 },
      { capacidade: 8, validade: 30, servidores: 5 },
      { capacidade: 3, validade: 10, servidores: 4 },
    ]);
  });

  it("evicts the least recently used object and balances by open connections", () => {
    const reqs = ["a", "b", "a", "c", "b"].map((obj, t) => ({ t, client: 0, obj }));
    const r = runCache(reqs, 2, 100);
    expect(r.served.map((s) => s.result)).toEqual(["miss", "miss", "hit", "miss", "miss"]);
    expect(r.served[3]?.evicted).toBe("b");
    expect(balance("least", 2, [5, 1, 1]).picks).toEqual([0, 1, 1]);
  });
});
