import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import {
  eat,
  flatBytes,
  type Region,
  split,
  tablesFor,
  walkAccesses,
  X86_32,
  X86_64,
} from "../../../sim/os/multilevel.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { paginacaoMultinivel as practice } from "../practice.ts";

/**
 * Why page tables are trees: a flat table for 32 bits already costs 4 MiB per process, two levels
 * allocate only what is used, x86-64 needs four, each TLB miss pays one access per level, and huge
 * pages cut a level and widen the TLB's reach.
 */
export const DEFAULTS = { endereco: "0A0123AB", heap: 8, acerto: 98 };
const MiB = 2 ** 20;
const MEM_NS = 100;
const ADDR64 = 0x7ffd12345678n;
const TLB_ENTRIES = 64;

const hex = (n: number | bigint, w = 8) => `0x${n.toString(16).toUpperCase().padStart(w, "0")}`;

function clamp(p: Params) {
  const raw = String(p.endereco ?? DEFAULTS.endereco).replace(/^0x/i, "");
  const addr = /^[0-9a-fA-F]{1,8}$/.test(raw)
    ? Number.parseInt(raw, 16)
    : Number.parseInt(DEFAULTS.endereco, 16);
  const heap = Math.min(64, Math.max(1, Math.round(Number(p.heap ?? DEFAULTS.heap))));
  const hit = Math.min(99, Math.max(80, Math.round(Number(p.acerto ?? DEFAULTS.acerto))));
  return { addr, heap, hit };
}

const regionsFor = (heap: number): Region[] => [
  { name: "código", start: 0x08048000, bytes: MiB },
  { name: "heap", start: 0x0a000000, bytes: heap * MiB },
  { name: "pilha", start: 0xbff00000, bytes: MiB },
];

const NODE = { w: 104, h: 40 } as const;
function scene(p: Params): SceneSpec {
  const { addr } = clamp(p);
  return {
    viewBox: [960, 640],
    nodes: [
      { id: "cr3a", kind: "box", label: "CR3", at: [90, 165], w: 80, h: 40 },
      { id: "dir", kind: "box", label: "Diretório", at: [280, 165], ...NODE },
      { id: "tab", kind: "box", label: "Tabela", at: [470, 165], ...NODE },
      { id: "pag", kind: "box", label: "Página", at: [660, 165], ...NODE },
      { id: "cr3b", kind: "box", label: "CR3", at: [90, 290], w: 80, h: 40, hidden: true },
      { id: "l4", kind: "box", label: "PML4", at: [230, 290], ...NODE, hidden: true },
      { id: "l3", kind: "box", label: "PDPT", at: [380, 290], ...NODE, hidden: true },
      { id: "l2", kind: "box", label: "PD", at: [530, 290], ...NODE, hidden: true },
      { id: "l1", kind: "box", label: "PT", at: [680, 290], ...NODE, hidden: true },
      { id: "pag64", kind: "box", label: "Página", at: [840, 290], ...NODE, hidden: true },
    ],
    links: [
      { id: "a1", from: "cr3a", to: "dir" },
      { id: "a2", from: "dir", to: "tab" },
      { id: "a3", from: "tab", to: "pag" },
      { id: "b1", from: "cr3b", to: "l4" },
      { id: "b2", from: "l4", to: "l3" },
      { id: "b3", from: "l3", to: "l2" },
      { id: "b4", from: "l2", to: "l1" },
      { id: "b5", from: "l1", to: "pag64" },
    ],
    widgets: [
      {
        kind: "grid",
        id: "bits",
        title: `Endereço ${hex(addr)}: diretório (10) · tabela (10) · deslocamento (12)`,
        at: [40, 50],
        cols: 32,
        rows: 1,
        cellW: 20,
        indexLabel: "none",
      },
      {
        kind: "table",
        id: "regioes",
        title: "Tabelas que o processo realmente usa",
        at: [40, 390],
        columns: ["Região", "Início", "Tamanho", "Tabelas"],
        widths: [80, 110, 80, 70],
        rows: 4,
      },
      {
        kind: "table",
        id: "x64",
        title: `x86-64: ${hex(ADDR64, 12)}`,
        at: [420, 390],
        columns: ["Nível", "Bits", "Índice"],
        widths: [110, 70, 70],
        rows: 5,
      },
      { kind: "counter", id: "acessos", title: "Acessos à memória", at: [720, 390] },
      { kind: "counter", id: "tamanho", title: "Memória em tabelas", at: [720, 480] },
      { kind: "counter", id: "medio", title: "Acesso médio", at: [720, 570] },
    ],
  };
}

const kib = (bytes: number) =>
  bytes >= MiB ? `${(bytes / MiB).toString().replace(".", ",")} MiB` : `${bytes / 1024} KiB`;
const ns = (v: number) => `${Number(v.toFixed(1)).toString().replace(".", ",")} ns`;

export function build(p: Params) {
  const { addr, heap, hit } = clamp(p);
  const b = lessonBuilder();
  const c = talk(
    b,
    {
      cr3a: "CR3",
      cr3b: "CR3",
      dir: "diretório",
      tab: "tabela",
      pag: "página",
      pag64: "página",
      l4: "PML4",
      l3: "PDPT",
      l2: "PD",
      l1: "PT",
    },
    (t) => String(t),
  );
  const flat = flatBytes(X86_32);
  const s32 = split(BigInt(addr), X86_32);
  const [di, ti] = s32.indices as [number, number];
  const regions = regionsFor(heap);
  const used = tablesFor(regions, X86_32);
  const s64 = split(ADDR64, X86_64);
  const h = hit / 100;
  const avg2 = eat(h, MEM_NS, 2);
  const avg4 = eat(h, MEM_NS, 4);

  const bitsOf = (n: number) => n.toString(2).padStart(32, "0");
  const field = (i: number): Role => (i < 10 ? "a" : i < 20 ? "b" : "muted");
  const drawBits = (mark?: "new") => {
    const s = bitsOf(addr);
    for (let i = 0; i < 32; i++)
      c.cell("bits", i, s[i] as string, {
        dt: i === 0 || i === 10 || i === 20 ? 1 : 0,
        role: mark ? "b" : field(i),
        ...(mark ? { mark } : {}),
      });
  };

  b.step(
    {
      id: "s1-plana",
      title: "Uma tabela grande demais",
      subtitle: `${kib(flat)} por processo`,
      text: `Com endereços de 32 bits e [[pagina|páginas]] de 4 KiB, sobram 20 bits para o número da página: 2^20, cerca de um milhão de páginas. Uma [[tabela-de-paginas]] plana precisa de uma entrada para cada uma, usada ou não. Com 4 bytes por entrada, são ${kib(flat)} por processo, mesmo para um programa que ocupa poucos megabytes. Com cem processos, 400 MiB só de tabelas.`,
      facts: [
        ["Páginas possíveis", "2^20"],
        ["Entrada", "4 bytes"],
        ["Tabela plana", kib(flat)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: "Quantos MiB ocupa uma tabela plana de 2^20 entradas de 4 bytes?",
        answer: flat / MiB,
        explain: "2^20 × 4 bytes = 2^22 bytes = 4 MiB.",
      },
    },
    () => {
      drawBits("new");
      c.count("tamanho", kib(flat), { label: `tabela plana: ${kib(flat)}` });
    },
  );

  b.step(
    {
      id: "s2-dois-niveis",
      title: "Uma tabela de tabelas",
      subtitle: `diretório ${di}, tabela ${ti}`,
      text: `A saída é dividir os 20 bits em dois índices de 10. Os primeiros escolhem uma entrada do diretório, que aponta para uma tabela de 1024 entradas; os seguintes escolhem a entrada dessa tabela, que dá o [[quadro]]. Em ${hex(addr)}, o diretório usa a entrada ${di}, a tabela usa a entrada ${ti} e o deslocamento é ${hex(s32.offset, 3)}. O registrador CR3 guarda onde está o diretório do processo atual.`,
      facts: [
        ["Diretório", `entrada ${di}`],
        ["Tabela", `entrada ${ti}`],
        ["Deslocamento", hex(s32.offset, 3)],
      ],
      highlight: ["dir", "tab"],
    },
    () => {
      drawBits();
      c.send("cr3a", "dir", "CR3", { what: "endereço do diretório" });
      c.state("dir", `[${di}]`, { label: `diretório[${di}] aponta a tabela` });
      c.send("dir", "tab", `[${di}]`, { what: "aponta a tabela" });
      c.state("tab", `[${ti}]`, { label: `tabela[${ti}] dá o quadro` });
      c.send("tab", "pag", `[${ti}]`, { what: "dá o quadro" });
      c.state("pag", `+ ${hex(s32.offset, 3)}`, { tone: "good", label: `quadro + ${hex(s32.offset, 3)}` });
      c.count("acessos", "3", { label: "diretório, tabela e o dado: 3 acessos" });
    },
  );

  b.step(
    {
      id: "s3-economia",
      title: "Só existe o necessário",
      subtitle: `${used.total} tabelas, ${kib(used.total * 4096)}`,
      text: `A vantagem aparece num espaço de endereços esparso. Este processo tem código embaixo, heap de ${heap} MiB no meio e pilha lá em cima, e o resto do diretório fica vazio. Cada tabela de segundo nível cobre 4 MiB, então só existem as que tocam alguma região. Junto com o diretório, são ${used.total} tabelas de 4 KiB, ${kib(used.total * 4096)}, contra ${kib(flat)} da tabela plana.`,
      facts: [
        ["Tabelas", String(used.total)],
        ["Memória", kib(used.total * 4096)],
        ["Cada tabela cobre", "4 MiB"],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Contando o diretório, quantas tabelas de 4 KiB esse processo usa?`,
        answer: used.total,
        explain: `Diretório (1) + código (${used.perRegion[0]}) + heap (${used.perRegion[1]}) + pilha (${used.perRegion[2]}) = ${used.total}.`,
      },
    },
    () => {
      regions.forEach((r, i) => {
        c.row("regioes", i, [r.name, hex(r.start), kib(r.bytes), String(used.perRegion[i])], {
          dt: 1,
          mark: "new",
          log: { who: r.name, what: hex(r.start), detail: `${used.perRegion[i]} tabela(s)` },
        });
      });
      c.row("regioes", 3, ["total", "", "", `${used.total}`], { dt: 1, mark: "hit" });
      c.count("tamanho", kib(used.total * 4096), {
        label: `${used.total} tabelas: ${kib(used.total * 4096)}`,
      });
    },
  );

  const names = ["PML4", "PDPT", "PD", "PT"];
  const ids = ["l4", "l3", "l2", "l1"];
  b.step(
    {
      id: "s4-quatro-niveis",
      title: "Quatro níveis no x86-64",
      subtitle: "9 + 9 + 9 + 9 + 12 bits",
      text: `Com 48 bits de endereço virtual, dois níveis não bastam: cada tabela ocuparia muito mais que uma página. O x86-64 usa quatro níveis de 9 bits, e cada tabela tem 512 entradas de 8 bytes, exatamente 4 KiB. O endereço ${hex(ADDR64, 12)}, típico de uma pilha, usa as entradas ${s64.indices.join(", ")} e o deslocamento ${hex(s64.offset, 3)}. Processadores recentes já têm um quinto nível, para 57 bits.`,
      facts: [
        ["Níveis", "4"],
        ["Entradas por tabela", "512"],
        ["Índices", s64.indices.join(" · ")],
      ],
      highlight: ids,
    },
    () => {
      c.show(["cr3b", ...ids, "pag64"], { dt: 1, label: "a hierarquia do x86-64" });
      let prev = "cr3b";
      s64.indices.forEach((ix, k) => {
        const id = ids[k] as string;
        c.send(prev, id, k === 0 ? "CR3" : `[${s64.indices[k - 1]}]`, { what: `lê ${names[k]}` });
        c.state(id, `[${ix}]`, { label: `${names[k]}[${ix}]` });
        c.row("x64", k, [names[k] as string, "9", String(ix)], { mark: "new" });
        prev = id;
      });
      c.send(prev, "pag64", `[${s64.indices[3]}]`, { what: "dá o quadro" });
      c.state("pag64", `+ ${hex(s64.offset, 3)}`, { tone: "good", label: "quadro + deslocamento" });
      c.row("x64", 4, ["deslocamento", "12", hex(s64.offset, 3)], { mark: "new" });
      c.count("acessos", String(walkAccesses(4)), { label: `${walkAccesses(4)} acessos para um dado` });
    },
  );

  b.step(
    {
      id: "s5-custo",
      title: "O preço de cada nível",
      subtitle: `${ns(avg4)} em média`,
      text: `Cada nível é uma leitura de memória. Sem atalho, buscar um dado no x86-64 custa ${walkAccesses(4)} acessos: quatro tabelas e o dado. A [[tlb]] guarda traduções prontas; com ${hit}% de acertos e ${MEM_NS} ns por acesso, a média fica em ${ns(avg4)}, contra ${ns(avg2)} com dois níveis. ${hit >= 95 ? "As falhas são raras, mas cada uma custa caro" : "Com tantas falhas, a caminhada domina o tempo"}, e por isso os processadores também guardam em cache os níveis superiores da tabela.`,
      facts: [
        ["Falha na TLB", `${walkAccesses(4)} acessos`],
        ["Acerto na TLB", "1 acesso"],
        ["Média", ns(avg4)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Com ${hit}% de acertos na TLB, ${MEM_NS} ns por acesso e 4 níveis, qual o tempo médio em ns? (Ignore o tempo da própria TLB.)`,
        answer: Number(avg4.toFixed(1)),
        explain: `${hit}% × ${MEM_NS} + ${100 - hit}% × ${walkAccesses(4) * MEM_NS} = ${ns(avg4)}.`,
      },
    },
    () => {
      c.count("medio", ns(avg4), { dt: 1, label: `média com ${hit}% de acertos: ${ns(avg4)}` });
    },
  );

  const reach4k = TLB_ENTRIES * 4 * 1024;
  const reach2m = TLB_ENTRIES * 2 * MiB;
  b.step(
    {
      id: "s6-grandes",
      title: "Páginas grandes",
      subtitle: `${kib(reach4k)} → ${kib(reach2m)}`,
      text: `Se a entrada do PD apontar direto para uma página de 2 MiB, a caminhada para um nível antes: são ${walkAccesses(3)} acessos em vez de ${walkAccesses(4)}, e o deslocamento passa a ter 21 bits. O ganho maior é na TLB: ${TLB_ENTRIES} entradas cobrem ${kib(reach4k)} com páginas de 4 KiB e ${kib(reach2m)} com páginas de 2 MiB. Bancos de dados e máquinas virtuais usam páginas grandes para errar menos na TLB.`,
      facts: [
        ["Acessos na falha", String(walkAccesses(3))],
        ["Alcance com 4 KiB", kib(reach4k)],
        ["Alcance com 2 MiB", kib(reach2m)],
      ],
      highlight: ["l2"],
    },
    () => {
      c.state("l1", "pulado", { tone: "none", label: "a PT não é consultada", dt: 1 });
      c.state("l2", `[${s64.indices[2]}] 2 MiB`, { tone: "good", label: "o PD aponta a página grande" });
      c.count("acessos", String(walkAccesses(3)), {
        label: `${walkAccesses(3)} acessos com página de 2 MiB`,
      });
    },
  );

  return b.done({
    flatMiB: flat / MiB,
    dir: di,
    table: ti,
    tables: used.total,
    idx64: s64.indices.join(","),
    eat4: Number(avg4.toFixed(1)),
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "paginacao-multinivel",
    site: "so",
    title: "Tabelas de páginas multinível",
    summary:
      "Por que a tabela de páginas virou uma árvore: o custo da tabela plana, dois níveis em 32 bits, quatro no x86-64, quanto cada falha na TLB custa e o que as páginas grandes economizam.",
    area: "Memória",
    refs: [
      {
        book: "tanenbaum-mos",
        chapter: 3,
        section: "3.3.4",
        note: "Tabelas de páginas para memórias grandes",
        verified: true,
      },
      { book: "maziero-so", chapter: 14, section: "14.7.3", note: "Tabelas multiníveis", verified: true },
    ],
    simplifications: [
      "Cada leitura de tabela custa um acesso inteiro à memória; na prática, caches de dados e de caminhada reduzem esse custo.",
      "As regiões do processo e o endereço de 48 bits são exemplos fixos.",
      "O tempo de consulta da própria TLB é ignorado.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "endereco",
        kind: "text",
        label: "Endereço de 32 bits (hexadecimal)",
        maxLength: 10,
        pattern: "^(0x)?[0-9a-fA-F]{1,8}$",
        placeholder: DEFAULTS.endereco,
      },
      { key: "heap", kind: "int", label: "Tamanho do heap (MiB)", min: 1, max: 64 },
      { key: "acerto", kind: "int", label: "Acertos na TLB (%)", min: 80, max: 99 },
    ],
  },
  build,
  intro: {
    text: "Cada processo tem uma tabela de páginas, e uma tabela que cobre todo o espaço de endereços seria enorme. Você vai ver como dividir o número da página em índices transforma a tabela numa árvore que só ocupa o que o processo usa.",
    facts: [
      ["Endereço", hex(Number.parseInt(DEFAULTS.endereco, 16))],
      ["Página", "4 KiB"],
      ["Níveis no x86-64", "4"],
    ],
  },
  outro: {
    title: "Paginação multinível em resumo",
    text: "Dividir o número da página em índices faz da tabela uma árvore: só existem as tabelas que cobrem regiões usadas. O preço é uma leitura por nível em cada falha na TLB, e por isso a TLB e as páginas grandes importam tanto em 64 bits.",
    facts: (run) => [
      ["Tabela plana", `${run.stats.flatMiB} MiB`],
      ["Tabelas usadas", String(run.stats.tables)],
      ["Acesso médio", `${String(run.stats.eat4).replace(".", ",")} ns`],
    ],
  },
  next: ["paginacao-tlb", "substituicao-paginas"],
  practice,
};

export default lesson;
