import type { LessonModule, SceneSpec } from "../../../contracts/types.ts";
import { type Kind, type Metrics, measure } from "../../../sim/arch/topology.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { interconexao as practice } from "../practice.ts";

/**
 * Interconnection networks for a 16-node multicomputer: star, ring, grid, torus, hypercube and
 * full mesh, each measured by the simulator (links, degree, diameter, mean hops, bisection).
 */
const N = 16;
const KINDS: Kind[] = ["estrela", "anel", "grade", "toro", "hipercubo", "completo"];
const NAME: Record<Kind, string> = {
  estrela: "Estrela",
  anel: "Anel",
  grade: "Grade 4 × 4",
  toro: "Toro 4 × 4",
  hipercubo: "Hipercubo 4D",
  completo: "Totalmente ligado",
};

const scene: SceneSpec = {
  viewBox: [960, 520],
  nodes: [],
  links: [],
  widgets: [
    {
      kind: "table",
      id: "topologias",
      title: `${N} nós, seis formas de ligar`,
      at: [40, 40],
      columns: ["Topologia", "Ligações", "Grau", "Diâmetro", "Média", "Bisseção"],
      widths: [230, 110, 80, 110, 90, 110],
      rows: KINDS.length,
    },
    { kind: "counter", id: "ligacoes", title: "Ligações (custo)", at: [60, 330] },
    { kind: "counter", id: "diametro", title: "Diâmetro (pior caso)", at: [360, 330] },
    { kind: "counter", id: "bissecao", title: "Largura de bisseção", at: [660, 330] },
  ],
};

const dec = (x: number) => String(x).replace(".", ",");

export function build() {
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const m = Object.fromEntries(KINDS.map((k) => [k, measure(k, N)])) as Record<Kind, Metrics>;
  const show = (k: Kind, mark?: "new" | "hit" | "bad") => {
    const x = m[k];
    c.row(
      "topologias",
      KINDS.indexOf(k),
      [NAME[k], String(x.links), String(x.degree), String(x.diameter), dec(x.average), String(x.bisection)],
      {
        dt: 1,
        ...(mark ? { mark } : {}),
        log: {
          who: NAME[k],
          what: `${x.links} ligações`,
          detail: `diâmetro ${x.diameter}, bisseção ${x.bisection}`,
        },
      },
    );
    c.count("ligacoes", String(x.links), { label: `${NAME[k]}: ${x.links} ligações` });
    c.count("diametro", String(x.diameter), { role: "a", label: `diâmetro ${x.diameter}` });
    c.count("bissecao", String(x.bisection), { role: "b", label: `bisseção ${x.bisection}` });
  };
  const { estrela, anel, grade, toro, hipercubo, completo } = m;

  b.step(
    {
      id: "s1-extremos",
      title: "Os dois extremos",
      subtitle: `${completo.links} ligações contra ${estrela.links}`,
      text: `Um [[multicomputador]] de ${N} nós troca mensagens por uma [[rede-de-interconexao]]. Ligar todos com todos dá ${completo.links} ligações e qualquer mensagem chega num salto, mas cada nó precisa de ${completo.degree} portas. A estrela usa só ${estrela.links} ligações, com um comutador central por onde tudo passa: duas etapas no máximo, porém um único ponto que congestiona e, se falha, isola todos.`,
      facts: [
        ["Totalmente ligado", `${completo.links} ligações`],
        ["Estrela", `${estrela.links} ligações`],
        ["Nós", String(N)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Com ${N} nós, ligar todos com todos usa ${completo.links} ligações. E com ${2 * N} nós?`,
        answer: (2 * N * (2 * N - 1)) / 2,
        tolerance: 0,
        unit: "ligações",
        explain: `Cada um dos ${2 * N} nós se liga aos outros ${2 * N - 1}, e cada ligação é contada duas vezes: ${2 * N} × ${2 * N - 1} / 2 = ${(2 * N * (2 * N - 1)) / 2}. Dobrar os nós quase quadruplica o custo.`,
      },
    },
    () => {
      show("completo", "hit");
      show("estrela", "bad");
    },
  );

  b.step(
    {
      id: "s2-anel",
      title: "O anel",
      subtitle: `Diâmetro ${anel.diameter}, bisseção ${anel.bisection}`,
      text: `No anel cada nó fala com dois vizinhos: ${anel.links} ligações, quase o mínimo. O preço aparece em duas medidas. O [[diametro-de-rede]], o pior caminho, é de ${anel.diameter} saltos, e em média uma mensagem dá ${dec(anel.average)}. E a [[largura-de-bissecao]] é ${anel.bisection}: cortando o anel em duas metades iguais, só ${anel.bisection} ligações cruzam, e todo o tráfego entre as metades se espreme por elas.`,
      facts: [
        ["Ligações", String(anel.links)],
        ["Diâmetro", String(anel.diameter)],
        ["Bisseção", String(anel.bisection)],
      ],
      highlight: [],
    },
    () => show("anel", "new"),
  );

  b.step(
    {
      id: "s3-grade",
      title: "Grade e toro",
      subtitle: `Diâmetro ${grade.diameter} → ${toro.diameter}`,
      text: `Numa grade 4 × 4, cada nó tem até ${grade.degree} vizinhos e há ${grade.links} ligações; o diâmetro cai para ${grade.diameter}, de um canto ao outro, e a bisseção sobe para ${grade.bisection}. Ligando as bordas opostas, a grade vira um toro: ${toro.links} ligações, todos os nós com o mesmo grau, diâmetro ${toro.diameter} e bisseção ${toro.bisection}. É o desenho de muitos supercomputadores, porque cresce sem mudar o número de portas por nó.`,
      facts: [
        ["Grade", `${grade.links} ligações, diâmetro ${grade.diameter}`],
        ["Toro", `${toro.links} ligações, diâmetro ${toro.diameter}`],
        ["Grau", String(toro.degree)],
      ],
      highlight: [],
    },
    () => {
      show("grade", "new");
      show("toro", "new");
    },
  );

  b.step(
    {
      id: "s4-hipercubo",
      title: "O hipercubo",
      subtitle: `${hipercubo.degree} dimensões, ${hipercubo.links} ligações`,
      text: `Num [[hipercubo]], cada nó tem um número de 4 bits e liga-se aos que diferem dele em um bit só. Para ir de 0000 a 1111 trocam-se os quatro bits, um por salto: diâmetro ${hipercubo.diameter}. As medidas saem iguais às do toro, ${hipercubo.links} ligações e bisseção ${hipercubo.bisection}, e não é coincidência: com 16 nós os dois são o mesmo grafo desenhado de outro jeito. Dobrando os nós, o hipercubo ganha só uma dimensão.`,
      facts: [
        ["Diâmetro", `${hipercubo.diameter} = log₂ ${N}`],
        ["Grau", String(hipercubo.degree)],
        ["Bisseção", String(hipercubo.bisection)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: "Num hipercubo de 64 nós, qual é o diâmetro, em saltos?",
        answer: 6,
        explain: "Cada nó tem um número de log₂ 64 = 6 bits, e o pior caso troca todos os 6, um por salto.",
      },
    },
    () => show("hipercubo", "new"),
  );

  b.step(
    {
      id: "s5-escolha",
      title: "Custo contra distância",
      subtitle: "Nenhuma vence em tudo",
      text: `A tabela inteira mostra a troca. Mais ligações compram diâmetro menor e bisseção maior: do anel, com ${anel.links}, ao totalmente ligado, com ${completo.links}, o diâmetro cai de ${anel.diameter} para ${completo.diameter}. Mas o que cresce com a máquina é o grau: com mil nós, ligar todos exigiria 999 portas por nó. Toros e hipercubos ficam no meio, com distância que cresce devagar e grau pequeno.`,
      facts: [
        ["Mais barato", `anel, ${anel.links} ligações`],
        ["Mais rápido", `totalmente ligado, ${completo.links}`],
        ["Meio-termo", "toro e hipercubo"],
      ],
      highlight: [],
    },
    () => {
      show("toro", "hit");
      show("hipercubo", "hit");
    },
  );

  return b.done({
    anelDiam: anel.diameter,
    anelMedia: dec(anel.average),
    gradeDiam: grade.diameter,
    toroBis: toro.bisection,
    hiperDiam: hipercubo.diameter,
    completoLig: completo.links,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "interconexao",
    site: "arq",
    title: "Redes de interconexão: como ligar 16 processadores",
    summary:
      "Estrela, anel, grade, toro, hipercubo e malha completa com 16 nós, medidos em ligações, diâmetro e largura de bisseção.",
    area: "Paralelismo",
    refs: [
      {
        book: "tanenbaum-sco",
        chapter: 8,
        section: "8.4.1",
        note: "Topologias de redes de interconexão",
        verified: true,
      },
    ],
    simplifications: [
      "Todas as ligações têm a mesma capacidade e a mesma latência.",
      "A bisseção conta ligações; não modela comutadores internos nem roteamento adaptativo.",
    ],
  },
  scene,
  params: { defaults: {} },
  build,
  intro: {
    text: "Com milhares de processadores, não dá para ligar todos com todos nem pôr todos num barramento. Você vai ligar 16 nós de seis jeitos e medir quanto cada desenho custa e quão longe fica o nó mais distante.",
    facts: [
      ["Nós", String(N)],
      ["Topologias", "6"],
      ["Medidas", "ligações, diâmetro, bisseção"],
    ],
  },
  outro: {
    title: "Interconexão em resumo",
    text: "Toda topologia troca ligações por distância. O anel é barato e lento no pior caso; ligar tudo é rápido e não escala; toro e hipercubo crescem com grau pequeno e diâmetro que sobe devagar.",
    facts: (run) => [
      ["Diâmetro do anel", String(run.stats.anelDiam)],
      ["Diâmetro do hipercubo", String(run.stats.hiperDiam)],
      ["Bisseção do toro", String(run.stats.toroBis)],
    ],
  },
  next: ["numa", "amdahl"],
  practice,
};

export default lesson;
