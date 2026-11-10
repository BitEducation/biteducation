/**
 * A small IJVM: a stack machine whose instructions are interpreted by a microprogram, in the
 * spirit of Mic-1. The microinstruction lists are this project's own model; cycle counts come
 * from their lengths, plus one dispatch cycle (Main1) per instruction.
 */
export type Op = "BIPUSH" | "ILOAD" | "ISTORE" | "IADD" | "ISUB" | "IINC" | "IFEQ" | "GOTO" | "IRETURN";

/** Opcodes as in the JVM. */
export const OPCODE: Record<Op, number> = {
  BIPUSH: 0x10,
  ILOAD: 0x15,
  ISTORE: 0x36,
  IADD: 0x60,
  ISUB: 0x64,
  IINC: 0x84,
  IFEQ: 0x99,
  GOTO: 0xa7,
  IRETURN: 0xac,
};

/** Operand bytes after the opcode. */
const OPERAND_BYTES: Record<Op, number> = {
  BIPUSH: 1,
  ILOAD: 1,
  ISTORE: 1,
  IADD: 0,
  ISUB: 0,
  IINC: 2,
  IFEQ: 2,
  GOTO: 2,
  IRETURN: 0,
};

export interface Micro {
  text: string;
  /** Only fetches a byte of the instruction stream; a prefetch unit makes it unnecessary. */
  fetch?: boolean;
}

export const MAIN1: Micro = { text: "Main1: PC=PC+1; busca o byte; desvia pelo opcode", fetch: true };

const JUMP: Micro[] = [
  { text: "OPC=PC-1 (endereço do opcode)" },
  { text: "PC=PC+1; busca", fetch: true },
  { text: "H=MBR<<8 (byte alto do deslocamento)" },
  { text: "H=MBRU OR H (byte baixo)" },
  { text: "PC=OPC+H; busca", fetch: true },
  { text: "espera o byte chegar ao MBR", fetch: true },
];

export const MICRO: Record<Op, Micro[]> = {
  BIPUSH: [
    { text: "SP=MAR=SP+1" },
    { text: "PC=PC+1; busca", fetch: true },
    { text: "MDR=TOS=MBR; escreve" },
  ],
  ILOAD: [
    { text: "H=LV" },
    { text: "MAR=MBRU+H; lê" },
    { text: "MAR=SP=SP+1" },
    { text: "PC=PC+1; busca; escreve" },
    { text: "TOS=MDR" },
  ],
  ISTORE: [
    { text: "H=LV" },
    { text: "MAR=MBRU+H" },
    { text: "MDR=TOS; escreve" },
    { text: "SP=MAR=SP-1; lê" },
    { text: "PC=PC+1; busca", fetch: true },
    { text: "TOS=MDR" },
  ],
  IADD: [
    { text: "MAR=SP=SP-1; lê o segundo operando" },
    { text: "H=TOS" },
    { text: "MDR=TOS=MDR+H; escreve" },
  ],
  ISUB: [
    { text: "MAR=SP=SP-1; lê o segundo operando" },
    { text: "H=TOS" },
    { text: "MDR=TOS=MDR-H; escreve" },
  ],
  IINC: [
    { text: "H=LV" },
    { text: "MAR=MBRU+H; lê" },
    { text: "PC=PC+1; busca", fetch: true },
    { text: "H=MDR" },
    { text: "PC=PC+1; busca", fetch: true },
    { text: "MDR=MBR+H; escreve" },
  ],
  IFEQ: [
    { text: "MAR=SP=SP-1; lê" },
    { text: "OPC=TOS" },
    { text: "TOS=MDR" },
    { text: "Z=OPC; se zero, desvia" },
  ],
  GOTO: JUMP,
  IRETURN: [
    { text: "MAR=SP=LV; lê a ligação" },
    { text: "espera a memória" },
    { text: "LV=MAR=MDR; lê o PC salvo" },
    { text: "MAR=LV+1" },
    { text: "PC=MDR; lê; busca", fetch: true },
    { text: "MAR=SP" },
    { text: "LV=MDR" },
    { text: "MDR=TOS; escreve o resultado" },
  ],
};

/** IFEQ continues with the jump sequence when taken, or skips the two offset bytes. */
const NOT_TAKEN: Micro[] = [
  { text: "PC=PC+1 (pula o byte alto)", fetch: true },
  { text: "PC=PC+1; busca", fetch: true },
  { text: "espera o byte chegar ao MBR", fetch: true },
];

export function microFor(op: Op, taken = false): Micro[] {
  if (op === "IFEQ") return [MAIN1, ...MICRO.IFEQ, ...(taken ? JUMP : NOT_TAKEN)];
  return [MAIN1, ...MICRO[op]];
}

/** Cycles with a prefetch unit: no dispatch fetch, no fetch-only microinstructions. */
export const cycles = (op: Op, taken: boolean, ifu: boolean) =>
  microFor(op, taken).filter((m) => !(ifu && m.fetch)).length;

export interface Line {
  label?: string;
  op: Op;
  arg?: number | string;
  arg2?: number;
}

export interface Assembled {
  addr: number;
  line: Line;
  bytes: number[];
}

const s8 = (v: number) => v & 0xff;
const s16 = (v: number) => [(v >> 8) & 0xff, v & 0xff];

/** Two passes: addresses first, then branch offsets relative to the opcode's address. */
export function assemble(lines: Line[]): Assembled[] {
  const labels: Record<string, number> = {};
  let at = 0;
  const addrs = lines.map((l) => {
    if (l.label) labels[l.label] = at;
    const a = at;
    at += 1 + OPERAND_BYTES[l.op];
    return a;
  });
  return lines.map((line, i) => {
    const addr = addrs[i] ?? 0;
    const op = OPCODE[line.op];
    let bytes: number[];
    if (line.op === "IFEQ" || line.op === "GOTO")
      bytes = [op, ...s16((labels[String(line.arg)] ?? 0) - addr)];
    else if (line.op === "IINC") bytes = [op, s8(Number(line.arg)), s8(line.arg2 ?? 0)];
    else if (OPERAND_BYTES[line.op] === 1) bytes = [op, s8(Number(line.arg))];
    else bytes = [op];
    return { addr, line, bytes };
  });
}

/** sum = 0; while (i != 0) { sum += i; i--; } return sum; with i in local 0 and sum in local 1. */
export const SUM_LOOP: Line[] = [
  { op: "BIPUSH", arg: 0 },
  { op: "ISTORE", arg: 1 },
  { label: "laco", op: "ILOAD", arg: 0 },
  { op: "IFEQ", arg: "fim" },
  { op: "ILOAD", arg: 1 },
  { op: "ILOAD", arg: 0 },
  { op: "IADD" },
  { op: "ISTORE", arg: 1 },
  { op: "IINC", arg: 0, arg2: -1 },
  { op: "GOTO", arg: "laco" },
  { label: "fim", op: "ILOAD", arg: 1 },
  { op: "IRETURN" },
];

export interface Exec {
  index: number;
  addr: number;
  op: Op;
  taken: boolean;
  stack: number[];
  locals: number[];
}

const sign16 = (hi: number, lo: number) => {
  const v = (hi << 8) | lo;
  return v & 0x8000 ? v - 0x10000 : v;
};
const sign8 = (v: number) => (v & 0x80 ? v - 0x100 : v);

/** Runs the program; each entry is the machine state right after one instruction. */
export function run(
  prog: Assembled[],
  locals: number[],
  limit = 10_000,
): { execs: Exec[]; result: number | null } {
  const byAddr = new Map(prog.map((a, i) => [a.addr, i]));
  const loc = [...locals];
  const stack: number[] = [];
  const execs: Exec[] = [];
  let pc = 0;
  for (let n = 0; n < limit; n++) {
    const index = byAddr.get(pc);
    const a = index === undefined ? undefined : prog[index];
    if (!a || index === undefined) break;
    const [, b1 = 0, b2 = 0] = a.bytes;
    let next = pc + a.bytes.length;
    let taken = false;
    switch (a.line.op) {
      case "BIPUSH":
        stack.push(sign8(b1));
        break;
      case "ILOAD":
        stack.push(loc[b1] ?? 0);
        break;
      case "ISTORE":
        loc[b1] = stack.pop() ?? 0;
        break;
      case "IADD":
      case "ISUB": {
        const y = stack.pop() ?? 0;
        const x = stack.pop() ?? 0;
        stack.push(a.line.op === "IADD" ? x + y : x - y);
        break;
      }
      case "IINC":
        loc[b1] = (loc[b1] ?? 0) + sign8(b2);
        break;
      case "IFEQ":
        if ((stack.pop() ?? 0) === 0) {
          taken = true;
          next = pc + sign16(b1, b2);
        }
        break;
      case "GOTO":
        taken = true;
        next = pc + sign16(b1, b2);
        break;
      case "IRETURN":
        execs.push({ index, addr: pc, op: "IRETURN", taken, stack: [...stack], locals: [...loc] });
        return { execs, result: stack[stack.length - 1] ?? null };
    }
    execs.push({ index, addr: pc, op: a.line.op, taken, stack: [...stack], locals: [...loc] });
    pc = next;
  }
  return { execs, result: null };
}

export function totals(execs: Exec[], ifu: boolean) {
  return execs.reduce((s, e) => s + cycles(e.op, e.taken, ifu), 0);
}
