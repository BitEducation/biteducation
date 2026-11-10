import { describe, expect, it } from "vitest";
import lesson from "./chamada-de-sistema.ts";

describe("lesson chamada-de-sistema", () => {
  const run = lesson.build({});
  it("has 7 steps tiling the trace and both frames referenced", () => {
    expect(run.steps).toHaveLength(7);
    let at = 0;
    for (const s of run.steps) {
      expect(s.events[0]).toBe(at);
      at = s.events[1];
    }
    expect(at).toBe(run.trace.length);
    const used = new Set(run.trace.map((e) => e.frame).filter(Boolean));
    expect([...used].sort()).toEqual(Object.keys(run.frames).sort());
  });
  it("counts the mode changes shown in the counter", () => {
    const modes = run.trace.filter((e) => e.kind === "count").map((e) => (e.kind === "count" ? e.value : ""));
    const changes = modes.filter((m, i) => i > 0 && m !== modes[i - 1]).length;
    expect(changes).toBe(run.stats.modeSwitches);
  });
});
