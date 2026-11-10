import type { LessonModule, SceneSpec } from "../../../contracts/types.ts";
import { type Model, opName, type Schedule, schedules, tally } from "../../../sim/arch/consistency.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { consistencia as practice } from "../practice.ts";

/**
 * Memory consistency with the store-buffering litmus test: two cores, two variables, every
 * schedule enumerated under sequential consistency, under a store buffer (TSO) and with fences.
 */
const scene: SceneSpec = {
  viewBox: [960, 560],
  nodes: [],
  links: [],
  widgets: [
    {
      kind: "table",
      id: "programa",
      title: "O programa (x e y começam em 0)",
      at: [40, 40],
      columns: ["Núcleo 0", "Núcleo 1"],
      widths: [170, 170],
      rows: 2,
    },
    { kind: "counter", id: "ordens", title: "Ordens possíveis", at: [440, 40] },
    { kind: "counter", id: "zero", title: "Ordens com r1 = r2 = 0", at: [660, 40] },
    {
      kind: "table",
      id: "sc",
      title: "Consistência sequencial: todas as ordens",
      at: [40, 160],
      columns: ["Ordem global", "r1", "r2"],
      widths: [460, 60, 60],
      rows: 6,
    },
    {
      kind: "table",
      id: "modelos",
      title: "Resultados por modelo",
      at: [40, 400],
      columns: ["Modelo", "Ordens", "(0,0)", "(0,1)", "(1,0)", "(1,1)"],
      widths: [260, 90, 80, 80, 80, 80],
      rows: 3,
    },
  ],
};

const LABEL: Record<Model, string> = {
  sc: "Sequencial",
  tso: "Buffer de escrita (TSO)",
  fence: "TSO com barreira",
};

export function build() {
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const runs = { sc: schedules("sc"), tso: schedules("tso"), fence: schedules("fence") };
  const t = { sc: tally(runs.sc), tso: tally(runs.tso), fence: tally(runs.fence) };
  const pct = (m: Model) => Math.round(((t[m]["0,0"] ?? 0) / runs[m].length) * 100);
  const summary = (m: Model, i: number) =>
    c.row(
      "modelos",
      i,
      [
        LABEL[m],
        String(runs[m].length),
        String(t[m]["0,0"]),
        String(t[m]["0,1"]),
        String(t[m]["1,0"]),
        String(t[m]["1,1"]),
      ],
      {
        dt: 1,
        mark: (t[m]["0,0"] ?? 0) > 0 ? "bad" : "hit",
        log: { who: LABEL[m], what: `${runs[m].length} ordens`, detail: `(0,0) em ${t[m]["0,0"]}` },
      },
    );
  const order = (s: Schedule) => s.order.map(opName).join(" → ");

  b.step(
    {
      id: "s1-programa",
      title: "Dois núcleos, duas variáveis",
      subtitle: "x = 1 de um lado, y = 1 do outro",
      text: "Dois núcleos dividem a memória. O núcleo 0 escreve x = 1 e depois lê y; o núcleo 1 escreve y = 1 e depois lê x. É o esqueleto de uma trava sem hardware especial, como a de Peterson: cada um avisa que quer entrar e confere o aviso do outro. A pergunta é quais pares (r1, r2) podem sair, e a resposta depende do [[modelo-de-consistencia]] da máquina.",
      facts: [
        ["Valores iniciais", "x = 0, y = 0"],
        ["Núcleo 0", "x = 1; r1 = y"],
        ["Núcleo 1", "y = 1; r2 = x"],
      ],
      highlight: [],
    },
    () => {
      c.row("programa", 0, ["x = 1", "y = 1"], { dt: 1, mark: "new" });
      c.row("programa", 1, ["r1 = y", "r2 = x"], { dt: 0, mark: "new" });
    },
  );

  b.step(
    {
      id: "s2-sequencial",
      title: "Uma fila só",
      subtitle: `${runs.sc.length} ordens, nenhuma com (0,0)`,
      text: `Na [[consistencia-sequencial]], as quatro operações entram numa fila única e cada núcleo mantém a sua ordem. Há ${runs.sc.length} intercalações. Em ${t.sc["1,1"]} delas as duas escritas vêm antes das leituras e sai (1,1); nas outras duas, um núcleo termina antes do outro começar. O par (0,0) nunca aparece: quem lê por último já encontra a escrita do outro.`,
      facts: [
        ["Ordens", String(runs.sc.length)],
        ["(1,1)", String(t.sc["1,1"])],
        ["(0,0)", String(t.sc["0,0"])],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: "Com consistência sequencial, o par r1 = 0 e r2 = 0 pode acontecer?",
        options: [
          "Não, em nenhuma ordem",
          "Sim, se os dois lerem ao mesmo tempo",
          "Só com mais de dois núcleos",
        ],
        answer: 0,
        explain: `Para r1 = 0, a leitura de y vem antes de y = 1, que vem antes de r2 = x; e x = 1 já veio antes de r1 = y. Então r2 vê 1. Nas ${runs.sc.length} ordens, (0,0) aparece ${t.sc["0,0"]} vezes.`,
      },
    },
    () => {
      runs.sc.forEach((s, i) => {
        c.row("sc", i, [order(s), String(s.r1), String(s.r2)], {
          dt: 1,
          mark: s.r1 === 1 && s.r2 === 1 ? "hit" : "new",
          log: { who: `ordem ${i + 1}`, what: `(${s.r1},${s.r2})`, detail: order(s) },
        });
      });
      c.count("ordens", String(runs.sc.length), { label: `${runs.sc.length} ordens` });
      c.count("zero", String(t.sc["0,0"]), { role: "a", label: `(0,0) ${t.sc["0,0"]}` });
      summary("sc", 0);
    },
  );

  b.step(
    {
      id: "s3-buffer",
      title: "A escrita espera",
      subtitle: `${t.tso["0,0"]} de ${runs.tso.length} ordens dão (0,0)`,
      text: `Um núcleo real não para a cada escrita: ela vai para um [[buffer-de-escrita]] e chega à memória depois, enquanto a leitura seguinte já busca y. Agora cada escrita tem dois momentos, entrar no buffer e chegar à memória, e há ${runs.tso.length} ordens. Em ${t.tso["0,0"]} delas, ${pct("tso")}%, as duas leituras passam antes de qualquer escrita sair do buffer: r1 = r2 = 0, um resultado impossível na fila única.`,
      facts: [
        ["Ordens", String(runs.tso.length)],
        ["(0,0)", `${t.tso["0,0"]} (${pct("tso")}%)`],
        ["Modelo", "TSO, o do x86"],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: "O que torna possível r1 = r2 = 0 quando há buffer de escrita?",
        options: [
          "As leituras buscam a memória antes de as escritas saírem dos buffers",
          "Cada núcleo executa as suas instruções fora da ordem do texto",
          "A memória perde uma das escritas quando as duas chegam juntas",
        ],
        answer: 0,
        explain: `Cada núcleo ainda executa x = 1 antes de r1 = y, mas a escrita espera no buffer e a leitura vai direto à memória. Em ${t.tso["0,0"]} das ${runs.tso.length} ordens, as duas leituras passam antes das duas chegadas à memória.`,
      },
    },
    () => {
      c.count("ordens", String(runs.tso.length), { dt: 1, label: `${runs.tso.length} ordens` });
      c.count("zero", String(t.tso["0,0"]), { role: "bad", label: `(0,0) ${t.tso["0,0"]}` });
      summary("tso", 1);
    },
  );

  b.step(
    {
      id: "s4-barreira",
      title: "Uma barreira de memória",
      subtitle: `${runs.fence.length} ordens, (0,0) some`,
      text: `Uma [[barreira-de-memoria]] (fence) entre a escrita e a leitura obriga o buffer a esvaziar antes de seguir. Cada núcleo volta a ter uma sequência fixa de três passos e sobram ${runs.fence.length} ordens, nenhuma com (0,0). O custo é esperar a escrita chegar à memória, dezenas de ciclos; por isso o compilador só põe barreiras onde o programa pede, por exemplo numa variável atômica.`,
      facts: [
        ["Ordens", String(runs.fence.length)],
        ["(0,0)", String(t.fence["0,0"])],
        ["Custo", "esvaziar o buffer"],
      ],
      highlight: [],
    },
    () => {
      c.count("ordens", String(runs.fence.length), { dt: 1, label: `${runs.fence.length} ordens` });
      c.count("zero", String(t.fence["0,0"]), { role: "a", label: `(0,0) ${t.fence["0,0"]}` });
      summary("fence", 2);
    },
  );

  b.step(
    {
      id: "s5-contrato",
      title: "Um contrato com o programador",
      subtitle: "x86, ARM e RISC-V prometem coisas diferentes",
      text: "O modelo de consistência é um contrato: diz quais resultados o hardware pode produzir. O x86 segue o TSO, que só deixa uma leitura passar à frente de uma escrita. ARM e RISC-V são mais fracos e reordenam também leituras entre si e escritas entre si, o que dá mais liberdade ao hardware. Código com travas e atômicas da linguagem fica correto em todos; código que confia na ordem do texto, não.",
      facts: [
        ["x86", "TSO"],
        ["RISC-V", "RVWMO, fraco"],
        ["Remédio", "travas, atômicas, fence"],
      ],
      highlight: [],
    },
    () => {
      c.row("programa", 0, ["x = 1; fence", "y = 1; fence"], { dt: 1, mark: "hit" });
    },
  );

  return b.done({
    sc: runs.sc.length,
    tso: runs.tso.length,
    tsoZero: t.tso["0,0"] ?? 0,
    fence: runs.fence.length,
    fenceZero: t.fence["0,0"] ?? 0,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "consistencia",
    site: "arq",
    title: "Consistência de memória: em que ordem os outros veem",
    summary:
      "Dois núcleos escrevem e leem duas variáveis; todas as ordens possíveis sob consistência sequencial, com buffer de escrita e com barreira.",
    area: "Paralelismo",
    refs: [
      {
        book: "tanenbaum-sco",
        chapter: 8,
        section: "8.3.2",
        note: "Semântica da memória: consistência estrita, sequencial e de processador",
        verified: true,
      },
      { url: "https://riscv.org/technical/specifications/", title: "RISC-V ISA, Volume I: RVWMO" },
    ],
    simplifications: [
      "Cada escrita sai do buffer de uma vez; não há caches nem protocolo de coerência no caminho.",
      "O modelo TSO aqui só tem o buffer de escrita com leitura do próprio buffer; não trata atômicas.",
    ],
  },
  scene,
  params: { defaults: {} },
  build,
  intro: {
    text: "Num núcleo só, a memória faz o que o programa manda, na ordem do texto. Com dois núcleos, cada um pode ver as escritas do outro numa ordem diferente. Você vai listar todas as ordens possíveis de um programa de quatro linhas e achar um resultado que parece impossível.",
    facts: [
      ["Núcleos", "2"],
      ["Variáveis", "x e y"],
      ["Modelos", "sequencial, TSO, TSO com barreira"],
    ],
  },
  outro: {
    title: "Consistência em resumo",
    text: "Sem buffer, as operações se intercalam numa fila única e r1 = r2 = 0 não acontece. Com buffer de escrita, as leituras passam à frente e esse par aparece; uma barreira devolve a ordem, ao custo de esperar.",
    facts: (run) => [
      ["Ordens sequenciais", String(run.stats.sc)],
      ["Ordens com buffer", String(run.stats.tso)],
      ["(0,0) com buffer", String(run.stats.tsoZero)],
    ],
  },
  next: ["coerencia-mesi", "numa"],
  practice,
};

export default lesson;
