/**
 * RV32I + M subset: encoder, decoder and a small assembler with labels.
 * Pure functions; errors are thrown as AsmError with line and column for friendly messages.
 */
export type Format = "R" | "I" | "S" | "B" | "U" | "J";

export class AsmError extends Error {
  constructor(
    message: string,
    readonly line: number,
    readonly col: number,
  ) {
    super(message);
  }
}

interface Spec {
  fmt: Format;
  opcode: number;
  funct3?: number;
  funct7?: number;
  /** I-type variants: "load" uses imm(rs1); "shift" uses a 5-bit shamt; "sys" has no operands. */
  kind?: "load" | "shift" | "sys" | "jalr";
}

export const OPS: Record<string, Spec> = {
  add: { fmt: "R", opcode: 0x33, funct3: 0, funct7: 0x00 },
  sub: { fmt: "R", opcode: 0x33, funct3: 0, funct7: 0x20 },
  sll: { fmt: "R", opcode: 0x33, funct3: 1, funct7: 0x00 },
  slt: { fmt: "R", opcode: 0x33, funct3: 2, funct7: 0x00 },
  sltu: { fmt: "R", opcode: 0x33, funct3: 3, funct7: 0x00 },
  xor: { fmt: "R", opcode: 0x33, funct3: 4, funct7: 0x00 },
  srl: { fmt: "R", opcode: 0x33, funct3: 5, funct7: 0x00 },
  sra: { fmt: "R", opcode: 0x33, funct3: 5, funct7: 0x20 },
  or: { fmt: "R", opcode: 0x33, funct3: 6, funct7: 0x00 },
  and: { fmt: "R", opcode: 0x33, funct3: 7, funct7: 0x00 },
  mul: { fmt: "R", opcode: 0x33, funct3: 0, funct7: 0x01 },
  mulh: { fmt: "R", opcode: 0x33, funct3: 1, funct7: 0x01 },
  mulhsu: { fmt: "R", opcode: 0x33, funct3: 2, funct7: 0x01 },
  mulhu: { fmt: "R", opcode: 0x33, funct3: 3, funct7: 0x01 },
  div: { fmt: "R", opcode: 0x33, funct3: 4, funct7: 0x01 },
  divu: { fmt: "R", opcode: 0x33, funct3: 5, funct7: 0x01 },
  rem: { fmt: "R", opcode: 0x33, funct3: 6, funct7: 0x01 },
  remu: { fmt: "R", opcode: 0x33, funct3: 7, funct7: 0x01 },
  addi: { fmt: "I", opcode: 0x13, funct3: 0 },
  slti: { fmt: "I", opcode: 0x13, funct3: 2 },
  sltiu: { fmt: "I", opcode: 0x13, funct3: 3 },
  xori: { fmt: "I", opcode: 0x13, funct3: 4 },
  ori: { fmt: "I", opcode: 0x13, funct3: 6 },
  andi: { fmt: "I", opcode: 0x13, funct3: 7 },
  slli: { fmt: "I", opcode: 0x13, funct3: 1, funct7: 0x00, kind: "shift" },
  srli: { fmt: "I", opcode: 0x13, funct3: 5, funct7: 0x00, kind: "shift" },
  srai: { fmt: "I", opcode: 0x13, funct3: 5, funct7: 0x20, kind: "shift" },
  lb: { fmt: "I", opcode: 0x03, funct3: 0, kind: "load" },
  lh: { fmt: "I", opcode: 0x03, funct3: 1, kind: "load" },
  lw: { fmt: "I", opcode: 0x03, funct3: 2, kind: "load" },
  lbu: { fmt: "I", opcode: 0x03, funct3: 4, kind: "load" },
  lhu: { fmt: "I", opcode: 0x03, funct3: 5, kind: "load" },
  jalr: { fmt: "I", opcode: 0x67, funct3: 0, kind: "jalr" },
  ecall: { fmt: "I", opcode: 0x73, funct3: 0, kind: "sys" },
  ebreak: { fmt: "I", opcode: 0x73, funct3: 0, kind: "sys" },
  sb: { fmt: "S", opcode: 0x23, funct3: 0 },
  sh: { fmt: "S", opcode: 0x23, funct3: 1 },
  sw: { fmt: "S", opcode: 0x23, funct3: 2 },
  beq: { fmt: "B", opcode: 0x63, funct3: 0 },
  bne: { fmt: "B", opcode: 0x63, funct3: 1 },
  blt: { fmt: "B", opcode: 0x63, funct3: 4 },
  bge: { fmt: "B", opcode: 0x63, funct3: 5 },
  bltu: { fmt: "B", opcode: 0x63, funct3: 6 },
  bgeu: { fmt: "B", opcode: 0x63, funct3: 7 },
  lui: { fmt: "U", opcode: 0x37 },
  auipc: { fmt: "U", opcode: 0x17 },
  jal: { fmt: "J", opcode: 0x6f },
};

const ABI = [
  "zero",
  "ra",
  "sp",
  "gp",
  "tp",
  "t0",
  "t1",
  "t2",
  "s0",
  "s1",
  "a0",
  "a1",
  "a2",
  "a3",
  "a4",
  "a5",
  "a6",
  "a7",
  "s2",
  "s3",
  "s4",
  "s5",
  "s6",
  "s7",
  "s8",
  "s9",
  "s10",
  "s11",
  "t3",
  "t4",
  "t5",
  "t6",
];

function regName(n: number): string {
  return `x${n}`;
}

export function parseReg(tok: string): number | null {
  const t = tok.trim().toLowerCase();
  const m = /^x(\d{1,2})$/.exec(t);
  if (m) {
    const n = Number(m[1]);
    return n <= 31 ? n : null;
  }
  if (t === "fp") return 8;
  const i = ABI.indexOf(t);
  return i >= 0 ? i : null;
}

export interface Instr {
  op: string;
  rd?: number;
  rs1?: number;
  rs2?: number;
  imm?: number;
}

const fits = (v: number, bits: number) => v >= -(2 ** (bits - 1)) && v < 2 ** (bits - 1);
const mask = (v: number, bits: number) => (bits === 32 ? v >>> 0 : (v >>> 0) & (2 ** bits - 1));

export function encode(ins: Instr): number {
  const s = OPS[ins.op];
  if (!s) throw new Error(`Instrução desconhecida: ${ins.op}`);
  const rd = ins.rd ?? 0;
  const rs1 = ins.rs1 ?? 0;
  const rs2 = ins.rs2 ?? 0;
  const imm = ins.imm ?? 0;
  const f3 = s.funct3 ?? 0;
  let w: number;
  switch (s.fmt) {
    case "R":
      w = ((s.funct7 ?? 0) << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | s.opcode;
      break;
    case "I": {
      if (s.kind === "sys") {
        w = ((ins.op === "ebreak" ? 1 : 0) << 20) | s.opcode;
        break;
      }
      if (s.kind === "shift") {
        if (imm < 0 || imm > 31) throw new Error("O deslocamento (shamt) vai de 0 a 31");
        w = ((s.funct7 ?? 0) << 25) | (imm << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | s.opcode;
        break;
      }
      if (!fits(imm, 12)) throw new Error("O imediato do tipo I vai de -2048 a 2047");
      w = (mask(imm, 12) << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | s.opcode;
      break;
    }
    case "S": {
      if (!fits(imm, 12)) throw new Error("O imediato do tipo S vai de -2048 a 2047");
      const u = mask(imm, 12);
      w = ((u >> 5) << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | ((u & 0x1f) << 7) | s.opcode;
      break;
    }
    case "B": {
      if (imm % 2 !== 0) throw new Error("O deslocamento de um desvio é sempre par");
      if (!fits(imm, 13)) throw new Error("O desvio alcança de -4096 a 4094 bytes");
      const u = mask(imm, 13);
      w =
        (((u >> 12) & 1) << 31) |
        (((u >> 5) & 0x3f) << 25) |
        (rs2 << 20) |
        (rs1 << 15) |
        (f3 << 12) |
        (((u >> 1) & 0xf) << 8) |
        (((u >> 11) & 1) << 7) |
        s.opcode;
      break;
    }
    case "U":
      if (imm < 0 || imm > 0xfffff) throw new Error("O imediato do tipo U tem 20 bits (0 a 0xFFFFF)");
      w = (imm << 12) | (rd << 7) | s.opcode;
      break;
    case "J": {
      if (imm % 2 !== 0) throw new Error("O deslocamento de um salto é sempre par");
      if (!fits(imm, 21)) throw new Error("O salto alcança ±1 MiB");
      const u = mask(imm, 21);
      w =
        (((u >> 20) & 1) << 31) |
        (((u >> 1) & 0x3ff) << 21) |
        (((u >> 11) & 1) << 20) |
        (((u >> 12) & 0xff) << 12) |
        (rd << 7) |
        s.opcode;
      break;
    }
  }
  return w >>> 0;
}

const sext = (v: number, bits: number) => (v << (32 - bits)) >> (32 - bits);

export interface Decoded extends Instr {
  fmt: Format;
  word: number;
  text: string;
}

export function decode(word: number): Decoded {
  const w = word >>> 0;
  const opcode = w & 0x7f;
  const rd = (w >>> 7) & 0x1f;
  const f3 = (w >>> 12) & 7;
  const rs1 = (w >>> 15) & 0x1f;
  const rs2 = (w >>> 20) & 0x1f;
  const f7 = w >>> 25;
  const find = (pred: (name: string, s: Spec) => boolean) =>
    Object.entries(OPS).find(([n, s]) => pred(n, s))?.[0];
  let op: string | undefined;
  let ins: Instr;
  switch (opcode) {
    case 0x33:
      op = find((_, s) => s.opcode === 0x33 && s.funct3 === f3 && s.funct7 === f7);
      ins = { op: op ?? "?", rd, rs1, rs2 };
      break;
    case 0x13:
      if (f3 === 1 || f3 === 5) {
        op = find((_, s) => s.opcode === 0x13 && s.kind === "shift" && s.funct3 === f3 && s.funct7 === f7);
        ins = { op: op ?? "?", rd, rs1, imm: rs2 };
      } else {
        op = find((_, s) => s.opcode === 0x13 && s.kind === undefined && s.funct3 === f3);
        ins = { op: op ?? "?", rd, rs1, imm: sext(w >>> 20, 12) };
      }
      break;
    case 0x03:
      op = find((_, s) => s.opcode === 0x03 && s.funct3 === f3);
      ins = { op: op ?? "?", rd, rs1, imm: sext(w >>> 20, 12) };
      break;
    case 0x67:
      op = f3 === 0 ? "jalr" : undefined;
      ins = { op: op ?? "?", rd, rs1, imm: sext(w >>> 20, 12) };
      break;
    case 0x73:
      op = w === 0x73 ? "ecall" : w === 0x100073 ? "ebreak" : undefined;
      ins = { op: op ?? "?" };
      break;
    case 0x23:
      op = find((_, s) => s.opcode === 0x23 && s.funct3 === f3);
      ins = { op: op ?? "?", rs1, rs2, imm: sext(((w >>> 25) << 5) | ((w >>> 7) & 0x1f), 12) };
      break;
    case 0x63: {
      op = find((_, s) => s.opcode === 0x63 && s.funct3 === f3);
      const imm =
        ((w >>> 31) << 12) | (((w >>> 7) & 1) << 11) | (((w >>> 25) & 0x3f) << 5) | (((w >>> 8) & 0xf) << 1);
      ins = { op: op ?? "?", rs1, rs2, imm: sext(imm, 13) };
      break;
    }
    case 0x37:
    case 0x17:
      op = opcode === 0x37 ? "lui" : "auipc";
      ins = { op, rd, imm: w >>> 12 };
      break;
    case 0x6f: {
      op = "jal";
      const imm =
        ((w >>> 31) << 20) |
        (((w >>> 12) & 0xff) << 12) |
        (((w >>> 20) & 1) << 11) |
        (((w >>> 21) & 0x3ff) << 1);
      ins = { op, rd, imm: sext(imm, 21) };
      break;
    }
    default:
      ins = { op: "?" };
  }
  if (!op)
    throw new Error(`Palavra 0x${w.toString(16).padStart(8, "0")} não é uma instrução do subconjunto RV32IM`);
  const spec = OPS[op] as Spec;
  return { ...ins, fmt: spec.fmt, word: w, text: format(ins) };
}

export function format(ins: Instr): string {
  const s = OPS[ins.op];
  const r = (n?: number) => regName(n ?? 0);
  if (!s) return ins.op;
  switch (s.fmt) {
    case "R":
      return `${ins.op} ${r(ins.rd)}, ${r(ins.rs1)}, ${r(ins.rs2)}`;
    case "I":
      if (s.kind === "sys") return ins.op;
      if (s.kind === "load" || s.kind === "jalr") return `${ins.op} ${r(ins.rd)}, ${ins.imm}(${r(ins.rs1)})`;
      return `${ins.op} ${r(ins.rd)}, ${r(ins.rs1)}, ${ins.imm}`;
    case "S":
      return `${ins.op} ${r(ins.rs2)}, ${ins.imm}(${r(ins.rs1)})`;
    case "B":
      return `${ins.op} ${r(ins.rs1)}, ${r(ins.rs2)}, ${ins.imm}`;
    case "U":
      return `${ins.op} ${r(ins.rd)}, 0x${(ins.imm ?? 0).toString(16)}`;
    case "J":
      return `${ins.op} ${r(ins.rd)}, ${ins.imm}`;
  }
}

/* ---------- assembler ---------- */

export interface AsmLine {
  line: number;
  source: string;
  pc: number;
  ins: Instr;
  word: number;
  /** Pseudo-instruction this came from (e.g. "nop", "mv"). */
  pseudo?: string;
}

function parseImm(tok: string, line: number, col: number): number {
  const t = tok.trim().toLowerCase();
  const m = /^(-?)(0x[0-9a-f]+|\d+)$/.exec(t);
  if (!m) throw new AsmError(`Número inválido: "${tok.trim()}"`, line, col);
  const v = Number.parseInt(m[2] as string, (m[2] as string).startsWith("0x") ? 16 : 10);
  return m[1] ? -v : v;
}

const SUGGEST: Record<string, string> = {
  mov: "mv",
  move: "mv",
  jmp: "j",
  ld: "lw",
  st: "sw",
  addu: "add",
  subi: "addi (com imediato negativo)",
};

/** Assembles up to `maxLines` lines. Supports labels, comments (#), RV32IM and nop/mv/li/j/jr/ret. */
export function assemble(src: string, maxLines = 32): AsmLine[] {
  const raw = src.split("\n");
  if (raw.length > maxLines) throw new AsmError(`Use no máximo ${maxLines} linhas`, maxLines + 1, 1);
  type Pending = { line: number; source: string; mnemonic: string; args: string[]; col: number };
  const pending: Pending[] = [];
  const labels = new Map<string, number>();
  raw.forEach((rawLine, i) => {
    const line = i + 1;
    let text = rawLine.replace(/#.*/, "");
    const lm = /^\s*([A-Za-z_][\w.]*)\s*:/.exec(text);
    if (lm) {
      const name = lm[1] as string;
      if (labels.has(name)) throw new AsmError(`Rótulo repetido: ${name}`, line, 1);
      labels.set(name, pending.length * 4);
      text = text.slice(lm[0].length);
    }
    if (!text.trim()) return;
    const col = text.length - text.trimStart().length + 1;
    const [mn, ...rest] = text.trim().split(/\s+/);
    const args = rest
      .join(" ")
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    pending.push({ line, source: rawLine.trim(), mnemonic: (mn as string).toLowerCase(), args, col });
  });
  return pending.map((p, k) => {
    const pc = k * 4;
    const reg = (i: number) => {
      const a = p.args[i];
      if (a === undefined) throw new AsmError(`Faltou o ${i + 1}º operando de ${p.mnemonic}`, p.line, p.col);
      const r = parseReg(a);
      if (r === null)
        throw new AsmError(`Registrador inválido: "${a}" (use x0..x31 ou nomes como a0, sp)`, p.line, p.col);
      return r;
    };
    const imm = (i: number) => {
      const a = p.args[i];
      if (a === undefined) throw new AsmError(`Faltou o ${i + 1}º operando de ${p.mnemonic}`, p.line, p.col);
      return parseImm(a, p.line, p.col);
    };
    const target = (i: number) => {
      const a = p.args[i];
      if (a === undefined) throw new AsmError(`Faltou o destino de ${p.mnemonic}`, p.line, p.col);
      const lab = labels.get(a);
      return lab !== undefined ? lab - pc : parseImm(a, p.line, p.col);
    };
    const mem = (i: number): [number, number] => {
      const a = p.args[i] ?? "";
      const m = /^(-?(?:0x[0-9a-fA-F]+|\d+))?\((\w+)\)$/.exec(a.replace(/\s+/g, ""));
      if (!m) throw new AsmError(`Use o formato deslocamento(registrador), ex.: 16(sp)`, p.line, p.col);
      const r = parseReg(m[2] as string);
      if (r === null) throw new AsmError(`Registrador inválido: "${m[2]}"`, p.line, p.col);
      return [m[1] ? parseImm(m[1], p.line, p.col) : 0, r];
    };
    const want = (n: number) => {
      if (p.args.length !== n)
        throw new AsmError(
          `${p.mnemonic} espera ${n} operando${n === 1 ? "" : "s"}, recebeu ${p.args.length}`,
          p.line,
          p.col,
        );
    };
    let ins: Instr;
    let pseudo: string | undefined;
    switch (p.mnemonic) {
      case "nop":
        want(0);
        ins = { op: "addi", rd: 0, rs1: 0, imm: 0 };
        pseudo = "nop";
        break;
      case "mv":
        want(2);
        ins = { op: "addi", rd: reg(0), rs1: reg(1), imm: 0 };
        pseudo = "mv";
        break;
      case "li": {
        want(2);
        const v = imm(1);
        if (!fits(v, 12))
          throw new AsmError(
            "Nesta versão, li aceita só -2048 a 2047 (use lui + addi para valores maiores)",
            p.line,
            p.col,
          );
        ins = { op: "addi", rd: reg(0), rs1: 0, imm: v };
        pseudo = "li";
        break;
      }
      case "j":
        want(1);
        ins = { op: "jal", rd: 0, imm: target(0) };
        pseudo = "j";
        break;
      case "jr":
        want(1);
        ins = { op: "jalr", rd: 0, rs1: reg(0), imm: 0 };
        pseudo = "jr";
        break;
      case "ret":
        want(0);
        ins = { op: "jalr", rd: 0, rs1: 1, imm: 0 };
        pseudo = "ret";
        break;
      default: {
        const s = OPS[p.mnemonic];
        if (!s) {
          const hint = SUGGEST[p.mnemonic];
          throw new AsmError(
            `Instrução desconhecida: "${p.mnemonic}"${hint ? `. Você quis dizer ${hint}?` : ""}`,
            p.line,
            p.col,
          );
        }
        switch (s.fmt) {
          case "R":
            want(3);
            ins = { op: p.mnemonic, rd: reg(0), rs1: reg(1), rs2: reg(2) };
            break;
          case "I":
            if (s.kind === "sys") {
              want(0);
              ins = { op: p.mnemonic };
            } else if (s.kind === "load" || (s.kind === "jalr" && p.args.length === 2)) {
              want(2);
              const [off, base] = mem(1);
              ins = { op: p.mnemonic, rd: reg(0), rs1: base, imm: off };
            } else {
              want(3);
              ins = { op: p.mnemonic, rd: reg(0), rs1: reg(1), imm: imm(2) };
            }
            break;
          case "S": {
            want(2);
            const [off, base] = mem(1);
            ins = { op: p.mnemonic, rs2: reg(0), rs1: base, imm: off };
            break;
          }
          case "B":
            want(3);
            ins = { op: p.mnemonic, rs1: reg(0), rs2: reg(1), imm: target(2) };
            break;
          case "U":
            want(2);
            ins = { op: p.mnemonic, rd: reg(0), imm: imm(1) };
            break;
          case "J":
            if (p.args.length === 1) ins = { op: "jal", rd: 1, imm: target(0) };
            else {
              want(2);
              ins = { op: "jal", rd: reg(0), imm: target(1) };
            }
            break;
        }
      }
    }
    let word: number;
    try {
      word = encode(ins);
    } catch (e) {
      throw new AsmError(e instanceof Error ? e.message : String(e), p.line, p.col);
    }
    return { line: p.line, source: p.source, pc, ins, word, ...(pseudo ? { pseudo } : {}) };
  });
}

/** Bit ranges of each field for a format, as [label, hi, lo] (bit 31 = MSB). */
export function fieldLayout(fmt: Format): [string, number, number][] {
  switch (fmt) {
    case "R":
      return [
        ["funct7", 31, 25],
        ["rs2", 24, 20],
        ["rs1", 19, 15],
        ["funct3", 14, 12],
        ["rd", 11, 7],
        ["opcode", 6, 0],
      ];
    case "I":
      return [
        ["imm[11:0]", 31, 20],
        ["rs1", 19, 15],
        ["funct3", 14, 12],
        ["rd", 11, 7],
        ["opcode", 6, 0],
      ];
    case "S":
      return [
        ["imm[11:5]", 31, 25],
        ["rs2", 24, 20],
        ["rs1", 19, 15],
        ["funct3", 14, 12],
        ["imm[4:0]", 11, 7],
        ["opcode", 6, 0],
      ];
    case "B":
      return [
        ["imm[12]", 31, 31],
        ["imm[10:5]", 30, 25],
        ["rs2", 24, 20],
        ["rs1", 19, 15],
        ["funct3", 14, 12],
        ["imm[4:1]", 11, 8],
        ["imm[11]", 7, 7],
        ["opcode", 6, 0],
      ];
    case "U":
      return [
        ["imm[31:12]", 31, 12],
        ["rd", 11, 7],
        ["opcode", 6, 0],
      ];
    case "J":
      return [
        ["imm[20]", 31, 31],
        ["imm[10:1]", 30, 21],
        ["imm[11]", 20, 20],
        ["imm[19:12]", 19, 12],
        ["rd", 11, 7],
        ["opcode", 6, 0],
      ];
  }
}

export function bitsOf(word: number, hi: number, lo: number): number {
  return (word >>> lo) & (2 ** (hi - lo + 1) - 1);
}
