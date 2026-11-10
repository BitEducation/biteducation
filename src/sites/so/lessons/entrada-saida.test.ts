import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { cost, timeline } from "../../../sim/os/io.ts";
import lesson from "./entrada-saida.ts";

describe("lesson entrada-saida", () => {
  it("matches the hand calculations (docs/revisao/so-entrada-saida.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      words: 1024,
      transfer: 10240,
      poll: 10240,
      irq: 2048,
      dma: 7,
      irqShare: "20%",
    });
    expectLabSweep(lesson, [
      { tamanho: 1, intervalo: 1 },
      { tamanho: 64, intervalo: 100 },
      { tamanho: 8, intervalo: 2 },
    ]);
  });

  it("costs and draws each mode", () => {
    expect(cost("interrupcao", 4096, 2).cpu).toBeNull();
    expect(cost("interrupcao", 4096, 3).cpu).toBe(2048);
    expect(cost("dma", 65536, 1).cpu).toBe(7);
    expect(timeline("interrupcao", 10, 2)).toEqual([
      { from: 0, to: 10, item: "outro" },
      { from: 10, to: 12, item: "int" },
      { from: 12, to: 20, item: "outro" },
    ]);
    expect(timeline("dma", 10, 5)).toEqual([
      { from: 0, to: 5, item: "prepara" },
      { from: 5, to: 50, item: "outro" },
    ]);
  });
});
