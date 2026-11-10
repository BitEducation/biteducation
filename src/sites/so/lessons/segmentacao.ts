import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import {
  type Access,
  compact,
  firstFit,
  freeTotal,
  holes,
  KIB,
  largest,
  type MemMap,
  place,
  type Segment,
  translate,
} from "../../../sim/os/segment.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { segmentacao as practice } from "../practice.ts";

/**
 * Segmentation: a process seen as a few variable-sized segments, base + limit translation, the
 * trap on a bad offset or a write to code, sharing the code segment, external fragmentation
 * between segments and compaction, which only works because bases can be rewritten.
 */
export const DEFAULTS = { segmento: 1, deslocamento: 500 };
const CELLS = 16;
const KERNEL = 2 * KIB;

const A: Segment[] = [
  { name: "código", base: 4 * KIB, limit: 3 * KIB, perm: "r-x" },
  { name: "dados", base: 9 * KIB, limit: 2 * KIB, perm: "rw-" },
  { name: "pilha", base: 13 * KIB, limit: 1 * KIB, perm: "rw-" },
];
const B_DATA = 2 * KIB;
const B_STACK = 3 * KIB;

const LABEL: Record<string, string> = {
  SO: "SO",
  "A.código": "cód",
  "A.dados": "A.d",
  "A.pilha": "A.p",
  "B.dados": "B.d",
  "B.pilha": "B.p",
};
const ROLE: Record<string, Role> = {
  SO: "muted",
  "A.código": "crypto",
  "A.dados": "a",
  "A.pilha": "a",
  "B.dados": "b",
  "B.pilha": "b",
};

function clamp(p: Params) {
  const seg = Math.min(2, Math.max(0, Math.round(Number(p.segmento ?? DEFAULTS.segmento))));
  const off = Math.min(4095, Math.max(0, Math.round(Number(p.deslocamento ?? DEFAULTS.deslocamento))));
  return { seg, off };
}

const segCols = ["Seg.", "Nome", "Base", "Limite", "Permissões"];
const scene: SceneSpec = {
  viewBox: [960, 600],
  nodes: [],
  links: [],
  widgets: [
    {
      kind: "grid",
      id: "fisica",
      title: "Memória física de 16 KiB, uma célula por KiB",
      at: [32, 50],
      cols: CELLS,
      rows: 1,
      cellW: 52,
      indexLabel: "dec",
    },
    {
      kind: "table",
      id: "segA",
      title: "Tabela de segmentos do processo A",
      at: [32, 160],
      columns: segCols,
      widths: [40, 120, 70, 70, 110],
      rows: 3,
    },
    {
      kind: "table",
      id: "segB",
      title: "Tabela de segmentos do processo B",
      at: [500, 160],
      columns: segCols,
      widths: [40, 120, 70, 70, 110],
      rows: 3,
    },
    {
      kind: "table",
      id: "acessos",
      title: "Acessos do processo A",
      at: [32, 340],
      columns: ["Endereço lógico", "Verificação", "Resultado"],
      widths: [170, 230, 190],
      rows: 3,
    },
    { kind: "counter", id: "fisico", title: "Endereço físico", at: [680, 340] },
    { kind: "counter", id: "livre", title: "Livre · maior buraco", at: [680, 440] },
  ],
};

export function build(p: Params) {
  const { seg, off } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const kib = (n: number) => `${n / KIB} KiB`;

  let map: MemMap = Array.from({ length: CELLS }, () => "");
  map = place(map, "SO", 0, KERNEL);
  A.forEach((s) => {
    map = place(map, `A.${s.name}`, s.base, s.limit);
  });
  const drawMap = (m: MemMap, mark?: (owner: string) => "new" | "evict" | undefined, dt = 1) =>
    m.forEach((o, i) => {
      const mk = mark?.(o);
      c.cell("fisica", i, o ? (LABEL[o] ?? o) : "", {
        dt: i === 0 ? dt : 0,
        role: ROLE[o] ?? "muted",
        ...(mk ? { mark: mk } : {}),
        label: o ? `${i} KiB: ${o}` : `${i} KiB: livre`,
      });
    });
  const segRow = (table: string, i: number, s: Segment, mark?: "new" | "hit" | "warn", shared = false) =>
    c.row(
      table,
      i,
      [String(i), shared ? `${s.name} (comp.)` : s.name, String(s.base), String(s.limit), s.perm],
      {
        dt: 1,
        ...(mark ? { mark } : {}),
        log: {
          who: table === "segA" ? "processo A" : "processo B",
          what: s.name,
          detail: `base ${s.base}, limite ${s.limit}`,
        },
      },
    );

  b.step(
    {
      id: "s1-pedacos",
      title: "Um programa em pedaços",
      subtitle: "Código, dados e pilha",
      text: `Na [[segmentacao]], o processo não é uma fila contínua de bytes, e sim alguns [[segmento|segmentos]] de tamanhos diferentes, cada um com sentido próprio: código com ${kib(A[0]?.limit ?? 0)}, dados com ${kib(A[1]?.limit ?? 0)} e pilha com ${kib(A[2]?.limit ?? 0)}. Cada segmento ocupa um trecho contínuo da memória física, em qualquer lugar. A tabela de segmentos guarda onde ele começa, a base, e quantos bytes tem, o limite.`,
      facts: [
        ["Segmentos de A", String(A.length)],
        ["Memória física", `${CELLS} KiB`],
        ["Por segmento", "base, limite, permissões"],
      ],
      highlight: [],
    },
    () => {
      drawMap(map, (o) => (o.startsWith("A.") ? "new" : undefined));
      A.forEach((s, i) => {
        segRow("segA", i, s, "new");
      });
    },
  );

  const t = translate(A, seg, off);
  const sA = A[seg];
  b.step(
    {
      id: "s2-traduz",
      title: "Base mais deslocamento",
      subtitle: `(${seg}, ${off})`,
      text: t.ok
        ? `O processo usa endereços lógicos do tipo (segmento, deslocamento). Para (${seg}, ${off}), a MMU acha o segmento ${seg}, ${sA?.name}, confere que ${off} é menor que o limite ${sA?.limit} e soma a base: ${sA?.base} + ${off} = ${t.physical}. Duas operações por acesso, uma comparação e uma soma, feitas pelo hardware em paralelo. O programa nunca sabe onde o segmento está.`
        : `O processo usa endereços lógicos do tipo (segmento, deslocamento). Para (${seg}, ${off}), a MMU acha o segmento ${seg}, ${sA?.name}, e compara ${off} com o limite ${sA?.limit}. Como não é menor, o acesso não chega à memória: a CPU gera uma interrupção de software e o kernel encerra o processo com falha de segmentação. No Laboratório, escolha um deslocamento menor que o limite.`,
      facts: [
        ["Segmento", `${seg} (${sA?.name})`],
        ["Limite", String(sA?.limit)],
        ["Físico", t.ok ? String(t.physical) : "falha"],
      ],
      highlight: [],
      ...(t.ok
        ? {
            quiz: {
              kind: "number" as const,
              prompt: `Qual é o endereço físico de (${seg}, ${off}) no processo A?`,
              answer: t.physical,
              explain: `${off} < ${sA?.limit}, então vale: base ${sA?.base} + ${off} = ${t.physical}.`,
            },
          }
        : {}),
    },
    () => {
      c.row(
        "acessos",
        0,
        [
          `(${seg}, ${off}) leitura`,
          `${off} < ${sA?.limit}? ${t.ok ? "sim" : "não"}`,
          t.ok ? `físico ${t.physical}` : "falha: limite",
        ],
        {
          dt: 1,
          mark: t.ok ? "hit" : "bad",
          log: { who: "MMU", what: `(${seg}, ${off})`, detail: t.ok ? String(t.physical) : "falha" },
        },
      );
      c.count("fisico", t.ok ? String(t.physical) : "falha", { dt: 0, role: t.ok ? "a" : "bad" });
    },
  );

  const outOff = (A[1]?.limit ?? 0) + 52;
  const bad1 = translate(A, 1, outOff);
  const write: Access = "escrita";
  const bad2 = translate(A, 0, 100, write);
  b.step(
    {
      id: "s3-protege",
      title: "O limite protege",
      subtitle: "Fora do segmento ou sem permissão",
      text: `Um laço que passa do fim de um vetor tenta (1, ${outOff}): ${outOff} não é menor que ${A[1]?.limit}, e a MMU barra o acesso antes que ele invada o vizinho. Uma escrita em (0, 100) cai dentro do limite do código, mas o segmento é ${A[0]?.perm}, sem escrita, e também é barrada. Como cada segmento tem um sentido, dá para proteger cada um do jeito certo: código só executa, dados não executam.`,
      facts: [
        [`(1, ${outOff})`, bad1.ok ? "ok" : `falha: ${bad1.reason}`],
        ["(0, 100) escrita", bad2.ok ? "ok" : `falha: ${bad2.reason}`],
        ["Quem barra", "a MMU, antes da memória"],
      ],
      highlight: [],
    },
    () => {
      c.row("acessos", 1, [`(1, ${outOff}) leitura`, `${outOff} < ${A[1]?.limit}? não`, "falha: limite"], {
        dt: 1,
        mark: "bad",
        log: { who: "MMU", what: `(1, ${outOff})`, detail: "falha de limite" },
      });
      c.row("acessos", 2, ["(0, 100) escrita", `dentro; perm. ${A[0]?.perm}`, "falha: proteção"], {
        dt: 1,
        mark: "bad",
        log: { who: "MMU", what: "(0, 100) escrita", detail: "segmento sem escrita" },
      });
    },
  );

  const bDataAt = firstFit(map, B_DATA) ?? 0;
  map = place(map, "B.dados", bDataAt, B_DATA);
  const bTable: Segment[] = [
    { ...(A[0] as Segment) },
    { name: "dados", base: bDataAt, limit: B_DATA, perm: "rw-" },
  ];
  b.step(
    {
      id: "s4-compartilha",
      title: "Código compartilhado",
      subtitle: "Dois processos, uma cópia",
      text: `O processo B roda o mesmo programa. Como o código é só leitura, a tabela de B aponta o segmento 0 para a mesma base, ${A[0]?.base}: uma cópia serve aos dois. Só os dados precisam ser novos, ${kib(B_DATA)}, e o kernel os põe no primeiro buraco que serve, em ${bDataAt}. Com segmentos é natural compartilhar uma unidade inteira com sentido, como uma biblioteca.`,
      facts: [
        ["Código de B", `base ${A[0]?.base}, comum`],
        ["Dados de B", `base ${bDataAt}`],
        ["Economia", kib(A[0]?.limit ?? 0)],
      ],
      highlight: [],
    },
    () => {
      drawMap(map, (o) => (o === "B.dados" ? "new" : undefined));
      segRow("segB", 0, bTable[0] as Segment, "hit", true);
      segRow("segB", 1, bTable[1] as Segment, "new");
    },
  );

  const free = freeTotal(map);
  const big = largest(map);
  const fails = firstFit(map, B_STACK) === null;
  const nHoles = holes(map).length;
  b.step(
    {
      id: "s5-buracos",
      title: "Buracos entre segmentos",
      subtitle: `${kib(free)} livres, nenhum de ${kib(B_STACK)}`,
      text: `Agora B pede uma pilha de ${kib(B_STACK)}. Há ${kib(free)} livres, mas espalhados em ${nHoles} buracos, o maior com ${kib(big)}. ${fails ? "Nenhum serve" : "Algum serve"}: é a [[fragmentacao-externa]]. Como os segmentos têm tamanhos variados, sobram pedaços entre eles que, somados, dariam, mas separados não servem. A paginação não sofre disso, porque qualquer quadro livre serve para qualquer página.`,
      facts: [
        ["Livre", kib(free)],
        ["Maior buraco", kib(big)],
        ["Pedido", kib(B_STACK)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: "Quantos KiB estão livres na memória física, somando todos os buracos?",
        answer: free / KIB,
        unit: "KiB",
        explain: `${holes(map)
          .map((h) => `${h.size / KIB} KiB a partir de ${h.at / KIB}`)
          .join(", ")}: ${free / KIB} KiB, mas o maior buraco tem só ${big / KIB}.`,
      },
    },
    () => {
      c.count("livre", `${kib(free)} · ${kib(big)}`, {
        role: "warn",
        label: `${kib(free)} livres, maior ${kib(big)}`,
      });
      c.note("fisica", `Pilha de ${kib(B_STACK)} não cabe`, "bad", { dt: 1 });
    },
  );

  const comp = compact(map, new Set(["SO", "A.código", "B.dados"]));
  const stackAt = firstFit(comp.map, B_STACK) ?? 0;
  const after = place(comp.map, "B.pilha", stackAt, B_STACK);
  const movedA = A.map((s) => ({ ...s, base: comp.bases[`A.${s.name}`] ?? s.base }));
  b.step(
    {
      id: "s6-compacta",
      title: "Compactar",
      subtitle: `${kib(comp.copied)} copiados`,
      text: `A saída é a compactação: o kernel para os processos, copia os segmentos para trás, juntando os buracos, e reescreve as bases. Aqui os dados e a pilha de A mudam para ${comp.bases["A.dados"]} e ${comp.bases["A.pilha"]}, ${kib(comp.copied)} copiados, e sobra um buraco de ${kib(largest(comp.map))} em que a pilha de B cabe, em ${stackAt}. O programa nem percebe, porque só usa (segmento, deslocamento). O preço é parar tudo para copiar memória.`,
      facts: [
        ["Copiado", kib(comp.copied)],
        ["Novo buraco", kib(largest(comp.map))],
        ["Pilha de B", `base ${stackAt}`],
      ],
      highlight: [],
    },
    () => {
      drawMap(after, (o) =>
        o === "B.pilha" ? "new" : o === "A.dados" || o === "A.pilha" ? "evict" : undefined,
      );
      movedA.forEach((s, i) => {
        if (s.base !== A[i]?.base) segRow("segA", i, s, "warn");
      });
      segRow("segB", 2, { name: "pilha", base: stackAt, limit: B_STACK, perm: "rw-" }, "new");
      c.count("livre", `${kib(freeTotal(after))} · ${kib(largest(after))}`, {
        dt: 0,
        label: "depois da compactação",
      });
    },
  );

  return b.done({
    physical: t.ok ? t.physical : -1,
    bData: bDataAt,
    free: free / KIB,
    largest: big / KIB,
    copied: comp.copied / KIB,
    stack: stackAt,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "segmentacao",
    site: "so",
    title: "Segmentação: base, limite e buracos",
    summary:
      "O processo em segmentos de tamanhos diferentes, a tradução por base e limite, a falha de segmentação, o código compartilhado, a fragmentação externa e a compactação.",
    area: "Memória",
    refs: [
      { book: "tanenbaum-mos", chapter: 3, section: "3.7", note: "Segmentação", verified: true },
      {
        book: "maziero-so",
        chapter: 14,
        section: "14.6",
        note: "Memória virtual por segmentos",
        verified: true,
      },
    ],
    simplifications: [
      "Memória física de 16 KiB em células de 1 KiB, segmentos em KiB inteiros.",
      "A pilha cresce para cima, como os outros segmentos.",
      "A compactação aparece pronta; o kernel real decide quando vale a pena parar os processos.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "segmento", kind: "int", label: "Segmento (0 código, 1 dados, 2 pilha)", min: 0, max: 2 },
      { key: "deslocamento", kind: "int", label: "Deslocamento", min: 0, max: 4095 },
    ],
  },
  build,
  intro: {
    text: "Antes da paginação dominar, a memória de um processo era dividida em segmentos com sentido: código, dados, pilha. Você vai traduzir endereços por base e limite, ver o hardware barrar um acesso errado, compartilhar código e descobrir por que sobram buracos inúteis entre segmentos.",
    facts: [
      ["Memória", `${CELLS} KiB`],
      ["Endereço", `(${DEFAULTS.segmento}, ${DEFAULTS.deslocamento})`],
      ["Processos", "A e B"],
    ],
  },
  outro: {
    title: "Segmentação em resumo",
    text: "Cada segmento tem base, limite e permissões; a MMU compara o deslocamento com o limite e soma a base. Isso protege e permite compartilhar unidades inteiras, mas os tamanhos variados deixam buracos entre segmentos, a fragmentação externa, que só a compactação resolve. Por isso os sistemas atuais preferem a paginação e deixam a segmentação plana no x86-64.",
    facts: (run) => [
      ["Físico", String(run.stats.physical)],
      ["Livre", `${run.stats.free} KiB, maior ${run.stats.largest} KiB`],
      ["Copiado", `${run.stats.copied} KiB`],
    ],
  },
  next: ["paginacao-tlb", "buddy"],
  practice,
};

export default lesson;
