import { describe, expect, it } from "vitest";
import { assemble, encode } from "../../../sim/arch/riscv.ts";
import lesson from "./instrucao-riscv.ts";

const tiles = (run: ReturnType<typeof lesson.build>) => {
  let at = 0;
  for (const s of run.steps) {
    expect(s.events[0]).toBe(at);
    expect(s.events[1]).toBeGreaterThan(s.events[0]);
    at = s.events[1];
  }
  expect(at).toBe(run.trace.length);
};

describe("lesson instrucao-riscv", () => {
  const run = lesson.build(lesson.params.defaults);
  it("has the 7 planned steps and a choice quiz with answer 1", () => {
    expect(run.steps.map((s) => s.id)).toEqual([
      "s1-texto",
      "s2-opcode",
      "s3-registradores",
      "s4-funct",
      "s5-tipo-i",
      "s6-tipo-s",
      "s7-tipo-b",
    ]);
    const quiz = run.steps[3]?.quiz;
    expect(quiz?.kind === "choice" && quiz.answer).toBe(1);
    tiles(run);
  });
  it("tour words match hand-checked encodings", () => {
    const words = assemble("add x5, x6, x7\nsub x5, x6, x7\naddi x5, x5, -12\nsw x8, 20(x2)").map(
      (l) => l.word >>> 0,
    );
    expect(words).toEqual([0x007302b3, 0x407302b3, 0xff428293, 0x00812a23]);
    const text = JSON.stringify(run);
    expect(text).toContain("0x007302B3");
  });
  it("is deterministic", () => {
    expect(JSON.stringify(lesson.build(lesson.params.defaults))).toBe(JSON.stringify(run));
  });
  it("lab accepts assembly and hex and tiles the trace", () => {
    for (const instrucao of [
      "add x5, x6, x7",
      "0x007302B3",
      "lui x1, 0x12345",
      "beq x1, x2, 8",
      "lw x9, -4(x3)",
      "jal x1, 16",
      "ecall",
    ]) {
      const r = lesson.build({ instrucao });
      expect(r.steps.length).toBeGreaterThanOrEqual(2);
      tiles(r);
    }
    expect(() => lesson.build({ instrucao: "foo x1" })).toThrow();
    expect(encode).toBeTypeOf("function");
  });
});
