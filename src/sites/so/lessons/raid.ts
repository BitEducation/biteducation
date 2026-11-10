import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import {
  type Cell,
  capacity,
  type Level,
  layout,
  locate5,
  rebuild,
  smallWriteIos,
  tolerated,
  xor,
} from "../../../sim/os/raid.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { raid as practice } from "../practice.ts";

/**
 * RAID 0, 1+0 and 5 on the same disks: striping for speed, mirroring and XOR parity for
 * redundancy, rebuilding a failed disk and the read-modify-write cost of small writes.
 */
export const DEFAULTS = { discos: 4, falha: 2, bloco: 5, valor: "42" };
const STRIPES = 5;
const DISK_TB = 4;
const MB_S = 200;
/** Annual failure rate of one disk, in the range large fleets report. */
const AFR = 0.02;

const h2 = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");
const bits = (n: number) => n.toString(2).padStart(8, "0");
const pct = (x: number) => `${(x * 100).toFixed(1).replace(/\.0$/, "").replace(".", ",")}%`;
const dec = (x: number) => x.toFixed(1).replace(".", ",");

function clamp(p: Params) {
  const n = Math.min(8, Math.max(3, Math.round(Number(p.discos ?? DEFAULTS.discos))));
  const failed = Math.min(n, Math.max(1, Math.round(Number(p.falha ?? DEFAULTS.falha)))) - 1;
  const maxBlock = STRIPES * (n - 1) - 1;
  const block = Math.min(maxBlock, Math.max(0, Math.round(Number(p.bloco ?? DEFAULTS.bloco))));
  const raw = String(p.valor ?? DEFAULTS.valor).replace(/^0x/i, "");
  const value = /^[0-9a-fA-F]{1,2}$/.test(raw)
    ? Number.parseInt(raw, 16)
    : Number.parseInt(DEFAULTS.valor, 16);
  return { n, failed, block, value };
}

const cellW = (n: number) => Math.min(100, Math.floor(600 / n) - 4);

function scene(p: Params): SceneSpec {
  const { n } = clamp(p);
  return {
    viewBox: [960, 600],
    nodes: [],
    links: [],
    widgets: [
      {
        kind: "grid",
        id: "discos",
        title: `${n} discos de ${DISK_TB} TB, uma faixa por linha`,
        at: [60, 50],
        cols: n,
        rows: STRIPES + 1,
        cellW: cellW(n),
        indexLabel: "none",
      },
      { kind: "counter", id: "cap", title: "Capacidade útil", at: [720, 50] },
      { kind: "counter", id: "tol", title: "Falhas toleradas", at: [720, 150] },
      { kind: "counter", id: "io", title: "Acessos por escrita", at: [720, 250] },
      {
        kind: "table",
        id: "xor",
        title: "Paridade bit a bit",
        at: [60, 370],
        columns: ["Bloco", "Disco", "Hex", "Bits"],
        widths: [90, 60, 50, 100],
        rows: n,
      },
    ],
  };
}

export function build(p: Params) {
  const { n, failed, block, value } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));

  const name = (cell: Cell) => (cell.block === -1 ? "P" : cell.block === -2 ? "reserva" : `D${cell.block}`);
  const roleOf = (cell: Cell, d: number, level: Level): Role =>
    cell.block === -2 ? "muted" : cell.block === -1 ? "crypto" : level === "10" ? (d % 2 ? "b" : "a") : "a";

  const draw = (level: Level, rows: Cell[][]) => {
    for (let d = 0; d < n; d++) c.cell("discos", d, `Disco ${d + 1}`, { role: "muted" });
    rows.forEach((row, s) => {
      row.forEach((cell, d) => {
        c.cell("discos", (s + 1) * n + d, cell.block === -2 ? "–" : `${name(cell)} ${h2(cell.value)}`, {
          dt: d === 0 ? 1 : 0,
          mark: "new",
          role: roleOf(cell, d, level),
        });
      });
    });
  };
  const counters = (level: Level, label: string) => {
    const cap = capacity(level, n);
    c.count("cap", `${cap * DISK_TB} TB`, { label: `${label}: ${cap * DISK_TB} de ${n * DISK_TB} TB` });
    c.count("tol", String(tolerated(level)), { label: `${tolerated(level)} disco(s)` });
    c.count("io", String(smallWriteIos(level)), {
      label: `${smallWriteIos(level)} acesso(s) por bloco escrito`,
    });
  };
  const clearXor = () => {
    for (let i = 0; i < n; i++) c.row("xor", i, ["", "", "", ""], { role: "muted" });
  };

  const r0 = layout("0", n, STRIPES);
  const r10 = layout("10", n, STRIPES);
  const r5 = layout("5", n, STRIPES);
  const pLoss0 = 1 - (1 - AFR) ** n;
  const pairs = Math.floor(n / 2);
  const stripe0 = r5[0] ?? [];
  const parity0 = stripe0.find((x) => x.block === -1)?.value ?? 0;
  const data0 = stripe0.filter((x) => x.block >= 0);
  const lost = r5.map((row) => row[failed] ?? { block: -2, value: 0 });
  const rebuilt = r5.map((row) => rebuild(row, failed));
  const ok = rebuilt.every((v, s) => v === lost[s]?.value);
  const hours = (DISK_TB * 1e12) / (MB_S * 1e6) / 3600;
  const loc = locate5(block, n);
  const row = r5[loc.stripe] ?? [];
  const oldData = row[loc.disk]?.value ?? 0;
  const oldParity = row[loc.parity]?.value ?? 0;
  const newParity = oldParity ^ oldData ^ value;

  b.step(
    {
      id: "s1-raid0",
      title: "RAID 0 divide em faixas",
      subtitle: `${n * DISK_TB} TB, nenhuma falha tolerada`,
      text: `No [[raid]] 0, os blocos D0, D1, D2… vão para discos diferentes, em [[faixa|faixas]]: um arquivo grande é lido de ${n} discos ao mesmo tempo, quase ${n} vezes mais rápido, e toda a capacidade é usada, ${n * DISK_TB} TB. Mas não há cópia de nada. Se cada disco tem ${pct(AFR)} de chance de falhar num ano, a chance de perder algum dos ${n}, e com ele pedaços de todos os arquivos, é ${pct(pLoss0)}.`,
      facts: [
        ["Capacidade", `${n * DISK_TB} TB`],
        ["Velocidade de leitura", `até ${n}×`],
        ["Perda em um ano", pct(pLoss0)],
      ],
      highlight: [],
    },
    () => {
      draw("0", r0);
      counters("0", "RAID 0");
    },
  );

  b.step(
    {
      id: "s2-raid10",
      title: "Espelhos guardam cópias",
      subtitle: `${pairs * DISK_TB} TB, cada bloco duas vezes`,
      text: `No RAID 1, cada bloco é gravado em dois discos idênticos, o [[espelhamento]]. Com ${n} discos ${pairs === 1 ? "forma-se 1 par" : `formam-se ${pairs} pares`}, e as faixas se distribuem entre eles (RAID 1+0)${n % 2 ? `; o disco ${n} fica de reserva, pronto para substituir quem falhar` : ""}. Se um disco morre, o par continua servindo tudo. O preço é o espaço: só ${pairs * DISK_TB} dos ${n * DISK_TB} TB ficam úteis. Leituras ficam até mais rápidas, já que qualquer cópia serve.`,
      facts: [
        ["Pares", String(pairs)],
        ["Capacidade", `${pairs * DISK_TB} TB`],
        ["Cópias", "2"],
      ],
      highlight: [],
    },
    () => {
      draw("10", r10);
      counters("10", "RAID 1+0");
    },
  );

  b.step(
    {
      id: "s3-paridade",
      title: "A paridade é um XOR",
      subtitle: `${data0.map((x) => h2(x.value)).join(" ⊕ ")} = ${h2(parity0)}`,
      text: `Dá para proteger com menos espaço. Para cada faixa, um bloco extra guarda a [[paridade]]: o XOR, bit a bit, dos ${n - 1} blocos de dados. Na primeira faixa, ${data0.map((x) => h2(x.value)).join(" ⊕ ")} = ${h2(parity0)}. Cada bit da paridade diz se a coluna tem um número ímpar de uns. O truque é que o XOR se desfaz: XOR de todos os outros blocos com a paridade devolve exatamente o bloco que faltar.`,
      facts: [
        ["Dados", data0.map((x) => h2(x.value)).join(", ")],
        ["Paridade", h2(parity0)],
        ["Custo", `1 bloco a cada ${n}`],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: "Se o disco com D1 se perde, como obter D1 de volta?",
        options: [
          "XOR dos outros dados com a paridade",
          "Somando os outros blocos",
          "Não dá: só RAID 1 recupera",
        ],
        answer: 0,
        explain: `A ⊕ A = 0: o XOR de ${[...data0.filter((x) => x.block !== 1).map(name), "P"].join(", ").replace(/, ([^,]*)$/, " e $1")} cancela tudo o que não é D1 e sobra ${h2(stripe0.find((x) => x.block === 1)?.value ?? 0)}.`,
      },
    },
    () => {
      clearXor();
      stripe0.forEach((x, d) => {
        if (x.block < 0) return;
        c.row("xor", data0.indexOf(x), [name(x), String(d + 1), h2(x.value), bits(x.value)], {
          dt: 1,
          role: "a",
          mark: "new",
        });
      });
      const pd = stripe0.findIndex((x) => x.block === -1);
      c.row("xor", n - 1, ["P = XOR", String(pd + 1), h2(parity0), bits(parity0)], {
        dt: 1,
        role: "crypto",
        mark: "new",
        log: { who: "faixa 0", what: "paridade", detail: `${h2(parity0)} = ${bits(parity0)}` },
      });
    },
  );

  b.step(
    {
      id: "s4-raid5",
      title: "RAID 5 gira a paridade",
      subtitle: `${(n - 1) * DISK_TB} TB, 1 falha tolerada`,
      text: `O RAID 4 punha toda a paridade num disco só, e cada escrita, em qualquer faixa, passava por ele: um gargalo. O RAID 5 gira a paridade, que a cada faixa muda para o disco à esquerda; assim as escritas se espalham por todos. A capacidade útil é de ${n - 1} discos, ${(n - 1) * DISK_TB} TB, contra ${pairs * DISK_TB} TB do espelhamento com os mesmos ${n} discos, e qualquer disco pode falhar sem perda.`,
      facts: [
        ["Capacidade", `${(n - 1) * DISK_TB} TB`],
        ["Paridade", `1 bloco por faixa`],
        ["Espelho, mesmos discos", `${pairs * DISK_TB} TB`],
      ],
      highlight: [],
    },
    () => {
      draw("5", r5);
      counters("5", "RAID 5");
    },
  );

  b.step(
    {
      id: "s5-falha",
      title: `O disco ${failed + 1} falha`,
      subtitle: `${STRIPES} blocos refeitos por XOR`,
      text: `O disco ${failed + 1} parou. Cada bloco que ele tinha é recalculado com o XOR dos ${n - 1} blocos que sobraram na faixa; ${ok ? "os valores batem com os originais" : "algo não bate"}. O sistema segue funcionando, mais lento, porque cada leitura daquele disco vira ${n - 1} leituras. Num disco novo, a [[reconstrucao]] lê os ${n - 1} discos inteiros: a ${MB_S} MB/s, ${DISK_TB} TB levam ${dec(hours)} h. Se outro disco falhar antes disso, os dados se perdem.`,
      facts: [
        ["Leituras por bloco", String(n - 1)],
        ["Reconstrução", `${dec(hours)} h`],
        ["Exposição", "uma 2ª falha perde tudo"],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Quantos discos precisam ser lidos para refazer um bloco do disco ${failed + 1}?`,
        answer: n - 1,
        explain: `Todos os outros da faixa: ${n - 1} discos, dados e paridade.`,
      },
    },
    () => {
      for (let s = 0; s <= STRIPES; s++)
        c.cell("discos", s * n + failed, s === 0 ? `Disco ${failed + 1} ×` : "×", {
          dt: s === 0 ? 1 : 0,
          mark: "evict",
          role: "bad",
        });
      const l0 = lost[0] ?? { block: -2, value: 0 };
      clearXor();
      stripe0.forEach((x, d) => {
        if (d === failed) return;
        const i = d < failed ? d : d - 1;
        c.row("xor", i, [name(x), String(d + 1), h2(x.value), bits(x.value)], { role: "muted" });
      });
      c.row(
        "xor",
        n - 1,
        [`${name(l0)} refeito`, String(failed + 1), h2(rebuilt[0] ?? 0), bits(rebuilt[0] ?? 0)],
        {
          dt: 1,
          role: "crypto",
          mark: "new",
        },
      );
      r5.forEach((rw, s) => {
        const cell = rw[failed] ?? { block: -2, value: 0 };
        c.cell("discos", (s + 1) * n + failed, `${name(cell)} ${h2(rebuilt[s] ?? 0)}`, {
          dt: 1,
          mark: "new",
          role: "crypto",
          log: {
            who: `faixa ${s}`,
            what: `${name(cell)} refeito`,
            detail: `XOR de ${n - 1} discos = ${h2(rebuilt[s] ?? 0)}`,
          },
        });
      });
    },
  );

  b.step(
    {
      id: "s6-escrita",
      title: "Escrita pequena custa caro",
      subtitle: `D${block}: ${h2(oldData)} → ${h2(value)}`,
      text: `Com o disco novo já reconstruído, trocar D${block} de ${h2(oldData)} para ${h2(value)} obriga a corrigir a paridade da faixa. ${n - 2 === 1 ? "Sem ler o outro bloco de dados" : `Sem ler os outros ${n - 2} blocos`}, o RAID 5 lê o dado antigo e a paridade antiga, calcula ${h2(oldParity)} ⊕ ${h2(oldData)} ⊕ ${h2(value)} = ${h2(newParity)} e grava os dois: 4 acessos, contra 1 no RAID 0 e 2 no espelho. Gravar a faixa inteira de uma vez evita as leituras. O RAID 6 guarda duas paridades e aguenta duas falhas.`,
      facts: [
        ["RAID 0", "1 acesso"],
        ["RAID 1+0", "2 acessos"],
        ["RAID 5", "4 acessos"],
      ],
      highlight: [],
    },
    () => {
      draw("5", r5);
      clearXor();
      const at = (loc.stripe + 1) * n;
      c.cell("discos", at + loc.disk, `D${block} ${h2(oldData)}`, {
        dt: 1,
        mark: "hit",
        role: "a",
        log: { who: `disco ${loc.disk + 1}`, what: "lê dado antigo", detail: h2(oldData) },
      });
      c.cell("discos", at + loc.parity, `P ${h2(oldParity)}`, {
        dt: 1,
        mark: "hit",
        role: "crypto",
        log: { who: `disco ${loc.parity + 1}`, what: "lê paridade antiga", detail: h2(oldParity) },
      });
      c.row("xor", 0, ["P antiga", String(loc.parity + 1), h2(oldParity), bits(oldParity)], {
        role: "crypto",
      });
      c.row("xor", 1, [`D${block} antigo`, String(loc.disk + 1), h2(oldData), bits(oldData)], { role: "a" });
      c.row("xor", 2, [`D${block} novo`, String(loc.disk + 1), h2(value), bits(value)], {
        role: "a",
        mark: "new",
      });
      c.row("xor", n - 1, ["P nova", String(loc.parity + 1), h2(newParity), bits(newParity)], {
        dt: 1,
        role: "crypto",
        mark: "new",
      });
      c.cell("discos", at + loc.disk, `D${block} ${h2(value)}`, {
        dt: 1,
        mark: "dirty",
        role: "a",
        log: { who: `disco ${loc.disk + 1}`, what: "grava dado", detail: h2(value) },
      });
      c.cell("discos", at + loc.parity, `P ${h2(newParity)}`, {
        dt: 1,
        mark: "dirty",
        role: "crypto",
        log: { who: `disco ${loc.parity + 1}`, what: "grava paridade", detail: h2(newParity) },
      });
      c.count("io", "4", { label: "4 acessos: 2 leituras e 2 gravações" });
    },
  );

  // A full-stripe check keeps the claim in step 6 honest: the shortcut equals recomputing everything.
  const recomputed = xor(row.map((x, d) => (d === loc.parity ? 0 : d === loc.disk ? value : x.value)));

  return b.done({
    cap0: n * DISK_TB,
    cap10: pairs * DISK_TB,
    cap5: (n - 1) * DISK_TB,
    loss0: pct(pLoss0),
    parity: h2(parity0),
    rebuilt: ok ? "sim" : "não",
    hours: dec(hours),
    newParity: h2(newParity),
    shortcut: recomputed === newParity ? "sim" : "não",
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "raid",
    site: "so",
    title: "RAID: faixas, espelhos e paridade",
    summary:
      "Como vários discos viram um só, mais rápido ou mais seguro: faixas do RAID 0, espelhos do RAID 1, a paridade XOR do RAID 5, a reconstrução depois de uma falha e o custo das escritas pequenas.",
    area: "Arquivos e E/S",
    refs: [
      {
        book: "tanenbaum-mos",
        chapter: 5,
        section: "5.4.1",
        note: "Hardware do disco (RAID)",
        verified: true,
      },
      { book: "maziero-so", chapter: 21, section: "21.2", note: "Sistemas RAID", verified: true },
    ],
    simplifications: [
      "Cada bloco tem um byte; em discos reais uma faixa tem dezenas de kilobytes por disco.",
      "A reconstrução usa a velocidade sequencial do disco o tempo todo, sem disputar com o uso normal.",
      `A chance anual de falha de ${pct(AFR)} por disco é um valor típico; ela varia com idade e modelo.`,
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "discos", kind: "int", label: "Número de discos", min: 3, max: 8 },
      {
        key: "falha",
        kind: "int",
        label: "Disco que falha",
        min: 1,
        max: 8,
        help: "Acima do número de discos, vale o último.",
      },
      {
        key: "bloco",
        kind: "int",
        label: "Bloco reescrito no passo 6",
        min: 0,
        max: 34,
        help: "Limitado aos blocos que aparecem na tabela.",
      },
      {
        key: "valor",
        kind: "text",
        label: "Novo valor do bloco (hexadecimal)",
        maxLength: 4,
        pattern: "^(0x)?[0-9a-fA-F]{1,2}$",
        placeholder: DEFAULTS.valor,
      },
    ],
  },
  build,
  intro: {
    text: "Discos falham, e são lentos. Juntando vários, dá para ganhar velocidade, segurança ou um pouco dos dois. Você vai ver os mesmos discos organizados de três jeitos e um deles sobreviver a uma falha com um XOR.",
    facts: [
      ["Discos", String(DEFAULTS.discos)],
      ["Tamanho", `${DISK_TB} TB cada`],
      ["Níveis", "0, 1+0 e 5"],
    ],
  },
  outro: {
    title: "RAID em resumo",
    text: "RAID 0 espalha os blocos em faixas e ganha velocidade, mas perde tudo com uma falha. RAID 1 espelha e gasta metade do espaço. RAID 5 guarda o XOR de cada faixa num disco que gira, refaz qualquer disco perdido e paga com quatro acessos por escrita pequena. Nenhum deles substitui backup: um arquivo apagado some de todos os discos ao mesmo tempo.",
    facts: (run) => [
      ["RAID 0 / 1+0 / 5", `${run.stats.cap0} / ${run.stats.cap10} / ${run.stats.cap5} TB`],
      ["Reconstrução", `${run.stats.hours} h`],
      ["Paridade nova", String(run.stats.newParity)],
    ],
  },
  next: ["escalonamento-disco", "inodes"],
  practice,
};

export default lesson;
