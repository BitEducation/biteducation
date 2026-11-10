import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { mountOf } from "../../../sim/os/blockcache.ts";
import lesson from "./cache-de-blocos.ts";

describe("lesson cache-de-blocos", () => {
  it("matches the hand trace (docs/revisao/so-cache-de-blocos.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      first: 2,
      firstPlain: 8,
      rehits: 4,
      requests: 6,
      requestsPlain: 21,
      wrote: 1,
    });
    expectLabSweep(lesson, [
      { antecipacao: 1, capacidade: 4 },
      { antecipacao: 8, capacidade: 24 },
    ]);
  });

  it("resolves mounts by longest prefix", () => {
    expect(mountOf("/mnt/pen/a").fs).toBe("vfat");
    expect(mountOf("/mnt/penX").fs).toBe("ext4");
  });
});
