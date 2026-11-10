import type { LessonModule, SceneSpec } from "../../../contracts/types.ts";
import { breakEven, cost, expand, parse } from "../../../sim/arch/macro.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { macros as practice } from "../practice.ts";

/**
 * Assembly macros: a 4-line swap defined once and used three times, expanded by the assembler,
 * then compared with the same swap as a procedure (size and instructions executed).
 */
const SOURCE = [
  ".macro troca a, b",
  "lw t0, 0(\\a)",
  "lw t1, 0(\\b)",
  "sw t1, 0(\\a)",
  "sw t0, 0(\\b)",
  ".endm",
  "troca a0, a1",
  "troca a2, a3",
  "troca a0, a2",
];
/** Two moves to put the addresses in a0 and a1 before the call. */
const SETUP = 2;
const MAX_K = 8;

const scene: SceneSpec = {
  viewBox: [960, 600],
  nodes: [],
  links: [],
  widgets: [
    {
      kind: "table",
      id: "fonte",
      title: "O que o programador escreve",
      at: [30, 40],
      columns: ["Linha", "Texto"],
      widths: [70, 230],
      rows: SOURCE.length,
    },
    {
      kind: "table",
      id: "expandido",
      title: "O que o montador traduz",
      at: [360, 40],
      columns: ["Endereço", "Instrução", "Veio da linha"],
      widths: [100, 200, 130],
      rows: 12,
    },
    {
      kind: "chart",
      id: "tamanho",
      title: "Palavras de código por número de usos",
      at: [60, 430],
      width: 360,
      height: 130,
      x: { label: "usos", max: MAX_K },
      y: { label: "palavras", max: 32 },
    },
    { kind: "counter", id: "macro", title: "Macro: palavras", at: [520, 470] },
    { kind: "counter", id: "proc", title: "Procedimento: palavras", at: [730, 470] },
  ],
};

export function build() {
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const { macros, code } = parse(SOURCE);
  const mac = macros[0] as (typeof macros)[number];
  const body = mac.body.length;
  const k = code.length;
  const out = expand(SOURCE);
  const x = cost(k, body, SETUP);
  const even = breakEven(body, SETUP);
  const at = cost(even, body, SETUP);

  b.step(
    {
      id: "s1-repeticao",
      title: "Quatro linhas, três vezes",
      subtitle: "Trocar dois valores na memória",
      text: `Um programa precisa trocar o conteúdo de duas posições de memória em três lugares. Em [[assembly]] RISC-V, cada troca são ${body} instruções: duas leituras e duas escritas. Copiar as ${body} linhas três vezes funciona, mas um registrador trocado numa das cópias passa despercebido e, se a troca mudar, é preciso corrigir todas.`,
      facts: [
        ["Instruções por troca", String(body)],
        ["Usos", String(k)],
        ["Registradores temporários", "t0, t1"],
      ],
      highlight: [],
    },
    () => {
      SOURCE.forEach((l, i) => {
        c.row("fonte", i, [String(i + 1), l], {
          dt: i === 0 ? 1 : 0,
          ...(i >= 6 ? { mark: "new" as const } : {}),
        });
      });
    },
  );

  b.step(
    {
      id: "s2-definicao",
      title: "Dar um nome",
      subtitle: `.macro ${mac.name} ${mac.params.join(", ")}`,
      text: `Uma [[macro]] dá nome a um trecho de texto. Entre .macro e .endm fica o corpo, com os [[parametro-formal|parâmetros formais]] ${mac.params.map((p) => `\\${p}`).join(" e ")} no lugar dos registradores que mudam a cada uso. Depois, no programa, basta escrever ${mac.name} seguido dos registradores reais. A macro não gera nenhuma instrução sozinha: é uma instrução para o montador, não para o processador.`,
      facts: [
        ["Nome", mac.name],
        ["Parâmetros", mac.params.join(", ")],
        ["Linhas do corpo", String(body)],
      ],
      highlight: [],
    },
    () => {
      for (let i = 0; i < 6; i++)
        c.row("fonte", i, [String(i + 1), SOURCE[i] as string], { dt: i === 0 ? 1 : 0, mark: "hit" });
    },
  );

  b.step(
    {
      id: "s3-expansao",
      title: "O montador copia",
      subtitle: `${k} usos viram ${out.length} instruções`,
      text: `Antes de traduzir, o [[montador]] faz a expansão: troca cada uso pelo corpo, colocando ${code[0]?.split(" ").slice(1).join(" ")} no lugar de ${mac.params.map((p) => `\\${p}`).join(", ")}, e assim por diante. As ${k} linhas viram ${out.length} instruções, uma cópia por uso. É substituição de texto e nada mais: o processador nunca sabe que houve uma macro, e o programa resultante é idêntico ao escrito à mão.`,
      facts: [
        ["Linhas de uso", String(k)],
        ["Instruções geradas", String(out.length)],
        ["Quando acontece", "antes da primeira passagem"],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Se o programa usasse ${mac.name} 5 vezes em vez de ${k}, quantas instruções o montador geraria para elas?`,
        answer: 5 * body,
        tolerance: 0,
        unit: "instruções",
        explain: `Cada uso vira uma cópia inteira do corpo, de ${body} instruções: 5 × ${body} = ${5 * body}. A definição em si não gera nada.`,
      },
    },
    () => {
      out.forEach((e, i) => {
        c.row("expandido", i, [`0x${(i * 4).toString(16).padStart(3, "0")}`, e.line, String(e.from + 6)], {
          dt: 1,
          mark: "new",
          log: { who: `linha ${e.from + 6}`, what: e.line },
        });
      });
      c.count("macro", String(x.macroSize), { label: `macro ${x.macroSize} palavras` });
    },
  );

  b.step(
    {
      id: "s4-procedimento",
      title: "Macro ou procedimento",
      subtitle: `Empatam com ${even} usos`,
      text: `A alternativa é um procedimento: o corpo uma vez, mais um ret, e em cada uso ${SETUP} instruções para pôr os endereços em a0 e a1 e um call. Com ${k} usos, a macro ocupa ${x.macroSize} palavras e o procedimento ${x.procSize}; a partir de ${even} usos o procedimento fica menor. Mas ele executa ${x.procRun} instruções contra ${x.macroRun}, porque cada uso paga a ida, a volta e a preparação.`,
      facts: [
        ["Macro", `${x.macroSize} palavras, ${x.macroRun} executadas`],
        ["Procedimento", `${x.procSize} palavras, ${x.procRun} executadas`],
        ["Empate de tamanho", `${even} usos, ${at.macroSize} palavras`],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: "A partir de quantos usos o procedimento ocupa no máximo o mesmo espaço que a macro?",
        answer: even,
        explain: `Macro: ${body} × k palavras. Procedimento: ${body} + 1 + ${SETUP + 1} × k. Com k = ${even}, ${at.macroSize} contra ${at.procSize}.`,
      },
    },
    () => {
      for (let n = 1; n <= MAX_K; n++) {
        const y = cost(n, body, SETUP);
        c.plot("tamanho", "macro", n, y.macroSize, {
          role: "a",
          dt: 1,
          label: `${n} usos: macro ${y.macroSize}`,
        });
        c.plot("tamanho", "procedimento", n, y.procSize, { role: "b", label: `procedimento ${y.procSize}` });
      }
      c.count("proc", String(x.procSize), { role: "b", label: `procedimento ${x.procSize} palavras` });
    },
  );

  b.step(
    {
      id: "s5-escolha",
      title: "Quando cada um ganha",
      subtitle: "Tamanho contra velocidade",
      text: "Macros servem a trechos curtos e quentes, em que a ida e a volta de um procedimento custariam tanto quanto o trabalho. Procedimentos servem a trechos grandes ou muito usados, em que copiar o corpo incharia o programa e a cache de instruções. Compiladores fazem a mesma escolha ao decidir se expandem uma função no lugar da chamada, a chamada inline.",
      facts: [
        ["Macro", "sem custo de chamada, código maior"],
        ["Procedimento", "código menor, ida e volta"],
        ["Em C", "funções inline"],
      ],
      highlight: [],
    },
    () => {
      c.count("macro", String(x.macroSize), { dt: 1, label: `macro ${x.macroSize}` });
    },
  );

  return b.done({
    expanded: out.length,
    macroSize: x.macroSize,
    procSize: x.procSize,
    procRun: x.procRun,
    even,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "macros",
    site: "arq",
    title: "Macros: o montador copia e cola",
    summary:
      "Uma troca de quatro instruções definida como macro, expandida pelo montador em cada uso e comparada com um procedimento.",
    area: "ISA",
    refs: [
      {
        book: "tanenbaum-sco",
        chapter: 7,
        section: "7.2",
        note: "Macros: definição, chamada e expansão",
        verified: true,
      },
    ],
    simplifications: [
      "A sintaxe .macro e .endm segue o montador GNU; outros montadores usam palavras diferentes.",
      "O procedimento não salva registradores na pilha; usa os temporários t0 e t1.",
    ],
  },
  scene,
  params: { defaults: {} },
  build,
  intro: {
    text: "Em assembly, os mesmos trechos se repetem muito. O montador oferece um atalho que não custa nada em tempo de execução: escrever o trecho uma vez, com um nome, e deixar que ele seja copiado em cada uso.",
    facts: [
      ["Trecho", "trocar duas palavras na memória"],
      ["Usos", "3"],
      ["Comparação", "procedimento"],
    ],
  },
  outro: {
    title: "Macros em resumo",
    text: "Uma macro é substituição de texto feita pelo montador: cada uso vira uma cópia do corpo com os parâmetros trocados. Não há custo de chamada, mas o código cresce a cada uso; um procedimento faz o contrário.",
    facts: (run) => [
      ["Instruções geradas", String(run.stats.expanded)],
      ["Procedimento", `${run.stats.procSize} palavras`],
      ["Empate", `${run.stats.even} usos`],
    ],
  },
  next: ["ligacao", "pilha-chamadas"],
  practice,
};

export default lesson;
