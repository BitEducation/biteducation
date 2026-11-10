import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { diverge, pixels, vectorOps } from "../../../sim/arch/simd.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { simdGpu as practice } from "../practice.ts";

/**
 * SIMD on a row of pixels: the same operation on every element, a scalar loop doing one per
 * instruction, a vector register doing several lanes at once, the leftover lanes at the end, a
 * branch that forces mixed groups to run both paths under a mask, and GPUs, where the same rule
 * applies to warps of 32 threads and sorting the data recovers the lost lanes.
 */
export const DEFAULTS = { pixels: 18, pistas: "4" };
const THRESHOLD = 50;
const BOOST = 20;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const instrs = (n: number) => (n === 1 ? "1 instrução" : `${n} instruções`);

function clamp(p: Params) {
  const n = Math.min(24, Math.max(8, Math.round(Number(p.pixels ?? DEFAULTS.pixels))));
  const w = Number(p.pistas) === 8 ? 8 : 4;
  return { n, w };
}

function scene(p: Params): SceneSpec {
  const { n, w } = clamp(p);
  return {
    viewBox: [960, 560],
    nodes: [],
    links: [],
    widgets: [
      {
        kind: "grid",
        id: "px",
        title: `${n} pixels · linhas: brilho, instrução escalar, instrução de ${w} pistas, caminho do desvio`,
        at: [40, 50],
        cols: n,
        rows: 4,
        cellW: Math.min(44, Math.floor(820 / n)),
        indexLabel: "none",
      },
      {
        kind: "table",
        id: "cmp",
        title: "Instruções para a mesma conta",
        at: [40, 300],
        columns: ["Forma", "Instruções", "Pistas úteis"],
        widths: [260, 110, 120],
        rows: 4,
      },
      { kind: "counter", id: "ganho", title: "Instruções a menos", at: [600, 300] },
      { kind: "counter", id: "uso", title: "Pistas aproveitadas", at: [780, 300] },
    ],
  };
}

export function build(p: Params) {
  const { n, w } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const v = pixels(n);
  const ops = vectorOps(n, w);
  const tail = n % w;
  const full = Math.floor(n / w);
  const bits = w * 32;
  const d = diverge(v, w, THRESHOLD);
  const sorted = diverge(
    [...v].sort((a, z) => z - a),
    w,
    THRESHOLD,
  );
  const mixed = d.paths.filter((x) => x === 2).length;
  const bright = v.filter((x) => x >= THRESHOLD).length;
  const cell = (row: number, i: number) => row * n + i;

  b.step(
    {
      id: "s1-pixels",
      title: "A mesma conta, muitos dados",
      subtitle: `${n} pixels, +${BOOST} em cada`,
      text: `Um filtro de imagem quer clarear uma linha de ${n} pixels, somando ${BOOST} ao brilho de cada um. A conta é idêntica para todos e um pixel não depende do outro. Programas de imagem, som, vídeo e aprendizado de máquina são cheios de laços assim: a mesma instrução, aplicada a milhares de dados independentes. É o terreno do [[simd]], uma instrução e muitos dados.`,
      facts: [
        ["Pixels", String(n)],
        ["Conta", `brilho + ${BOOST}`],
        ["Dependência entre pixels", "nenhuma"],
      ],
      highlight: ["px"],
    },
    () => {
      v.forEach((x, i) => {
        c.cell("px", cell(0, i), String(x), { dt: i === 0 ? 1 : 0, role: "muted" });
      });
    },
  );

  b.step(
    {
      id: "s2-escalar",
      title: "Um pixel por instrução",
      subtitle: instrs(n),
      text: `No laço escalar, cada volta carrega um pixel, soma ${BOOST} e guarda o resultado: ${n} somas para ${n} pixels, numeradas na segunda linha. O processador tem uma [[ula]] de 64 bits, mas cada brilho ocupa só 8 ou 32 deles, e o resto do circuito fica parado. Quase todo o trabalho de cada volta é burocracia de laço, buscar a instrução, decodificar e testar o fim, e não a soma em si.`,
      facts: [
        ["Somas", String(n)],
        ["Pixels por instrução", "1"],
        ["Pistas úteis", "100%"],
      ],
      highlight: ["px", "cmp"],
    },
    () => {
      v.forEach((_, i) => {
        c.cell("px", cell(1, i), String(i + 1), { dt: 1, mark: "new", role: "b" });
      });
      c.row("cmp", 0, ["escalar", String(n), "100%"], { dt: 1, mark: "bad" });
    },
  );

  b.step(
    {
      id: "s3-vetor",
      title: `${w} de uma vez`,
      subtitle: `${instrs(ops)} vetoriais`,
      text: `Um registrador vetorial de ${bits} bits guarda ${w} brilhos de 32 bits lado a lado, em ${w} [[pista|pistas]]. Uma única instrução soma ${BOOST} às ${w} pistas no mesmo ciclo, com ${w} somadores pequenos em paralelo. Os ${n} pixels saem em ${instrs(ops)}, na terceira linha, em vez de ${n}: ${n - ops} a menos. Também a busca e a decodificação acontecem ${ops} vezes, não ${n}. É o que fazem SSE e AVX nos x86, NEON nos ARM e a extensão V do RISC-V.`,
      facts: [
        ["Registrador", `${bits} bits = ${w} × 32`],
        ["Instruções", String(ops)],
        ["Economia", `${n - ops} instruções`],
      ],
      highlight: ["px", "cmp", "ganho"],
      quiz: {
        kind: "number",
        prompt: `Com ${w} pistas, quantas instruções vetoriais são precisas para somar ${BOOST} a ${n} pixels?`,
        answer: ops,
        explain: `${n} ÷ ${w} = ${(n / w).toFixed(2).replace(".", ",")}, arredondado para cima: ${ops}.`,
      },
    },
    () => {
      v.forEach((_, i) => {
        c.cell("px", cell(2, i), String(Math.floor(i / w) + 1), {
          dt: i % w === 0 ? 1 : 0,
          mark: "new",
          role: Math.floor(i / w) % 2 === 0 ? "a" : "s3",
        });
      });
      c.row("cmp", 1, [`${w} pistas`, String(ops), pct(n / (ops * w))], { dt: 1, mark: "hit" });
      c.count("ganho", String(n - ops), { dt: 0, label: `${n - ops} instruções a menos` });
    },
  );

  b.step(
    {
      id: "s4-sobra",
      title: "A sobra no fim",
      subtitle: tail ? `${w - tail} ${w - tail === 1 ? "pista vazia" : "pistas vazias"}` : "Nada sobra",
      text: tail
        ? `${n} não é múltiplo de ${w}: ${full} instruções enchem as ${w} pistas, e a última só tem ${tail} ${tail === 1 ? "pixel" : "pixels"}. As outras ${w - tail} pistas são desligadas por uma máscara, para não escrever fora do vetor. Outra saída é terminar os ${tail} restantes com instruções escalares. Das ${ops * w} pistas usadas, ${n} fizeram trabalho útil: ${pct(n / (ops * w))}. Com vetores longos, a perda some; com vetores curtos e pistas largas, pesa.`
        : `${n} é múltiplo de ${w}, então as ${ops} instruções usam as ${w} pistas cheias, e nada se perde. Se fossem ${n + 1} pixels, a última instrução teria um pixel só e ${w - 1} pistas desligadas por uma máscara, para não escrever fora do vetor. Com vetores longos, essa perda some; com vetores curtos e pistas largas, ela pesa.`,
      facts: [
        ["Instruções cheias", String(full)],
        ["Pixels na última", tail ? String(tail) : String(w)],
        ["Pistas úteis", pct(n / (ops * w))],
      ],
      highlight: ["px"],
    },
    () => {
      if (tail) {
        for (let i = full * w; i < n; i++)
          c.cell("px", cell(2, i), String(ops), { dt: i === full * w ? 1 : 0, mark: "bubble", role: "warn" });
      } else c.count("uso", "100%", { dt: 1, label: "sem sobra: todas as pistas úteis" });
    },
  );

  b.step(
    {
      id: "s5-desvio",
      title: "Quando os pixels discordam",
      subtitle: `${pct(d.util)} das pistas úteis`,
      text: `Agora o filtro equilibra: pixel claro, com brilho ${THRESHOLD} ou mais, escurece; pixel escuro clareia. Num laço escalar, cada pixel segue o seu desvio. Uma instrução vetorial não pode ir para dois lados ao mesmo tempo, então cada grupo com pixels dos dois tipos executa os dois caminhos, desligando com a máscara as pistas que não são da vez. Aqui ${mixed} de ${ops} grupos estão misturados: são ${instrs(d.instr)} e só ${pct(d.util)} das pistas fazem trabalho útil.`,
      facts: [
        ["Pixels claros", `${bright} de ${n}`],
        ["Grupos misturados", `${mixed} de ${ops}`],
        ["Pistas úteis", pct(d.util)],
      ],
      highlight: ["px", "cmp", "uso"],
      quiz: {
        kind: "choice",
        prompt: "Por que um grupo com pixels claros e escuros custa duas instruções?",
        options: [
          "Todas as pistas executam a mesma instrução, então os dois caminhos rodam um depois do outro com máscara",
          "Pixels claros precisam de mais bits de precisão",
          "A máscara precisa ser recalculada a cada pixel",
        ],
        answer: 0,
        explain: `Num grupo misturado, as ${w} pistas rodam "escurecer" com só as claras ligadas, depois "clarear" com só as escuras. Grupos uniformes rodam um caminho só.`,
      },
    },
    () => {
      v.forEach((x, i) => {
        const both = d.paths[Math.floor(i / w)] === 2;
        c.cell("px", cell(3, i), x >= THRESHOLD ? "↓" : "↑", {
          dt: i === 0 ? 1 : 0,
          ...(both ? { mark: "miss" as const } : {}),
          role: x >= THRESHOLD ? "s4" : "a",
        });
      });
      c.row("cmp", 2, [`${w} pistas com desvio`, String(d.instr), pct(d.util)], { dt: 1, mark: "warn" });
      c.count("uso", pct(d.util), { dt: 0, label: `${pct(d.util)} das pistas úteis` });
    },
  );

  b.step(
    {
      id: "s6-gpu",
      title: "GPU: o mesmo, em escala",
      subtitle: `Ordenado: ${pct(sorted.util)}`,
      text: `Uma [[gpu]] leva a ideia ao extremo: milhares de pistas, organizadas em grupos de 32 threads que executam a mesma instrução juntas, os warps. O desvio custa o mesmo que aqui: um warp misturado roda os dois caminhos. Por isso quem programa GPU agrupa dados parecidos. Se os pixels claros viessem todos antes dos escuros, só ${sorted.paths.filter((x) => x === 2).length} ${sorted.paths.filter((x) => x === 2).length === 1 ? "grupo ficaria misturado" : "grupos ficariam misturados"}, e ${pct(sorted.util)} das pistas seriam úteis, contra ${pct(d.util)}.`,
      facts: [
        ["Grupo na GPU", "warp de 32 threads"],
        ["Dados misturados", pct(d.util)],
        ["Dados agrupados", pct(sorted.util)],
      ],
      highlight: ["cmp", "uso"],
    },
    () => {
      c.row("cmp", 3, [`${w} pistas, claros antes`, String(sorted.instr), pct(sorted.util)], {
        dt: 1,
        mark: "hit",
      });
      c.count("uso", pct(sorted.util), { dt: 0, label: `agrupados: ${pct(sorted.util)}` });
    },
  );

  return b.done({
    scalar: n,
    vector: ops,
    tail,
    mixed,
    branchInstr: d.instr,
    util: pct(d.util),
    sortedUtil: pct(sorted.util),
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "simd-gpu",
    site: "arq",
    title: "SIMD e GPU: uma instrução, muitos dados",
    summary:
      "Clarear uma linha de pixels um por vez e em pistas vetoriais, a sobra no fim do vetor, o desvio que faz grupos misturados rodarem os dois caminhos, e a GPU, onde a mesma regra vale para warps de 32 threads.",
    area: "Paralelismo",
    refs: [
      {
        book: "tanenbaum-sco",
        chapter: 2,
        section: "2.1.6",
        note: "Paralelismo no nível do processador",
        verified: true,
      },
      {
        book: "tanenbaum-sco",
        chapter: 8,
        section: "8.2.2",
        note: "Processadores de gráficos",
        verified: true,
      },
    ],
    simplifications: [
      "Conta só as instruções de soma; cargas e escritas vetoriais encolhem na mesma proporção.",
      "Cada caminho do desvio é uma instrução só.",
      "Na GPU real, warps parados esperando memória são trocados por outros, o que esta lição não mostra.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "pixels", kind: "int", label: "Pixels na linha", min: 8, max: 24 },
      {
        key: "pistas",
        kind: "choice",
        label: "Pistas do registrador vetorial",
        options: [
          { value: "4", label: "4 pistas (128 bits)" },
          { value: "8", label: "8 pistas (256 bits)" },
        ],
      },
    ],
  },
  build,
  intro: {
    text: "Uma imagem tem milhões de pixels, e cada um passa pela mesma conta. Você vai clarear uma linha de pixels um de cada vez e depois em pistas vetoriais, ver o que sobra no fim e descobrir por que um simples if pode custar metade da velocidade de uma GPU.",
    facts: [
      ["Pixels", String(DEFAULTS.pixels)],
      ["Pistas", DEFAULTS.pistas],
      ["Conta", `brilho + ${BOOST}`],
    ],
  },
  outro: {
    title: "SIMD em resumo",
    text: "Uma instrução vetorial aplica a mesma operação a várias pistas de uma vez, e o número de instruções cai na proporção da largura. A sobra no fim e, principalmente, os desvios desperdiçam pistas: um grupo misturado executa os dois caminhos com máscara. GPUs aplicam a mesma regra a warps de 32 threads, por isso dados agrupados rodam mais rápido.",
    facts: (run) => [
      ["Escalar", instrs(Number(run.stats.scalar))],
      ["Vetorial", instrs(Number(run.stats.vector))],
      ["Com desvio", String(run.stats.util)],
    ],
  },
  next: ["amdahl", "pipeline", "coerencia-mesi"],
  practice,
};

export default lesson;
