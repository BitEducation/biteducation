import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import { type DiskAlgo, type DiskResult, diskSchedule } from "../../../sim/os/disk.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { escalonamentoDisco as practice } from "../practice.ts";

/**
 * Disk arm scheduling: one queue of cylinder requests served by FCFS, SSTF, SCAN/LOOK and
 * C-SCAN/C-LOOK. Each chart plots arm position against cylinders travelled (a proxy for time).
 */
export const DEFAULT_REQS = "120 15 160 62 90 30 185 80";
export const DEFAULTS = { inicio: 70, pedidos: DEFAULT_REQS, sobe: true };
const MAX = 199;

export function parseReqs(spec: string): number[] {
  const out = spec
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= MAX)
    .slice(0, 10);
  return out.length >= 3 ? out : parseReqs(DEFAULT_REQS);
}

function setup(p: Params) {
  const head = Math.min(MAX, Math.max(0, Math.round(Number(p.inicio ?? DEFAULTS.inicio))));
  const reqs = parseReqs(String(p.pedidos ?? DEFAULT_REQS));
  const up = p.sobe === undefined ? DEFAULTS.sobe : Boolean(p.sobe);
  const run = (a: DiskAlgo) => diskSchedule(head, reqs, a, { max: MAX, up });
  const res = {
    fcfs: run("fcfs"),
    sstf: run("sstf"),
    scan: run("scan"),
    look: run("look"),
    cscan: run("cscan"),
    clook: run("clook"),
  };
  return { head, reqs, up, res };
}

const CHARTS: { id: DiskAlgo; title: string; at: [number, number] }[] = [
  { id: "fcfs", title: "FCFS", at: [90, 140] },
  { id: "sstf", title: "SSTF", at: [550, 140] },
  { id: "scan", title: "SCAN (elevador)", at: [90, 320] },
  { id: "cscan", title: "C-SCAN", at: [550, 320] },
];

function scene(p: Params): SceneSpec {
  const { reqs, res } = setup(p);
  const xmax = Math.ceil(Math.max(...CHARTS.map((c) => res[c.id].total), 1) / 100) * 100;
  return {
    viewBox: [960, 660],
    nodes: [],
    links: [],
    widgets: [
      {
        kind: "grid",
        id: "fila",
        title: "Fila de pedidos (cilindros), na ordem de chegada",
        at: [90, 40],
        cols: reqs.length,
        rows: 1,
        cellW: 48,
        indexLabel: "none",
      },
      ...CHARTS.map((c) => ({
        kind: "chart" as const,
        id: c.id,
        title: c.title,
        at: c.at,
        width: 340,
        height: 120,
        x: { label: "cilindros percorridos", max: xmax },
        y: { label: "cilindro", max: 200 },
      })),
      {
        kind: "table",
        id: "res",
        title: "Comparação",
        at: [90, 480],
        columns: ["Algoritmo", "Ordem de atendimento", "Cilindros percorridos"],
        widths: [130, 420, 180],
        rows: 6,
      },
    ],
  };
}

const ROLE: Record<DiskAlgo, Role> = {
  fcfs: "s3",
  sstf: "a",
  scan: "b",
  look: "b",
  cscan: "s4",
  clook: "s4",
};
const NAME: Record<DiskAlgo, string> = {
  fcfs: "FCFS",
  sstf: "SSTF",
  scan: "SCAN",
  look: "LOOK",
  cscan: "C-SCAN",
  clook: "C-LOOK",
};
const ROW: Record<DiskAlgo, number> = { fcfs: 0, sstf: 1, scan: 2, look: 3, cscan: 4, clook: 5 };

export function build(p: Params) {
  const { head, reqs, up, res } = setup(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => `${t}`);
  const dir = up ? "subindo" : "descendo";
  const edge = up ? MAX : 0;

  const resetQueue = () =>
    reqs.forEach((r, i) => {
      c.cell("fila", i, String(r), { dt: i === 0 ? 1 : 0, role: "muted", label: `pedido ${r}` });
    });

  const play = (a: DiskAlgo, plot: boolean) => {
    const r = res[a];
    if (plot) {
      resetQueue();
      c.plot(a, NAME[a], 0, r.path[0] ?? head, { role: ROLE[a], dt: 1 });
    }
    const left = [...reqs];
    const used = reqs.map(() => false);
    let dist = 0;
    let prev = r.path[0] ?? head;
    for (const pos of r.path.slice(1)) {
      dist += Math.abs(pos - prev);
      prev = pos;
      if (plot) c.plot(a, NAME[a], dist, pos, { role: ROLE[a], dt: 1 });
      const k = left.indexOf(pos);
      if (k >= 0) {
        left.splice(k, 1);
        const qi = reqs.findIndex((x, i) => x === pos && !used[i]);
        used[qi] = true;
        if (plot)
          c.cell("fila", qi, String(pos), {
            mark: "hit",
            role: ROLE[a],
            label: `${NAME[a]} atende ${pos}`,
            log: { who: NAME[a], what: `atende ${pos}`, detail: `${dist} cilindros até aqui` },
          });
      }
    }
    c.row("res", ROW[a], [NAME[a], r.order.join(" "), String(r.total)], {
      mark: "new",
      log: { who: NAME[a], what: "total", detail: `${r.total} cilindros` },
    });
  };

  const R = (a: DiskAlgo): DiskResult => res[a];
  const fcfs = R("fcfs");
  const sstf = R("sstf");
  const scan = R("scan");
  const look = R("look");
  const cscan = R("cscan");
  const clook = R("clook");
  const route = (r: DiskResult) => r.path.filter((x, i) => i === 0 || x !== r.path[i - 1]).join(" → ");
  const best = (Object.keys(res) as DiskAlgo[]).reduce(
    (m, a) => (res[a].total < res[m].total ? a : m),
    "fcfs",
  );

  b.step(
    {
      id: "s1-braco",
      title: "O braço e os cilindros",
      subtitle: `${reqs.length} pedidos, cabeça no ${head}`,
      text: `Num disco rígido, o braço leva a cabeça de leitura até a trilha certa, e todas as trilhas na mesma posição formam um cilindro. Essa viagem, o [[tempo-de-busca]], custa milissegundos, uma eternidade para a CPU. Com ${reqs.length} pedidos na fila e a cabeça no cilindro ${head}, o sistema operacional pode escolher a ordem de atendimento. Cada gráfico mostra a posição do braço contra a distância percorrida.`,
      facts: [
        ["Cilindros", `0 a ${MAX}`],
        ["Cabeça", String(head)],
        ["Pedidos", reqs.join(" ")],
      ],
      highlight: [],
    },
    () => {
      resetQueue();
      for (const ch of CHARTS) c.plot(ch.id, NAME[ch.id], 0, head, { role: ROLE[ch.id] });
    },
  );

  b.step(
    {
      id: "s2-fcfs",
      title: "Na ordem de chegada",
      subtitle: `FCFS: ${fcfs.total} cilindros`,
      text: `O jeito mais simples é atender na ordem de chegada (FCFS). É justo, mas o braço vai e volta pelo disco inteiro: ${route(fcfs)}. Ao todo, ${fcfs.total} cilindros percorridos. No gráfico, as linhas íngremes e longas são viagens de um lado a outro.`,
      facts: [
        ["Ordem", fcfs.order.join(" ")],
        ["Percorrido", `${fcfs.total} cilindros`],
        [
          "Maior salto",
          String(Math.max(...fcfs.path.slice(1).map((x, i) => Math.abs(x - (fcfs.path[i] ?? 0))))),
        ],
      ],
      highlight: [],
    },
    () => play("fcfs", true),
  );

  const firstS = sstf.order[0] ?? head;
  b.step(
    {
      id: "s3-sstf",
      title: "O mais perto primeiro",
      subtitle: `SSTF: ${sstf.total} cilindros`,
      text: `O SSTF sempre atende o pedido mais próximo da cabeça. Começa pelo ${firstS} e percorre ${sstf.total} cilindros, ${sstf.total < fcfs.total * 0.6 ? `bem menos que os ${fcfs.total} do FCFS` : sstf.total < fcfs.total ? `menos que os ${fcfs.total} do FCFS` : `contra ${fcfs.total} do FCFS`}. Mas ser guloso não garante o melhor: ${sstf.total > look.total ? `o LOOK, do próximo passo, faz ${look.total}.` : best === "sstf" ? "aqui ele foi o melhor dos seis, o que nem sempre acontece." : `aqui ele não perde para o LOOK (${look.total}), mas isso varia com a fila.`} Pior: se chegam pedidos perto da cabeça sem parar, os distantes podem esperar para sempre. É [[inanicao]].`,
      facts: [
        ["Primeiro atendido", String(firstS)],
        ["Ordem", sstf.order.join(" ")],
        ["Percorrido", `${sstf.total} cilindros`],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Com a cabeça no cilindro ${head}, qual pedido o SSTF atende primeiro?`,
        answer: firstS,
        explain: `É o de menor distância: |${firstS} − ${head}| = ${Math.abs(firstS - head)}. Em caso de empate, a simulação escolhe o cilindro menor.`,
      },
    },
    () => play("sstf", true),
  );

  b.step(
    {
      id: "s4-elevador",
      title: "O elevador",
      subtitle: `SCAN: ${scan.total} · LOOK: ${look.total}`,
      text: `O [[elevador]] (SCAN) segue ${dir}, atendendo tudo no caminho até a borda ${edge}, e só então inverte. Ninguém espera mais de duas varreduras, e o total fica em ${scan.total} cilindros. O LOOK é o mesmo elevador, mas vira no último pedido em vez de ir até a borda: ${look.total}. É a base do que os sistemas usam de fato.`,
      facts: [
        ["SCAN", route(scan)],
        ["Total SCAN", `${scan.total} cilindros`],
        ["Total LOOK", `${look.total} cilindros`],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `O elevador parte do ${head} ${dir}, vai até a borda ${edge} e volta. Quantos cilindros ele percorre ao todo?`,
        answer: scan.total,
        explain: `Caminho: ${route(scan)}. Somando os trechos: ${scan.total} cilindros.`,
      },
    },
    () => {
      play("scan", true);
      play("look", false);
    },
  );

  b.step(
    {
      id: "s5-circular",
      title: "Sempre no mesmo sentido",
      subtitle: `C-SCAN: ${cscan.total} · C-LOOK: ${clook.total}`,
      text: `No elevador, quem está perto das bordas espera mais: a cabeça acabou de passar e vai demorar a voltar. O C-SCAN atende só ${dir}; ao chegar à borda, volta direto ao outro extremo sem atender nada e recomeça. Contando esse retorno, percorre ${cscan.total} cilindros${cscan.total > scan.total ? `, mais que os ${scan.total} do SCAN,` : ""} em troca de uma espera mais uniforme. O C-LOOK faz o mesmo virando nos pedidos extremos: ${clook.total}.`,
      facts: [
        ["C-SCAN", route(cscan)],
        ["Total C-SCAN", `${cscan.total} cilindros`],
        ["Total C-LOOK", `${clook.total} cilindros`],
      ],
      highlight: [],
    },
    () => {
      play("cscan", true);
      play("clook", false);
    },
  );

  b.step(
    {
      id: "s6-comparar",
      title: "Qual usar",
      subtitle: `Menor total: ${NAME[best]}`,
      text: `Nesta fila, o menor total foi do ${NAME[best]}, com ${res[best].total} cilindros, contra ${fcfs.total} do FCFS. Distância não é tudo: importam também a justiça e o pior caso de espera, e por isso variantes do elevador são as mais usadas. Hoje a própria controladora do disco reordena pedidos. Num SSD não existe braço, e o Linux costuma nem reordenar os pedidos.`,
      facts: [
        ["Melhor aqui", `${NAME[best]}, ${res[best].total}`],
        ["FCFS", String(fcfs.total)],
        ["SSD", "sem braço, sem busca"],
      ],
      highlight: [],
    },
    () => {
      (Object.keys(res) as DiskAlgo[]).forEach((a) => {
        c.row("res", ROW[a], [NAME[a], res[a].order.join(" "), String(res[a].total)], {
          ...(a === best ? { mark: "hit" as const } : {}),
          ...(a === best
            ? { log: { who: "melhor", what: NAME[a], detail: `${res[a].total} cilindros` } }
            : {}),
        });
      });
    },
  );

  return b.done({
    fcfs: fcfs.total,
    sstf: sstf.total,
    scan: scan.total,
    look: look.total,
    cscan: cscan.total,
    clook: clook.total,
    first: firstS,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "escalonamento-disco",
    site: "so",
    title: "Escalonamento de disco: FCFS, SSTF e o elevador",
    summary:
      "Uma fila de pedidos de cilindros atendida de seis jeitos, com o caminho do braço em gráfico e a distância total de cada um.",
    area: "Arquivos e E/S",
    refs: [
      {
        book: "tanenbaum-mos",
        chapter: 5,
        section: "5.4.3",
        note: "Algoritmos de escalonamento de braço de disco",
        verified: true,
      },
      {
        book: "maziero-so",
        chapter: 21,
        section: "21.1.2",
        note: "Escalonamento de acessos",
        verified: true,
      },
    ],
    simplifications: [
      "O custo é a distância em cilindros; a busca real não é linear e há ainda a latência de rotação.",
      "Todos os pedidos já estão na fila; num sistema real eles chegam enquanto o braço anda.",
      "No C-SCAN, o retorno à outra borda entra na conta como movimento comum.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "inicio", kind: "int", label: "Cilindro inicial da cabeça", min: 0, max: MAX },
      {
        key: "pedidos",
        kind: "list",
        label: "Pedidos (cilindros)",
        maxItems: 10,
        pattern: "\\d{1,3}",
        placeholder: DEFAULT_REQS,
        help: `De 3 a 10 cilindros, de 0 a ${MAX}.`,
      },
      { key: "sobe", kind: "bool", label: "Braço começa subindo", help: "Sentido inicial do elevador." },
    ],
  },
  build,
  intro: {
    text: "Num disco rígido, mover o braço até a trilha certa é a parte mais lenta de uma leitura. Quando vários pedidos esperam na fila, a ordem de atendimento muda muito o tempo total. Você vai comparar seis estratégias sobre a mesma fila, vendo o caminho do braço em cada uma.",
    facts: [
      ["Cilindros", `0 a ${MAX}`],
      ["Cabeça", String(DEFAULTS.inicio)],
      ["Pedidos", DEFAULT_REQS],
    ],
  },
  outro: {
    title: "Escalonamento de disco em resumo",
    text: "FCFS é justo e lento; SSTF corta a distância, mas é guloso e pode deixar pedidos distantes esperando para sempre. O elevador e suas variantes varrem o disco em ordem e limitam a espera. Em SSDs não há braço, e reordenar pedidos quase não ajuda.",
    facts: (run) => [
      ["FCFS", String(run.stats.fcfs)],
      ["SSTF", String(run.stats.sstf)],
      ["LOOK", String(run.stats.look)],
    ],
  },
  next: ["escalonamento", "chamada-de-sistema"],
  practice,
};

export default lesson;
