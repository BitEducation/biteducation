import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { serve } from "../../../sim/os/threads.ts";
import lesson from "./threads.ts";

describe("lesson threads", () => {
  it("matches the hand calculations (docs/revisao/so-threads.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ single: 30, kernel: 14, user: 30, idleSingle: 18, idleKernel: 2, noIo: 12 });
    expectLabSweep(lesson, [
      { pedidos: 1, cpu: 1, es: 0 },
      { pedidos: 6, cpu: 5, es: 12 },
      { pedidos: 6, cpu: 1, es: 12 },
    ]);
  });

  it("overlaps I/O only with kernel threads", () => {
    const k = serve(3, 2, 6, "kernel");
    expect(k.slices.map((s) => [s.req, s.from])).toEqual([
      [0, 0],
      [1, 2],
      [2, 4],
      [0, 8],
      [1, 10],
      [2, 12],
    ]);
    expect(serve(3, 2, 6, "user")).toEqual(serve(3, 2, 6, "single"));
    for (let n = 1; n <= 6; n++)
      for (let io = 0; io <= 12; io += 3) {
        const one = serve(n, 2, io, "single");
        const ker = serve(n, 2, io, "kernel");
        expect(ker.end).toBeLessThanOrEqual(one.end);
        expect(ker.busy).toBe(one.busy);
      }
  });
});
