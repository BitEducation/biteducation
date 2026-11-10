import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { locate, mapFile, maxBlocks } from "../../../sim/os/inode.ts";
import lesson from "./inodes.ts";

describe("lesson inodes", () => {
  it("matches the hand calculations (docs/revisao/so-inodes.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      reads: 7,
      blocks: 50,
      index: 1,
      block: 25,
      level: "indireto simples",
      max4: "4 TiB",
    });
    expectLabSweep(lesson, [
      { tamanho: 1, bloco: "4", deslocamento: 0 },
      { tamanho: 100000, bloco: "1", deslocamento: 99999 },
      { tamanho: 48, bloco: "4", deslocamento: 47 },
    ]);
  });

  it("maps blocks across all levels", () => {
    const KB = 1024;
    expect(mapFile(48 * KB, 4 * KB)).toMatchObject({ dataBlocks: 12, direct: 12, single: 0, indexBlocks: 0 });
    expect(mapFile(100000 * KB, KB)).toMatchObject({
      direct: 12,
      single: 256,
      double: 65536,
      triple: 34196,
      indexBlocks: 1 + (1 + 256) + (1 + 1 + 134),
    });
    expect(locate(12 * 4 * KB, 4 * KB)).toMatchObject({
      block: 12,
      level: "indireto simples",
      path: [12, 0],
    });
    expect(locate((12 + 1024) * 4 * KB, 4 * KB)).toMatchObject({ level: "indireto duplo", path: [13, 0, 0] });
    expect(maxBlocks(KB)).toBe(12 + 256 + 65536 + 16777216);
  });
});
