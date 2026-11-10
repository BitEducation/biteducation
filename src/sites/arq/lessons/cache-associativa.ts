import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { type CacheAccess, type CacheConfig, runCache } from "../../../sim/arch/cache.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { num } from "../../shared/practice-kit.ts";
import { cacheAssociativa as practice } from "../practice.ts";

/**
 * Set-associative caches and the hierarchy. Three blocks that collide on one line of a
 * direct-mapped cache stop colliding with 2 and 4 ways; full associativity costs one comparator
 * per line. Then the average access time through L1, L2, L3 and memory.
 */
const A = 0x1000;
const B = 0x1080;
const C = 0x1100;
const D = 0x1010;
export const SEQ = [A, B, A, B, C, A, B, A, D, A, B, C];
const NAME = new Map([
  [A, "A"],
  [B, "B"],
  [C, "C"],
  [D, "D"],
]);
const LINES = 8;
const cfg = (ways: number): CacheConfig => ({
  addrBits: 16,
  lines: LINES,
  blockSize: 16,
  ways,
  policy: "lru",
});
export const LEVELS = [
  { name: "L1", ns: 1 },
  { name: "L2", ns: 4, miss: 0.4 },
  { name: "L3", ns: 12, miss: 0.5 },
  { name: "Memória", ns: 80 },
] as const;
export const DEFAULTS = { vias: "4", falhaL1: 10 };

/** Average memory access time through the chain: t1 + m1·(t2 + m2·(t3 + m3·tmem)). */
export function amatChain(m1: number): number {
  const [l1, l2, l3, mem] = LEVELS;
  return l1.ns + m1 * (l2.ns + l2.miss * (l3.ns + l3.miss * mem.ns));
}

function clamp(p: Params) {
  const w = Number(p.vias);
  const ways = [2, 4, 8].includes(w) ? w : 4;
  const m1 = Math.min(20, Math.max(2, Math.round(Number(p.falhaL1 ?? DEFAULTS.falhaL1))));
  return { ways, m1 };
}

function scene(): SceneSpec {
  return {
    viewBox: [960, 640],
    nodes: [
      { id: "cpu", kind: "cpu", label: "CPU", at: [80, 70], w: 110 },
      { id: "l1", kind: "cache", label: "L1", sub: `${LEVELS[0].ns} ns`, at: [260, 70], w: 130 },
      { id: "l2", kind: "cache", label: "L2", sub: `${LEVELS[1].ns} ns`, at: [440, 70], w: 130 },
      { id: "l3", kind: "cache", label: "L3", sub: `${LEVELS[2].ns} ns`, at: [620, 70], w: 130 },
      { id: "mem", kind: "memory", label: "Memória", sub: `${LEVELS[3].ns} ns`, at: [830, 70], w: 150 },
    ],
    links: [
      { id: "l-a", from: "cpu", to: "l1", style: "bus" },
      { id: "l-b", from: "l1", to: "l2", style: "bus" },
      { id: "l-c", from: "l2", to: "l3", style: "bus" },
      { id: "l-d", from: "l3", to: "mem", style: "bus" },
    ],
    widgets: [
      {
        kind: "table",
        id: "linhas",
        title: `L1 com ${LINES} linhas de 16 B`,
        at: [40, 160],
        columns: ["Conj.via", "Bloco", "Último uso"],
        widths: [110, 110, 140],
        rows: LINES,
      },
      { kind: "counter", id: "acertos", title: `Acertos em ${SEQ.length} leituras`, at: [40, 470] },
      {
        kind: "table",
        id: "cmp",
        title: "Mesma sequência, mais vias",
        at: [450, 160],
        columns: ["Vias", "Conjuntos", "Comparadores", "Acertos"],
        widths: [90, 120, 150, 110],
        rows: 4,
      },
      {
        kind: "table",
        id: "hier",
        title: "A hierarquia",
        at: [450, 370],
        columns: ["Nível", "Tempo", "Falha local", "Típico"],
        widths: [110, 90, 120, 160],
        rows: 4,
      },
      { kind: "counter", id: "amat", title: "Tempo médio por acesso", at: [260, 470] },
    ],
  };
}

export function build(p: Params) {
  const { ways, m1 } = clamp(p);
  const runs = new Map([1, 2, 4, 8].map((w) => [w, runCache(cfg(w), SEQ)]));
  const get = (w: number) => runs.get(w) ?? runCache(cfg(w), SEQ);
  const r1 = get(1);
  const r2 = get(2);
  const rw = get(ways);
  const t = amatChain(m1 / 100);
  const b = lessonBuilder();
  const c = talk(b, { cpu: "CPU", l1: "L1" }, (x) => `t${x}`);
  const label = (w: number, line: number) => (w === 1 ? String(line) : `${Math.floor(line / w)}.${line % w}`);
  const clear = (w: number) => {
    for (let i = 0; i < LINES; i++) c.row("linhas", i, [label(w, i), "—", ""], { dt: 0 });
  };
  const play = (w: number, acc: CacheAccess[]) => {
    clear(w);
    let hits = 0;
    for (const a of acc) {
      const nm = NAME.get(a.addr) ?? "?";
      if (a.hit) hits++;
      c.state("l1", a.hit ? `${nm}: acerto` : `${nm}: falha`, { tone: a.hit ? "good" : "bad" });
      c.row("linhas", a.line, [label(w, a.line), nm, `leitura ${a.i + 1}`], {
        dt: 0,
        mark: a.hit ? "hit" : a.evictedTag !== null ? "bad" : "miss",
      });
      c.count("acertos", String(hits), { label: `${hits} acertos` });
    }
  };
  const sets = (w: number) => LINES / w;

  b.step(
    {
      id: "s1-direta",
      title: "Três blocos, uma linha",
      subtitle: `${r1.hits} acerto em ${SEQ.length}`,
      text: `Na cache de [[mapeamento-direto|mapeamento direto]], cada bloco tem uma única linha possível. O programa alterna entre os blocos A, B e C, e os três caem na linha 0. Cada um expulsa o anterior: das ${SEQ.length} leituras, só ${r1.hits} ${r1.hits === 1 ? "acerta" : "acertam"}, e ${r1.byKind.conflito} falhas são de conflito. Enquanto isso, ${LINES - 2} das ${LINES} linhas nunca são usadas.`,
      facts: [
        ["Acertos", String(r1.hits)],
        ["Falhas de conflito", String(r1.byKind.conflito)],
        ["Linhas sem uso", String(LINES - 2)],
      ],
      highlight: ["linhas", "l1"],
    },
    () => play(1, r1.accesses),
  );

  b.step(
    {
      id: "s2-vias",
      title: "Duas vias por conjunto",
      subtitle: `${r2.hits} acertos`,
      text: `Numa cache [[associativa-por-conjunto|associativa por conjunto]] de 2 vias, as ${LINES} linhas viram ${sets(2)} conjuntos de 2. O índice escolhe o conjunto, e o bloco pode ficar em qualquer uma das vias; as duas tags são comparadas ao mesmo tempo. A e B agora convivem no conjunto 0. Quando C chega, sai o bloco usado há mais tempo, pela política [[lru|LRU]]. Acertos: ${r2.hits}.`,
      facts: [
        ["Conjuntos", String(sets(2))],
        ["Vias", "2"],
        ["Acertos", String(r2.hits)],
      ],
      highlight: ["linhas"],
      quiz: {
        kind: "number",
        prompt: `Uma cache tem ${LINES} linhas e é associativa de ${ways} vias. Quantos conjuntos ela tem?`,
        answer: sets(ways),
        explain: `Cada conjunto agrupa ${ways} linhas: ${LINES} ÷ ${ways} = ${sets(ways)}. O índice do endereço precisa de log₂(${sets(ways)}) = ${Math.log2(sets(ways))} bits.`,
      },
    },
    () => play(2, r2.accesses),
  );

  b.step(
    {
      id: "s3-mais-vias",
      title: `Com ${ways} vias`,
      subtitle: `${rw.hits} acertos`,
      text: `Com ${ways} vias, ${sets(ways) === 1 ? "há um conjunto só: a cache é totalmente associativa" : `há ${sets(ways)} conjuntos`}. ${rw.byKind.conflito === 0 ? `A, B e C cabem juntos, e sobram só as ${rw.byKind.compulsório} falhas compulsórias, a primeira vez de cada bloco.` : `Ainda há ${rw.byKind.conflito} falhas de conflito.`} A tabela compara a mesma sequência de leituras com 1, 2, 4 e 8 vias: a partir de certo ponto, mais vias não trazem nada.`,
      facts: [
        ["Vias", String(ways)],
        ["Acertos", String(rw.hits)],
        ["Falhas de conflito", String(rw.byKind.conflito)],
      ],
      highlight: ["cmp", "linhas"],
    },
    () => {
      play(ways, rw.accesses);
      [1, 2, 4, 8].forEach((w, i) => {
        c.row("cmp", i, [String(w), String(sets(w)), String(w), String(get(w).hits)], {
          dt: 1,
          mark: w === ways ? "hit" : "new",
        });
      });
    },
  );

  b.step(
    {
      id: "s4-custo",
      title: "O preço das vias",
      subtitle: "Um comparador por via",
      text: `Cada via precisa de um comparador de tag funcionando em paralelo a cada acesso, e de um multiplexador para escolher o dado. Com ${LINES} vias, são ${LINES} comparações por leitura: mais energia, mais área e um caminho mais lento justo na cache que precisa responder em poucos ciclos. Por isso a L1 dos processadores atuais usa de 8 a 12 vias, e não é totalmente associativa.`,
      facts: [
        ["Comparadores, 2 vias", "2"],
        [`Comparadores, ${LINES} vias`, String(LINES)],
        ["L1 típica", "8 a 12 vias"],
      ],
      highlight: ["cmp"],
      quiz: {
        kind: "choice",
        prompt: "Se a cache totalmente associativa elimina as falhas de conflito, por que a L1 não é assim?",
        options: [
          "Comparar a tag com todas as linhas a cada acesso custa tempo, área e energia",
          "Porque falhas de conflito não existem em programas reais",
          "Porque a política LRU não funciona com muitas vias",
        ],
        answer: 0,
        explain:
          "Mais vias quer dizer mais comparadores ligados ao mesmo tempo e um seletor maior. Na L1, que precisa responder em ~4 ciclos, isso pesa mais que algumas falhas de conflito.",
      },
    },
    () => {
      c.state("l1", `${ways} comparadores por leitura`, { tone: "active" });
    },
  );

  b.step(
    {
      id: "s5-hierarquia",
      title: "L1, L2, L3 e memória",
      subtitle: `${num(t)} ns em média`,
      text: `Uma falha na L1 não vai direto à memória: passa pela L2 e pela L3, cada uma maior e mais lenta. O tempo médio é L1 + falha da L1 × (L2 + falha da L2 × (L3 + falha da L3 × memória)). Com ${m1}% de falhas na L1, ${LEVELS[1].miss * 100}% na L2 e ${LEVELS[2].miss * 100}% na L3, ele fica em ${num(t)} ns, contra ${LEVELS[3].ns} ns sem nenhuma cache.`,
      facts: [
        ["Falha na L1", `${m1}%`],
        ["Tempo médio", `${num(t)} ns`],
        ["Só a memória", `${LEVELS[3].ns} ns`],
      ],
      highlight: ["hier", "amat"],
      quiz: {
        kind: "number",
        prompt: `L1 de ${LEVELS[0].ns} ns com ${m1}% de falhas, L2 de ${LEVELS[1].ns} ns com ${LEVELS[1].miss * 100}%, L3 de ${LEVELS[2].ns} ns com ${LEVELS[2].miss * 100}% e memória de ${LEVELS[3].ns} ns. Qual o tempo médio por acesso, em ns?`,
        answer: Math.round(t * 100) / 100,
        tolerance: 0.05,
        unit: "ns",
        explain: `De dentro para fora: ${LEVELS[2].ns} + ${num(LEVELS[2].miss)} × ${LEVELS[3].ns} = ${num(LEVELS[2].ns + LEVELS[2].miss * LEVELS[3].ns)}; ${LEVELS[1].ns} + ${num(LEVELS[1].miss)} × isso = ${num(LEVELS[1].ns + LEVELS[1].miss * (LEVELS[2].ns + LEVELS[2].miss * LEVELS[3].ns))}; ${LEVELS[0].ns} + ${num(m1 / 100)} × isso = ${num(t)} ns.`,
      },
    },
    () => {
      c.row("hier", 0, ["L1", `${LEVELS[0].ns} ns`, `${m1}%`, "32 a 48 KiB por núcleo"], {
        dt: 1,
        mark: "new",
      });
      c.row("hier", 1, ["L2", `${LEVELS[1].ns} ns`, `${LEVELS[1].miss * 100}%`, "1 a 2 MiB por núcleo"], {
        dt: 1,
        mark: "new",
      });
      c.row("hier", 2, ["L3", `${LEVELS[2].ns} ns`, `${LEVELS[2].miss * 100}%`, "dezenas de MiB, dividida"], {
        dt: 1,
        mark: "new",
      });
      c.row("hier", 3, ["Memória", `${LEVELS[3].ns} ns`, "—", "gigabytes"], { dt: 1, mark: "warn" });
      c.count("amat", `${num(t)} ns`, { label: `${num(t)} ns` });
    },
  );

  b.step(
    {
      id: "s6-niveis",
      title: "Por que vários níveis",
      subtitle: "Pequeno e rápido, grande e lento",
      text: `Uma cache não pode ser ao mesmo tempo enorme e rápida: quanto maior, mais longe ficam as linhas e mais tempo leva para achar uma. A saída é empilhar. A L1, pequena, fica colada no núcleo; a L2 pega quase tudo o que a L1 perde; a L3 é dividida entre os núcleos e evita a viagem à memória. Cada nível só precisa ser bom para o que o anterior não segurou.`,
      facts: [
        ["L1", "por núcleo, ~4 ciclos"],
        ["L3", "dividida entre núcleos"],
        ["Memória", "centenas de ciclos"],
      ],
      highlight: ["l1", "l2", "l3"],
    },
    () => {
      c.send("cpu", "l1", "lw", { what: "leitura", detail: "falha na L1" });
      c.send("l1", "l2", "pede o bloco", { what: "falha", detail: "L2 acerta" });
      c.send("l2", "l1", "bloco", { role: "b", what: "resposta", detail: "4 ns" });
    },
  );

  return b.done({ direct: r1.hits, two: r2.hits, chosen: rw.hits, amat: Math.round(t * 100) / 100 });
}

const lesson: LessonModule = {
  meta: {
    slug: "cache-associativa",
    site: "arq",
    title: "Cache associativa e hierarquia",
    summary:
      "Três blocos que brigam por uma linha na cache direta convivem com 2 e 4 vias. Mais vias custam comparadores; por isso existem L1, L2 e L3, e o tempo médio de acesso atravessa os três níveis.",
    area: "Memória",
    refs: [
      { book: "tanenbaum-sco", chapter: 4, section: "4.5.1", note: "Memória cache", verified: true },
      { book: "tanenbaum-sco", chapter: 2, section: "2.2.5", note: "Memória cache", verified: true },
    ],
    simplifications: [
      "Uma cache de 8 linhas; a sequência de leituras foi escolhida para provocar conflitos.",
      "As taxas de falha da L2 e da L3 são fixas e locais: de quem chegou até elas.",
      "Os tempos por nível são ordens de grandeza, não de um processador específico.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "vias",
        kind: "choice",
        label: "Vias no passo 3",
        options: [
          { value: "2", label: "2 vias" },
          { value: "4", label: "4 vias" },
          { value: "8", label: "8 vias (totalmente associativa)" },
        ],
      },
      { key: "falhaL1", kind: "int", label: "Falhas na L1 (%)", min: 2, max: 20 },
    ],
  },
  build,
  practice,
  intro: {
    text: "Na cache de mapeamento direto, dois blocos que caem na mesma linha se expulsam, mesmo com o resto vazio. Você vai dar mais lugares a cada bloco, ver quanto isso custa e seguir uma falha pelos três níveis de cache até a memória.",
    facts: [
      ["Linhas", String(LINES)],
      ["Leituras", String(SEQ.length)],
      ["Níveis", "L1, L2, L3"],
    ],
  },
  outro: {
    title: "Associatividade em resumo",
    text: "Com mapeamento direto, cada bloco tem um lugar; com n vias, n lugares dentro de um conjunto, e as falhas de conflito caem. Cada via custa um comparador, por isso as caches param em 8 a 16 vias. A hierarquia empilha caches cada vez maiores e mais lentas, e o tempo médio fica perto do da L1.",
    facts: (r) => [
      ["Acertos, direta", String(r.stats.direct)],
      ["Acertos, 2 vias", String(r.stats.two)],
      ["Tempo médio", `${num(Number(r.stats.amat))} ns`],
    ],
  },
  next: ["politicas-escrita", "coerencia-mesi", "dram"],
};

export default lesson;
