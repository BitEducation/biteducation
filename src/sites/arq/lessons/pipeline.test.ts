import { describe, expect, it } from "vitest";
import lesson from "./pipeline.ts";

const tiles = (run: ReturnType<typeof lesson.build>) => {
  let at = 0;
  for (const s of run.steps) {
    expect(s.events[0]).toBe(at);
    expect(s.events[1]).toBeGreaterThan(s.events[0]);
    at = s.events[1];
  }
  expect(at).toBe(run.trace.length);
};

describe("lesson pipeline", () => {
  const run = lesson.build(lesson.params.defaults);
  it("matches the hand-worked numbers", () => {
    expect(run.stats).toMatchObject({ cycles1: 9, cycles2: 11, bubbles: 2, single: 4000, piped: 1800 });
  });
  it("has 6 steps, a numeric quiz of 11 cycles and the ID/EX frame", () => {
    expect(run.steps.map((s) => s.id)).toEqual([
      "s1-sequencial",
      "s2-enche",
      "s3-regime",
      "s4-registradores",
      "s5-dependencia",
      "s6-ganho",
    ]);
    const quiz = run.steps[4]?.quiz;
    expect(quiz?.kind === "number" && quiz.answer).toBe(11);
    expect(Object.keys(run.frames)).toEqual(["id-ex"]);
    tiles(run);
  });
  it("counts the two bubbles", () => {
    const counter = lesson.counter;
    expect(run.trace.filter((e) => counter?.test(e)).length).toBe(2);
  });
  it("is deterministic", () => {
    expect(JSON.stringify(lesson.build(lesson.params.defaults))).toBe(JSON.stringify(run));
  });
  it("lab: load-use costs one bubble with forwarding, four without", () => {
    const programa = "lw x5, 0(x10)\nadd x6, x5, x5\nsw x6, 4(x10)";
    const fwd = lesson.build({ programa, forwarding: true });
    const nofwd = lesson.build({ programa, forwarding: false });
    expect(fwd.stats.bubbles).toBe(1);
    expect(nofwd.stats.bubbles).toBe(4); // lw→add and add→sw, 2 each
    tiles(fwd);
    tiles(nofwd);
    expect(lesson.build({ programa: "nop", forwarding: false }).steps.length).toBe(1);
    const twelve = Array.from({ length: 12 }, (_, i) => `add x${i + 1}, x${i}, x${i}`).join("\n");
    expect(lesson.build({ programa: twelve, forwarding: false }).stats.cycles).toBeLessThanOrEqual(40);
  });
  it("scene follows the lab program", () => {
    const spec =
      typeof lesson.scene === "function"
        ? lesson.scene({ programa: "nop\nnop", forwarding: false })
        : lesson.scene;
    expect(spec.widgets?.length).toBe(1);
  });
});
