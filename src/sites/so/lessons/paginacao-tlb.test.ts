import { describe, expect, it } from "vitest";
import lesson, { eat, parseSeq } from "./paginacao-tlb.ts";

describe("lesson paginacao-tlb", () => {
  const run = lesson.build(lesson.params.defaults);
  it("matches the hand-worked example", () => {
    expect(run.stats).toMatchObject({ hits: 6, accesses: 10, faults: 1 });
    expect(eat(0.6)).toBeCloseTo(141);
    const quiz = run.steps.find((s) => s.id === "s5-falta")?.quiz;
    expect(quiz?.kind === "number" && quiz.answer).toBe(0x3010);
    expect(run.frames["pa-0"]?.title).toBe("Endereço físico 0x5A7C");
  });
  it("has the 7 planned steps tiling the trace", () => {
    expect(run.steps.map((s) => s.id)).toEqual([
      "s1-endereco",
      "s2-tlb-miss",
      "s3-traducao",
      "s4-tlb-hit",
      "s5-falta",
      "s6-bits",
      "s7-custo",
    ]);
    let at = 0;
    for (const s of run.steps) {
      expect(s.events[0]).toBe(at);
      at = s.events[1];
    }
    expect(at).toBe(run.trace.length);
  });
  it("lab extremes build and bad input is rejected", () => {
    const seq32 = Array.from(
      { length: 32 },
      (_, k) => `0x${(k * 0x0801).toString(16)}${k % 3 ? "" : "w"}`,
    ).join(" ");
    for (const tlb of [1, 8])
      for (const pagina of ["4096", "8192"])
        for (const politica of ["lru", "fifo"]) lesson.build({ pagina, tlb, politica, enderecos: seq32 });
    expect(() => parseSeq("0x12345")).toThrow();
    expect(() => parseSeq("")).toThrow();
  });
});
