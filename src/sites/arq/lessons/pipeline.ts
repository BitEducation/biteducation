import type { CellMark, Frame, LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { spreadRow } from "../../../scene/geometry.ts";
import { type PipeInstr, type PipeResult, runPipeline, STAGES } from "../../../sim/arch/pipeline.ts";
import { type AsmLine, assemble, OPS } from "../../../sim/arch/riscv.ts";
import { type LessonBuilder, lessonBuilder } from "../../../sim/shared/builder.ts";
import { pipeline as practice } from "../practice.ts";

/**
 * The 5-stage pipeline. Worked by hand:
 * 5 independent instructions take 9 cycles; with one RAW dependency and no forwarding, 11.
 */
const PROG1 = "add x1, x2, x3\nsub x4, x5, x6\nand x7, x8, x9\nor x10, x11, x12\nlw x13, 0(x14)";
const PROG2 = "add x5, x6, x7\nsub x8, x5, x9\nand x10, x11, x12\nor x13, x14, x15\nsw x16, 0(x17)";
export const SINGLE_PS = 800;
export const STAGE_PS = 200;

function toPipe(lines: AsmLine[]): PipeInstr[] {
  return lines.map((l) => {
    const s = OPS[l.ins.op];
    const fmt = s?.fmt;
    const srcs: number[] = [];
    if (fmt === "R" || fmt === "S" || fmt === "B") srcs.push(l.ins.rs1 ?? 0, l.ins.rs2 ?? 0);
    else if (fmt === "I" && s?.kind !== "sys") srcs.push(l.ins.rs1 ?? 0);
    const writes = fmt === "R" || fmt === "U" || fmt === "J" || (fmt === "I" && s?.kind !== "sys");
    return {
      label: l.pseudo ?? l.ins.op,
      srcs,
      ...(writes ? { rd: l.ins.rd ?? 0 } : {}),
      ...(s?.kind === "load" ? { isLoad: true } : {}),
    };
  });
}

function scene(p: Params): SceneSpec {
  const custom = String(p.programa ?? "").trim();
  let cycles = 12;
  if (custom)
    try {
      cycles = Math.min(40, runPipeline(toPipe(assemble(custom, 12)), Boolean(p.forwarding)).cycles);
    } catch {
      // build() reports the error to the reader; the scene keeps the default width
    }
  const cellW = Math.max(18, Math.min(56, Math.floor(820 / cycles) - 3));
  // Stages alternate with the latches between them, packed at their drawn widths.
  const stage = (id: string, kind: "imem" | "regfile" | "alu" | "dmem", sub: string) =>
    ({ id, kind, label: id, sub, at: [0, 0], w: 112 }) as const;
  const latch = (id: string) =>
    ({ id: id.replace("/", "-"), kind: "box", label: id, at: [0, 0], w: 46, h: 64 }) as const;
  const row = spreadRow(
    [
      stage("IF", "imem", "busca"),
      latch("IF/ID"),
      stage("ID", "regfile", "decodifica"),
      latch("ID/EX"),
      stage("EX", "alu", "ULA"),
      latch("EX/MEM"),
      stage("MEM", "dmem", "dados"),
      latch("MEM/WB"),
      stage("WB", "regfile", "escreve"),
    ],
    { x0: 20, x1: 980, y: 80, rowGap: 0, gap: 8 },
  );
  return {
    viewBox: [1000, custom ? 420 : 610],
    nodes: row.nodes,
    widgets: custom
      ? [
          {
            kind: "pipeline",
            id: "pipe1",
            title: "Seu programa: estágio × ciclo",
            at: [40, 190],
            stages: [...STAGES],
            cycles,
            cellW,
          },
        ]
      : [
          {
            kind: "pipeline",
            id: "pipe1",
            title: "Programa 1: sem dependências",
            at: [40, 190],
            stages: [...STAGES],
            cycles: 12,
            cellW: 56,
          },
          {
            kind: "pipeline",
            id: "pipe2",
            title: "Programa 2: sub usa o x5 do add (sem forwarding)",
            at: [40, 410],
            stages: [...STAGES],
            cycles: 12,
            cellW: 56,
          },
        ],
  };
}

function idExFrame(): Frame {
  return {
    id: "id-ex",
    title: "Registrador ID/EX no fim do ciclo 3",
    summary:
      "Tudo o que a instrução sub x4, x5, x6 precisa nos próximos estágios, copiado para o registrador entre ID e EX.",
    unit: "word32",
    where: "Entre os estágios ID e EX; é sobrescrito a cada ciclo",
    data: [0x4, 0x2a, 0x11, 0, 4, 0b1000001],
    layers: [
      {
        id: "pc",
        label: "PC",
        role: "muted",
        from: 0,
        to: 1,
        fields: [
          {
            label: "PC da instrução",
            value: "0x4",
            from: 0,
            to: 1,
            note: "Viaja junto para os desvios e exceções saberem de onde a instrução veio",
          },
        ],
      },
      {
        id: "ops",
        label: "Operandos lidos",
        role: "b",
        from: 1,
        to: 4,
        fields: [
          {
            label: "valor de x5 (rs1)",
            value: "42",
            from: 1,
            to: 2,
            example: true,
            note: "Lido do banco de registradores no estágio ID",
          },
          {
            label: "valor de x6 (rs2)",
            value: "17",
            from: 2,
            to: 3,
            example: true,
            note: "Lido do banco de registradores no estágio ID",
          },
          {
            label: "imediato estendido",
            value: "0 (tipo R não usa)",
            from: 3,
            to: 4,
            note: "Nos outros tipos, o imediato já sai com o sinal estendido para 32 bits",
          },
        ],
      },
      {
        id: "rd",
        label: "Destino",
        role: "a",
        from: 4,
        to: 5,
        fields: [
          { label: "rd", value: "x4", from: 4, to: 5, note: "Viaja até o WB para saber onde escrever" },
        ],
      },
      {
        id: "ctrl",
        label: "Sinais de controle",
        role: "ctrl",
        from: 5,
        to: 6,
        fields: [
          {
            label: "ALUOp = sub",
            value: "1",
            from: 5,
            to: 6,
            note: "Gerados no ID a partir do opcode e funct",
          },
          {
            label: "RegWrite",
            value: "1",
            from: 5,
            to: 6,
            note: "No estágio WB, o resultado vai para o registrador rd",
          },
          {
            label: "MemRead / MemWrite",
            value: "0 / 0",
            from: 5,
            to: 6,
            note: "Uma soma não lê nem escreve a memória",
          },
        ],
      },
    ],
  };
}

function playCycles(
  b: LessonBuilder,
  r: PipeResult,
  widget: string,
  from: number,
  to: number,
  tick: { n: number },
  rows: boolean,
) {
  for (let c = from; c <= Math.min(to, r.cycles); c++) {
    const t = ++tick.n;
    const stages = (r.grid[c] ?? []).slice(0, 5);
    const marks: (CellMark | undefined)[] = stages.map((x) => (x === "bolha" ? "bubble" : undefined));
    const entering = r.timings.find((x) => x.if === c);
    const leaving = r.timings.find((x) => x.wb === c);
    const bubble = stages.includes("bolha");
    b.ev({
      t,
      kind: "stage",
      pipeline: widget,
      cycle: c,
      stages,
      marks,
      role: bubble ? "warn" : "ctrl",
      label: `Ciclo ${c}`,
      ...(rows
        ? {
            row: {
              cols: {
                t: String(c),
                who: stages
                  .map((x, i) => (x ? `${STAGES[i]}:${x}` : null))
                  .filter(Boolean)
                  .join(" "),
                what: bubble
                  ? "bolha"
                  : entering
                    ? `entra ${entering.label}`
                    : leaving
                      ? `sai ${leaving.label}`
                      : "avança",
                detail: leaving ? `${leaving.label} termina` : "",
              },
            },
          }
        : {}),
    });
    STAGES.forEach((s, i) => {
      b.ev({
        t,
        kind: "state",
        target: s,
        text: stages[i] ?? "—",
        tone: stages[i] === "bolha" ? "warn" : stages[i] ? "active" : "none",
        role: "ctrl",
        label: `${s}: ${stages[i] ?? "vazio"}`,
      });
    });
  }
}

export function build(p: Params) {
  const b = lessonBuilder();
  const tick = { n: 0 };
  const custom = String(p.programa ?? "").trim();
  if (custom) {
    const prog = toPipe(assemble(custom, 12));
    const fwd = Boolean(p.forwarding);
    const r = runPipeline(prog, fwd);
    if (r.cycles > 40) throw new Error("O programa passa de 40 ciclos; use menos instruções");
    const fill = Math.min(5, r.cycles);
    b.step(
      {
        id: "s1-enche",
        title: "O pipeline enche",
        subtitle: "Ciclos 1 a 5",
        text: "Uma instrução entra a cada ciclo enquanto as anteriores avançam.",
        facts: [["Instruções", String(prog.length)]],
      },
      () => playCycles(b, r, "pipe1", 1, fill, tick, true),
    );
    if (r.cycles > fill)
      b.step(
        {
          id: "s2-resto",
          title: "Até o fim",
          subtitle: fwd ? "com forwarding" : "sem forwarding",
          text: "Bolhas aparecem quando uma instrução precisa de um valor que ainda não está pronto.",
          facts: [["Bolhas", String(r.bubbles)]],
        },
        () => playCycles(b, r, "pipe1", fill + 1, r.cycles, tick, true),
      );
    const notes = [
      `${prog.length} instruções em ${r.cycles} ciclos: CPI = ${r.cpi.toFixed(2).replace(".", ",")}.`,
    ];
    if (r.bubbles)
      notes.push(
        `${r.bubbles} bolha${r.bubbles > 1 ? "s" : ""} por dependência de dados${fwd ? " (load seguido de uso)" : ""}.`,
      );
    if (!fwd) {
      const withFwd = runPipeline(prog, true);
      if (withFwd.bubbles < r.bubbles)
        notes.push(`Com forwarding seriam ${withFwd.cycles} ciclos (${withFwd.bubbles} bolhas).`);
    }
    return b.done({ cycles: r.cycles, bubbles: r.bubbles, cpi: r.cpi, instrs: prog.length }, notes);
  }

  const r1 = runPipeline(toPipe(assemble(PROG1)), false);
  const r2 = runPipeline(toPipe(assemble(PROG2)), false);
  const n = 5;
  b.step(
    {
      id: "s1-sequencial",
      title: "Uma de cada vez",
      subtitle: "Sem pipeline, cada etapa espera",
      text: `Executar uma instrução passa por 5 etapas: buscar (IF), decodificar e ler registradores (ID), calcular (EX), acessar a memória (MEM) e escrever o resultado (WB). Se cada instrução só começa quando a anterior termina, ${n} instruções levam ${n} × 5 = ${n * 5} ciclos, e quatro das cinco unidades ficam paradas o tempo todo.`,
      facts: [
        ["Instruções", String(n)],
        ["Estágios", "5"],
        ["Sem sobreposição", `${n * 5} ciclos`],
      ],
      highlight: ["IF", "ID", "EX", "MEM", "WB"],
    },
    () => {
      for (const s of STAGES)
        b.ev({
          t: ++tick.n,
          kind: "state",
          target: s,
          text: "—",
          tone: "none",
          role: "muted",
          label: `${s} vazio`,
        });
      b.ev({
        t: ++tick.n,
        kind: "note",
        at: "EX",
        text: `sem pipeline: ${n} × 5 = ${n * 5} ciclos`,
        tone: "info",
        role: "ctrl",
        label: "Conta sem pipeline",
        row: {
          cols: { t: "—", who: "Sem pipeline", what: `${n * 5} ciclos`, detail: "uma instrução por vez" },
        },
      });
    },
  );
  b.step(
    {
      id: "s2-enche",
      quiz: {
        kind: "choice",
        prompt: "Com o pipeline cheio, cada instrução, sozinha, termina mais depressa do que sem pipeline?",
        options: [
          "Não: cada uma ainda passa pelos 5 estágios; o ganho é ter várias em andamento",
          "Sim: cada instrução fica 5 vezes mais rápida",
          "Sim, mas só as que não acessam a memória",
        ],
        answer: 0,
        explain:
          "A latência de cada instrução não cai; até sobe um pouco, porque o clock segue o estágio mais lento. O que aumenta é a vazão: uma instrução termina por ciclo.",
      },
      title: "O pipeline enche",
      subtitle: "Ciclos 1 a 5",
      text: "Com pipeline, a próxima instrução entra no IF assim que a anterior passa para o ID. No ciclo 5 os cinco estágios estão ocupados, cada um com uma instrução diferente. Nenhuma instrução fica mais rápida; o que aumenta é quantas estão em andamento ao mesmo tempo.",
      facts: [
        ["Ciclo 5", "5 instruções em andamento"],
        ["Primeira a terminar", "ciclo 5"],
      ],
    },
    () => playCycles(b, r1, "pipe1", 1, 5, tick, true),
  );
  b.step(
    {
      id: "s3-regime",
      title: "Uma por ciclo",
      subtitle: "Em regime, CPI tende a 1",
      text: `Depois de cheio, o pipeline termina uma instrução por ciclo. As ${n} instruções acabam no ciclo ${r1.cycles} = ${n} + 4: os 4 ciclos extras são o tempo de encher. Com milhões de instruções esse custo some, e os ciclos por instrução (CPI) se aproximam de 1.`,
      facts: [
        ["Ciclos", `${r1.cycles} (era ${n * 5})`],
        ["CPI deste trecho", r1.cpi.toFixed(2).replace(".", ",")],
        ["CPI em regime", "≈ 1"],
      ],
    },
    () => playCycles(b, r1, "pipe1", 6, r1.cycles, tick, true),
  );
  b.step(
    {
      id: "s4-registradores",
      title: "Registradores de pipeline",
      subtitle: "O que passa de um estágio ao outro",
      text: "Entre dois estágios há um registrador que, a cada ciclo, guarda tudo o que a instrução vai precisar adiante: valores lidos, imediato, número do registrador de destino e sinais de controle. Sem eles, a instrução seguinte apagaria os dados da anterior. Abra o inspetor (I) para ver o ID/EX.",
      facts: [
        ["Registradores", "IF/ID, ID/EX, EX/MEM, MEM/WB"],
        ["Atualizados", "na borda do clock"],
      ],
      highlight: ["ID-EX"],
    },
    () => {
      const fr = b.frame(idExFrame());
      b.ev({
        t: ++tick.n,
        kind: "state",
        target: "ID-EX",
        text: "sub x4",
        tone: "active",
        role: "ctrl",
        label: "ID/EX guarda o sub",
        frame: fr,
        row: {
          cols: { t: "—", who: "ID/EX", what: "Guarda sub x4, x5, x6", detail: "operandos, rd e controle" },
        },
      });
      b.ev({
        t: ++tick.n,
        kind: "move",
        from: "ID",
        to: "EX",
        role: "b",
        label: "Os valores seguem para a ULA",
      });
    },
  );
  b.step(
    {
      id: "s5-dependencia",
      title: "Uma dependência",
      subtitle: "sub precisa do x5 que o add ainda não escreveu",
      text: `No programa 2, \`sub x8, x5, x9\` lê x5 logo depois de \`add x5, x6, x7\` calculá-lo. Sem forwarding, o valor só chega ao banco de registradores no WB do add. O sub fica parado no ID e entram **bolhas** no EX: ${r2.bubbles} ciclos perdidos. O forwarding, no Laboratório, evita quase todas.`,
      facts: [
        ["Bolhas", String(r2.bubbles)],
        ["Ciclos", `${r2.cycles} (eram ${r1.cycles})`],
        ["CPI", r2.cpi.toFixed(2).replace(".", ",")],
      ],
      highlight: ["ID", "EX"],
      quiz: {
        kind: "number",
        prompt:
          "O programa 2 tem 5 instruções e o sub depende do add logo antes dele. Sem forwarding (o registrador é escrito na primeira metade do ciclo e lido na segunda), quantos ciclos leva o programa todo?",
        answer: r2.cycles,
        explain: `Seriam ${n} + 4 = ${r1.cycles} ciclos sem dependências. O sub precisa esperar o WB do add (ciclo 5) para ler x5 no ID, o que gera ${r2.bubbles} bolhas: **${r2.cycles} ciclos**.`,
      },
    },
    () => playCycles(b, r2, "pipe2", 1, r2.cycles, tick, true),
  );
  const single = n * SINGLE_PS;
  const piped = r1.cycles * STAGE_PS;
  const million = (1_000_000 * SINGLE_PS) / ((1_000_000 + 4) * STAGE_PS);
  b.step(
    {
      id: "s6-ganho",
      title: "Quanto se ganha",
      subtitle: "Ciclo menor, mais instruções por vez",
      text: `Num processador monociclo, o clock precisa caber a instrução mais lenta inteira (aqui ${SINGLE_PS} ps). Com pipeline, o clock só precisa caber o estágio mais lento (${STAGE_PS} ps). Para estas ${n} instruções: ${single} ps contra ${piped} ps. Para um milhão, o ganho se aproxima de ${SINGLE_PS / STAGE_PS}×, e não 5×: os estágios não levam o mesmo tempo, e o clock segue o mais lento.`,
      facts: [
        ["Monociclo", `${n} × ${SINGLE_PS} = ${single} ps`],
        ["Pipeline", `${r1.cycles} × ${STAGE_PS} = ${piped} ps`],
        ["1 milhão de instruções", `≈ ${million.toFixed(2).replace(".", ",")}× mais rápido`],
      ],
    },
    () => {
      b.ev({
        t: ++tick.n,
        kind: "note",
        at: "MEM",
        text: `${single} ps → ${piped} ps`,
        tone: "good",
        role: "ctrl",
        label: "Comparação de tempo",
        row: {
          cols: { t: "—", who: "Resumo", what: "Monociclo × pipeline", detail: `${single} ps × ${piped} ps` },
        },
      });
    },
  );
  return b.done({ cycles1: r1.cycles, cycles2: r2.cycles, bubbles: r2.bubbles, single, piped });
}

const lesson: LessonModule = {
  meta: {
    slug: "pipeline",
    site: "arq",
    title: "O pipeline de 5 estágios",
    summary:
      "Como sobrepor as etapas de várias instruções faz o processador terminar uma por ciclo, e por que uma dependência de dados cria bolhas.",
    area: "Microarquitetura",
    refs: [
      {
        book: "tanenbaum-sco",
        chapter: 2,
        section: "2.1.5",
        note: "Paralelismo no nível de instrução",
        verified: true,
      },
      {
        book: "tanenbaum-sco",
        chapter: 4,
        section: "4.4.4",
        note: "Projeto com pipeline: a Mic-3",
        verified: true,
      },
    ],
    simplifications: [
      "Os tempos seguem o exemplo clássico do Patterson & Hennessy: o estágio mais lento leva 200 ps e a instrução inteira, 800 ps. O ciclo do pipeline é sempre o do estágio mais lento.",
      "Sem desvios nem predição de desvio.",
      "A memória sempre responde em um ciclo (sem faltas de cache).",
      "No Laboratório, o forwarding segue o modelo clássico: só o load seguido de uso ainda gera bolha.",
    ],
  },
  scene,
  params: {
    defaults: { programa: "", forwarding: false },
    fields: [
      {
        key: "programa",
        kind: "text",
        label: "Seu programa (até 12 instruções)",
        maxLength: 360,
        rows: 6,
        pattern: "[\\x20-\\x7E\\n]*",
        placeholder: "lw x5, 0(x10)\nadd x6, x5, x5\nsw x6, 4(x10)",
        help: "Assembly RV32I, uma instrução por linha. Deixe vazio para ver a lição completa.",
      },
      { key: "forwarding", kind: "bool", label: "Ligar o forwarding (adiantamento)" },
    ],
  },
  build,
  intro: {
    text: "Uma lavanderia com lavadora, secadora e passadeira não espera a primeira roupa ficar pronta para começar a segunda. (Essa é a analogia da lição.) O [[pipeline]] faz o mesmo com instruções: cada [[estagio]] trabalha numa instrução diferente. Você vai ver o pipeline encher, chegar a uma instrução por ciclo e engasgar numa dependência.",
    facts: [
      ["Estágios", "IF, ID, EX, MEM, WB"],
      ["Programa 1", "5 instruções independentes"],
      ["Programa 2", "uma dependência, sem forwarding"],
    ],
  },
  outro: {
    title: "Pipeline em resumo",
    text: "O pipeline não acelera uma instrução: ele termina mais instruções por segundo. Dependências entre instruções próximas criam bolhas, e o hardware gasta muito esforço para evitá-las.",
    facts: (run) =>
      run.stats.cycles1 !== undefined
        ? [
            ["Programa 1", `${run.stats.cycles1} ciclos`],
            ["Programa 2", `${run.stats.cycles2} ciclos (${run.stats.bubbles} bolhas)`],
          ]
        : [
            ["Ciclos", String(run.stats.cycles)],
            ["Bolhas", String(run.stats.bubbles)],
          ],
  },
  next: ["cache-direta"],
  counter: {
    test: (ev) =>
      ev.kind === "stage" &&
      ev.stages.includes("bolha") &&
      (ev.marks ?? []).some((m, i) => m === "bubble" && i === 2),
    label: (n) => (n === 1 ? "1 bolha" : `${n} bolhas`),
  },
  practice,
};

export default lesson;
