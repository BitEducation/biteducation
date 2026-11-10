import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type PipeInstr, runPipeline } from "./pipeline.ts";

const indep: PipeInstr[] = [
  { label: "i1", rd: 1, srcs: [2, 3] },
  { label: "i2", rd: 4, srcs: [5, 6] },
  { label: "i3", rd: 7, srcs: [8, 9] },
];

describe("pipeline", () => {
  it("N independent instructions take N + 4 cycles", () => {
    const r = runPipeline(indep, false);
    expect(r.cycles).toBe(7);
    expect(r.bubbles).toBe(0);
    expect(r.grid[3]).toEqual(["i3", "i2", "i1", null, null]);
  });
  it("RAW without forwarding: 2 bubbles (write in WB, read in ID same cycle)", () => {
    const r = runPipeline(
      [
        { label: "add", rd: 5, srcs: [6, 7] },
        { label: "sub", rd: 8, srcs: [5, 9] },
      ],
      false,
    );
    expect(r.timings[1]).toMatchObject({ id: 3, idEnd: 5, ex: 6, stalls: 2, waitedFor: 0 });
    expect(r.cycles).toBe(8);
    expect(r.grid[4]?.[2]).toBe("bolha");
    expect(r.grid[5]?.[2]).toBe("bolha");
  });
  it("forwarding removes ALU stalls but not load-use (1 bubble)", () => {
    expect(
      runPipeline(
        [
          { label: "add", rd: 5, srcs: [] },
          { label: "sub", rd: 8, srcs: [5] },
        ],
        true,
      ).bubbles,
    ).toBe(0);
    expect(
      runPipeline(
        [
          { label: "lw", rd: 5, srcs: [2], isLoad: true },
          { label: "sub", rd: 8, srcs: [5] },
        ],
        true,
      ).bubbles,
    ).toBe(1);
  });
  it("x0 never creates a dependency", () => {
    expect(
      runPipeline(
        [
          { label: "a", rd: 0, srcs: [] },
          { label: "b", rd: 1, srcs: [0] },
        ],
        false,
      ).bubbles,
    ).toBe(0);
  });
  it("properties: each stage holds at most one instruction per cycle; order is preserved", () => {
    const prog = fc.array(
      fc.record({
        rd: fc.integer({ min: 0, max: 4 }),
        srcs: fc.array(fc.integer({ min: 0, max: 4 }), { maxLength: 2 }),
        isLoad: fc.boolean(),
      }),
      { minLength: 1, maxLength: 10 },
    );
    fc.assert(
      fc.property(prog, fc.boolean(), (p, fwd) => {
        const r = runPipeline(
          p.map((x, i) => ({ ...x, label: `i${i}` })),
          fwd,
        );
        for (let i = 1; i < r.timings.length; i++) {
          const a = r.timings[i - 1];
          const b = r.timings[i];
          expect(b?.ex).toBeGreaterThan(a?.ex ?? 0);
          expect(b?.wb).toBe((b?.ex ?? 0) + 2);
        }
        expect(r.cycles).toBe(p.length + 4 + r.bubbles);
        if (fwd)
          expect(r.bubbles).toBeLessThanOrEqual(
            runPipeline(
              p.map((x, i) => ({ ...x, label: `i${i}` })),
              false,
            ).bubbles,
          );
      }),
    );
  });
});
