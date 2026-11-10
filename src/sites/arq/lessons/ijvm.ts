import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import {
  assemble,
  cycles,
  type Exec,
  MICRO,
  microFor,
  type Op,
  run,
  SUM_LOOP,
  totals,
} from "../../../sim/arch/ijvm.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * A stack machine from the inside: a summing loop in IJVM bytecode, the operand stack at every
 * instruction, then the microprogram that interprets each opcode and what a prefetch unit saves.
 */
export const DEFAULTS = { n: 5 };
const PROG = assemble(SUM_LOOP);
const BYTES = PROG.reduce((s, a) => s + a.bytes.length, 0);
const STACK_CELLS = 5;
const LOCALS = 2;
/** The same loop in RISC-V: li, beqz, add, addi, j, mv, ret. */
const RISCV_INSTRS = 7;

const hx = (v: number) => v.toString(16).toUpperCase().padStart(2, "0");
const dec = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2).replace(".", ","));
const asm = (i: number) => {
  const l = PROG[i]?.line;
  if (!l) return "";
  const args = [l.arg, l.arg2].filter((x) => x !== undefined).join(" ");
  return `${l.op}${args ? ` ${args}` : ""}`;
};
/** Signed 16-bit branch offset stored after the opcode of program line `i`. */
const offset = (i: number) => {
  const [, hi = 0, lo = 0] = PROG[i]?.bytes ?? [];
  const v = (hi << 8) | lo;
  return v & 0x8000 ? v - 0x10000 : v;
};
const kindOf = (e: Pick<Exec, "op" | "taken">) =>
  e.op === "IFEQ" ? `IFEQ ${e.taken ? "(desvia)" : "(segue)"}` : e.op;

function clamp(p: Params) {
  return { n: Math.min(20, Math.max(0, Math.round(Number(p.n ?? DEFAULTS.n)))) };
}

function scene(): SceneSpec {
  return {
    viewBox: [960, 600],
    nodes: [],
    links: [],
    widgets: [
      {
        kind: "table",
        id: "programa",
        title: `Área de método: ${BYTES} bytes`,
        at: [40, 30],
        columns: ["End.", "Bytes", "Instrução"],
        widths: [44, 96, 150],
        rows: PROG.length,
      },
      {
        kind: "grid",
        id: "pilha",
        title: "Pilha: locais (LV) e operandos (SP)",
        at: [380, 40],
        cols: STACK_CELLS,
        rows: 1,
        cellW: 60,
        indexLabel: "dec",
      },
      {
        kind: "table",
        id: "regs",
        title: "Registradores",
        at: [380, 150],
        columns: ["Reg", "Valor", "Papel"],
        widths: [50, 60, 180],
        rows: 4,
      },
      { kind: "counter", id: "instr", title: "Instruções", at: [780, 40] },
      { kind: "counter", id: "ciclos", title: "Ciclos", at: [780, 130] },
      { kind: "counter", id: "cpi", title: "Ciclos por instrução", at: [780, 220] },
      {
        kind: "table",
        id: "micro",
        title: "Microprograma",
        at: [40, 360],
        columns: ["Ciclo", "Microinstrução"],
        widths: [50, 470],
        rows: 9,
      },
      {
        kind: "table",
        id: "custo",
        title: "Custo por tipo de instrução",
        at: [600, 360],
        columns: ["Instrução", "Vezes", "Ciclos", "Total"],
        widths: [130, 50, 50, 60],
        rows: 9,
      },
    ],
  };
}

export function build(p: Params) {
  const { n } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));

  const { execs, result } = run(PROG, [n, 0]);
  const sum = result ?? 0;
  const total = totals(execs, false);
  const fast = totals(execs, true);
  const perIter = SUM_LOOP.slice(2, 10).reduce((s, l, i) => s + cycles(l.op, i === 7, false), 0);
  const perIterFast = SUM_LOOP.slice(2, 10).reduce((s, l, i) => s + cycles(l.op, i === 7, true), 0);

  // Machine state drawn so far, so only changed cells and rows produce events.
  let shown: string[] = Array.from({ length: STACK_CELLS }, () => "");
  const regs: string[] = [];
  let count = 0;
  const draw = (cells: string[], r: [string, string, string][]) => {
    cells.forEach((v, i) => {
      if (shown[i] !== v) c.cell("pilha", i, v, { dt: 0, mark: "new", role: i < LOCALS ? "b" : "a" });
    });
    shown = cells;
    r.forEach((row, i) => {
      const key = row.join("|");
      if (regs[i] !== key) c.row("regs", i, row, { dt: 0, role: "ctrl" });
      regs[i] = key;
    });
  };
  const stateOf = (stack: number[], locals: number[], pc: number) => {
    const cells = [`i=${locals[0]}`, `soma=${locals[1]}`];
    for (let k = 0; k < STACK_CELLS - LOCALS; k++) cells.push(stack[k] === undefined ? "" : String(stack[k]));
    const sp = LOCALS - 1 + stack.length;
    const tos = stack.length ? String(stack[stack.length - 1]) : `${locals[1]}`;
    const r: [string, string, string][] = [
      ["PC", `0x${hx(pc)}`, "próximo byte do programa"],
      ["SP", String(sp), "palavra do topo da pilha"],
      ["LV", "0", "início das variáveis locais"],
      ["TOS", tos, "cópia do topo, sem ir à memória"],
    ];
    return { cells, r };
  };
  const exec = (e: Exec, k: number) => {
    const next = execs[k + 1]?.addr ?? e.addr;
    c.row(
      "programa",
      e.index,
      [`0x${hx(e.addr)}`, PROG[e.index]?.bytes.map(hx).join(" ") ?? "", asm(e.index)],
      {
        dt: 1,
        mark: "hit",
        role: "a",
        log: {
          who: `0x${hx(e.addr)}`,
          what: asm(e.index),
          detail: `pilha [${e.stack.join(", ")}], i=${e.locals[0]}, soma=${e.locals[1]}${e.op === "IFEQ" ? (e.taken ? ", desvia" : ", segue") : ""}`,
        },
      },
    );
    const s = stateOf(e.stack, e.locals, next);
    draw(s.cells, s.r);
    count += 1;
    c.count("instr", String(count), { label: `${count} instruções` });
  };

  b.step(
    {
      id: "s1-programa",
      title: "Um programa para pilha",
      subtitle: `${PROG.length} instruções em ${BYTES} bytes`,
      text: `O laço soma = 0; while (i != 0) { soma += i; i--; } compilado para a IJVM, uma [[maquina-de-pilha]] inspirada no bytecode Java. Nenhuma instrução nomeia registradores: as contas acontecem no topo da pilha. Por isso as instruções são curtas, de 1 a 3 bytes: o programa inteiro tem ${PROG.length} instruções e ${BYTES} bytes. O mesmo laço em RISC-V usa ${RISCV_INSTRS} instruções de 4 bytes, ${RISCV_INSTRS * 4} bytes. As variáveis i e soma ficam na moldura do método, a partir do registrador LV.`,
      facts: [
        ["Instruções", String(PROG.length)],
        ["Bytes", String(BYTES)],
        ["i inicial", String(n)],
      ],
      highlight: [],
    },
    () => {
      PROG.forEach((a, i) => {
        c.row("programa", i, [`0x${hx(a.addr)}`, a.bytes.map(hx).join(" "), asm(i)], {
          dt: i === 0 ? 1 : 0,
          role: "muted",
        });
      });
      const s = stateOf([], [n, 0], 0);
      draw(
        s.cells.map((v, i) => (i === 1 ? "soma=?" : v)),
        s.r,
      );
    },
  );

  const firstPart = Math.min(8, execs.length - 1);
  const head = execs.slice(0, firstPart);
  const firstAdd = head.find((e) => e.op === "IADD");
  b.step(
    {
      id: "s2-pilha",
      title: "Empilha, opera, desempilha",
      subtitle: firstAdd ? `0 + ${n} no topo` : "o laço nem começa",
      text: firstAdd
        ? `BIPUSH 0 empilha a constante e ISTORE 1 a tira da pilha para guardar em soma. ILOAD 0 empilha i, e IFEQ desempilha e testa: ${n} não é zero, segue. ILOAD 1 e ILOAD 0 empilham soma e i; IADD tira os dois do topo, soma e empilha ${firstAdd.stack[0]}. ISTORE 1 guarda o resultado. Cada instrução sabe onde estão seus operandos: no topo. O registrador TOS guarda uma cópia do topo, para que a soma não precise ler a memória duas vezes.`
        : "BIPUSH 0 empilha a constante e ISTORE 1 a tira da pilha para guardar em soma. ILOAD 0 empilha i, e IFEQ desempilha e testa: i já é zero, e o desvio pula o laço inteiro para o fim. ILOAD 1 empilha soma, que vai ser devolvida. Cada instrução sabe onde estão seus operandos: no topo. O registrador TOS guarda uma cópia do topo, para que operações como IADD não precisem ler a memória duas vezes.",
      facts: [
        ["Executadas", String(head.length)],
        ["Pilha", "cresce e encolhe"],
        ["TOS", "cópia do topo"],
      ],
      highlight: [],
    },
    () => {
      head.forEach((e, k) => {
        exec(e, k);
      });
    },
  );

  const rest = execs.slice(firstPart);
  b.step(
    {
      id: "s3-laco",
      title: "O laço inteiro",
      subtitle: `${execs.length} instruções, soma ${sum}`,
      text: `Cada volta executa 8 instruções: ILOAD e IFEQ testam i, ILOAD, ILOAD, IADD e ISTORE somam, IINC 0 -1 decrementa i direto na variável, sem passar pela pilha, e GOTO volta ao teste. Com i = ${n}, ${n === 0 ? "não há nenhuma volta" : n === 1 ? "é 1 volta" : `são ${n} voltas`}, mais 2 instruções antes do laço e 4 na saída: ${execs.length} instruções. O desvio do IFEQ e do GOTO é relativo, em 2 bytes: +${offset(3)} leva ao fim e o GOTO volta ${-offset(9)} bytes. IRETURN devolve soma = ${sum}.`,
      facts: [
        ["Voltas", String(n)],
        ["Instruções", String(execs.length)],
        ["Resultado", String(sum)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Com i = ${n}, quantas instruções a IJVM executa do BIPUSH ao IRETURN?`,
        answer: execs.length,
        explain: `2 antes do laço + 8 × ${n} ${n === 1 ? "volta" : "voltas"} + 4 na saída = ${execs.length}.`,
      },
    },
    () => {
      rest.forEach((e, k) => {
        exec(e, firstPart + k);
      });
    },
  );

  const iadd = microFor("IADD");
  b.step(
    {
      id: "s4-micro",
      title: "Quem executa o bytecode",
      subtitle: `IADD em ${iadd.length} ciclos`,
      text: `A IJVM não existe em hardware: um [[microprograma]] a interpreta. A cada ciclo, uma microinstrução comanda o caminho de dados: quais registradores vão para a ULA, qual operação ela faz, onde o resultado é gravado e se a memória lê ou escreve. O ciclo Main1 busca o próximo byte e usa o próprio opcode como endereço do microprograma da instrução. O IADD precisa de mais ${MICRO.IADD.length}: ler o segundo operando, copiá-lo para H e, no mesmo ciclo, somar com o TOS e escrever. São ${iadd.length} ciclos para uma soma.`,
      facts: [
        ["IADD", `${iadd.length} ciclos`],
        ["Despacho", "opcode = endereço"],
        ["Por ciclo", "1 microinstrução"],
      ],
      highlight: [],
    },
    () => {
      iadd.forEach((m, i) => {
        c.row("micro", i, [String(i + 1), m.text], {
          dt: 1,
          mark: "new",
          role: i === 0 ? "ctrl" : "a",
          log: { who: "IADD", what: `ciclo ${i + 1}`, detail: m.text },
        });
      });
      c.count("ciclos", String(iadd.length), { label: `IADD: ${iadd.length} ciclos` });
    },
  );

  const kinds = new Map<string, { op: Op; taken: boolean; times: number }>();
  for (const e of execs) {
    const k = kindOf(e);
    const prev = kinds.get(k);
    if (prev) prev.times += 1;
    else kinds.set(k, { op: e.op, taken: e.taken, times: 1 });
  }
  const cpi = total / execs.length;
  b.step(
    {
      id: "s5-custo",
      title: "Quanto custa o laço",
      subtitle: `${total} ciclos, ${dec(cpi)} por instrução`,
      text: `Cada tipo de instrução tem um microprograma de tamanho diferente: IADD leva ${cycles("IADD", false, false)} ciclos, ILOAD ${cycles("ILOAD", false, false)}, ISTORE e IINC ${cycles("ISTORE", false, false)}, IFEQ ${cycles("IFEQ", false, false)} quando segue e ${cycles("IFEQ", true, false)} quando desvia. Uma volta do laço custa ${perIter} ciclos. O programa todo, com i = ${n}, leva ${total} ciclos para ${execs.length} instruções: ${dec(cpi)} ciclos por instrução. Num processador RISC com pipeline, a meta é perto de 1 ciclo por instrução.`,
      facts: [
        ["Por volta", `${perIter} ciclos`],
        ["Total", `${total} ciclos`],
        ["Por instrução", dec(cpi)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Uma volta tem ILOAD, IFEQ (segue), ILOAD, ILOAD, IADD, ISTORE, IINC e GOTO. Com ${cycles("ILOAD", false, false)}, ${cycles("IFEQ", false, false)}, ${cycles("IADD", false, false)}, ${cycles("ISTORE", false, false)}, ${cycles("IINC", false, false)} e ${cycles("GOTO", true, false)} ciclos para ILOAD, IFEQ, IADD, ISTORE, IINC e GOTO, quantos ciclos custa a volta?`,
        answer: perIter,
        explain: `3 × ${cycles("ILOAD", false, false)} + ${cycles("IFEQ", false, false)} + ${cycles("IADD", false, false)} + ${cycles("ISTORE", false, false)} + ${cycles("IINC", false, false)} + ${cycles("GOTO", true, false)} = ${perIter} ciclos.`,
      },
    },
    () => {
      [...kinds.entries()].forEach(([label, k], i) => {
        const each = cycles(k.op, k.taken, false);
        c.row("custo", i, [label, String(k.times), String(each), String(each * k.times)], {
          dt: i === 0 ? 1 : 0,
          mark: "new",
          role: "warn",
        });
      });
      c.count("ciclos", String(total), { label: `${total} ciclos` });
      c.count("cpi", dec(cpi), { label: `${dec(cpi)} ciclos por instrução` });
    },
  );

  const iaddFast = microFor("IADD").filter((m) => !m.fetch);
  const speedup = total / fast;
  b.step(
    {
      id: "s6-busca",
      title: "Buscar bytes antes",
      subtitle: `${total} → ${fast} ciclos`,
      text: `Muitos ciclos só esperam bytes do programa: o Main1 de cada instrução e as buscas de operandos e deslocamentos. Uma [[unidade-de-busca]] lê os próximos bytes enquanto a instrução atual executa, e esses ciclos somem: o IADD cai para ${iaddFast.length}, uma volta para ${perIterFast} ciclos e o programa para ${fast}, ${dec(speedup)} vezes mais rápido. Os passos seguintes desse caminho são o pipeline, e hoje as JVMs nem interpretam o laço: compilam o bytecode quente para instruções nativas enquanto o programa roda.`,
      facts: [
        ["Sem busca antecipada", `${total} ciclos`],
        ["Com busca antecipada", `${fast} ciclos`],
        ["Ganho", `${dec(speedup)}×`],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: "Que ciclos a unidade de busca antecipada elimina?",
        options: [
          "Os que só esperam o próximo byte do programa",
          "Os que fazem a soma na ULA",
          "Os que escrevem o resultado na pilha",
        ],
        answer: 0,
        explain: "Ela entrega os bytes do programa já lidos; as contas e os acessos à pilha continuam.",
      },
    },
    () => {
      for (let i = 0; i < iadd.length; i++) {
        const m = iaddFast[i];
        c.row("micro", i, m ? [String(i + 1), m.text] : ["", ""], {
          dt: i === 0 ? 1 : 0,
          mark: "new",
          role: "a",
        });
      }
      c.count("ciclos", `${total} → ${fast}`, { label: `${total} → ${fast} ciclos` });
      c.count("cpi", dec(fast / execs.length), { label: `${dec(fast / execs.length)} ciclos por instrução` });
    },
  );

  return b.done({
    bytes: BYTES,
    instructions: execs.length,
    result: sum,
    perIter,
    cycles: total,
    cpi: dec(cpi),
    fast,
    speedup: dec(speedup),
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "ijvm",
    site: "arq",
    title: "IJVM: uma máquina de pilha microprogramada",
    summary:
      "Um laço em bytecode de pilha, instrução por instrução, com a pilha e os registradores à vista; depois o microprograma que interpreta cada opcode, o custo em ciclos e o que a busca antecipada de bytes economiza.",
    area: "Microarquitetura",
    refs: [
      {
        book: "tanenbaum-sco",
        chapter: 4,
        section: "4.2",
        note: "Exemplo de ISA: IJVM",
        verified: true,
      },
      {
        book: "tanenbaum-sco",
        chapter: 4,
        section: "4.3",
        note: "Exemplo de implementação (microprograma)",
        verified: true,
      },
      {
        book: "tanenbaum-sco",
        chapter: 4,
        section: "4.4",
        note: "Unidade de busca de instrução",
        verified: true,
      },
    ],
    simplifications: [
      "As microinstruções são um modelo próprio, no estilo do Mic-1; os números de ciclos saem desse modelo.",
      "A moldura do método aparece só com as variáveis locais, sem a palavra de ligação e o PC e o LV salvos que o IRETURN usa.",
      "Com busca antecipada, só somem os ciclos que esperam bytes; o resto do microprograma fica igual.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [{ key: "n", kind: "int", label: "Valor inicial de i", min: 0, max: 20 }],
  },
  build,
  intro: {
    text: "Uma máquina de pilha não nomeia registradores: empilha os operandos e opera no topo. Você vai seguir um laço em bytecode instrução por instrução e depois descer um nível, até o microprograma que executa cada uma delas em vários ciclos.",
    facts: [
      ["Instruções", String(PROG.length)],
      ["Bytes", String(BYTES)],
      ["Modelo", "estilo Mic-1"],
    ],
  },
  outro: {
    title: "IJVM em resumo",
    text: "Na IJVM os operandos vivem no topo da pilha, o que deixa as instruções curtas, de 1 a 3 bytes. Um microprograma interpreta cada opcode: o próprio opcode é o endereço da sua sequência de microinstruções, e cada uma leva um ciclo. Por isso uma instrução custa vários ciclos; buscar os bytes do programa com antecedência elimina boa parte deles.",
    facts: (run) => [
      ["Resultado", String(run.stats.result)],
      ["Ciclos", String(run.stats.cycles)],
      ["Com busca antecipada", String(run.stats.fast)],
    ],
  },
  next: ["pilha-chamadas", "pipeline", "instrucao-riscv"],
};

export default lesson;
