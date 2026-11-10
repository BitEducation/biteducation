import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { DIRECT, locate, mapFile, maxBlocks, perBlock } from "../../../sim/os/inode.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { inodes as practice } from "../practice.ts";

/**
 * A Unix file system from the inside: inode metadata, path resolution through directories, the
 * direct and indirect block pointers, the largest possible file, and hard versus symbolic links.
 */
export const DEFAULTS = { tamanho: 200, bloco: "4", deslocamento: 100 };
const KIB = 1024;
const DATA0 = 1000;
const IND = 900;
const PATH: { dir: string; inode: number; block: number; finds: string; next: number }[] = [
  { dir: "/", inode: 2, block: 120, finds: "home", next: 11 },
  { dir: "/home", inode: 11, block: 310, finds: "ana", next: 23 },
  { dir: "/home/ana", inode: 23, block: 545, finds: "notas.txt", next: 57 },
];
const SLOTS = [...Array.from({ length: DIRECT }, (_, i) => `d${i}`), "ind1", "ind2", "ind3"];

const scene: SceneSpec = {
  viewBox: [960, 600],
  nodes: [],
  links: [],
  widgets: [
    {
      kind: "grid",
      id: "inode",
      title: "Inode 57 · 12 ponteiros diretos e 3 indiretos",
      at: [40, 50],
      cols: 15,
      rows: 1,
      cellW: 54,
      indexLabel: "none",
    },
    {
      kind: "table",
      id: "meta",
      title: "Metadados do inode",
      at: [40, 140],
      columns: ["Campo", "Valor"],
      widths: [130, 200],
      rows: 5,
    },
    {
      kind: "table",
      id: "caminho",
      title: "Resolvendo /home/ana/notas.txt",
      at: [420, 140],
      columns: ["Leitura", "O quê", "Resultado"],
      widths: [70, 210, 220],
      rows: 7,
    },
    { kind: "counter", id: "leituras", title: "Leituras de disco", at: [420, 368] },
    {
      kind: "table",
      id: "mapa",
      title: "Como o arquivo se espalha",
      at: [40, 455],
      columns: ["Caso", "Blocos de dados", "Blocos de índice", "Alcance"],
      widths: [260, 150, 150, 300],
      rows: 4,
    },
  ],
};

function human(bytes: number): string {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${(Math.round(v * 10) / 10).toString().replace(".", ",")} ${units[u]}`;
}

export function build(p: Params) {
  const bs = (p.bloco === "1" ? 1 : 4) * KIB;
  const size = Math.min(100_000, Math.max(1, Math.round(Number(p.tamanho ?? DEFAULTS.tamanho)))) * KIB;
  const offKiB = Math.min(
    size / KIB - 1,
    Math.max(0, Math.round(Number(p.deslocamento ?? DEFAULTS.deslocamento))),
  );
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => `${t}`);
  const fm = mapFile(size, bs);
  const P = perBlock(bs);
  const where = locate(offKiB * KIB, bs);

  // 1. the inode
  b.step(
    {
      id: "s1-inode",
      title: "Um arquivo é um inode",
      subtitle: "Metadados e ponteiros",
      text: `Num sistema de arquivos do Unix, cada arquivo é descrito por um [[inode]]: dono, permissões, tamanho, datas e a lista de blocos do disco onde estão os dados. O nome não fica no inode, e sim no diretório que aponta para ele. O arquivo notas.txt usa o inode 57, com ${human(size)} em blocos de ${bs / KIB} KiB.`,
      facts: [
        ["Inode", "57"],
        ["Tamanho", human(size)],
        ["Bloco", `${bs / KIB} KiB`],
      ],
      highlight: [],
    },
    () => {
      const rows: [string, string][] = [
        ["Tipo e permissões", "arquivo, rw-r--r--"],
        ["Dono", "ana (uid 1000)"],
        ["Tamanho", human(size)],
        ["Links", "1"],
        ["Modificado", "ontem, 14h02"],
      ];
      rows.forEach((r, i) => {
        c.row("meta", i, r, {
          dt: i === 0 ? 1 : 0,
          ...(i === 0 ? { log: { who: "inode 57", what: "metadados" } } : {}),
        });
      });
      SLOTS.forEach((s, i) => {
        c.cell("inode", i, s, { role: "muted", label: `ponteiro ${s} vazio` });
      });
    },
  );

  // 2. path resolution
  const reads = PATH.length * 2 + 1;
  b.step(
    {
      id: "s2-caminho",
      title: "Do nome ao inode",
      subtitle: "Um diretório por vez",
      text: `Um [[diretorio]] é um arquivo especial com pares nome → número de inode. Para abrir /home/ana/notas.txt, o sistema parte do inode 2, a raiz, lê o bloco do diretório e acha "home"; lê o inode de home, o bloco dele, e assim por diante. Sem cache são ${reads} leituras de disco antes do primeiro byte. Por isso o kernel guarda inodes e entradas de diretório recentes na memória.`,
      facts: [
        ["Componentes", "/, home, ana, notas.txt"],
        ["Leituras", String(reads)],
        ["Inode final", "57"],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt:
          "Sem nenhum cache, quantas leituras de disco são necessárias para chegar ao inode de /home/ana/notas.txt, partindo do inode da raiz?",
        answer: reads,
        explain: `Para cada um dos ${PATH.length} diretórios: ler o inode e ler o bloco de entradas (${PATH.length} × 2 = ${PATH.length * 2}). Mais o inode de notas.txt: ${reads}.`,
      },
    },
    () => {
      let n = 0;
      for (const s of PATH) {
        n++;
        c.row("caminho", n - 1, [String(n), `inode ${s.inode} (${s.dir})`, `dados no bloco ${s.block}`], {
          dt: 1,
        });
        c.count("leituras", String(n));
        n++;
        c.row("caminho", n - 1, [String(n), `bloco ${s.block}`, `"${s.finds}" → inode ${s.next}`], {
          dt: 1,
          mark: "new",
          log: { who: s.dir, what: `procura ${s.finds}`, detail: `inode ${s.next}` },
        });
        c.count("leituras", String(n));
      }
      n++;
      c.row("caminho", n - 1, [String(n), "inode 57", "chegou: notas.txt"], { dt: 1, mark: "hit" });
      c.count("leituras", String(n), { label: `${n} leituras` });
    },
  );

  // 3. direct pointers
  const directBytes = DIRECT * bs;
  b.step(
    {
      id: "s3-diretos",
      title: "Ponteiros diretos",
      subtitle: `Até ${human(directBytes)}`,
      text: `Os primeiros ${DIRECT} ponteiros do inode apontam direto para blocos de dados. Com blocos de ${bs / KIB} KiB, isso cobre ${human(directBytes)}. Como a maioria dos arquivos é pequena, quase sempre basta ler o inode para saber onde está tudo, sem nenhum bloco de índice. Aqui, os ${fm.direct} primeiros blocos de notas.txt ocupam os ponteiros diretos.`,
      facts: [
        ["Ponteiros diretos", String(DIRECT)],
        ["Cobrem", human(directBytes)],
        ["Usados", String(fm.direct)],
      ],
      highlight: [],
    },
    () => {
      for (let i = 0; i < DIRECT; i++)
        c.cell("inode", i, i < fm.direct ? String(DATA0 + i) : "—", {
          dt: i === 0 ? 1 : 0,
          role: i < fm.direct ? "a" : "muted",
          ...(i < fm.direct ? { mark: "new" as const } : {}),
          label: i < fm.direct ? `d${i} → bloco ${DATA0 + i}` : `d${i} vazio`,
          ...(i === 0 ? { log: { who: "inode 57", what: "diretos", detail: `${fm.direct} blocos` } } : {}),
        });
      c.row("mapa", 0, ["Só diretos", String(DIRECT), "0", `até ${human(directBytes)}`]);
    },
  );

  // 4. indirect
  b.step(
    {
      id: "s4-indireto",
      title: "Um bloco de ponteiros",
      subtitle: `Deslocamento de ${offKiB} KiB`,
      text: `Arquivos maiores usam o ponteiro indireto: ele aponta para um [[bloco-de-indice]] cheio de ponteiros, ${P} por bloco de ${bs / KIB} KiB. notas.txt tem ${fm.dataBlocks} blocos: ${fm.direct} diretos${fm.single ? `, ${fm.single} pelo indireto simples` : ""}${fm.double ? `, ${fm.double} pelo duplo` : ""}${fm.triple ? `, ${fm.triple} pelo triplo` : ""}, mais ${fm.indexBlocks} ${fm.indexBlocks === 1 ? "bloco" : "blocos"} de índice. O byte no deslocamento ${offKiB} KiB está no bloco lógico ${where.block}, ${where.level === "direto" ? `ponteiro direto ${where.path[0]}` : `${where.level}, posição ${where.path.slice(1).join(" → ")}`}.`,
      facts: [
        ["Blocos de dados", String(fm.dataBlocks)],
        ["Blocos de índice", String(fm.indexBlocks)],
        ["Byte procurado", `bloco ${where.block}, ${where.level}`],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Com blocos de ${bs / KIB} KiB, em que bloco lógico do arquivo (contando de 0) está o byte no deslocamento ${offKiB} KiB?`,
        answer: where.block,
        explain: `${offKiB} KiB ÷ ${bs / KIB} KiB = ${(offKiB / (bs / KIB)).toString().replace(".", ",")}; descartando a fração, bloco ${where.block}. ${where.block < DIRECT ? "Está entre os diretos." : `Passa dos ${DIRECT} diretos, então vai para o ${where.level}.`}`,
      },
    },
    () => {
      const ind = [fm.single, fm.double, fm.triple];
      ind.forEach((n, k) => {
        c.cell("inode", DIRECT + k, n ? String(IND + k) : "—", {
          dt: k === 0 ? 1 : 0,
          role: n ? "b" : "muted",
          ...(n ? { mark: "new" as const } : {}),
          label: n ? `${SLOTS[DIRECT + k]} → bloco de índice ${IND + k}` : `${SLOTS[DIRECT + k]} vazio`,
        });
      });
      c.cell(
        "inode",
        where.path[0] ?? 0,
        where.level === "direto"
          ? String(DATA0 + where.block)
          : String(IND + (where.path[0] ?? DIRECT) - DIRECT),
        {
          mark: "hit",
          role: "s4",
          label: `o byte procurado passa por ${SLOTS[where.path[0] ?? 0]}`,
          log: { who: "busca", what: `${offKiB} KiB`, detail: `bloco ${where.block}, ${where.level}` },
        },
      );
      c.row("mapa", 1, ["notas.txt", String(fm.dataBlocks), String(fm.indexBlocks), human(size)], {
        mark: "new",
      });
    },
  );

  // 5. the largest file
  const max4 = maxBlocks(4 * KIB) * 4 * KIB;
  const max1 = maxBlocks(KIB) * KIB;
  b.step(
    {
      id: "s5-maximo",
      title: "O maior arquivo possível",
      subtitle: `Com blocos de ${bs / KIB} KiB: ${human(maxBlocks(bs) * bs)}`,
      text: `Cada nível multiplica o alcance por ${P}: ${DIRECT} blocos diretos, mais ${P} pelo simples, ${P}² pelo duplo e ${P}³ pelo triplo. Com blocos de 4 KiB, o maior arquivo chega a ${human(max4)}; com blocos de 1 KiB, só ${human(max1)}. O custo é a busca: um byte no indireto triplo precisa de 3 blocos de índice antes do dado. Sistemas como o ext4 trocaram isso por extents, faixas contínuas de blocos.`,
      facts: [
        ["Blocos de 4 KiB", human(max4)],
        ["Blocos de 1 KiB", human(max1)],
        ["Pior busca", "3 índices + dado"],
      ],
      highlight: [],
    },
    () => {
      c.row("mapa", 2, ["Máximo, blocos de 4 KiB", String(maxBlocks(4 * KIB)), "—", human(max4)], {
        dt: 1,
        log: { who: "máximo", what: "4 KiB", detail: human(max4) },
      });
      c.row("mapa", 3, ["Máximo, blocos de 1 KiB", String(maxBlocks(KIB)), "—", human(max1)], {
        log: { who: "máximo", what: "1 KiB", detail: human(max1) },
      });
    },
  );

  // 6. links
  b.step(
    {
      id: "s6-links",
      title: "Dois nomes, um arquivo",
      subtitle: "Links físicos e simbólicos",
      text: `Como o nome vive no diretório, nada impede dois nomes para o mesmo inode: um [[link-fisico]]. Criar copia.txt apontando para o inode 57 sobe o contador de links para 2; apagar notas.txt só tira uma entrada, e os dados ficam até o contador chegar a 0. Já o link simbólico é um arquivo pequeno cujo conteúdo é um caminho: se o alvo some, ele fica apontando para o nada.`,
      facts: [
        ["Link físico", "mesmo inode, contador 2"],
        ["rm notas.txt", "contador volta a 1"],
        ["Link simbólico", "guarda um caminho"],
      ],
      highlight: [],
    },
    () => {
      c.row("meta", 3, ["Links", "2"], {
        dt: 1,
        mark: "new",
        log: { who: "ln", what: "copia.txt → inode 57", detail: "links = 2" },
      });
      c.row("meta", 3, ["Links", "1"], {
        dt: 1,
        mark: "warn",
        log: { who: "rm", what: "notas.txt", detail: "links = 1, dados ficam" },
      });
    },
  );

  return b.done({
    reads,
    blocks: fm.dataBlocks,
    index: fm.indexBlocks,
    block: where.block,
    level: where.level,
    max4: human(max4),
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "inodes",
    site: "so",
    title: "Sistema de arquivos: inodes, diretórios e blocos",
    summary:
      "O que um inode guarda, como um caminho vira número de inode, como ponteiros diretos e indiretos encontram cada byte, o maior arquivo possível e a diferença entre links físicos e simbólicos.",
    area: "Arquivos e E/S",
    refs: [
      {
        book: "tanenbaum-mos",
        chapter: 4,
        section: "4.3.2",
        note: "Implementando arquivos (i-nodes)",
        verified: true,
      },
      {
        book: "tanenbaum-mos",
        chapter: 4,
        section: "4.3.3",
        note: "Implementando diretórios",
        verified: true,
      },
      {
        book: "maziero-so",
        chapter: 24,
        section: "24.5.5",
        note: "Alocação indexada multinível",
        verified: true,
      },
    ],
    simplifications: [
      "Modelo do ext2: 12 ponteiros diretos e três indiretos de 4 bytes; o ext4 usa extents.",
      "Números de inode e de bloco são ilustrativos.",
      "A contagem de leituras ignora todos os caches.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "tamanho", kind: "int", label: "Tamanho do arquivo (KiB)", min: 1, max: 100000 },
      {
        key: "bloco",
        kind: "choice",
        label: "Tamanho do bloco",
        options: [
          { value: "4", label: "4 KiB" },
          { value: "1", label: "1 KiB" },
        ],
      },
      { key: "deslocamento", kind: "int", label: "Byte procurado (KiB desde o início)", min: 0, max: 99999 },
    ],
  },
  build,
  intro: {
    text: "Um arquivo parece uma sequência contínua de bytes, mas no disco ele está espalhado em blocos. Você vai abrir um inode, seguir um caminho de diretório em diretório e descobrir como o sistema acha um byte qualquer de um arquivo grande.",
    facts: [
      ["Arquivo", "/home/ana/notas.txt"],
      ["Tamanho", `${DEFAULTS.tamanho} KiB`],
      ["Bloco", "4 KiB"],
    ],
  },
  outro: {
    title: "Inodes em resumo",
    text: "O inode guarda tudo sobre o arquivo menos o nome, que fica nos diretórios. Chegar a um arquivo custa uma leitura de inode e uma de diretório por componente do caminho. Ponteiros diretos atendem arquivos pequenos; níveis indiretos multiplicam o alcance ao custo de mais leituras.",
    facts: (run) => [
      ["Leituras no caminho", String(run.stats.reads)],
      ["Blocos de índice", String(run.stats.index)],
      ["Máximo com 4 KiB", String(run.stats.max4)],
    ],
  },
  next: ["escalonamento-disco", "paginacao-tlb"],
  practice,
};

export default lesson;
