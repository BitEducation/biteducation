import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { allocRun, DISK, holes, LAYOUT } from "../../../sim/os/alloc.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { alocacaoArquivos as practice } from "../practice.ts";

/**
 * Where a file's blocks go: contiguous (fast, but external fragmentation), linked (no
 * fragmentation, but reading block k walks k pointers on disk), FAT (the same chain kept in a
 * table in memory) and indexed (one index block, two reads for any block), ending in extents.
 */
export const DEFAULTS = { tamanho: 5, bloco: 4 };

function clamp(p: Params) {
  const n = Math.min(7, Math.max(2, Math.round(Number(p.tamanho ?? DEFAULTS.tamanho))));
  const k = Math.min(n - 1, Math.max(0, Math.round(Number(p.bloco ?? DEFAULTS.bloco))));
  return { n, k };
}

const COLS = 12;

function scene(): SceneSpec {
  return {
    viewBox: [960, 620],
    nodes: [],
    links: [],
    widgets: [
      {
        kind: "grid",
        id: "disco",
        title: `Disco: ${DISK} blocos (número = posição)`,
        at: [40, 40],
        cols: COLS,
        rows: 2,
        cellW: 72,
        indexLabel: "dec",
      },
      {
        kind: "grid",
        id: "fat",
        title: "FAT: para cada bloco, o próximo do arquivo (fim = último)",
        at: [40, 210],
        cols: COLS,
        rows: 2,
        cellW: 72,
        indexLabel: "dec",
      },
      { kind: "counter", id: "leituras", title: "Leituras de disco para chegar ao bloco", at: [40, 380] },
      {
        kind: "table",
        id: "cmp",
        title: "Quatro formas de guardar o mesmo arquivo",
        at: [300, 370],
        columns: ["Método", "Onde ficam os ponteiros", "Leituras", "Ponto fraco"],
        widths: [120, 200, 90, 220],
        rows: 4,
      },
    ],
  };
}

export function build(p: Params) {
  const { n, k } = clamp(p);
  const r = allocRun(n, k);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => `t${t}`);
  const hs = holes();
  const pl = (x: number, one: string, many: string) => (x === 1 ? one : many);
  const list = (xs: number[]) => xs.join(", ");
  const reset = () => {
    LAYOUT.forEach((o, i) => {
      c.cell("disco", i, o ?? "", { dt: 0 });
    });
  };
  const clearFat = () => {
    for (let i = 0; i < DISK; i++) c.cell("fat", i, "", { dt: 0 });
  };
  const contig = r.contiguous;
  const kth = `F${k}`;

  b.step(
    {
      id: "s1-disco",
      title: "Um disco já usado",
      subtitle: `${r.free} blocos livres`,
      text: `O disco tem ${DISK} blocos, e os arquivos A, B e C já ocupam parte deles. Sobram ${r.free} blocos livres, mas espalhados em ${hs.length} buracos, de ${hs.map((h) => h.len).join(", ")} blocos. Chega o arquivo F, com ${n} blocos. O sistema de arquivos precisa decidir onde cada um vai e como achá-los depois, inclusive o bloco ${k} do meio do arquivo.`,
      facts: [
        ["Livres", String(r.free)],
        ["Maior buraco", `${r.largest} blocos`],
        ["Arquivo F", `${n} blocos`],
      ],
      highlight: ["disco"],
    },
    () => {
      reset();
      clearFat();
      c.count("leituras", "0", { label: "nada lido" });
    },
  );

  b.step(
    {
      id: "s2-contigua",
      title: "Alocação contígua",
      subtitle: contig ? `Blocos ${contig[0]} a ${contig.at(-1)}` : "Não cabe",
      text: contig
        ? `Na alocação contígua, F ocupa blocos seguidos: basta guardar o início e o tamanho. O primeiro buraco com ${n} blocos começa no ${contig[0]}. Ler o bloco ${k} é uma conta, ${contig[0]} + ${k} = ${(contig[0] ?? 0) + k}, e uma leitura só. O preço aparece com o tempo: arquivos que crescem não cabem e os buracos que sobram são pequenos demais.`
        : `Na alocação contígua, F ocupa blocos seguidos: basta guardar o início e o tamanho. Mas o maior buraco tem ${r.largest} blocos, e F precisa de ${n}. Há ${r.free} blocos livres no disco e ainda assim F não cabe: é a [[fragmentacao-externa|fragmentação externa]]. Só desfragmentando, movendo os outros arquivos, abriria espaço.`,
      facts: [
        ["Maior buraco", `${r.largest} blocos`],
        ["Cabe?", contig ? "sim" : "não"],
        ["Leituras até o bloco", contig ? "1" : "—"],
      ],
      highlight: ["disco"],
      quiz: {
        kind: "choice",
        prompt: `O disco tem ${r.free} blocos livres. Por que um arquivo de ${r.largest + 1} blocos não cabe com alocação contígua?`,
        options: [
          `Nenhum buraco tem ${r.largest + 1} blocos seguidos; os livres estão espalhados`,
          "O disco está cheio",
          "Arquivos grandes precisam de um bloco de índice",
        ],
        answer: 0,
        explain: `Espaço livre total não basta: a contígua precisa dele inteiro num lugar só. O maior buraco tem ${r.largest} blocos.`,
      },
    },
    () => {
      if (contig) {
        contig.forEach((x, i) => {
          c.cell("disco", x, `F${i}`, { mark: i === k ? "hit" : "new" });
        });
        c.count("leituras", "1", { label: "uma leitura" });
      } else {
        for (const h of hs)
          for (let i = 0; i < h.len; i++) c.cell("disco", h.start + i, "", { mark: "miss", dt: 0 });
        c.note("disco", `nenhum buraco com ${n} blocos`, "bad", { dt: 1 });
        c.count("leituras", "—", { label: "não alocado" });
      }
    },
  );

  b.step(
    {
      id: "s3-encadeada",
      title: "Lista encadeada no disco",
      subtitle: `Blocos ${list(r.chain)}`,
      text: `Na alocação encadeada, F usa quaisquer blocos livres: ${list(r.chain)}. Cada bloco guarda, no fim, o número do próximo, e o diretório guarda só o primeiro. Não há fragmentação externa. Mas para ler o bloco ${k}, o sistema precisa ler ${k === 0 ? "só o primeiro, cujo endereço está no diretório; qualquer bloco depois dele exige ler os anteriores" : `os ${k + 1} primeiros, um por um, só para descobrir onde está o seguinte`}. Acesso direto vira uma caminhada.`,
      facts: [
        ["Primeiro bloco", String(r.chain[0])],
        ["Leituras até o bloco", String(r.reads.linked)],
        ["Fragmentação externa", "nenhuma"],
      ],
      highlight: ["disco", "leituras"],
      quiz: {
        kind: "number",
        prompt: `Com alocação encadeada no disco, quantas leituras são precisas para chegar ao bloco ${k} de F (contando a partir do 0)?`,
        answer: r.reads.linked,
        explain:
          k === 0
            ? "O endereço do bloco 0 está no diretório: uma leitura basta. Cada bloco além dele custa mais uma."
            : `O endereço do bloco ${k} só está escrito no bloco ${k - 1}, e assim por diante: ${k + 1} leituras, do bloco 0 até o ${k}.`,
      },
    },
    () => {
      reset();
      r.chain.forEach((x, i) => {
        const nx = r.chain[i + 1];
        c.cell("disco", x, nx === undefined ? `F${i}·fim` : `F${i}→${nx}`, { mark: "new" });
      });
      r.chain.slice(0, k + 1).forEach((x, i) => {
        c.cell("disco", x, i === k ? `${kth} ✓` : `F${i}→${r.chain[i + 1]}`, {
          mark: i === k ? "hit" : "miss",
          dt: 1,
        });
        c.count("leituras", String(i + 1), { label: `${i + 1} ${pl(i + 1, "leitura", "leituras")}` });
      });
    },
  );

  b.step(
    {
      id: "s4-fat",
      title: "A FAT: ponteiros na memória",
      subtitle: "Mesma cadeia, outro lugar",
      text: `A [[fat|FAT]] tira os ponteiros dos blocos e os junta numa tabela, com uma entrada por bloco do disco, que fica na memória. A cadeia de F é a mesma, ${list(r.chain)}, mas agora segui-la custa ${k} ${pl(k, "consulta", "consultas")} na RAM e uma leitura de disco só. O problema é o tamanho: a tabela tem uma entrada para cada bloco do disco, ocupado ou não.`,
      facts: [
        ["Consultas na RAM", String(r.fatHops)],
        ["Leituras de disco", "1"],
        ["Entradas na tabela", String(DISK)],
      ],
      highlight: ["fat"],
      quiz: {
        kind: "pick",
        prompt: "Com a FAT, onde o sistema descobre qual é o próximo bloco de F? Clique na cena.",
        targets: [
          { id: "fat", label: "A tabela FAT" },
          { id: "disco", label: "Os blocos de dados no disco" },
          { id: "leituras", label: "O contador de leituras" },
        ],
        answer: "fat",
        explain:
          "Na FAT, a cadeia de ponteiros sai dos blocos de dados e vai para a tabela, que o sistema mantém na memória.",
      },
    },
    () => {
      reset();
      r.chain.forEach((x, i) => {
        c.cell("disco", x, `F${i}`, { mark: "new", dt: 0 });
        const nx = r.chain[i + 1];
        c.cell("fat", x, nx === undefined ? "fim" : String(nx), { mark: "new" });
      });
      r.chain.slice(0, k + 1).forEach((x) => {
        c.cell("fat", x, String(r.chain[r.chain.indexOf(x) + 1] ?? "fim"), { mark: "hit", dt: 1 });
      });
      c.cell("disco", r.chain[k] as number, `${kth} ✓`, { mark: "hit" });
      c.count("leituras", "1", { label: "uma leitura" });
    },
  );

  b.step(
    {
      id: "s5-indexada",
      title: "Alocação indexada",
      subtitle: `Índice no bloco ${r.index}`,
      text: `Na alocação indexada, F ganha um [[bloco-de-indice|bloco de índice]], o ${r.index}, com a lista dos seus blocos de dados: ${list(r.data)}. Para ler o bloco ${k}, basta ler o índice e pegar a posição ${k}: duas leituras, qualquer que seja o bloco. O custo é um bloco a mais por arquivo; arquivos grandes usam índices de índices, como os ponteiros indiretos do inode.`,
      facts: [
        ["Bloco de índice", String(r.index)],
        ["Leituras até o bloco", "2"],
        ["Blocos usados", String(n + 1)],
      ],
      highlight: ["disco"],
    },
    () => {
      reset();
      clearFat();
      c.cell("disco", r.index, `índice F`, { mark: "dirty" });
      r.data.forEach((x, i) => {
        c.cell("disco", x, `F${i}`, { mark: "new" });
      });
      c.cell("disco", r.index, `índice F ✓`, { mark: "hit", dt: 1 });
      c.cell("disco", r.data[k] as number, `${kth} ✓`, { mark: "hit", dt: 1 });
      c.count("leituras", "2", { label: "duas leituras" });
    },
  );

  b.step(
    {
      id: "s6-extensoes",
      title: "Extensões e a comparação",
      subtitle: `${r.extents.length} ${pl(r.extents.length, "extensão", "extensões")}`,
      text: `Sistemas como ext4 e NTFS guardam [[extensao|extensões]]: pares de início e tamanho. Os blocos ${list(r.chain)} viram ${r.extents.map((e) => `${e.start} (+${e.len})`).join(", ")}, ${r.extents.length} ${pl(r.extents.length, "entrada", "entradas")} em vez de ${n}. É o índice com a vantagem da contígua: trechos seguidos são lidos de uma vez. A tabela compara as quatro formas.`,
      facts: [
        ["Extensões", String(r.extents.length)],
        ["Blocos", String(n)],
        ["Usado em", "ext4, NTFS, APFS"],
      ],
      highlight: ["cmp"],
    },
    () => {
      c.row(
        "cmp",
        0,
        ["Contígua", "nenhum: início + tamanho", contig ? "1" : "não coube", "fragmentação externa"],
        {
          dt: 1,
          mark: contig ? "new" : "bad",
        },
      );
      c.row("cmp", 1, ["Encadeada", "dentro de cada bloco", String(r.reads.linked), "acesso direto lento"], {
        dt: 1,
        mark: "warn",
      });
      c.row("cmp", 2, ["FAT", "tabela na memória", "1", "tabela do tamanho do disco"], {
        dt: 1,
        mark: "new",
      });
      c.row("cmp", 3, ["Indexada", "bloco de índice", "2", "um bloco a mais por arquivo"], {
        dt: 1,
        mark: "new",
      });
    },
  );

  return b.done({
    free: r.free,
    largest: r.largest,
    fits: contig ? 1 : 0,
    linked: r.reads.linked,
    extents: r.extents.length,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "alocacao-arquivos",
    site: "so",
    title: "Alocação de arquivos no disco",
    summary:
      "O mesmo arquivo guardado de quatro formas: contígua, que falha com fragmentação externa; encadeada, que caminha bloco a bloco; FAT, com a cadeia na memória; e indexada, com duas leituras para qualquer bloco. Extensões fecham a conta.",
    area: "Arquivos",
    refs: [
      { book: "maziero-so", chapter: 24, section: "24.5", note: "Alocação de arquivos", verified: true },
      { book: "tanenbaum-mos", chapter: 4, section: "4.3.2", note: "Implementando arquivos", verified: true },
    ],
    simplifications: [
      `Um disco de ${DISK} blocos; o de verdade tem milhões.`,
      "A contígua usa o primeiro buraco que serve; há outras políticas.",
      "O bloco de índice não fica em cache, por isso conta como uma leitura.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "tamanho", kind: "int", label: "Blocos do arquivo F", min: 2, max: 7 },
      { key: "bloco", kind: "int", label: "Bloco de F a ler (a partir de 0)", min: 0, max: 6 },
    ],
  },
  build,
  practice,
  intro: {
    text: "Um sistema de arquivos precisa lembrar onde está cada bloco de cada arquivo. Você vai guardar o mesmo arquivo de quatro jeitos num disco já usado e contar quantas leituras cada um custa para chegar a um bloco do meio.",
    facts: [
      ["Disco", `${DISK} blocos`],
      ["Arquivo novo", "F"],
      ["Métodos", "4"],
    ],
  },
  outro: {
    title: "Alocação em resumo",
    text: "Contígua é a mais rápida, mas sofre com fragmentação externa. Encadeada aproveita qualquer bloco, mas acessar o meio exige ler todos os anteriores. A FAT leva essa cadeia para a memória. A indexada chega a qualquer bloco em duas leituras, e as extensões compactam o índice quando os blocos são seguidos.",
    facts: (rr) => [
      ["Coube contíguo", rr.stats.fits === 1 ? "sim" : "não"],
      ["Leituras encadeada", String(rr.stats.linked)],
      ["Extensões", String(rr.stats.extents)],
    ],
  },
  next: ["inodes", "journaling", "ssd"],
};

export default lesson;
