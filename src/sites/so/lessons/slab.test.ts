import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { buddyBlock, perSlab, SlabCache } from "../../../sim/os/slab.ts";
import lesson from "./slab.ts";

describe("lesson slab", () => {
  it("matches the hand calculations (docs/revisao/so-slab.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      perSlab: 6,
      buddy: 1024,
      wasteBuddy: "41%",
      wasteSlab: "12%",
      pages: 167,
      reused: "4,3",
      free: 7,
    });
    expectLabSweep(lesson, [{ tamanho: 200 }, { tamanho: 512 }, { tamanho: 800 }]);
  });

  it("prefers partial slabs and reuses the slot freed last", () => {
    const c = new SlabCache(1000);
    expect(c.k).toBe(4);
    for (let i = 0; i < 6; i++) c.alloc(`o${i}`);
    expect(c.slabs.map((s) => s.filter(Boolean).length)).toEqual([4, 2]);
    c.release(0, 0);
    c.release(0, 2);
    expect(c.alloc("x")).toEqual({ slab: 0, slot: 2, newSlab: false });
    c.release(1, 0);
    c.release(1, 1);
    expect(c.state(1)).toBe("vazio");
    expect(c.alloc("y")).toEqual({ slab: 0, slot: 0, newSlab: false });
    expect(c.alloc("z")).toEqual({ slab: 1, slot: 1, newSlab: false });
    expect([perSlab(600), buddyBlock(600), buddyBlock(512)]).toEqual([6, 1024, 512]);
  });
});
