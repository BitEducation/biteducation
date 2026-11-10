import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type CacheConfig, runCache, splitAddress } from "./cache.ts";

const dm: CacheConfig = { addrBits: 16, lines: 8, blockSize: 16, ways: 1, policy: "lru" };
// Sequence worked by hand
const SEQ = [0x1a04, 0x1a08, 0x1a1c, 0x1a0c, 0x2a00, 0x1a04, 0x2a04, 0x1a14, 0x3020, 0x3024, 0x1a00, 0x1a1f];

describe("cache", () => {
  it("splits 16-bit addresses into tag 9 | index 3 | offset 4", () => {
    expect(splitAddress(dm, 0x1a04)).toMatchObject({
      tag: 52,
      index: 0,
      offset: 4,
      tagBits: 9,
      indexBits: 3,
      offsetBits: 4,
    });
    expect(splitAddress(dm, 0x2a00)).toMatchObject({ tag: 84, index: 0 });
  });
  it("hand-worked sequence: 5 hits, 4 compulsory and 3 conflict misses", () => {
    const r = runCache(dm, SEQ);
    expect(r.accesses.map((a) => (a.hit ? "H" : (a.miss as string)[1]))).toEqual([
      "o",
      "H",
      "o",
      "H",
      "o",
      "o",
      "o",
      "H",
      "o",
      "H",
      "o",
      "H",
    ]);
    expect(r.hits).toBe(5);
    expect(r.byKind).toEqual({ compulsório: 4, capacidade: 0, conflito: 3 });
    expect(r.accesses[4]?.evictedTag).toBe(52);
  });
  it("two ways remove the ping-pong conflict", () => {
    const r = runCache({ ...dm, ways: 2 }, SEQ);
    expect(r.byKind.conflito).toBe(0);
    expect(r.hits).toBe(8);
  });
  it("capacity misses appear when the working set is larger than the cache", () => {
    const loop = Array.from({ length: 3 }, () => Array.from({ length: 9 }, (_, k) => k * 16)).flat();
    const r = runCache({ ...dm, ways: 8 }, loop);
    expect(r.byKind.capacidade).toBeGreaterThan(0);
    expect(r.byKind.conflito).toBe(0);
  });
  it("properties: hits + misses = accesses; a fully associative cache has no conflict misses", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 0x3ff }), { maxLength: 60 }),
        fc.constantFrom(1, 2, 4, 8),
        (seq, ways) => {
          const r = runCache({ ...dm, ways }, seq);
          expect(r.hits + r.misses).toBe(seq.length);
          expect(r.byKind.compulsório + r.byKind.capacidade + r.byKind.conflito).toBe(r.misses);
          if (ways === 8) expect(r.byKind.conflito).toBe(0);
        },
      ),
    );
  });
});
