import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { AsmError, assemble, decode, encode, type Instr, OPS } from "./riscv.ts";

// Vectors worked by hand bit by bit and cross-checked
// against the encodings listed in the RISC-V ISA manual's opcode map.
const VECTORS: [string, number][] = [
  ["add x5, x6, x7", 0x007302b3],
  ["sub x5, x6, x7", 0x407302b3],
  ["addi x5, x5, -12", 0xff428293],
  ["lw x8, 16(x2)", 0x01012403],
  ["sw x8, 20(x2)", 0x00812a23],
  ["nop", 0x00000013],
  ["ret", 0x00008067],
  ["ecall", 0x00000073],
  ["ebreak", 0x00100073],
  ["lui x10, 0x12345", 0x12345537],
  ["slli x5, x6, 3", 0x00331293],
  ["srai x5, x6, 3", 0x40335293],
  ["mul x10, x11, x12", 0x02c58533],
];

describe("riscv encoder", () => {
  for (const [src, word] of VECTORS)
    it(src, () => {
      const [l] = assemble(src);
      expect(l?.word.toString(16).padStart(8, "0")).toBe(word.toString(16).padStart(8, "0"));
    });
  it("branch to a label: beq x5, x0, fim (offset +8)", () => {
    const prog = assemble("beq x5, x0, fim\nnop\nfim: nop");
    expect(prog[0]?.ins.imm).toBe(8);
    expect(prog[0]?.word).toBe(0x00028463);
  });
  it("backward jump: j loop (offset -4)", () => {
    const prog = assemble("loop: nop\nj loop");
    expect(prog[1]?.ins.imm).toBe(-4);
    expect(prog[1]?.word).toBe(0xffdff06f);
  });
  it("friendly errors with line and suggestion", () => {
    try {
      assemble("nop\nmov a0, a1");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AsmError);
      expect((e as AsmError).line).toBe(2);
      expect((e as AsmError).message).toContain("mv");
    }
    expect(() => assemble("addi x1, x1, 5000")).toThrow(/-2048/);
    expect(() => assemble("add x1, x2")).toThrow(/3 operandos/);
    expect(() => assemble("lw x1, 4[sp]")).toThrow(/deslocamento\(registrador\)/);
    expect(() => assemble("add x1, x2, x40")).toThrow(/Registrador/);
  });
});

const reg = fc.integer({ min: 0, max: 31 });
const instrArb: fc.Arbitrary<Instr> = fc.constantFrom(...Object.keys(OPS)).chain((op) => {
  const s = OPS[op] as (typeof OPS)[string];
  switch (s.fmt) {
    case "R":
      return fc.record({ op: fc.constant(op), rd: reg, rs1: reg, rs2: reg });
    case "I":
      if (s.kind === "sys") return fc.constant({ op });
      if (s.kind === "shift")
        return fc.record({ op: fc.constant(op), rd: reg, rs1: reg, imm: fc.integer({ min: 0, max: 31 }) });
      return fc.record({
        op: fc.constant(op),
        rd: reg,
        rs1: reg,
        imm: fc.integer({ min: -2048, max: 2047 }),
      });
    case "S":
      return fc.record({
        op: fc.constant(op),
        rs1: reg,
        rs2: reg,
        imm: fc.integer({ min: -2048, max: 2047 }),
      });
    case "B":
      return fc.record({
        op: fc.constant(op),
        rs1: reg,
        rs2: reg,
        imm: fc.integer({ min: -2048, max: 2047 }).map((x) => x * 2),
      });
    case "U":
      return fc.record({ op: fc.constant(op), rd: reg, imm: fc.integer({ min: 0, max: 0xfffff }) });
    case "J":
      return fc.record({
        op: fc.constant(op),
        rd: reg,
        imm: fc.integer({ min: -524288, max: 524287 }).map((x) => x * 2),
      });
  }
});

describe("riscv decoder", () => {
  it("decode(encode(i)) round-trips every field", () => {
    fc.assert(
      fc.property(instrArb, (ins) => {
        const d = decode(encode(ins));
        expect(d.op).toBe(ins.op);
        for (const k of ["rd", "rs1", "rs2", "imm"] as const)
          if (ins[k] !== undefined) expect(d[k]).toBe(ins[k]);
      }),
      { numRuns: 2000 },
    );
  });
  it("assemble(format(decode(w))) gives back w", () => {
    fc.assert(
      fc.property(instrArb, (ins) => {
        const w = encode(ins);
        expect(assemble(decode(w).text)[0]?.word).toBe(w);
      }),
      { numRuns: 1000 },
    );
  });
  it("rejects words outside the subset", () => {
    expect(() => decode(0xffffffff)).toThrow();
    expect(() => decode(0)).toThrow();
  });
});
