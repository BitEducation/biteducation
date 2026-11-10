import type { Frame, LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import {
  type AsmLine,
  assemble,
  bitsOf,
  type Decoded,
  decode,
  type Format,
  fieldLayout,
} from "../../../sim/arch/riscv.ts";
import { type LessonBuilder, lessonBuilder } from "../../../sim/shared/builder.ts";
import { instrucaoRiscv as practice } from "../practice.ts";

/**
 * One RISC-V instruction, bit by bit. Words checked by hand and by
 * the encoder tests (src/sim/arch/riscv.test.ts).
 */
const PROGRAM = [
  "add x5, x6, x7",
  "sub x5, x6, x7",
  "addi x5, x5, -12",
  "sw x8, 20(x2)",
  "beq x5, x0, fim",
  "nop",
  "fim: nop",
];

const FORMAT_NAME: Record<Format, string> = {
  R: "tipo R (registrador-registrador)",
  I: "tipo I (imediato)",
  S: "tipo S (store)",
  B: "tipo B (desvio)",
  U: "tipo U (imediato alto)",
  J: "tipo J (salto)",
};

function fieldRole(name: string): Role {
  if (name === "opcode") return "ctrl";
  if (name === "rd") return "a";
  if (name === "rs1") return "b";
  if (name === "rs2") return "s3";
  if (name.startsWith("funct")) return "s4";
  return "s5";
}

const UNIT: Record<string, string> = {
  opcode: "ctrl",
  rd: "regs",
  rs1: "regs",
  rs2: "regs",
  funct3: "alu",
  funct7: "alu",
};

const hex8 = (w: number) => `0x${(w >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
const bin = (v: number, n: number) => v.toString(2).padStart(n, "0");

function meaning(name: string, d: Decoded): string {
  switch (name) {
    case "opcode":
      return `${FORMAT_NAME[d.fmt]}`;
    case "rd":
      return `destino: x${d.rd}`;
    case "rs1":
      return `1ª fonte: x${d.rs1}`;
    case "rs2":
      return `2ª fonte: x${d.rs2}`;
    case "funct3":
      return `operação: ${d.op}`;
    case "funct7":
      return d.op === "sub" || d.op === "sra" || d.op === "srai"
        ? "bit 30 = 1: variante (sub/sra)"
        : d.op.startsWith("mul") || d.op.startsWith("div") || d.op.startsWith("rem")
          ? "0000001: extensão M"
          : "0000000: variante padrão";
    default:
      return `imediato = ${d.imm}`;
  }
}

function instrFrame(id: string, line: AsmLine, d: Decoded): Frame {
  const layout = fieldLayout(d.fmt);
  return {
    id,
    title: `${line.source.replace(/^\w+:\s*/, "")} = ${hex8(d.word)}`,
    summary: `Palavra de 32 bits no ${FORMAT_NAME[d.fmt]}. O bit 31 fica à esquerda.`,
    unit: "bit",
    data: Array.from({ length: 32 }, (_, i) => (d.word >>> (31 - i)) & 1),
    where: "Memória de instruções, no endereço do PC",
    layers: layout.map(([name, hi, lo]) => ({
      id: name.replace(/[^\w]/g, ""),
      label: name,
      role: fieldRole(name),
      from: 31 - hi,
      to: 32 - lo,
      fields: [
        {
          label: name,
          value: `${bin(bitsOf(d.word, hi, lo), hi - lo + 1)} = ${bitsOf(d.word, hi, lo)}`,
          from: 31 - hi,
          to: 32 - lo,
          note: meaning(name, d),
        },
      ],
    })),
  };
}

function scene(): SceneSpec {
  return {
    viewBox: [960, 600],
    nodes: [
      { id: "asm", kind: "box", label: "Assembly", sub: "texto", at: [150, 64], w: 200 },
      { id: "montador", kind: "box", label: "Montador", sub: "texto → bits", at: [450, 64], w: 170 },
      {
        id: "palavra",
        kind: "imem",
        label: "Memória de instruções",
        sub: "palavra de 32 bits",
        at: [770, 64],
        w: 220,
      },
      { id: "ctrl", kind: "box", label: "Controle", sub: "lê opcode", at: [835, 300], w: 170 },
      {
        id: "regs",
        kind: "regfile",
        label: "Banco de registradores",
        sub: "x0 a x31",
        at: [835, 380],
        w: 200,
      },
      { id: "alu", kind: "alu", label: "ULA", sub: "funct3/funct7", at: [835, 460], w: 170 },
      {
        id: "imm",
        kind: "box",
        label: "Gerador de imediato",
        sub: "junta e estende",
        at: [835, 540],
        w: 200,
      },
    ],
    links: [
      { id: "l1", from: "asm", to: "montador" },
      { id: "l2", from: "montador", to: "palavra" },
    ],
    widgets: [
      {
        kind: "grid",
        id: "bits",
        title: "A palavra, bit a bit (31 → 0)",
        at: [52, 150],
        cols: 32,
        rows: 1,
        cellW: 22,
        indexLabel: "bit",
      },
      {
        kind: "table",
        id: "campos",
        title: "Campos",
        at: [52, 262],
        columns: ["Campo", "Bits", "Valor", "Significado"],
        widths: [104, 70, 150, 340],
        rows: 8,
      },
    ],
  };
}

type Part = "word" | "opcode" | "regs" | "funct" | "imm";

function explain(b: LessonBuilder, line: AsmLine, parts: Part[], tick: { n: number }) {
  const d = decode(line.word);
  const layout = fieldLayout(d.fmt);
  const fr = b.frame(instrFrame(`w-${line.pc}-${line.word}`, line, d));
  const row = (what: string, detail: string) => ({
    cols: { t: `pc ${line.pc}`, who: line.source.replace(/^\w+:\s*/, ""), what, detail },
  });
  const nextT = () => ++tick.n;
  const fieldIdx = (name: string) => layout.findIndex(([n]) => n === name);
  const showField = (name: string, mark: boolean) => {
    const k = fieldIdx(name);
    const f = layout[k];
    if (!f) return;
    const [, hi, lo] = f;
    const v = bitsOf(d.word, hi, lo);
    const t = nextT();
    for (let bit = hi; bit >= lo; bit--)
      b.ev({
        t,
        kind: "cell",
        grid: "bits",
        index: 31 - bit,
        value: String((d.word >>> bit) & 1),
        ...(mark ? { mark: "new" as const } : {}),
        role: fieldRole(name),
        label: `bit ${bit}`,
      });
    b.ev({
      t,
      kind: "row",
      table: "campos",
      index: k,
      cells: [name, hi === lo ? `${hi}` : `${hi}–${lo}`, `${bin(v, hi - lo + 1)}`, meaning(name, d)],
      mark: "new",
      role: fieldRole(name),
      label: `Campo ${name}`,
      frame: fr,
      row: row(name, `${bin(v, hi - lo + 1)} → ${meaning(name, d)}`),
    });
    const unit = UNIT[name] ?? "imm";
    b.ev({
      t: nextT(),
      kind: "move",
      from: "bits",
      to: unit,
      role: fieldRole(name),
      label: `${name} vai para ${unit}`,
    });
  };

  if (parts.includes("word")) {
    let t = nextT();
    for (let k = 0; k < 8; k++)
      b.ev({ t, kind: "row", table: "campos", index: k, cells: [], role: "muted", label: "limpa" });
    for (let bit = 31; bit >= 0; bit--)
      b.ev({ t, kind: "cell", grid: "bits", index: 31 - bit, value: "", role: "muted", label: "limpa" });
    b.ev({
      t,
      kind: "state",
      target: "asm",
      text: line.source.replace(/^\w+:\s*/, ""),
      tone: "active",
      role: "a",
      label: `Texto: ${line.source}`,
    });
    t = nextT();
    b.ev({
      t,
      kind: "move",
      from: "asm",
      to: "montador",
      role: "a",
      label: "O montador lê a linha",
      row: row(
        "Montador",
        `${d.op}: ${FORMAT_NAME[d.fmt]}${line.pseudo ? ` (pseudo-instrução ${line.pseudo})` : ""}`,
      ),
    });
    t = nextT();
    b.ev({
      t,
      kind: "move",
      from: "montador",
      to: "palavra",
      role: "ctrl",
      label: "Grava a palavra",
      frame: fr,
      row: row("Palavra", hex8(d.word)),
    });
    b.ev({
      t,
      kind: "state",
      target: "palavra",
      text: hex8(d.word),
      tone: "active",
      role: "ctrl",
      label: hex8(d.word),
    });
    t = nextT();
    for (const [name, hi, lo] of layout)
      for (let bit = hi; bit >= lo; bit--)
        b.ev({
          t,
          kind: "cell",
          grid: "bits",
          index: 31 - bit,
          value: String((d.word >>> bit) & 1),
          role: fieldRole(name),
          label: `bit ${bit}`,
        });
  }
  if (parts.includes("opcode")) showField("opcode", true);
  if (parts.includes("regs")) for (const n of ["rd", "rs1", "rs2"]) if (fieldIdx(n) >= 0) showField(n, true);
  if (parts.includes("funct")) for (const n of ["funct3", "funct7"]) if (fieldIdx(n) >= 0) showField(n, true);
  if (parts.includes("imm")) for (const [n] of layout) if (n.startsWith("imm")) showField(n, true);
}

export function build(p: Params) {
  const custom = String(p.instrucao ?? "").trim();
  const b = lessonBuilder();
  const tick = { n: 0 };

  if (custom) {
    // Lab: one instruction typed by the student (assembly or a hex word).
    let line: AsmLine;
    if (/^0x[0-9a-f]{1,8}$/i.test(custom)) {
      const word = Number.parseInt(custom.slice(2), 16) >>> 0;
      const d = decode(word);
      line = { line: 1, source: d.text, pc: 0, ins: d, word };
    } else {
      const lines = assemble(custom, 1);
      if (lines.length !== 1) throw new Error("Digite uma instrução");
      line = lines[0] as AsmLine;
    }
    const d = decode(line.word);
    const has = (prefix: string) => fieldLayout(d.fmt).some(([n]) => n.startsWith(prefix));
    b.step(
      {
        id: "s1-texto",
        title: "Texto para número",
        subtitle: FORMAT_NAME[d.fmt],
        text: `O montador transforma \`${line.source}\` na palavra ${hex8(line.word)}.`,
        facts: [
          ["Formato", d.fmt],
          ["Palavra", hex8(line.word)],
        ],
      },
      () => explain(b, line, ["word"], tick),
    );
    b.step(
      {
        id: "s2-opcode",
        title: "O opcode",
        subtitle: "Bits 6 a 0",
        text: "Os 7 bits de baixo dizem a família da instrução e, portanto, o formato do resto.",
        facts: [["opcode", bin(bitsOf(line.word, 6, 0), 7)]],
      },
      () => explain(b, line, ["opcode"], tick),
    );
    if (has("rd") || has("rs"))
      b.step(
        {
          id: "s3-registradores",
          title: "Os registradores",
          subtitle: "5 bits cada",
          text: "Cada registrador ocupa 5 bits: dá para escolher entre x0 e x31.",
          facts: [],
        },
        () => explain(b, line, ["regs"], tick),
      );
    if (has("funct"))
      b.step(
        {
          id: "s4-funct",
          title: "funct3 e funct7",
          subtitle: "Qual operação exatamente",
          text: "Os campos funct escolhem a operação dentro da família do opcode.",
          facts: [],
        },
        () => explain(b, line, ["funct"], tick),
      );
    if (has("imm"))
      b.step(
        {
          id: "s5-imediato",
          title: "O imediato",
          subtitle: `Valor: ${d.imm}`,
          text: "O imediato é a constante embutida na instrução. O gerador de imediato junta os pedaços e estende o sinal.",
          facts: [["Imediato", String(d.imm)]],
        },
        () => explain(b, line, ["imm"], tick),
      );
    return b.done({ word: line.word, format: d.fmt }, [
      `Decodificação de ${hex8(line.word)}: ${d.text} (${FORMAT_NAME[d.fmt]}).`,
    ]);
  }

  const prog = assemble(PROGRAM.join("\n"));
  const [add, sub, addi, sw, beq] = prog as [AsmLine, AsmLine, AsmLine, AsmLine, AsmLine];
  b.step(
    {
      id: "s1-texto",
      title: "Texto para número",
      subtitle: "add é uma instrução do tipo R",
      text: `A CPU não lê texto. O montador transforma \`add x5, x6, x7\` (x5 = x6 + x7) numa palavra de 32 bits: **${hex8(add.word)}**. Como as duas fontes e o destino são registradores, ela usa o formato R. Os 32 bits se dividem em campos de tamanho fixo, e cada cor abaixo é um campo.`,
      facts: [
        ["Instrução", "add x5, x6, x7"],
        ["Palavra", hex8(add.word)],
        ["Formato", "R"],
      ],
      highlight: ["montador"],
    },
    () => explain(b, add, ["word"], tick),
  );
  b.step(
    {
      id: "s2-opcode",
      title: "O opcode",
      subtitle: "Bits 6 a 0 dizem a família",
      text: "O decodificador olha primeiro os 7 bits de baixo, o **opcode**. `0110011` significa operação entre registradores, e já define onde estão os outros campos. Por isso o opcode fica sempre no mesmo lugar, em todos os formatos.",
      facts: [
        ["opcode", "0110011"],
        ["Família", "OP (registrador-registrador)"],
      ],
      highlight: ["ctrl"],
    },
    () => explain(b, add, ["opcode"], tick),
  );
  b.step(
    {
      id: "s3-registradores",
      title: "rd, rs1 e rs2",
      subtitle: "5 bits por registrador",
      text: "Com 32 registradores, cada um cabe em 5 bits: x5 vira `00101`, x6 `00110` e x7 `00111`. rs1 e rs2 vão para o banco de registradores, que os lê ao mesmo tempo; rd diz onde o resultado será escrito.",
      facts: [
        ["rd", "x5 = 00101"],
        ["rs1", "x6 = 00110"],
        ["rs2", "x7 = 00111"],
      ],
      highlight: ["regs"],
    },
    () => explain(b, add, ["regs"], tick),
  );
  b.step(
    {
      id: "s4-funct",
      title: "funct3 e funct7",
      subtitle: "Somar ou subtrair?",
      text: `Várias operações compartilham o mesmo opcode; funct3 e funct7 escolhem qual. Em \`sub x5, x6, x7\` só muda o bit 30, dentro de funct7: a palavra vira **${hex8(sub.word)}**. Esse bit chega ao controle da ULA, que troca a soma pela subtração.`,
      facts: [
        ["add", `${hex8(add.word)} (funct7 = 0000000)`],
        ["sub", `${hex8(sub.word)} (funct7 = 0100000)`],
        ["funct3", "000 nos dois"],
      ],
      highlight: ["alu"],
      quiz: {
        kind: "choice",
        prompt: "O que muda na palavra de `sub x5, x6, x7` em relação a `add x5, x6, x7`?",
        options: ["O opcode", "Só um bit, dentro de funct7", "O funct3", "Os campos de registrador"],
        answer: 1,
        explain:
          "Só o bit 30 muda: funct7 passa de `0000000` para `0100000`. Opcode, funct3 e registradores ficam iguais. É por isso que somar e subtrair usam quase o mesmo hardware.",
      },
    },
    () => {
      explain(b, sub, ["word"], tick);
      explain(b, sub, ["funct"], tick);
    },
  );
  b.step(
    {
      id: "s5-tipo-i",
      title: "Imediato negativo",
      subtitle: "addi e o complemento de dois",
      text: `Em \`addi x5, x5, -12\` uma das fontes é uma constante dentro da própria instrução: o imediato, com 12 bits no topo da palavra. -12 em [[complemento-de-dois]] com 12 bits é \`111111110100\`. O gerador de imediato copia o bit de sinal para completar 32 bits.`,
      facts: [
        ["Palavra", hex8(addi.word)],
        ["imm[11:0]", "111111110100 = -12"],
        ["Faixa", "-2048 a 2047"],
      ],
      highlight: ["imm"],
    },
    () => {
      explain(b, addi, ["word"], tick);
      explain(b, addi, ["imm"], tick);
    },
  );
  b.step(
    {
      id: "s6-tipo-s",
      title: "O imediato partido",
      subtitle: "sw guarda o deslocamento em dois pedaços",
      text: `\`sw x8, 20(x2)\` grava x8 no endereço x2 + 20. O store não tem rd, então os 5 bits que seriam do rd guardam a parte baixa do imediato, e funct7 vira a parte alta. Parece estranho, mas mantém rs1 e rs2 **sempre nas mesmas posições**, o que simplifica o hardware que lê registradores.`,
      facts: [
        ["Palavra", hex8(sw.word)],
        ["imm[11:5]", "0000000"],
        ["imm[4:0]", "10100 = 20"],
      ],
      highlight: ["imm", "regs"],
    },
    () => {
      explain(b, sw, ["word"], tick);
      explain(b, sw, ["imm"], tick);
    },
  );
  b.step(
    {
      id: "s7-tipo-b",
      quiz: {
        kind: "choice",
        prompt: "O deslocamento de um desvio não guarda o bit 0. Por que dá para jogá-lo fora?",
        options: [
          "Desvios sempre caem em endereços pares, então ele é sempre 0",
          "O bit 0 vai no opcode",
          "O hardware sorteia o bit 0 a cada execução",
        ],
        answer: 0,
        explain:
          "Toda instrução começa num endereço par, então o bit 0 do destino é sempre zero. Não guardá-lo dobra o alcance com os mesmos 12 bits.",
      },
      title: "O desvio embaralhado",
      subtitle: "beq e o bit zero implícito",
      text: `\`beq x5, x0, fim\` salta ${beq.ins.imm} bytes à frente se x5 for zero. Desvios sempre caem em endereços pares, então o bit 0 do deslocamento não é guardado: os 12 bits cobrem ±4 KiB. Os pedaços aparecem fora de ordem (12, 10:5, 4:1, 11) para reaproveitar as posições do formato S.`,
      facts: [
        ["Palavra", hex8(beq.word)],
        ["Deslocamento", `+${beq.ins.imm} bytes`],
        ["Bit 0", "sempre 0, não guardado"],
      ],
      highlight: ["imm"],
    },
    () => {
      explain(b, beq, ["word"], tick);
      explain(b, beq, ["imm"], tick);
    },
  );
  return b.done({ add: add.word, sub: sub.word, addi: addi.word, sw: sw.word, beq: beq.word });
}

const lesson: LessonModule = {
  meta: {
    slug: "instrucao-riscv",
    site: "arq",
    title: "Uma instrução RISC-V, bit a bit",
    summary:
      "Como o texto add x5, x6, x7 vira 32 bits, o que cada campo significa e por que os imediatos aparecem partidos nos formatos S e B.",
    area: "Conjunto de instruções (ISA)",
    refs: [
      { book: "tanenbaum-sco", chapter: 5, section: "5.3", note: "Formatos de instrução", verified: true },
      {
        url: "https://github.com/riscv/riscv-isa-manual",
        title: "The RISC-V Instruction Set Manual, Volume I: Unprivileged ISA",
        note: "Formatos R, I, S, B, U e J",
      },
    ],
    simplifications: [
      "Só o subconjunto RV32I + M; instruções comprimidas (C) e de ponto flutuante ficam de fora.",
      "O montador aceita poucas pseudo-instruções (nop, mv, li pequeno, j, jr, ret).",
      "Os endereços começam em 0, sem seções nem ligação.",
    ],
  },
  scene,
  params: {
    defaults: { instrucao: "" },
    fields: [
      {
        key: "instrucao",
        kind: "text",
        label: "Uma instrução (assembly ou hexadecimal)",
        maxLength: 60,
        pattern: "[\\x20-\\x7E]*",
        placeholder: "add x5, x6, x7  ou  0x007302B3",
        help: "Ex.: lw a0, 8(sp) · srai t0, t1, 3 · 0xFF428293. Deixe vazio para ver o tour completo.",
      },
    ],
  },
  build,
  intro: {
    text: "Para a CPU, um programa é só uma sequência de números de 32 bits. Nesta lição você acompanha o montador transformando instruções de texto em bits, num processador RISC-V didático, e o decodificador fazendo o caminho de volta: qual campo diz a operação, quais bits escolhem os registradores e onde se esconde a constante.",
    facts: [
      ["ISA", "RISC-V RV32I"],
      ["Tamanho", "32 bits por instrução"],
      ["Formatos vistos", "R, I, S e B"],
    ],
  },
  outro: {
    title: "Instruções em resumo",
    text: "Toda instrução RISC-V cabe em 32 bits, com opcode e registradores sempre nos mesmos lugares. Os imediatos se adaptam ao espaço que sobra, mesmo que isso os deixe partidos.",
    facts: (run) =>
      run.stats.add !== undefined
        ? [
            ["add", hex8(Number(run.stats.add))],
            ["sub", hex8(Number(run.stats.sub))],
            ["beq", hex8(Number(run.stats.beq))],
          ]
        : [
            ["Palavra", hex8(Number(run.stats.word))],
            ["Formato", String(run.stats.format)],
          ],
  },
  next: ["pipeline"],
  practice,
};

export default lesson;
