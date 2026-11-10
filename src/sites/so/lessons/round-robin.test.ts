import { describe, expect, it } from "vitest";
import lesson, { parseProcs } from "./round-robin.ts";

describe("lesson round-robin", () => {
  const run = lesson.build(lesson.params.defaults);
  it("matches the hand-worked example", () => {
    expect(run.stats).toMatchObject({
      avgWait: 8,
      switches: 4,
      makespan: 20,
      utilization: 0.8,
      avgResponse: 3,
    });
    expect(run.stats.avgTurnaround).toBeCloseTo(40 / 3);
  });
  it("has the 7 planned steps, a pick quiz and a PCB frame", () => {
    expect(run.steps.map((s) => s.id)).toEqual([
      "s1-chegada",
      "s2-timer",
      "s3-troca",
      "s4-termina",
      "s5-rodizio",
      "s6-contas",
      "s7-quantum",
    ]);
    const quiz = run.steps[1]?.quiz;
    expect(quiz?.kind === "pick" && quiz.answer).toBe("compilador");
    expect(Object.keys(run.frames)).toEqual(["pcb-editor"]);
  });
  it("steps tile the trace without gaps", () => {
    let at = 0;
    for (const s of run.steps) {
      expect(s.events[0]).toBe(at);
      expect(s.events[1]).toBeGreaterThan(s.events[0]);
      at = s.events[1];
    }
    expect(at).toBe(run.trace.length);
  });
  it("is deterministic", () => {
    expect(JSON.stringify(lesson.build(lesson.params.defaults))).toBe(JSON.stringify(run));
  });
  it("lab extremes build", () => {
    for (const quantum of [1, 20])
      for (const troca of [0, 3]) {
        const r = lesson.build({ quantum, troca, processos: "0:12 0:12 5:1 30:12 2:3 1:1" });
        expect(r.steps.length).toBeGreaterThanOrEqual(3);
      }
    expect(() => parseProcs("0:0")).toThrow();
    expect(() => parseProcs("")).toThrow();
  });
});
