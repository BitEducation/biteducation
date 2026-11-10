import type { LessonModule, SceneSpec } from "../../../contracts/types.ts";
import { type Policy, type Req, run, type Step, summary } from "../../../sim/os/partitions.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { alocacaoParticoes as practice } from "../practice.ts";

/**
 * Variable partitions: the same requests and frees placed by first, next, best and worst fit
 * in 256 KiB of 8 KiB units; who fails, how many holes remain and how big the largest is.
 */
const UNITS = 32;
const KB = 8;
const REQS: Req[] = [
  { op: "alloc", id: "A", size: 5 },
  { op: "alloc", id: "B", size: 3 },
  { op: "alloc", id: "C", size: 6 },
  { op: "alloc", id: "D", size: 2 },
  { op: "alloc", id: "E", size: 4 },
  { op: "alloc", id: "F", size: 3 },
  { op: "free", id: "B" },
  { op: "free", id: "D" },
  { op: "free", id: "F" },
  { op: "alloc", id: "G", size: 2 },
  { op: "alloc", id: "H", size: 3 },
  { op: "alloc", id: "I", size: 9 },
  { op: "alloc", id: "J", size: 8 },
];
const PREFIX = 9;
const POLICIES: Policy[] = ["first", "next", "best", "worst"];
const NAME: Record<Policy, string> = {
  first: "Primeiro que serve",
  next: "Próximo que serve",
  best: "Melhor que serve",
  worst: "Pior que serve",
};

const scene: SceneSpec = {
  viewBox: [960, 600],
  nodes: [],
  links: [],
  widgets: [
    {
      kind: "grid",
      id: "memoria",
      title: "256 KiB em blocos de 8 KiB: primeiro, próximo, melhor e pior que serve",
      at: [40, 40],
      cols: UNITS,
      rows: POLICIES.length,
      cellW: 27,
      indexLabel: "none",
    },
    {
      kind: "table",
      id: "pedidos",
      title: "Pedidos",
      at: [40, 250],
      columns: ["Pedido", "Tamanho"],
      widths: [170, 110],
      rows: 4,
    },
    {
      kind: "table",
      id: "placar",
      title: "Depois de todos os pedidos",
      at: [360, 250],
      columns: ["Política", "Falhas", "Buracos", "Livre", "Maior buraco"],
      widths: [190, 80, 90, 90, 130],
      rows: POLICIES.length,
    },
  ],
};

const kib = (u: number) => `${u * KB} KiB`;

export function build() {
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const runs = Object.fromEntries(POLICIES.map((p) => [p, run(p, UNITS, REQS)])) as Record<Policy, Step[]>;
  const paint = (row: number, map: string[], prev: string[] | null, log?: string) => {
    map.forEach((owner, i) => {
      if (prev && prev[i] === owner) return;
      c.cell("memoria", row * UNITS + i, owner || "·", {
        dt: 0,
        ...(owner ? { mark: "new" as const } : { mark: "evict" as const }),
      });
    });
    if (log) c.note("memoria", log, "info", { dt: 1 });
  };
  const fails = (p: Policy) => runs[p].filter((s) => s.failed).map((s) => s.req.id);
  const where = (p: Policy, id: string) => runs[p].find((s) => s.req.op === "alloc" && s.req.id === id);
  const final = (p: Policy) => summary((runs[p][runs[p].length - 1] as Step).map);
  const prefix = runs.first[PREFIX - 1] as Step;
  const pre = summary(prefix.map);
  const placeRest = (p: Policy) => {
    let prev = prefix.map;
    for (const s of runs[p].slice(PREFIX)) {
      c.at(c.t + 1);
      paint(POLICIES.indexOf(p), s.map, prev);
      const r = s.req;
      if (r.op === "alloc")
        c.row(
          "pedidos",
          REQS.slice(PREFIX).indexOf(r),
          [`${r.id}${s.failed ? " (falhou)" : ` em ${kib(s.at ?? 0)}`}`, kib(r.size)],
          {
            dt: 0,
            mark: s.failed ? "bad" : "new",
            log: {
              who: NAME[p],
              what: s.failed ? `${r.id} não cabe` : `${r.id} em ${kib(s.at ?? 0)}`,
              detail: kib(r.size),
            },
          },
        );
      prev = s.map;
    }
    const f = final(p);
    c.row(
      "placar",
      POLICIES.indexOf(p),
      [NAME[p], String(fails(p).length), String(f.holes), kib(f.free), kib(f.largest)],
      { dt: 1, mark: fails(p).length > 1 ? "bad" : "hit" },
    );
  };
  const g = { first: where("first", "G"), best: where("best", "G"), worst: where("worst", "G") };
  const holeSizes = "3, 2 e 12 blocos";

  b.step(
    {
      id: "s1-buracos",
      title: "Seis processos, três saídas",
      subtitle: `${pre.holes} buracos, ${kib(pre.free)} livres`,
      text: `A memória tem 256 KiB, em blocos de 8 KiB. Chegam seis processos, de A a F, e cada um ocupa uma [[particao-variavel]] do tamanho que pediu, encostada na anterior. Depois B, D e F terminam e deixam ${pre.holes} buracos (${holeSizes}), ${kib(pre.free)} livres ao todo. Os próximos pedidos, G a J, precisam caber num buraco só: um processo não pode ficar espalhado.`,
      facts: [
        ["Memória", "256 KiB = 32 blocos"],
        ["Buracos", String(pre.holes)],
        ["Livre", kib(pre.free)],
      ],
      highlight: [],
    },
    () => {
      POLICIES.forEach((_, row) => {
        paint(row, prefix.map, null);
      });
      REQS.slice(PREFIX).forEach((r, i) => {
        if (r.op === "alloc") c.row("pedidos", i, [r.id, kib(r.size)], { dt: i === 0 ? 1 : 0, mark: "new" });
      });
    },
  );

  b.step(
    {
      id: "s2-primeiro",
      title: "O primeiro que serve",
      subtitle: `${fails("first").length ? `${fails("first").join(", ")} não cabe` : "todos cabem"}`,
      text: `O primeiro que serve (first fit) percorre os buracos de baixo para cima e usa o primeiro grande o bastante. É rápido e simples. G vai para o buraco em ${kib(g.first?.at ?? 0)} e o divide, deixando uma sobra pequena. I cabe no fim da memória. Mas J, com ${kib(8)}, não encontra lugar: sobram ${kib(final("first").free)} livres, em pedaços de no máximo ${kib(final("first").largest)}.`,
      facts: [
        ["Falhas", fails("first").join(", ") || "nenhuma"],
        ["Buracos no fim", String(final("first").holes)],
        ["Maior buraco", kib(final("first").largest)],
      ],
      highlight: [],
    },
    () => placeRest("first"),
  );

  b.step(
    {
      id: "s3-proximo",
      title: "Continuar de onde parou",
      subtitle: `Falham ${fails("next").join(" e ")}`,
      text: `O próximo que serve (next fit) começa a busca onde a última alocação terminou, para não remexer sempre nos buracos do começo. Aqui ele vai direto ao buraco grande do fim e põe G e H lá, picotando o único espaço que caberia I. Resultado: ${fails("next").join(" e ")} falham, mesmo com ${kib(final("next").free)} livres. Em simulações clássicas, ele costuma ser um pouco pior que o primeiro que serve.`,
      facts: [
        ["Falhas", fails("next").join(", ")],
        ["Livre no fim", kib(final("next").free)],
        ["Maior buraco", kib(final("next").largest)],
      ],
      highlight: [],
    },
    () => placeRest("next"),
  );

  b.step(
    {
      id: "s4-melhor",
      title: "O menor que serve",
      subtitle: `G em ${kib(g.best?.at ?? 0)}, buraco exato`,
      text: `O melhor que serve (best fit) procura o menor buraco onde o pedido cabe. G, com ${kib(2)}, entra exatamente no buraco de ${kib(2)}; H, no de ${kib(3)}. O buraco grande fica inteiro e recebe I. Aqui ele vence, mas tem um custo: percorre a lista toda a cada pedido e, quando o encaixe não é exato, deixa sobras tão pequenas que ninguém mais usa.`,
      facts: [
        ["Falhas", fails("best").join(", ") || "nenhuma"],
        ["Buracos no fim", String(final("best").holes)],
        ["Livre", kib(final("best").free)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Os buracos têm ${holeSizes}. Pelo melhor que serve, em que buraco entra um pedido de 3 blocos? Responda o tamanho do buraco, em blocos.`,
        answer: 3,
        tolerance: 0,
        unit: "blocos",
        explain:
          "O melhor que serve escolhe o menor buraco onde o pedido cabe: o de 2 é pequeno demais, o de 3 serve exato e o de 12 sobraria. Sem sobra, não nasce buraco novo.",
      },
    },
    () => placeRest("best"),
  );

  b.step(
    {
      id: "s5-pior",
      title: "O maior que serve",
      subtitle: `Falham ${fails("worst").join(" e ")}`,
      text: `O pior que serve (worst fit) faz o contrário: escolhe sempre o maior buraco, esperando que a sobra ainda seja útil. G e H vão para o buraco grande e o quebram; quando I chega, o maior pedaço tem ${kib(final("worst").largest)} e ele não cabe. É a [[fragmentacao-externa]]: há ${kib(final("worst").free)} livres, mais que os ${kib(9)} de I, só que separados.`,
      facts: [
        ["Falhas", fails("worst").join(", ")],
        ["Livre", kib(final("worst").free)],
        ["Maior buraco", kib(final("worst").largest)],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: `Com o pior que serve sobram ${kib(final("worst").free)} livres. Por que I, de ${kib(9)}, não entra?`,
        options: [
          `O maior buraco tem só ${kib(final("worst").largest)}; o espaço livre está em pedaços`,
          "O sistema reserva os blocos livres para o próprio núcleo",
          "Processos só podem começar em endereços múltiplos de 64 KiB",
        ],
        answer: 0,
        explain: `A partição precisa ser contígua. Os ${kib(final("worst").free)} livres estão em ${final("worst").holes} buracos, e o maior tem ${kib(final("worst").largest)}.`,
      },
    },
    () => placeRest("worst"),
  );

  b.step(
    {
      id: "s6-placar",
      title: "Ninguém resolve tudo",
      subtitle: "Compactar ou paginar",
      text: "Nenhuma política elimina os buracos; muda só onde eles aparecem. Duas saídas existem. A compactação move os processos para juntar o espaço livre, mas copiar a memória inteira custa caro e pausa tudo. A outra é desistir da contiguidade: com paginação, um processo ocupa quadros espalhados, e a fragmentação externa desaparece. Partições variáveis sobrevivem dentro do núcleo, em alocadores como o buddy.",
      facts: [
        ["Compactação", "junta os buracos, copiando"],
        ["Paginação", "acaba com a contiguidade"],
        ["Ainda usado", "alocadores do núcleo"],
      ],
      highlight: [],
    },
    () => {
      c.note("memoria", "Mesmos pedidos, quatro mapas diferentes", "info", { dt: 1 });
    },
  );

  return b.done({
    firstFails: fails("first").join(","),
    nextFails: fails("next").join(","),
    bestFails: fails("best").join(","),
    worstFails: fails("worst").join(","),
    worstLargest: final("worst").largest * KB,
    bestHoles: final("best").holes,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "alocacao-particoes",
    site: "so",
    title: "Partições variáveis: onde pôr cada processo",
    summary:
      "Os mesmos pedidos em 256 KiB alocados pelo primeiro, próximo, melhor e pior que serve; quem falha e quanto espaço fica picotado.",
    area: "Memória",
    refs: [
      {
        book: "tanenbaum-mos",
        chapter: 3,
        section: "3.2.3",
        note: "Gerenciando a memória livre: algoritmos de alocação",
        verified: true,
      },
      {
        book: "maziero-so",
        chapter: 16,
        section: "16.3.1",
        note: "Alocação de memória: estratégias de alocação",
        verified: true,
      },
    ],
    simplifications: [
      "A memória é dividida em blocos de 8 KiB; pedidos são múltiplos desse tamanho.",
      "Buracos vizinhos se juntam na hora em que um processo sai.",
    ],
  },
  scene,
  params: { defaults: {} },
  build,
  intro: {
    text: "Sem paginação, cada processo precisa de um pedaço contínuo de memória. Quando processos saem, ficam buracos, e o sistema tem de escolher em qual deles pôr o próximo. Você vai ver quatro regras simples darem resultados diferentes para os mesmos pedidos.",
    facts: [
      ["Memória", "256 KiB"],
      ["Pedidos", "10, com 3 saídas"],
      ["Políticas", "4"],
    ],
  },
  outro: {
    title: "Partições em resumo",
    text: "Com partições contíguas, o espaço livre se espalha em buracos e um pedido pode falhar mesmo com memória sobrando. Primeiro, próximo, melhor e pior que serve só mudam onde ficam os buracos; compactação e paginação atacam a causa.",
    facts: (run) => [
      ["Falhas no melhor", String(run.stats.bestFails) || "nenhuma"],
      ["Falhas no pior", String(run.stats.worstFails)],
      ["Maior buraco no pior", `${run.stats.worstLargest} KiB`],
    ],
  },
  next: ["buddy", "paginacao-tlb"],
  practice,
};

export default lesson;
