import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import { type AccessKind, patterns, type Served, serve, type Timing } from "../../../sim/arch/dram.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Inside a DRAM: banks of capacitor rows, the row buffer, opening a row and reading columns from it,
 * sequential reads that hit the open row, two arrays in the same bank that keep evicting each
 * other's row, the same arrays spread over two banks, and refresh plus real timings.
 */
export const DEFAULTS = { cl: 4, rcd: 4, rp: 4 };
const LANES = { seq: "sequencial", same: "mesmo banco", spread: "dois bancos" } as const;
type Pattern = keyof typeof LANES;
const ROLE: Record<AccessKind, Role> = { acerto: "a", fechada: "ctrl", conflito: "bad" };
const COLS = 8;
const GANTT_W = 880;
const cycles = (n: number) => (n === 1 ? "1 ciclo" : `${n} ciclos`);

function clamp(p: Params): Timing {
  const pick = (v: unknown, d: number) => Math.min(8, Math.max(1, Math.round(Number(v ?? d))));
  return { cl: pick(p.cl, DEFAULTS.cl), rcd: pick(p.rcd, DEFAULTS.rcd), rp: pick(p.rp, DEFAULTS.rp) };
}

function scene(p: Params): SceneSpec {
  const t = clamp(p);
  const span = serve(patterns().same, t).end + 2;
  return {
    viewBox: [960, 560],
    nodes: [],
    links: [],
    widgets: [
      {
        kind: "grid",
        id: "buf",
        title: "Buffer de linha: banco 0 em cima, banco 1 embaixo (colunas 0 a 7)",
        at: [40, 50],
        cols: COLS,
        rows: 2,
        cellW: 58,
        indexLabel: "dec",
      },
      {
        kind: "table",
        id: "tempo",
        title: "Comandos da DRAM",
        at: [560, 50],
        columns: ["Comando", "O que faz", "Ciclos"],
        widths: [70, 250, 60],
        rows: 3,
      },
      {
        kind: "gantt",
        id: "linha",
        title: "Oito leituras · cor = linha aberta, linha fechada ou conflito",
        at: [40, 230],
        lanes: [LANES.seq, LANES.same, LANES.spread],
        span,
        width: GANTT_W,
      },
      {
        kind: "table",
        id: "cmp",
        title: "Oito leituras em cada padrão",
        at: [40, 380],
        columns: ["Padrão", "Linha aberta", "Conflitos", "Ciclos"],
        widths: [200, 110, 100, 90],
        rows: 3,
      },
    ],
  };
}

export function build(p: Params) {
  const t = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (x) => String(x));
  const pats = patterns();
  const r = {
    seq: serve(pats.seq, t),
    same: serve(pats.same, t),
    spread: serve(pats.spread, t),
  };
  const first = t.rcd + t.cl;
  const conflict = t.rp + t.rcd + t.cl;
  const cell = (bank: number, col: number) => bank * COLS + col;

  const read = (s: Served, mark: "hit" | "miss" | "evict") =>
    c.cell("buf", cell(s.bank, s.col), `L${s.row}`, {
      dt: 1,
      mark,
      role: s.bank === 0 ? "a" : "s3",
      log: { who: `banco ${s.bank}`, what: `linha ${s.row}, coluna ${s.col}`, detail: s.kind },
    });
  const open = (bank: number, row: number) => {
    for (let k = 0; k < COLS; k++) c.cell("buf", cell(bank, k), `L${row}`, { dt: 0, role: "muted" });
  };
  const draw = (x: Pattern) => {
    for (const s of r[x].served) {
      const at = c.t + 1;
      c.at(at);
      b.ev({
        t: at,
        kind: "gantt",
        lane: LANES[x],
        from: s.from,
        to: s.to,
        item: s.kind === "acerto" ? "" : s.kind === "fechada" ? "abre" : "troca",
        itemRole: ROLE[s.kind],
        role: ROLE[s.kind],
        label: `${LANES[x]}: banco ${s.bank}, linha ${s.row}, coluna ${s.col}: ${s.kind}, ciclos ${s.from} a ${s.to}`,
        row: {
          cols: { t: `${s.from}–${s.to}`, who: `banco ${s.bank}`, what: `linha ${s.row}`, detail: s.kind },
        },
      });
    }
  };
  const result = (x: Pattern, i: number, mark: "hit" | "bad" | "warn") =>
    c.row("cmp", i, [LANES[x], String(r[x].hits), String(r[x].conflicts), String(r[x].end)], { dt: 1, mark });

  b.step(
    {
      id: "s1-grade",
      title: "Uma grade de capacitores",
      subtitle: "Bancos, linhas e colunas",
      text: `Cada bit de uma [[dram]] é um capacitor minúsculo: carregado é 1, descarregado é 0. Os capacitores formam grades de linhas e colunas, e cada grade é um [[banco-de-memoria|banco]]. Ler um bit isolado é impossível: o chip copia a linha inteira, milhares de bits, para o [[buffer-de-linha]] do banco, e só então entrega as colunas pedidas. Três comandos fazem isso, cada um com o seu tempo em ciclos do clock da memória.`,
      facts: [
        ["Bit", "um capacitor"],
        ["Leitura", "linha inteira para o buffer"],
        ["Bancos aqui", "2"],
      ],
      highlight: ["tempo", "buf"],
    },
    () => {
      c.row("tempo", 0, ["ACT", "copia uma linha para o buffer (tRCD)", String(t.rcd)], {
        dt: 1,
        mark: "new",
      });
      c.row("tempo", 1, ["READ", "entrega uma coluna do buffer (CL)", String(t.cl)], { dt: 1, mark: "hit" });
      c.row("tempo", 2, ["PRE", "devolve a linha à grade e fecha (tRP)", String(t.rp)], {
        dt: 1,
        mark: "warn",
      });
    },
  );

  const s0 = r.seq.served[0] as Served;
  b.step(
    {
      id: "s2-abrir",
      title: "Abrir e ler",
      subtitle: `${cycles(first)} para o primeiro dado`,
      text: `A CPU pede a coluna 0 da linha ${s0.row} do banco 0, que está fechado. O controlador manda ACT, e em ${cycles(t.rcd)} a linha ${s0.row} inteira está no buffer. Depois manda READ, e o dado sai ${cycles(t.cl)} depois. O primeiro dado leva ${t.rcd} + ${t.cl} = ${cycles(first)}. A linha continua aberta no buffer, à espera de mais pedidos.`,
      facts: [
        ["ACT", cycles(t.rcd)],
        ["READ", cycles(t.cl)],
        ["Primeiro dado", cycles(first)],
      ],
      highlight: ["buf"],
    },
    () => {
      open(0, s0.row);
      read(s0, "miss");
    },
  );

  b.step(
    {
      id: "s3-sequencial",
      title: "A linha já está aberta",
      subtitle: `8 leituras em ${cycles(r.seq.end)}`,
      text: `As próximas ${r.seq.hits} leituras são das colunas 1 a 7 da mesma linha: estão no buffer, e cada uma custa só o READ, ${cycles(t.cl)}. As oito saem em ${first} + ${r.seq.hits} × ${t.cl} = ${cycles(r.seq.end)}. Ler endereços vizinhos é o melhor caso da DRAM, e é por isso que uma falta de [[cache]] traz um bloco inteiro e que percorrer um vetor em ordem é tão mais rápido que saltar.`,
      facts: [
        ["Na linha aberta", String(r.seq.hits)],
        ["Cada uma", cycles(t.cl)],
        ["Total", cycles(r.seq.end)],
      ],
      highlight: ["buf", "linha", "cmp"],
      quiz: {
        kind: "number",
        prompt: `Com ACT = ${t.rcd}, READ = ${t.cl} e a linha fechada no início, quantos ciclos levam 8 leituras seguidas da mesma linha?`,
        answer: r.seq.end,
        unit: "ciclos",
        explain: `A primeira abre a linha: ${first}. As outras 7 só leem: 7 × ${t.cl}. Total ${r.seq.end}.`,
      },
    },
    () => {
      for (const s of r.seq.served.slice(1)) read(s, "hit");
      draw("seq");
      result("seq", 0, "hit");
    },
  );

  b.step(
    {
      id: "s4-conflito",
      title: "Duas linhas no mesmo banco",
      subtitle: `${cycles(r.same.end)}`,
      text: `Agora o programa soma dois vetores, alternando a[i] e b[i]. a está na linha 5 e b na linha 9, ambas no banco 0. Cada vez que troca de vetor, o banco precisa fechar uma linha e abrir a outra: PRE, ACT e READ, ${t.rp} + ${t.rcd} + ${t.cl} = ${cycles(conflict)}. São ${r.same.conflicts} conflitos de linha, e as mesmas 8 leituras levam ${cycles(r.same.end)}, ${(r.same.end / r.seq.end).toFixed(1).replace(".", ",")} vezes mais que em sequência.`,
      facts: [
        ["Cada troca", cycles(conflict)],
        ["Conflitos", String(r.same.conflicts)],
        ["Total", cycles(r.same.end)],
      ],
      highlight: ["buf", "linha", "cmp"],
    },
    () => {
      let row = -1;
      for (const s of r.same.served) {
        if (s.row !== row) open(0, s.row);
        row = s.row;
        read(s, s.kind === "conflito" ? "evict" : "miss");
      }
      draw("same");
      result("same", 1, "bad");
    },
  );

  b.step(
    {
      id: "s5-bancos",
      title: "Cada vetor no seu banco",
      subtitle: `${cycles(r.spread.end)}`,
      text: `Se b ficar no banco 1, cada banco mantém a sua linha aberta no seu buffer. Só as duas primeiras leituras abrem linhas; as outras ${r.spread.hits} encontram a linha pronta e custam ${cycles(t.cl)} cada. Total: ${cycles(r.spread.end)}, contra ${r.same.end} no mesmo banco. Os controladores de memória espalham endereços vizinhos por bancos diferentes justamente para isso, e chips reais têm 16 ou 32 bancos.`,
      facts: [
        ["Linhas abertas", "uma por banco"],
        ["Conflitos", String(r.spread.conflicts)],
        ["Total", cycles(r.spread.end)],
      ],
      highlight: ["buf", "linha", "cmp"],
      quiz: {
        kind: "choice",
        prompt: "Por que separar a e b em bancos diferentes acelera a soma dos vetores?",
        options: [
          "Cada banco tem o seu buffer, então as duas linhas ficam abertas ao mesmo tempo",
          "O banco 1 tem capacitores mais rápidos",
          "Com dois bancos, o READ passa a custar metade",
        ],
        answer: 0,
        explain: `Com um banco, a linha 5 e a linha 9 disputam o mesmo buffer e se expulsam. Com dois, cada uma fica no seu, e ${r.spread.hits} das 8 leituras acertam a linha aberta.`,
      },
    },
    () => {
      open(0, 5);
      open(1, 9);
      for (const s of r.spread.served) read(s, s.kind === "acerto" ? "hit" : "miss");
      draw("spread");
      result("spread", 2, "hit");
    },
  );

  b.step(
    {
      id: "s6-real",
      title: "Capacitores vazam",
      subtitle: "Refresh e tempos reais",
      text: `Um capacitor perde a carga em milissegundos, então a DRAM relê e reescreve cada linha periodicamente, a cada 64 ms nos padrões DDR: é o refresh, e enquanto ele acontece o banco não atende. Nos módulos, os três tempos aparecem como "CL-tRCD-tRP", e somam dezenas de nanossegundos. Por isso o controlador reordena pedidos para aproveitar linhas abertas, e por isso existe a cache: aqui, o pior padrão custou ${(r.same.end / r.seq.end).toFixed(1).replace(".", ",")} vezes o melhor.`,
      facts: [
        ["Refresh", "cada linha a cada 64 ms"],
        ["Rótulo do módulo", "CL-tRCD-tRP"],
        ["Pior ÷ melhor", `${(r.same.end / r.seq.end).toFixed(1).replace(".", ",")} ×`],
      ],
      highlight: ["cmp"],
    },
    () => {
      c.note("cmp", "refresh: cada linha a cada 64 ms", "warn", { dt: 1 });
    },
  );

  return b.done({
    first,
    seq: r.seq.end,
    same: r.same.end,
    spread: r.spread.end,
    conflicts: r.same.conflicts,
    hitsSpread: r.spread.hits,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "dram",
    site: "arq",
    title: "Por dentro da DRAM: bancos, linhas e o buffer",
    summary:
      "Abrir uma linha, ler colunas do buffer, ler em sequência, dois vetores que se expulsam do mesmo banco e os mesmos vetores em bancos separados, com refresh e os tempos CL-tRCD-tRP.",
    area: "Memória",
    refs: [
      { book: "tanenbaum-sco", chapter: 3, section: "3.3.5", note: "Chips de memória", verified: true },
      { book: "tanenbaum-sco", chapter: 3, section: "3.3.6", note: "RAMs e ROMs", verified: true },
    ],
    simplifications: [
      "Os comandos não se sobrepõem: a próxima leitura só começa quando a anterior termina.",
      "Uma palavra por READ, sem rajadas.",
      "Dois bancos e oito colunas por linha; chips reais têm milhares de colunas.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "cl", kind: "int", label: "CL, ler do buffer (ciclos)", min: 1, max: 8 },
      { key: "rcd", kind: "int", label: "tRCD, abrir a linha (ciclos)", min: 1, max: 8 },
      { key: "rp", kind: "int", label: "tRP, fechar a linha (ciclos)", min: 1, max: 8 },
    ],
  },
  build,
  intro: {
    text: "A memória principal não é uma lista de bytes que se lê em tempo fixo. Você vai abrir linhas dentro de um chip de DRAM, ler colunas do buffer e ver por que a ordem em que um programa acessa a memória pode mudar o tempo por mais de duas vezes.",
    facts: [
      ["CL-tRCD-tRP", `${DEFAULTS.cl}-${DEFAULTS.rcd}-${DEFAULTS.rp}`],
      ["Bancos", "2"],
      ["Leituras por padrão", "8"],
    ],
  },
  outro: {
    title: "DRAM em resumo",
    text: "A DRAM guarda bits em capacitores organizados em bancos de linhas e colunas. Ler exige abrir a linha no buffer do banco; ler da linha aberta é rápido, trocar de linha no mesmo banco é caro. Espalhar dados por bancos mantém várias linhas abertas, e o refresh periódico rouba tempo de todos. A cache existe para esconder essas dezenas de nanossegundos.",
    facts: (run) => [
      ["Sequencial", cycles(Number(run.stats.seq))],
      ["Mesmo banco", cycles(Number(run.stats.same))],
      ["Dois bancos", cycles(Number(run.stats.spread))],
    ],
  },
  next: ["cache-direta", "barramentos", "politicas-escrita"],
};

export default lesson;
