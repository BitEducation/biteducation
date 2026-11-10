import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { MOUNTS, mountOf, type Op, type Outcome, simulate } from "../../../sim/os/blockcache.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * VFS and the block cache: three paths resolved to three file systems, then a script of reads
 * and writes through an LRU cache with read-ahead and write-back.
 */
export const DEFAULTS = { antecipacao: 4, capacidade: 12 };
const N = "notas.txt";
const V = "video.mp4";
const PATHS = ["/home/lia/notas.txt", "/mnt/pen/foto.jpg", "/proc/cpuinfo"];
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const PHASES: { id: string; ops: Op[] }[] = [
  { id: "leitura", ops: range(8).map((b) => ({ op: "read", file: N, block: b })) },
  { id: "releitura", ops: range(4).map((b) => ({ op: "read", file: N, block: b })) },
  { id: "escrita", ops: [2, 2, 2].map((b) => ({ op: "write", file: N, block: b })) },
  {
    id: "video",
    ops: [
      ...range(12).map((b): Op => ({ op: "read", file: V, block: b })),
      { op: "read", file: N, block: 2 },
      { op: "sync" },
    ],
  },
];
const ALL = PHASES.flatMap((p) => p.ops);

function clamp(p: Params) {
  const antecipacao = Math.min(8, Math.max(1, Math.round(Number(p.antecipacao ?? DEFAULTS.antecipacao))));
  const capacidade = Math.min(24, Math.max(4, Math.round(Number(p.capacidade ?? DEFAULTS.capacidade))));
  return { antecipacao, capacidade };
}

function scene(p: Params): SceneSpec {
  const { capacidade } = clamp(p);
  return {
    viewBox: [960, 600],
    nodes: [],
    links: [],
    widgets: [
      {
        kind: "table",
        id: "montagens",
        title: "O VFS escolhe o sistema de arquivos",
        at: [30, 40],
        columns: ["Caminho", "Montado em", "Sistema", "Usa disco"],
        widths: [220, 130, 100, 110],
        rows: PATHS.length,
      },
      {
        kind: "grid",
        id: "cache",
        title: `Cache de ${capacidade} blocos (mais antigo à esquerda)`,
        at: [30, 220],
        cols: Math.min(capacidade, 12),
        rows: Math.ceil(capacidade / 12),
        cellW: 70,
        indexLabel: "none",
      },
      { kind: "counter", id: "pedidos", title: "Pedidos ao disco", at: [640, 40] },
      { kind: "counter", id: "lidos", title: "Blocos lidos do disco", at: [640, 120] },
      { kind: "counter", id: "acertos", title: "Acertos na cache", at: [800, 40] },
      { kind: "counter", id: "gravados", title: "Blocos gravados", at: [800, 120] },
    ],
  };
}

export function build(p: Params) {
  const { antecipacao, capacidade } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const res = simulate(ALL, capacidade, antecipacao);
  const plain = simulate(ALL, capacidade, 1);
  const tot = { req: 0, read: 0, hit: 0, wrote: 0 };
  const lru: string[] = [];
  const dirty = new Set<string>();
  const short = (k: string) => {
    const [f, blk] = k.split("#");
    return `${f === N ? "N" : "V"}${blk}`;
  };
  const drawCache = () => {
    for (let i = 0; i < capacidade; i++) {
      const k = lru[i];
      c.cell("cache", i, k ? short(k) : "", {
        dt: 0,
        ...(k && dirty.has(k) ? { mark: "dirty" as const } : {}),
      });
    }
  };
  // mirror of the simulator's LRU, only to paint the grid
  const apply = (o: Op, r: Outcome) => {
    if (o.op === "sync") {
      dirty.clear();
      return;
    }
    const keys: string[] = [];
    if (!r.hit && o.op === "read")
      for (let blk = o.block; blk < o.block + antecipacao; blk++) {
        const k = `${o.file}#${blk}`;
        if (blk === o.block || !lru.includes(k)) keys.push(k);
      }
    keys.push(`${o.file}#${o.block}`);
    for (const k of keys) {
      const i = lru.indexOf(k);
      if (i >= 0) lru.splice(i, 1);
      lru.push(k);
      while (lru.length > capacidade) dirty.delete(lru.shift() as string);
    }
    if (o.op === "write") dirty.add(`${o.file}#${o.block}`);
  };
  let idx = 0;
  const play = (phase: number) => {
    for (const _ of (PHASES[phase] as { ops: Op[] }).ops) {
      const o = ALL[idx] as Op;
      const r = res[idx] as Outcome;
      idx++;
      apply(o, r);
      if (r.diskReads) tot.req++;
      tot.read += r.diskReads;
      if (r.hit) tot.hit++;
      tot.wrote += r.diskWrites;
      const what =
        o.op === "sync" ? "sync" : `${o.op === "read" ? "lê" : "escreve"} ${o.file}, bloco ${o.block}`;
      const detail =
        o.op === "sync"
          ? `${r.diskWrites} ${r.diskWrites === 1 ? "bloco gravado" : "blocos gravados"}`
          : r.hit
            ? "acerto"
            : o.op === "read"
              ? `falta: ${r.diskReads} ${r.diskReads === 1 ? "bloco lido" : "blocos lidos"} do disco`
              : "bloco novo na cache, sujo";
      c.note("cache", what, r.hit ? "good" : "info", { dt: 1, label: what });
      b.ev({
        t: c.t,
        kind: "count",
        counter: "pedidos",
        value: String(tot.req),
        role: "warn",
        label: `${what}: ${detail}`,
        row: { cols: { t: String(c.t), who: o.op === "sync" ? "núcleo" : o.file, what, detail } },
      });
      c.count("lidos", String(tot.read), { role: "b" });
      c.count("acertos", String(tot.hit), { role: "a" });
      c.count("gravados", String(tot.wrote), { role: "warn" });
      drawCache();
    }
  };
  const sum = (rs: Outcome[], from: number, to: number) => {
    const s = rs.slice(from, to);
    return {
      req: s.filter((x) => x.diskReads).length,
      read: s.reduce((a, x) => a + x.diskReads, 0),
      hit: s.filter((x) => x.hit).length,
      wrote: s.reduce((a, x) => a + x.diskWrites, 0),
    };
  };
  const bounds = [0];
  for (const ph of PHASES) bounds.push((bounds[bounds.length - 1] ?? 0) + ph.ops.length);
  const ph = PHASES.map((_, i) => sum(res, bounds[i] as number, bounds[i + 1] as number));
  const phPlain = PHASES.map((_, i) => sum(plain, bounds[i] as number, bounds[i + 1] as number));
  const all = sum(res, 0, ALL.length);
  const allPlain = sum(plain, 0, ALL.length);
  const [p0, p1, p2, p3] = ph as [typeof all, typeof all, typeof all, typeof all];
  const lastRead = res[ALL.length - 2] as Outcome;
  const evictWrite = res.slice(bounds[3], ALL.length - 1).reduce((a, x) => a + x.diskWrites, 0);

  b.step(
    {
      id: "s1-vfs",
      title: "Três caminhos, três sistemas",
      subtitle: "ext4, vfat e proc",
      text: `O programa chama read() sem saber em que disco está o arquivo. O [[vfs]] olha a tabela de montagem e escolhe pelo prefixo mais longo do caminho: ${PATHS.map((x) => `${x} vai para ${mountOf(x).fs}`).join("; ")}. Cada sistema de arquivos implementa as mesmas operações do seu jeito. O proc nem tem disco: monta o texto na hora, a partir de estruturas do núcleo.`,
      facts: [
        ["Montagens", String(MOUNTS.length)],
        ["Regra", "prefixo mais longo"],
        ["Sem disco", "/proc"],
      ],
      highlight: [],
    },
    () => {
      PATHS.forEach((x, i) => {
        const m = mountOf(x);
        c.row("montagens", i, [x, m.at, m.fs, m.disk ? "sim" : "não"], {
          dt: 1,
          mark: m.disk ? "new" : "hit",
          log: { who: "VFS", what: `${x} → ${m.fs}`, detail: `montado em ${m.at}` },
        });
      });
    },
  );

  b.step(
    {
      id: "s2-antecipacao",
      title: "Ler antes de pedirem",
      subtitle: `${p0.req} pedidos em vez de ${phPlain[0]?.req}`,
      text: `O editor lê notas.txt do bloco 0 ao 7, em ordem. Na primeira falta, o núcleo percebe a leitura sequencial e faz [[leitura-antecipada]]: traz ${antecipacao} blocos num pedido só. As 8 leituras custam ${p0.req} ${p0.req === 1 ? "pedido" : "pedidos"} ao disco em vez de ${phPlain[0]?.req}. Num disco, cada pedido paga busca e rotação; num SSD, paga a latência do comando. Juntar pedidos economiza as duas coisas.`,
      facts: [
        ["Leituras", "8 blocos"],
        ["Pedidos ao disco", String(p0.req)],
        ["Sem antecipação", `${phPlain[0]?.req} pedidos`],
      ],
      highlight: [],
    },
    () => play(0),
  );

  b.step(
    {
      id: "s3-releitura",
      title: "Na segunda vez, memória",
      subtitle: `${p1.hit} acertos, ${p1.req} pedidos`,
      text: `O editor volta ao começo e lê os blocos 0 a 3 de novo. Eles ainda estão na [[cache-de-blocos]], na memória, e as ${p1.hit} leituras saem dali, sem ${p1.req === 0 ? "nenhum pedido" : `mais de ${p1.req} pedidos`} ao disco. É por isso que abrir um arquivo pela segunda vez é tão mais rápido, e por isso o Linux usa quase toda a memória livre como cache: memória parada não ajuda ninguém.`,
      facts: [
        ["Acertos", String(p1.hit)],
        ["Pedidos ao disco", String(p1.req)],
        ["Onde ficam", "memória livre do sistema"],
      ],
      highlight: [],
    },
    () => play(1),
  );

  b.step(
    {
      id: "s4-escrita",
      title: "Escrever depois",
      subtitle: `3 escritas, ${p2.wrote} gravações agora`,
      text: `O editor salva o bloco 2 três vezes seguidas. Cada write() só altera a cópia na cache e a marca como suja; ${p2.wrote === 0 ? "nenhuma vai" : `${p2.wrote} vão`} ao disco agora. A gravação acontece depois, quando o bloco sai da cache ou numa sincronização periódica, e as três escritas viram uma. O risco: se a energia cai antes, a alteração se perde. Programas que não podem perder dados chamam fsync() para forçar a gravação.`,
      facts: [
        ["Escritas", "3 no mesmo bloco"],
        ["Gravações agora", String(p2.wrote)],
        ["Para garantir", "fsync()"],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt:
          "O editor salvou o bloco 2 e a energia caiu um segundo depois, sem fsync(). O que acontece com a alteração?",
        options: [
          "Pode se perder: ela estava só na cópia suja, na memória",
          "Está salva: todo write() grava no disco antes de retornar",
          "O disco grava sozinho os blocos sujos ao perder energia",
        ],
        answer: 0,
        explain: `Com escrita adiada, write() volta assim que a cópia na cache muda; ${p2.wrote === 0 ? "nenhuma gravação foi" : `só ${p2.wrote} gravação foi`} ao disco nesse trecho. Só fsync(), ou a sincronização periódica, garante que o bloco chegou lá.`,
      },
    },
    () => play(2),
  );

  b.step(
    {
      id: "s5-expulsao",
      title: "Um arquivo grande passa",
      subtitle: `${p3.read} blocos lidos, ${evictWrite} gravado`,
      text: `O player lê 12 blocos de video.mp4 e a cache de ${capacidade} blocos, com LRU, expulsa os blocos mais antigos: os de notas.txt. ${evictWrite ? "O bloco 2, sujo, é gravado no disco ao sair." : "O bloco 2, sujo, ainda não saiu."} Quando o editor relê o bloco 2, ele ${lastRead.hit ? "ainda está lá" : "já não está e volta do disco"}. No total, foram ${all.req} pedidos ao disco com antecipação contra ${allPlain.req} sem ela; ler um arquivo grande uma única vez costuma varrer a cache e prejudicar os outros.`,
      facts: [
        ["Pedidos ao disco", `${all.req} (sem antecipação: ${allPlain.req})`],
        ["Blocos lidos", String(all.read)],
        ["Gravações", String(all.wrote)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Com antecipação de ${antecipacao} blocos, quantos pedidos ao disco o roteiro inteiro fez?`,
        answer: all.req,
        explain: `Cada falta vira um pedido que traz até ${antecipacao} blocos. Foram ${all.req} faltas, contra ${allPlain.req} pedidos de um bloco sem antecipação.`,
      },
    },
    () => play(3),
  );

  return b.done({
    first: p0.req,
    firstPlain: phPlain[0]?.req ?? 0,
    rehits: p1.hit,
    requests: all.req,
    requestsPlain: allPlain.req,
    wrote: all.wrote,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "cache-de-blocos",
    site: "so",
    title: "VFS e cache de blocos: ler sem ir ao disco",
    summary:
      "O VFS escolhe o sistema de arquivos pelo caminho; uma cache LRU com leitura antecipada e escrita adiada poupa pedidos ao disco.",
    area: "Arquivos e E/S",
    refs: [
      {
        book: "tanenbaum-mos",
        chapter: 4,
        section: "4.3.7",
        note: "Sistemas de arquivos virtuais",
        verified: true,
      },
      {
        book: "tanenbaum-mos",
        chapter: 4,
        section: "4.4.4",
        note: "Desempenho: cache de blocos e leitura antecipada",
        verified: true,
      },
      {
        book: "maziero-so",
        chapter: 24,
        section: "24.4",
        note: "Gestão de blocos: o cache de blocos",
        verified: true,
      },
    ],
    simplifications: [
      "A cache guarda blocos de arquivo; no Linux, a cache de páginas faz esse papel junto com a memória virtual.",
      "A antecipação tem tamanho fixo; o núcleo real aumenta a janela enquanto a leitura continua sequencial.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "antecipacao", kind: "int", label: "Blocos lidos por falta (antecipação)", min: 1, max: 8 },
      { key: "capacidade", kind: "int", label: "Capacidade da cache (blocos)", min: 4, max: 24 },
    ],
  },
  build,
  intro: {
    text: "Ler do disco é milhares de vezes mais lento que ler da memória. Entre o read() de um programa e o disco há duas camadas que escondem isso: uma que escolhe o sistema de arquivos e uma cache que tenta nunca ir ao disco duas vezes pelo mesmo bloco.",
    facts: [
      ["Arquivos", `${N}, ${V}`],
      ["Cache", `${DEFAULTS.capacidade} blocos, LRU`],
      ["Antecipação", `${DEFAULTS.antecipacao} blocos`],
    ],
  },
  outro: {
    title: "VFS e cache em resumo",
    text: "O VFS dá a todos os sistemas de arquivos a mesma interface e escolhe um pelo caminho. A cache de blocos atende releituras da memória, junta leituras sequenciais em pedidos maiores e adia escritas, ao custo de perder dados sem um fsync.",
    facts: (run) => [
      ["Pedidos ao disco", String(run.stats.requests)],
      ["Sem antecipação", String(run.stats.requestsPlain)],
      ["Gravações", String(run.stats.wrote)],
    ],
  },
  next: ["chamada-de-sistema", "journaling"],
};

export default lesson;
