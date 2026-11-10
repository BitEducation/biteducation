import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { FILE_PAGES, mmapRun, PAGE_KIB, type Share } from "../../../sim/os/mmap.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { mmap as practice } from "../practice.ts";

/**
 * mmap(): mapping a file returns only an address; pages arrive by page fault. A second process
 * mapping the same file shares the page-cache frame (minor fault), and a write is visible to
 * both or, with MAP_PRIVATE, copied on write. Compared with read(), no copy to a user buffer.
 */
export const DEFAULTS = { tocadas: 3, modo: "shared" };

function clamp(p: Params): { n: number; mode: Share } {
  const n = Math.min(FILE_PAGES, Math.max(1, Math.round(Number(p.tocadas ?? DEFAULTS.tocadas))));
  return { n, mode: p.modo === "private" ? "private" : "shared" };
}

function scene(): SceneSpec {
  return {
    viewBox: [960, 620],
    nodes: [
      { id: "A", kind: "process", label: "Processo A", sub: "mapeia o arquivo", at: [150, 80], w: 170 },
      { id: "B", kind: "process", label: "Processo B", sub: "mapeia depois", at: [810, 80], w: 170 },
      { id: "kern", kind: "kernel", label: "Núcleo", sub: "faltas de página", at: [480, 80], w: 200 },
      {
        id: "disco",
        kind: "disk",
        label: "dados.bin",
        sub: `${FILE_PAGES} páginas de ${PAGE_KIB} KiB`,
        at: [480, 210],
        w: 200,
      },
    ],
    links: [
      { id: "l-a", from: "A", to: "kern" },
      { id: "l-b", from: "B", to: "kern" },
      { id: "l-d", from: "kern", to: "disco" },
    ],
    widgets: [
      { kind: "counter", id: "faltas", title: "Leituras do disco", at: [760, 200] },
      {
        kind: "grid",
        id: "ptA",
        title: "Tabela de páginas de A: página → quadro",
        at: [40, 290],
        cols: FILE_PAGES,
        rows: 1,
        cellW: 90,
        indexLabel: "dec",
      },
      {
        kind: "grid",
        id: "ptB",
        title: "Tabela de páginas de B: página → quadro",
        at: [520, 290],
        cols: FILE_PAGES,
        rows: 1,
        cellW: 90,
        indexLabel: "dec",
      },
      {
        kind: "grid",
        id: "ram",
        title: "Memória física: quadro → conteúdo",
        at: [40, 380],
        cols: FILE_PAGES + 1,
        rows: 1,
        cellW: 120,
        indexLabel: "dec",
      },
      {
        kind: "table",
        id: "cmp",
        title: "Ler as mesmas páginas",
        at: [40, 470],
        columns: ["Forma", "Cópias para o processo", "Chamadas ao núcleo"],
        widths: [160, 330, 330],
        rows: 2,
      },
    ],
  };
}

export function build(p: Params) {
  const { n, mode } = clamp(p);
  const run = mmapRun(n, mode);
  const b = lessonBuilder();
  const c = talk(b, { A: "A", B: "B", kern: "núcleo", disco: "disco" }, (t) => `t${t}`);
  const fileKiB = FILE_PAGES * PAGE_KIB;
  const major = run.acc.filter((a) => a.kind === "maior");
  const hit = run.acc.find((a) => a.kind === "acerto");
  const minor = run.acc.find((a) => a.kind === "menor");
  const write = run.acc.find((a) => a.op === "escreve");
  const priv = mode === "private";
  const pl = (k: number, one: string, many: string) => (k === 1 ? one : many);

  b.step(
    {
      id: "s1-mapear",
      title: "mmap devolve um endereço",
      subtitle: "Nada foi lido ainda",
      text: `O processo A chama mmap sobre o arquivo dados.bin, de ${fileKiB} KiB. O núcleo reserva uma faixa de endereços virtuais e anota que ela corresponde ao arquivo, mas não lê nada do disco. As ${FILE_PAGES} entradas da tabela de páginas ficam inválidas: o primeiro acesso a cada página vai causar uma [[falta-de-pagina|falta de página]].`,
      facts: [
        ["Arquivo", `${fileKiB} KiB`],
        ["Páginas válidas", "0"],
        ["Bytes lidos", "0"],
      ],
      highlight: ["A", "ptA"],
    },
    () => {
      c.send("A", "kern", "mmap(dados.bin)", { what: "mmap", detail: `${fileKiB} KiB` });
      for (let i = 0; i < FILE_PAGES; i++) c.cell("ptA", i, "inválida", { dt: 0 });
      c.send("kern", "A", "endereço 0x7f00…", { role: "b", what: "retorno", detail: "só a faixa virtual" });
      c.count("faltas", "0", { label: "nenhuma leitura" });
    },
  );

  b.step(
    {
      id: "s2-falta-maior",
      title: "Faltas que vão ao disco",
      subtitle: `${n} ${pl(n, "página tocada", "páginas tocadas")}`,
      text: `A lê ${pl(n, "a página 0", `as páginas 0 a ${n - 1}`)}. Cada primeiro acesso cai numa falta de página: o núcleo vê que o endereço pertence ao arquivo, lê a página do disco para um quadro da cache de páginas e preenche a entrada de A. São ${n} ${pl(n, "falta maior", "faltas maiores")}, uma leitura de disco cada. As outras páginas do arquivo continuam sem quadro.`,
      facts: [
        ["Faltas maiores", String(run.major)],
        ["Quadros usados", String(n)],
        ["Páginas sem quadro", String(FILE_PAGES - n)],
      ],
      highlight: ["disco", "ram"],
      quiz: {
        kind: "number",
        prompt: `O arquivo tem ${FILE_PAGES} páginas e A tocou ${n}. Quantos KiB foram lidos do disco até agora?`,
        answer: n * PAGE_KIB,
        unit: "KiB",
        explain: `Só as páginas tocadas são lidas: ${n} × ${PAGE_KIB} KiB = ${n * PAGE_KIB} KiB. O resto do arquivo fica no disco até alguém acessar.`,
      },
    },
    () => {
      for (const a of major) {
        c.state("A", `lê a página ${a.page}`, { tone: "warn", label: `falta na página ${a.page}` });
        c.send("kern", "disco", `lê página ${a.page}`, { what: "E/S", detail: `${PAGE_KIB} KiB` });
        c.send("disco", "kern", `página ${a.page}`, { role: "b", what: "dados", detail: "para a cache" });
        c.cell("ram", a.frame, `dados:${a.page}`, { mark: "new" });
        c.cell("ptA", a.page, `q${a.frame}`, { mark: "miss" });
        c.count("faltas", String(a.page + 1), { label: `${a.page + 1} leituras do disco` });
      }
    },
  );

  b.step(
    {
      id: "s3-acerto",
      title: "Depois, acesso comum",
      subtitle: "Sem chamada ao núcleo",
      text: `A lê a página 0 de novo. Agora a entrada da tabela é válida, e a leitura é um acesso à memória como outro qualquer, traduzido pela MMU e pela [[tlb|TLB]]. Não há chamada de sistema nem falta. É isso que torna o mmap atraente: depois do primeiro toque, o arquivo é lido com instruções comuns de carga.`,
      facts: [
        ["Página", "0"],
        ["Falta", "nenhuma"],
        ["Chamadas ao núcleo", "0"],
      ],
      highlight: ["A", "ptA"],
    },
    () => {
      if (hit) {
        c.state("A", "lê a página 0 de novo", { tone: "good" });
        c.cell("ptA", hit.page, `q${hit.frame}`, { mark: "hit" });
      }
    },
  );

  b.step(
    {
      id: "s4-falta-menor",
      title: "Outro processo, mesmo quadro",
      subtitle: "Falta menor",
      text: `O processo B mapeia o mesmo arquivo e lê a página 0. Também é uma falta, porque a tabela de B começa vazia. Mas a página já está na cache de páginas, no quadro 0: o núcleo só preenche a entrada de B apontando para ele. É uma falta menor, sem disco. Os dois processos passam a ler o mesmo quadro físico.`,
      facts: [
        ["Falta menor", "1"],
        ["Leituras do disco", String(run.major)],
        ["Quadro de B", "q0, o mesmo de A"],
      ],
      highlight: ["B", "ptB", "ram"],
      quiz: {
        kind: "choice",
        prompt: "Quando B lê a página 0, o núcleo vai ao disco?",
        options: [
          "Não: a página já está num quadro da cache, só falta a entrada na tabela de B",
          "Sim: cada processo tem sua própria cópia do arquivo",
          "Não: B lê direto da tabela de páginas de A",
        ],
        answer: 0,
        explain:
          "A cache de páginas é do sistema, não do processo. Uma falta menor só cria a tradução; os dados já estão na memória.",
      },
    },
    () => {
      c.send("B", "kern", "mmap(dados.bin)", { what: "mmap", detail: "mesmo arquivo" });
      for (let i = 0; i < FILE_PAGES; i++) c.cell("ptB", i, "inválida", { dt: 0 });
      if (minor) {
        c.state("B", "lê a página 0", { tone: "warn", label: "falta menor" });
        c.cell("ptB", minor.page, `q${minor.frame}`, { mark: "new" });
        c.cell("ram", minor.frame, "dados:0 (A e B)", { mark: "hit" });
      }
    },
  );

  b.step(
    {
      id: "s5-escrita",
      title: priv ? "Escrita privada" : "Escrita compartilhada",
      subtitle: priv ? "MAP_PRIVATE: cópia na escrita" : "MAP_SHARED: todos veem",
      text: priv
        ? `A escreve na página 0, mapeada com MAP_PRIVATE. A entrada estava marcada só para leitura; a escrita causa uma falta, e o núcleo copia a página para um quadro novo, o q${write?.frame ?? n}, só de A. B continua vendo o original, e o arquivo no disco nunca recebe a mudança. É a mesma [[copia-na-escrita|cópia na escrita]] do fork.`
        : `A escreve na página 0, mapeada com MAP_SHARED. A escrita vai direto ao quadro 0 da cache, que fica sujo. B, que aponta para o mesmo quadro, vê o valor novo na próxima leitura, sem nenhuma chamada de sistema. Mais tarde, o núcleo grava a página no arquivo, ou antes, se o processo chamar msync.`,
      facts: priv
        ? [
            ["Quadro de A", `q${write?.frame ?? n}, cópia`],
            ["B vê a escrita", "não"],
            ["Arquivo muda", "não"],
          ]
        : [
            ["Quadro", "q0, sujo"],
            ["B vê a escrita", "sim"],
            ["Arquivo muda", "depois, ou com msync"],
          ],
      highlight: ["A", "ram"],
      quiz: {
        kind: "choice",
        prompt: priv
          ? "Com MAP_PRIVATE, B lê a página 0 depois da escrita de A. O que ele vê?"
          : "Com MAP_SHARED, B lê a página 0 depois da escrita de A. O que ele vê?",
        options: priv
          ? ["O conteúdo original do arquivo", "O valor escrito por A", "Uma falta de proteção"]
          : ["O valor escrito por A", "O conteúdo original do arquivo", "Uma falta de proteção"],
        answer: 0,
        explain: priv
          ? "A escrita foi para uma cópia de A. A entrada de B continua no quadro 0, que guarda o original."
          : "A e B apontam para o mesmo quadro físico; a escrita de um é a leitura do outro. É memória compartilhada através do arquivo.",
      },
    },
    () => {
      if (!write) return;
      c.state("A", "escreve na página 0", { tone: priv ? "warn" : "active" });
      if (priv) {
        c.cell("ram", write.frame, "dados:0′ (só A)", { mark: "new" });
        c.cell("ptA", 0, `q${write.frame}`, { mark: "dirty" });
        c.cell("ram", 0, "dados:0 (B)", { mark: "hit" });
      } else {
        c.cell("ram", 0, "dados:0′ (A e B)", { mark: "dirty" });
        c.state("B", "vê o valor novo", { tone: "good" });
      }
    },
  );

  b.step(
    {
      id: "s6-read",
      title: "Comparando com read()",
      subtitle: "Cópias e chamadas",
      text: `Ler as mesmas ${n} ${pl(n, "página", "páginas")} com read() passa pela mesma cache, mas copia ${run.readCopyKiB} KiB dela para um buffer do processo, a cada chamada. Com mmap não há essa cópia, e reler é só acessar a memória. Em troca, cada página nova custa uma falta, e o mapeamento ocupa tabela de páginas. Para leituras pequenas e sequenciais, read() costuma ganhar.`,
      facts: [
        ["read()", `${run.readCopyKiB} KiB copiados`],
        ["mmap", "0 KiB copiados"],
        ["Faltas com mmap", String(run.major + run.minor)],
      ],
      highlight: ["cmp"],
      quiz: {
        kind: "number",
        prompt: `Quantos KiB read() copia da cache para o processo ao ler ${n * 2} páginas de ${PAGE_KIB} KiB?`,
        answer: n * 2 * PAGE_KIB,
        unit: "KiB",
        explain: `Cada página lida é copiada uma vez para o buffer: ${n * 2} × ${PAGE_KIB} KiB = ${n * 2 * PAGE_KIB} KiB. Com mmap, a cópia não existe.`,
      },
    },
    () => {
      c.row("cmp", 0, ["read()", `${run.readCopyKiB} KiB, cache → buffer`, "uma por chamada"], {
        dt: 1,
        mark: "warn",
      });
      c.row(
        "cmp",
        1,
        ["mmap()", "nenhuma: o processo lê o quadro", `${run.major + run.minor} faltas, depois nada`],
        {
          dt: 1,
          mark: "new",
        },
      );
    },
  );

  return b.done({ major: run.major, minor: run.minor, frames: run.frames, readCopyKiB: run.readCopyKiB });
}

const lesson: LessonModule = {
  meta: {
    slug: "mmap",
    site: "so",
    title: "Arquivos mapeados em memória",
    summary:
      "mmap() devolve um endereço e as páginas chegam por falta. Um segundo processo usa o mesmo quadro da cache, a escrita é compartilhada ou copiada, e não há cópia para um buffer como em read().",
    area: "Memória",
    refs: [
      {
        book: "maziero-so",
        chapter: 18,
        section: "18.3",
        note: "Mapeamento de arquivo em memória",
        verified: true,
      },
      { book: "maziero-so", chapter: 18, section: "18.2", note: "Cópia na escrita", verified: true },
      { book: "tanenbaum-mos", chapter: 3, section: "3.5.7", note: "Arquivos mapeados", verified: true },
    ],
    simplifications: [
      "A cache de páginas guarda a página i do arquivo no quadro i; na prática o quadro é qualquer um livre.",
      "Não há leitura antecipada: o núcleo real costuma trazer várias páginas por falta.",
      "A gravação das páginas sujas no disco aparece só no texto.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "tocadas", kind: "int", label: "Páginas que A lê", min: 1, max: FILE_PAGES },
      {
        key: "modo",
        kind: "choice",
        label: "Modo do mapeamento",
        options: [
          { value: "shared", label: "MAP_SHARED" },
          { value: "private", label: "MAP_PRIVATE" },
        ],
      },
    ],
  },
  build,
  practice,
  intro: {
    text: "Em vez de pedir bytes com read(), um processo pode mapear o arquivo na própria memória e lê-lo com instruções comuns. Você vai ver as páginas chegarem por falta, dois processos dividirem o mesmo quadro e o que acontece numa escrita.",
    facts: [
      ["Arquivo", `${FILE_PAGES * PAGE_KIB} KiB`],
      ["Processos", "A e B"],
      ["Página", `${PAGE_KIB} KiB`],
    ],
  },
  outro: {
    title: "mmap em resumo",
    text: "mapear não lê nada; cada página chega na primeira falta. Se a página já está na cache, a falta é menor e só cria a tradução. MAP_SHARED faz a escrita aparecer para todos e chegar ao arquivo; MAP_PRIVATE copia a página na primeira escrita. Comparado a read(), some a cópia para o buffer.",
    facts: (r) => [
      ["Faltas maiores", String(r.stats.major)],
      ["Faltas menores", String(r.stats.minor)],
      ["Quadros no fim", String(r.stats.frames)],
    ],
  },
  next: ["paginacao-tlb", "fork-exec", "ipc"],
};

export default lesson;
