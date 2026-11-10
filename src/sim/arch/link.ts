/**
 * A two-pass assembler and a linker for a toy program in two files. Every instruction is 4 bytes;
 * references are either PC-relative (unchanged by moving code) or absolute (patched on relocation).
 */
export type RefKind = "relativa" | "absoluta";

export interface SrcLine {
  label?: string;
  text: string;
  /** Symbol this instruction refers to, and how the address is encoded. */
  ref?: { sym: string; kind: RefKind };
  /** Data word instead of an instruction. */
  data?: boolean;
}

export interface Module {
  name: string;
  lines: SrcLine[];
}

export const WORD = 4;

export const PRINCIPAL: Module = {
  name: "principal.s",
  lines: [
    { label: "inicio", text: "li a0, 5" },
    { text: "call soma", ref: { sym: "soma", kind: "relativa" } },
    { text: "sw a0, total", ref: { sym: "total", kind: "absoluta" } },
    { text: "j fim", ref: { sym: "fim", kind: "relativa" } },
    { label: "fim", text: "ret" },
    { label: "total", text: ".word 0", data: true },
  ],
};

export const SOMA: Module = {
  name: "soma.s",
  lines: [{ label: "soma", text: "addi a0, a0, 10" }, { text: "ret" }],
};

export interface Symbol {
  name: string;
  module: string;
  /** Offset inside its module; undefined while it is only an external reference. */
  offset?: number;
}

/** Pass 1: walk the lines counting bytes and record every label. */
export function pass1(m: Module) {
  const symbols: Symbol[] = [];
  m.lines.forEach((l, i) => {
    if (l.label) symbols.push({ name: l.label, module: m.name, offset: i * WORD });
  });
  const known = new Set(symbols.map((s) => s.name));
  const externals = [...new Set(m.lines.flatMap((l) => (l.ref && !known.has(l.ref.sym) ? [l.ref.sym] : [])))];
  return { symbols, externals, size: m.lines.length * WORD };
}

/** A reference whose label appears only further down: the reason for a second pass. */
export const forward = (m: Module) =>
  m.lines.flatMap((l, i) => {
    if (!l.ref) return [];
    const at = m.lines.findIndex((x) => x.label === l.ref?.sym);
    return at > i ? [{ at: i * WORD, sym: l.ref.sym }] : [];
  });

export interface Reloc {
  module: string;
  at: number;
  sym: string;
  kind: RefKind;
  /** Resolved by the assembler (local and relative), or left to the linker. */
  local: boolean;
}

/** Pass 2: local relative jumps are final; externals and absolute addresses become relocations. */
export function pass2(m: Module) {
  const { symbols } = pass1(m);
  return m.lines.flatMap((l, i): Reloc[] => {
    if (!l.ref) return [];
    const local = symbols.some((s) => s.name === l.ref?.sym) && l.ref.kind === "relativa";
    return [{ module: m.name, at: i * WORD, sym: l.ref.sym, kind: l.ref.kind, local }];
  });
}

export interface Placed {
  module: Module;
  base: number;
  size: number;
}

/** Lays the modules out one after the other from `base`. */
export function layout(mods: Module[], base: number): Placed[] {
  let at = base;
  return mods.map((module) => {
    const p = { module, base: at, size: module.lines.length * WORD };
    at += p.size;
    return p;
  });
}

export function addressOf(placed: Placed[], sym: string): number {
  for (const p of placed) {
    const i = p.module.lines.findIndex((l) => l.label === sym);
    if (i >= 0) return p.base + i * WORD;
  }
  throw new Error(`undefined symbol ${sym}`);
}

/** Final value stored in each reference: an offset from the instruction, or an absolute address. */
export function resolve(placed: Placed[]) {
  return placed.flatMap((p) =>
    pass2(p.module).map((r) => {
      const where = p.base + r.at;
      const target = addressOf(placed, r.sym);
      return { ...r, where, target, value: r.kind === "relativa" ? target - where : target };
    }),
  );
}

export const hex = (n: number) => `0x${n.toString(16).padStart(4, "0")}`;
export const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));
