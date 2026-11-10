import { describe, expect, it } from "vitest";
import lesson from "./produtor-consumidor.ts";

describe("lesson produtor-consumidor", () => {
  const run = lesson.build(lesson.params.defaults);
  it("has the 7 planned steps and a choice quiz on the full buffer", () => {
    expect(run.steps.map((s) => s.id)).toEqual([
      "s1-problema",
      "s2-espera",
      "s3-insere",
      "s4-retira",
      "s5-cheio",
      "s6-ritmo",
      "s7-deadlock",
    ]);
    const q = run.steps[4]?.quiz;
    expect(q?.kind === "choice" && q.answer).toBe(1);
  });
  it("delivers every item, fills the buffer and deadlocks with the wrong order (default params)", () => {
    expect(run.stats).toMatchObject({ consumed: 8, maxFill: 4, deadlock: 1 });
  });
  it("steps tile the trace", () => {
    let at = 0;
    for (const s of run.steps) {
      expect(s.events[0]).toBe(at);
      at = s.events[1];
    }
    expect(at).toBe(run.trace.length);
  });
  it("lab extremes and a script build", () => {
    for (const buffer of [1, 8])
      for (const v of [1, 24])
        lesson.build({ buffer, itens: 12, velProdutor: v, velConsumidor: 25 - v, roteiro: "" });
    const r = lesson.build({ ...lesson.params.defaults, roteiro: "C P P P C c p" });
    expect(r.labNotes?.some((n) => n.includes("7 micro-operações"))).toBe(true);
  });
});
