import type { LessonModule, SceneSpec } from "../../../contracts/types.ts";
import { ASM, C_LINE, levels } from "../../../sim/arch/levels.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { niveis as practice } from "../practice.ts";

/**
 * The multilevel machine: x = a + b followed from C down to assembly, ISA words,
 * multicycle microarchitecture steps and the gates of the adder.
 */
const LEVELS = [
  "5 · Linguagem orientada a problema",
  "4 · Linguagem de montagem",
  "3 · Máquina do sistema operacional",
  "2 · Arquitetura do conjunto de instrução",
  "1 · Microarquitetura",
  "0 · Lógica digital",
];

const scene: SceneSpec = {
  viewBox: [960, 600],
  nodes: [],
  links: [],
  widgets: [
    {
      kind: "table",
      id: "niveis",
      title: `${C_LINE} em cada nível`,
      at: [30, 40],
      columns: ["Nível", "O que aparece", "Quanto"],
      widths: [330, 330, 200],
      rows: LEVELS.length,
    },
    {
      kind: "table",
      id: "instrucoes",
      title: "As instruções, em texto e em bits",
      at: [30, 330],
      columns: ["Assembly", "Palavra", "Passos internos"],
      widths: [200, 140, 520],
      rows: ASM.length,
    },
  ],
};

const hex = (w: number) => `0x${w.toString(16).toUpperCase().padStart(8, "0")}`;

export function build() {
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const l = levels();
  const level = (i: number, what: string, much: string) =>
    c.row("niveis", i, [LEVELS[i] as string, what, much], {
      dt: 1,
      mark: "new",
      log: { who: LEVELS[i] as string, what, detail: much },
    });

  b.step(
    {
      id: "s1-c",
      title: "Uma linha de C",
      subtitle: C_LINE,
      text: `Quem escreve ${C_LINE} pensa em variáveis, não em registradores. Essa é a linguagem do nível 5, feita para o problema. O processador não a entende: um compilador a traduz para o nível de baixo. Cada nível de uma [[maquina-multinivel]] é uma máquina virtual com sua própria linguagem, implementada pelo nível abaixo, por tradução ou por interpretação.`,
      facts: [
        ["Nível", "5"],
        ["Linha", C_LINE],
        ["Quem traduz", "o compilador"],
      ],
      highlight: [],
    },
    () => level(0, C_LINE, "1 linha"),
  );

  b.step(
    {
      id: "s2-isa",
      title: "Quatro instruções",
      subtitle: `${ASM.length} palavras, ${l.bits} bits`,
      text: `O compilador produz ${ASM.length} instruções de [[assembly]]: duas leituras da memória, uma soma e uma escrita. O montador troca cada uma por uma palavra de 32 bits, e chegamos ao nível 2, a [[isa]]: ${l.words.map(hex).join(", ")}. A ISA é o contrato entre software e hardware; dois processadores muito diferentes por dentro rodam o mesmo binário se seguem a mesma ISA.`,
      facts: [
        ["Instruções", String(ASM.length)],
        ["Bits", String(l.bits)],
        ["Primeira palavra", hex(l.words[0] as number)],
      ],
      highlight: [],
    },
    () => {
      level(1, ASM.join("; "), `${ASM.length} instruções`);
      level(3, l.words.map(hex).join(" "), `${l.bits} bits`);
      ASM.forEach((a, i) => {
        c.row("instrucoes", i, [a, hex(l.words[i] as number), ""], { dt: 1, mark: "new" });
      });
    },
  );

  b.step(
    {
      id: "s3-so",
      title: "O nível do sistema",
      subtitle: "A ISA mais chamadas ao sistema",
      text: "Entre a montagem e a ISA fica a máquina do sistema operacional, o nível 3. Ela tem quase as mesmas instruções da ISA, que o hardware executa direto, mais algumas novas: as chamadas ao sistema, como abrir um arquivo, que o sistema interpreta em software. Também muda o significado de endereços: o 0(a0) do programa é um endereço virtual, que a MMU traduz para outro, físico.",
      facts: [
        ["Nível", "3"],
        ["Instruções extras", "chamadas ao sistema"],
        ["Endereços", "virtuais, traduzidos"],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: "No nível 3, quem executa uma chamada ao sistema, como abrir um arquivo?",
        options: [
          "O sistema operacional, interpretando o pedido em software",
          "O hardware, como qualquer instrução da ISA",
          "O compilador, ao traduzir o programa",
        ],
        answer: 0,
        explain:
          "As instruções comuns do nível 3 o hardware executa direto. As chamadas ao sistema não existem na ISA: o programa entra no núcleo, que faz o trabalho em software e volta.",
      },
    },
    () => level(2, "endereços virtuais em a0", "nenhuma chamada ao sistema"),
  );

  b.step(
    {
      id: "s4-micro",
      title: "Passos dentro da instrução",
      subtitle: `${l.cycles} ciclos num caminho multiciclo`,
      text: `No nível 1, a [[microarquitetura]], cada instrução vira uma sequência de passos sobre registradores, ULA e memória. Num caminho de dados multiciclo, uma leitura passa por ${l.micro[0]?.steps.length} passos, a soma e a escrita por ${l.micro[2]?.steps.length}: ${l.cycles} ciclos para a linha de C inteira. É aqui que um pipeline sobrepõe esses passos; acima do nível 2, ninguém percebe a diferença.`,
      facts: [
        ["Passos da leitura (lw)", String(l.micro[0]?.steps.length)],
        ["Passos da soma", String(l.micro[2]?.steps.length)],
        ["Ciclos ao todo", String(l.cycles)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: "Quantos passos uma instrução lw usa neste caminho de dados multiciclo?",
        answer: l.micro[0]?.steps.length ?? 0,
        explain: `${l.micro[0]?.steps.join(", ")}. A escrita sw pula o último passo, porque não grava registrador.`,
      },
    },
    () => {
      l.micro.forEach((m, i) => {
        c.row("instrucoes", i, [ASM[i] as string, hex(l.words[i] as number), m.steps.join(" → ")], {
          dt: 1,
          mark: "hit",
        });
      });
      level(4, "busca, decodifica, executa…", `${l.cycles} ciclos`);
    },
  );

  b.step(
    {
      id: "s5-portas",
      title: "Até as portas",
      subtitle: `${l.adderGates} portas para somar`,
      text: `No nível 0 só existem portas lógicas e fios. A soma de 32 bits passa por 32 somadores completos de 5 portas cada, ${l.adderGates} portas, e o resultado se propaga de um bit ao próximo. Cada nível esconde o de baixo: quem escreve C não pensa em portas, e quem projeta portas não sabe que programa vai rodar. É essa separação que deixa trocar um nível sem reescrever os outros.`,
      facts: [
        ["Somadores completos", "32"],
        ["Portas", String(l.adderGates)],
        ["Nível", "0"],
      ],
      highlight: [],
    },
    () => level(5, "32 somadores completos", `${l.adderGates} portas`),
  );

  return b.done({ words: l.words.map(hex).join(" "), cycles: l.cycles, gates: l.adderGates });
}

const lesson: LessonModule = {
  meta: {
    slug: "niveis",
    site: "arq",
    title: "Níveis de máquina: de uma linha de C às portas",
    summary:
      "x = a + b atravessa os seis níveis: C, assembly, sistema operacional, ISA, microarquitetura e lógica digital.",
    area: "Visão geral",
    refs: [
      {
        book: "tanenbaum-sco",
        chapter: 1,
        section: "1.1",
        note: "Organização estruturada de computador: máquinas multinível",
        verified: true,
      },
    ],
    simplifications: [
      "As variáveis a, b e x ficam em posições fixas a partir de a0; um compilador real escolheria outro arranjo.",
      "O caminho multiciclo segue o modelo didático de cinco passos; processadores reais usam pipeline.",
    ],
  },
  scene,
  params: { defaults: {} },
  build,
  intro: {
    text: "Um computador é uma pilha de máquinas, cada uma com sua linguagem. Você vai seguir uma única linha de C de cima a baixo e ver quantas instruções, bits, ciclos e portas ela vira em cada nível.",
    facts: [
      ["Linha", C_LINE],
      ["Níveis", "6"],
      ["Processador", "RISC-V"],
    ],
  },
  outro: {
    title: "Níveis em resumo",
    text: "Cada nível é uma máquina virtual implementada pelo de baixo, por tradução ou interpretação. A ISA é a fronteira entre software e hardware; abaixo dela, passos e portas; acima, sistema operacional e linguagens.",
    facts: (run) => [
      ["Palavras", String(run.stats.words)],
      ["Ciclos", String(run.stats.cycles)],
      ["Portas da soma", String(run.stats.gates)],
    ],
  },
  next: ["instrucao-riscv", "portas-logicas"],
  practice,
};

export default lesson;
