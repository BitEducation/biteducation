import type { Frame, LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import {
  amat,
  type CacheAccess,
  type CacheConfig,
  type CacheResult,
  type MissKind,
  runCache,
  splitAddress,
} from "../../../sim/arch/cache.ts";
import { type LessonBuilder, lessonBuilder } from "../../../sim/shared/builder.ts";
import { cacheDireta as practice } from "../practice.ts";

/**
 * Direct-mapped cache. Worked by hand:
 * 12 reads, 5 hits, 4 compulsory and 3 conflict misses; with 2 ways, 8 hits.
 */
export const SEQ = [
  0x1a04, 0x1a08, 0x1a1c, 0x1a0c, 0x2a00, 0x1a04, 0x2a04, 0x1a14, 0x3020, 0x3024, 0x1a00, 0x1a1f,
];
export const BASE: CacheConfig = { addrBits: 16, lines: 8, blockSize: 16, ways: 1, policy: "lru" };
export const HIT_NS = 1;
export const PENALTY_NS = 100;
const MAX_ACCESSES = 24;

const hex = (n: number, w = 4) => `0x${n.toString(16).toUpperCase().padStart(w, "0")}`;
const pct = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")}%`;
const MISS_LABEL: Record<MissKind, string> = {
  compulsório: "compulsória",
  capacidade: "de capacidade",
  conflito: "de conflito",
};
const ns = (x: number) => `${x.toFixed(1).replace(".", ",")} ns`;

export function parseAddrs(raw: string): number[] {
  const parts = raw
    .trim()
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (parts.length === 0) throw new Error("Informe ao menos um endereço");
  if (parts.length > MAX_ACCESSES) throw new Error(`No máximo ${MAX_ACCESSES} endereços`);
  return parts.map((p) => {
    const v = /^0x[0-9a-f]{1,4}$/i.test(p)
      ? Number.parseInt(p.slice(2), 16)
      : /^\d{1,5}$/.test(p)
        ? Number(p)
        : Number.NaN;
    if (!Number.isInteger(v) || v < 0 || v > 0xffff)
      throw new Error(`Endereço inválido: ${p} (use 0x0000 a 0xFFFF)`);
    return v;
  });
}

function config(p: Params): CacheConfig {
  const ways = Number(p.vias ?? 1);
  return {
    ...BASE,
    ways: [1, 2, 4].includes(ways) ? ways : 1,
    policy: p.politica === "fifo" ? "fifo" : "lru",
  };
}

const rowLabel = (cfg: CacheConfig, line: number) =>
  cfg.ways === 1 ? String(line) : `${Math.floor(line / cfg.ways)}.${line % cfg.ways}`;

function scene(p: Params): SceneSpec {
  const cfg = config(p);
  return {
    viewBox: [960, 600],
    zones: [{ id: "cpu-z", title: "Processador", rect: { x: 20, y: 20, w: 600, h: 400 }, tone: "cpu" }],
    nodes: [
      { id: "cpu", kind: "cpu", label: "CPU", sub: "lw", at: [110, 90], w: 120 },
      {
        id: "cache",
        kind: "cache",
        label: "Cache",
        sub: cfg.ways === 1 ? "mapeamento direto" : `${cfg.ways} vias`,
        at: [420, 90],
        w: 170,
      },
      {
        id: "mem",
        kind: "memory",
        label: "Memória",
        sub: `${PENALTY_NS} ns por bloco`,
        at: [830, 90],
        w: 150,
      },
    ],
    links: [
      { id: "l-cpu-cache", from: "cpu", to: "cache", style: "bus" },
      { id: "l-cache-mem", from: "cache", to: "mem", style: "bus" },
    ],
    widgets: [
      {
        kind: "table",
        id: "linhas",
        title:
          cfg.ways === 1
            ? "Linhas da cache (8 × 16 B)"
            : `Conjuntos.vias (${cfg.lines / cfg.ways} × ${cfg.ways})`,
        at: [60, 170],
        columns: [cfg.ways === 1 ? "Linha" : "Conj.via", "V", "Tag", "Bloco na memória"],
        widths: [80, 40, 80, 300],
        rows: cfg.lines,
      },
      {
        kind: "grid",
        id: "addr",
        title: "Endereço de 16 bits: tag | índice | deslocamento",
        at: [60, 470],
        cols: 16,
        rows: 1,
        cellW: 32,
        indexLabel: "bit",
      },
    ],
  };
}

function addrFrame(cfg: CacheConfig, addr: number, id: string): Frame {
  const s = splitAddress(cfg, addr);
  const bits = Array.from({ length: 16 }, (_, k) => (addr >>> (15 - k)) & 1);
  return {
    id,
    title: `Endereço ${hex(addr)}`,
    summary: `${s.tagBits} bits de tag, ${s.indexBits} de índice e ${s.offsetBits} de deslocamento.`,
    unit: "bit",
    where: "Sai do processador no barramento de endereços",
    data: bits,
    layers: [
      {
        id: "tag",
        label: "Tag",
        role: "a",
        from: 0,
        to: s.tagBits,
        fields: [
          {
            label: "tag",
            value: `${hex(s.tag, 3)} = ${s.tag}`,
            from: 0,
            to: s.tagBits,
            note: "Guardada na linha para saber qual bloco está lá",
          },
        ],
      },
      {
        id: "idx",
        label: "Índice",
        role: "b",
        from: s.tagBits,
        to: s.tagBits + s.indexBits,
        fields: [
          {
            label: cfg.ways === 1 ? "linha" : "conjunto",
            value: String(s.index),
            from: s.tagBits,
            to: s.tagBits + s.indexBits,
            note: "Escolhe onde procurar, sem comparar nada",
          },
        ],
      },
      {
        id: "off",
        label: "Deslocamento",
        role: "s3",
        from: 16 - s.offsetBits,
        to: 16,
        fields: [{ label: "byte no bloco", value: String(s.offset), from: 16 - s.offsetBits, to: 16 }],
      },
    ],
  };
}

interface Ctx {
  b: LessonBuilder;
  cfg: CacheConfig;
  r: CacheResult;
  tick: { n: number };
}

function showAddr(c: Ctx, addr: number, frame?: string) {
  const t = ++c.tick.n;
  const s = splitAddress(c.cfg, addr);
  for (let k = 0; k < 16; k++) {
    const bit = 15 - k;
    const role = k < s.tagBits ? "a" : bit < s.offsetBits ? "s3" : "b";
    c.b.ev({
      t,
      kind: "cell",
      grid: "addr",
      index: k,
      value: String((addr >>> bit) & 1),
      role,
      label: `bit ${bit}`,
      ...(frame && k === 0 ? { frame } : {}),
    });
  }
}

function blockRange(cfg: CacheConfig, addr: number) {
  const start = addr & ~(cfg.blockSize - 1);
  return `${hex(start)}–${hex(start + cfg.blockSize - 1)}`;
}

function play(c: Ctx, a: CacheAccess) {
  const { b, cfg } = c;
  showAddr(c, a.addr);
  const where = cfg.ways === 1 ? `linha ${a.index}` : `conjunto ${a.index}`;
  let t = ++c.tick.n;
  b.ev({ t, kind: "move", from: "cpu", to: "cache", role: "a", label: `lw ${hex(a.addr)}` });
  b.ev({
    t,
    kind: "state",
    target: "cpu",
    text: `lw ${hex(a.addr)}`,
    tone: "active",
    role: "a",
    label: `CPU pede ${hex(a.addr)}`,
  });
  t = ++c.tick.n;
  const tagText = `tag ${hex(a.tag, 3)}`;
  const kindText = a.miss ? `falta ${MISS_LABEL[a.miss]}` : "acerto";
  b.ev({
    t,
    kind: "state",
    target: "cache",
    text: a.hit ? "acerto" : "falta",
    tone: a.hit ? "good" : "bad",
    role: a.hit ? "a" : "bad",
    label: `${hex(a.addr)}: ${kindText}`,
    row: {
      cols: {
        t: `#${a.i + 1}`,
        who: hex(a.addr),
        what: kindText,
        detail: `${where}, ${tagText}${a.evictedTag !== null ? `; expulsa a tag ${hex(a.evictedTag, 3)}` : a.hit ? "" : `; traz ${blockRange(cfg, a.addr)}`}`,
      },
    },
  });
  if (a.hit) {
    b.ev({
      t,
      kind: "row",
      table: "linhas",
      index: a.line,
      cells: rowCells(cfg, a, a.line),
      mark: "hit",
      role: "a",
      label: `Acerto na ${where}`,
    });
    b.ev({ t: ++c.tick.n, kind: "move", from: "cache", to: "cpu", role: "a", label: `${HIT_NS} ns` });
    return;
  }
  b.ev({
    t: ++c.tick.n,
    kind: "move",
    from: "cache",
    to: "mem",
    role: "bad",
    label: `Busca ${blockRange(cfg, a.addr)}`,
  });
  t = ++c.tick.n;
  b.ev({
    t,
    kind: "move",
    from: "mem",
    to: "cache",
    role: "b",
    label: `${cfg.blockSize} bytes, ${PENALTY_NS} ns`,
  });
  b.ev({
    t,
    kind: "row",
    table: "linhas",
    index: a.line,
    cells: rowCells(cfg, a, a.line),
    mark: "new",
    role: "b",
    label: `Bloco entra na ${where}`,
  });
  if (a.evictedTag !== null)
    b.ev({
      t,
      kind: "note",
      at: "cache",
      text: `expulsa a tag ${hex(a.evictedTag, 3)}`,
      tone: "warn",
      role: "warn",
      label: "Expulsão",
    });
  b.ev({ t: ++c.tick.n, kind: "move", from: "cache", to: "cpu", role: "b", label: "Dado entregue" });
}

function rowCells(cfg: CacheConfig, a: CacheAccess, line: number): string[] {
  const l = a.sets[Math.floor(line / cfg.ways)]?.[line % cfg.ways];
  if (!l?.valid) return [rowLabel(cfg, line), "0", "—", "—"];
  const start = (l.tag * (cfg.lines / cfg.ways) + Math.floor(line / cfg.ways)) * cfg.blockSize;
  return [rowLabel(cfg, line), "1", hex(l.tag, 3), `${hex(start)}–${hex(start + cfg.blockSize - 1)}`];
}

function emptyRows(c: Ctx) {
  const t = ++c.tick.n;
  for (let k = 0; k < c.cfg.lines; k++)
    c.b.ev({
      t,
      kind: "row",
      table: "linhas",
      index: k,
      cells: [rowLabel(c.cfg, k), "0", "—", "—"],
      role: "muted",
      label: "Linha vazia",
    });
  c.b.ev({
    t,
    kind: "state",
    target: "cache",
    text: "vazia",
    tone: "none",
    role: "muted",
    label: "Cache vazia",
  });
}

function stats(cfg: CacheConfig, r: CacheResult, n: number) {
  const rate = r.misses / n;
  return {
    hits: r.hits,
    misses: r.misses,
    compulsory: r.byKind.compulsório,
    conflict: r.byKind.conflito,
    capacity: r.byKind.capacidade,
    missRate: rate,
    amat: amat(HIT_NS, rate, PENALTY_NS),
    ways: cfg.ways,
  };
}

export function build(p: Params) {
  const b = lessonBuilder();
  const cfg = config(p);
  const custom = String(p.enderecos ?? "").trim();
  const addrs = custom ? parseAddrs(custom) : SEQ;
  const r = runCache(cfg, addrs);
  const c: Ctx = { b, cfg, r, tick: { n: 0 } };
  const acc = (i: number) => r.accesses[i] as CacheAccess;
  const st = stats(cfg, r, addrs.length);

  if (custom || cfg.ways !== 1 || cfg.policy !== "lru") {
    const chunk = 6;
    for (let from = 0, k = 1; from < addrs.length; from += chunk, k++) {
      const part = r.accesses.slice(from, from + chunk);
      const hits = part.filter((a) => a.hit).length;
      b.step(
        {
          id: `s${k}-acessos-${from + 1}`,
          title: `Acessos ${from + 1} a ${from + part.length}`,
          subtitle: `${hits} acerto${hits === 1 ? "" : "s"}, ${part.length - hits} falta${part.length - hits === 1 ? "" : "s"}`,
          text: "Cada endereço é dividido em tag, índice e deslocamento. O índice escolhe onde procurar; a tag diz se o bloco certo está lá.",
          facts: part.map(
            (a) => [hex(a.addr), a.hit ? "acerto" : `falta ${MISS_LABEL[a.miss ?? "compulsório"]}`] as const,
          ),
        },
        () => {
          if (from === 0) emptyRows(c);
          for (const a of part) play(c, a);
        },
      );
    }
    const notes = [
      `${r.hits} acertos em ${addrs.length} leituras: taxa de faltas de ${pct(st.missRate)}.`,
      `Faltas: ${r.byKind.compulsório} compulsórias, ${r.byKind.conflito} de conflito e ${r.byKind.capacidade} de capacidade.`,
      `Tempo médio de acesso: ${HIT_NS} + ${pct(st.missRate)} × ${PENALTY_NS} = ${ns(st.amat)}.`,
    ];
    if (cfg.ways < 8) {
      const full = runCache({ ...cfg, ways: 8 }, addrs);
      if (full.hits > r.hits) notes.push(`Totalmente associativa (8 vias), seriam ${full.hits} acertos.`);
    }
    return b.done(st, notes);
  }

  b.step(
    {
      id: "s1-endereco",
      title: "Cortando o endereço",
      subtitle: "tag | índice | deslocamento",
      text: "A cache tem 8 linhas de 16 bytes. Com blocos de 16 bytes, os 4 bits de baixo dizem qual byte do bloco se quer (o **deslocamento**). Com 8 linhas, os 3 bits seguintes escolhem a linha (o **índice**). Os 9 bits que sobram são a **tag**, guardada na linha para saber de qual bloco da memória ela é cópia. Abra o inspetor (I) para ver os campos de 0x1A04.",
      facts: [
        ["Endereço", "16 bits"],
        ["Tag | índice | deslocamento", "9 | 3 | 4 bits"],
        ["0x1A04", "tag 0x034, linha 0, byte 4"],
      ],
      highlight: ["cache"],
    },
    () => {
      emptyRows(c);
      const fr = b.frame(addrFrame(cfg, 0x1a04, "addr-1a04"));
      showAddr(c, 0x1a04, fr);
      b.ev({
        t: ++c.tick.n,
        kind: "note",
        at: "cache",
        text: "índice 0 → linha 0",
        tone: "info",
        role: "b",
        label: "O índice escolhe a linha",
        row: { cols: { t: "—", who: "0x1A04", what: "corte do endereço", detail: "linha 0, tag 0x034" } },
      });
    },
  );
  b.step(
    {
      id: "s2-primeira",
      title: "A primeira falta",
      subtitle: "Uma linha vazia não tem nada a oferecer",
      text: "A cache começa vazia: todo bit de validade (V) é 0. A leitura de 0x1A04 é uma **falta compulsória** (o bloco nunca foi trazido), e a cache busca na memória o bloco inteiro de 0x1A00 a 0x1A0F. A leitura seguinte, 0x1A08, cai no mesmo bloco: acerto, sem ir à memória.",
      facts: [
        ["0x1A04", "falta compulsória"],
        ["0x1A08", "acerto (mesmo bloco)"],
        ["Custo de uma falta", `${PENALTY_NS} ns`],
      ],
    },
    () => {
      play(c, acc(0));
      play(c, acc(1));
    },
  );
  b.step(
    {
      id: "s3-vizinhos",
      quiz: {
        kind: "choice",
        prompt:
          "Numa falta, a cache traz o bloco inteiro de 16 bytes, não só o byte pedido. Por que isso compensa?",
        options: [
          "Programas costumam ler endereços próximos logo em seguida",
          "A memória não consegue entregar menos que 16 bytes",
          "Para ocupar as linhas vazias da cache",
        ],
        answer: 0,
        explain:
          "É a localidade espacial: depois de um byte, o programa costuma ler o vizinho, como no próximo elemento de um vetor. Trazer o bloco inteiro custa quase o mesmo que trazer um byte e transforma as leituras seguintes em acertos.",
      },
      title: "Vizinhos chegam juntos",
      subtitle: "Localidade espacial",
      text: "0x1A1C fica no bloco seguinte (0x1A10 a 0x1A1F), cujo índice é 1: outra falta compulsória, agora na linha 1. Depois 0x1A0C volta ao primeiro bloco, ainda na linha 0: acerto. Programas costumam ler endereços próximos, e é por isso que trazer o bloco inteiro compensa ([[localidade]]).",
      facts: [
        ["0x1A1C", "linha 1, falta compulsória"],
        ["0x1A0C", "linha 0, acerto"],
      ],
    },
    () => {
      play(c, acc(2));
      play(c, acc(3));
    },
  );
  const lineOf2a00 = splitAddress(cfg, 0x2a00).index;
  b.step(
    {
      id: "s4-conflito",
      title: "Dois blocos, uma linha",
      subtitle: "Faltas de conflito",
      text: "0x2A00 tem tag 0x054, mas o mesmo índice 0 de 0x1A04. Num mapeamento direto, cada bloco só pode morar numa linha: o bloco de 0x1A00 é **expulso**. Quando o programa volta a 0x1A04, falta de novo, e expulsa 0x2A00, que volta a faltar em seguida. A cache tem linhas livres, mas não serve: são **faltas de conflito**.",
      facts: [
        ["0x2A00", "linha 0, expulsa a tag 0x034"],
        ["0x1A04 e 0x2A04", "duas faltas de conflito"],
        [
          "Linhas ainda vazias",
          `${BASE.lines - new Set(SEQ.slice(0, 7).map((a) => Math.floor(a / BASE.blockSize) % BASE.lines)).size} de ${BASE.lines}`,
        ],
      ],
      highlight: ["cache"],
      quiz: {
        kind: "pick",
        prompt: "A CPU vai ler 0x2A00. Em qual linha da cache ele tem de ficar?",
        targets: Array.from({ length: 4 }, (_, k) => ({ id: `linha-${k}`, label: `Linha ${k}` })),
        answer: `linha-${lineOf2a00}`,
        explain:
          "0x2A00 = 0010 1010 0000 0000. Tirando os 4 bits de deslocamento, os 3 bits do índice são 000: **linha 0**, a mesma de 0x1A04. É por isso que um expulsa o outro.",
      },
    },
    () => {
      play(c, acc(4));
      play(c, acc(5));
      play(c, acc(6));
    },
  );
  b.step(
    {
      id: "s5-resto",
      title: "O resto da sequência",
      subtitle: "Acertos onde há localidade",
      text: "0x1A14 acerta na linha 1. 0x3020 é a primeira leitura de outro bloco (linha 2, compulsória), e 0x3024 acerta logo atrás. 0x1A00 é mais um conflito na linha 0, que 0x2A04 tinha ocupado, e 0x1A1F, o último byte do bloco da linha 1, acerta.",
      facts: [
        ["Acertos", String(r.hits)],
        ["Faltas", `${r.misses} (${r.byKind.compulsório} compulsórias, ${r.byKind.conflito} de conflito)`],
      ],
    },
    () => {
      for (let i = 7; i < addrs.length; i++) play(c, acc(i));
    },
  );
  b.step(
    {
      id: "s6-tempo",
      title: "Tempo médio de acesso",
      subtitle: "AMAT = acerto + taxa de faltas × penalidade",
      text: `Com ${r.misses} faltas em ${addrs.length} leituras, a taxa de faltas é ${r.misses}/${addrs.length} ≈ ${pct(st.missRate)}. Se o acerto custa ${HIT_NS} ns e cada falta acrescenta ${PENALTY_NS} ns, o tempo médio de acesso é ${HIT_NS} + ${r.misses}/${addrs.length} × ${PENALTY_NS} ≈ **${ns(st.amat)}**. Cada falta evitada aqui vale mais que dobrar a velocidade do acerto.`,
      facts: [
        ["Taxa de faltas", pct(st.missRate)],
        ["AMAT", ns(st.amat)],
        ["Sem cache", `${PENALTY_NS} ns por leitura`],
      ],
    },
    () => {
      b.ev({
        t: ++c.tick.n,
        kind: "note",
        at: "cache",
        text: `AMAT ≈ ${ns(st.amat)}`,
        tone: "info",
        role: "ctrl",
        label: "Tempo médio",
        row: {
          cols: {
            t: "—",
            who: "Resumo",
            what: `${r.hits} acertos, ${r.misses} faltas`,
            detail: `AMAT ≈ ${ns(st.amat)}`,
          },
        },
      });
    },
  );
  const two = runCache({ ...cfg, ways: 2 }, addrs);
  const twoAmat = amat(HIT_NS, two.misses / addrs.length, PENALTY_NS);
  b.step(
    {
      id: "s7-vias",
      title: "Duas vagas por linha",
      subtitle: "Associatividade",
      text: `Numa cache de 2 vias com as mesmas 8 linhas (4 conjuntos de 2), 0x1A00 e 0x2A00 cabem juntos no conjunto 0. Os conflitos somem: ${two.hits} acertos em vez de ${r.hits}, e o AMAT cai para ${ns(twoAmat)}. O preço é comparar duas tags por acesso. Teste no Laboratório (L), mudando as vias.`,
      facts: [
        ["Direta", `${r.hits} acertos, AMAT ${ns(st.amat)}`],
        ["2 vias", `${two.hits} acertos, AMAT ${ns(twoAmat)}`],
      ],
    },
    () => {
      b.ev({
        t: ++c.tick.n,
        kind: "note",
        at: "cache",
        text: `2 vias: ${two.hits} acertos`,
        tone: "good",
        role: "ctrl",
        label: "Comparação com 2 vias",
        row: {
          cols: {
            t: "—",
            who: "2 vias",
            what: `${two.hits} acertos, ${two.misses} faltas`,
            detail: `AMAT ≈ ${ns(twoAmat)}`,
          },
        },
      });
    },
  );
  return b.done({ ...st, twoWayHits: two.hits, twoWayAmat: twoAmat });
}

const lesson: LessonModule = {
  meta: {
    slug: "cache-direta",
    site: "arq",
    title: "Cache de mapeamento direto",
    summary:
      "Como o endereço é cortado em tag, índice e deslocamento, por que blocos vizinhos acertam e dois blocos na mesma linha brigam.",
    area: "Hierarquia de memória",
    refs: [
      { book: "tanenbaum-sco", chapter: 4, section: "4.5.1", note: "Memória cache", verified: true },
      {
        book: "tanenbaum-sco",
        chapter: 2,
        section: "2.2.5",
        note: "Memória cache (visão geral)",
        verified: true,
      },
    ],
    simplifications: [
      "Só leituras; escrita (write-through e write-back) fica para outra lição.",
      "Acerto em 1 ns e falta com 100 ns fixos de penalidade, valores ilustrativos.",
      "Um único nível de cache, sem cache separada de instruções.",
      "A classificação dos 3 C's usa uma cache totalmente associativa LRU de mesmo tamanho como referência.",
    ],
  },
  scene,
  params: {
    defaults: { enderecos: "", vias: "1", politica: "lru" },
    fields: [
      {
        key: "enderecos",
        kind: "text",
        label: `Endereços lidos (até ${MAX_ACCESSES}, hex ou decimal)`,
        maxLength: 200,
        rows: 3,
        pattern: "[0-9a-fA-Fx ,;\\n]*",
        placeholder: "0x0000 0x0010 0x0080 0x0000",
        help: "Separe por espaço ou vírgula. Vazio usa a sequência da lição.",
      },
      {
        key: "vias",
        kind: "choice",
        label: "Associatividade",
        options: [
          { value: "1", label: "Direta (1 via)" },
          { value: "2", label: "2 vias" },
          { value: "4", label: "4 vias" },
        ],
      },
      {
        key: "politica",
        kind: "choice",
        label: "Substituição (com mais de 1 via)",
        options: [
          { value: "lru", label: "LRU (menos usado recentemente)" },
          { value: "fifo", label: "FIFO (mais antigo)" },
        ],
      },
    ],
  },
  build,
  intro: {
    text: "A memória principal leva dezenas de vezes mais tempo que o processador para responder. A [[cache]] guarda cópias de blocos recém-usados perto da CPU. Você vai seguir 12 leituras numa cache de 8 linhas e ver acertos, faltas e uma briga por lugar.",
    facts: [
      ["Cache", "8 linhas × 16 bytes = 128 B"],
      ["Endereços", "16 bits"],
      ["Leituras", String(SEQ.length)],
    ],
  },
  outro: {
    title: "Cache em resumo",
    text: "O índice decide onde o bloco pode morar, e a tag confirma quem está lá. Localidade faz a maioria das leituras acertar; blocos que disputam a mesma linha geram conflitos, que a associatividade reduz.",
    facts: (run) => [
      ["Acertos", String(run.stats.hits)],
      ["Faltas", String(run.stats.misses)],
      ["AMAT", ns(Number(run.stats.amat))],
    ],
  },
  next: ["pipeline"],
  counter: {
    test: (ev) => ev.kind === "state" && ev.target === "cache" && ev.tone === "bad",
    label: (n) => (n === 1 ? "1 falta" : `${n} faltas`),
  },
  practice,
};

export default lesson;
