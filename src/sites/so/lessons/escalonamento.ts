import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import { spreadRow } from "../../../scene/geometry.ts";
import { type Algo, type Proc, type SchedResult, schedule } from "../../../sim/os/sched.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { escalonamento as practice } from "../practice.ts";

/**
 * The same four processes under FCFS, SJF, SRTF, fixed priority and Round Robin, one Gantt lane
 * per algorithm and a table of averages, so the trade-offs show side by side.
 */
export const NAMES = ["backup", "editor", "compilador", "player", "planilha", "terminal"] as const;
const ROLES: Role[] = ["a", "b", "s3", "s4", "s5", "s6"];
export const DEFAULT_PROCS = "0:9:3 1:2:2 2:6:1 4:3:0";
const LANES = ["FCFS", "SJF", "SRTF", "Prioridade", "Round Robin"] as const;
const ALGOS: Algo[] = ["fcfs", "sjf", "srtf", "prio", "rr"];

export function parseProcs(spec: string): Proc[] {
  const items = spec.split(/[\s,;]+/).filter(Boolean);
  if (items.length < 2 || items.length > NAMES.length) throw new Error("Use de 2 a 6 processos");
  return items.map((it, i) => {
    const [a, b, p] = it.split(":").map(Number);
    const ok = (v: number | undefined, lo: number, hi: number) =>
      Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
    if (!ok(a, 0, 20) || !ok(b, 1, 12) || !ok(p, 0, 9))
      throw new Error(`Processo ${i + 1}: use chegada:CPU:prioridade (0–20, 1–12, 0–9)`);
    return { pid: NAMES[i] as string, arrival: a as number, burst: b as number, priority: p as number };
  });
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ","));

function read(p: Params) {
  const quantum = Math.min(6, Math.max(1, Number(p.quantum ?? 2)));
  const procs = parseProcs(String(p.processos ?? DEFAULT_PROCS));
  const runs = ALGOS.map((algo) => schedule(procs, { algo, quantum, switchCost: 0 }));
  return { quantum, procs, runs };
}

function scene(p: Params): SceneSpec {
  const { procs, runs } = read(p);
  const span = Math.max(10, Math.ceil(Math.max(...runs.map((r) => r.makespan)) / 5) * 5);
  // Six processes do not fit one row at their label widths: a second row pushes the rest down.
  const row = spreadRow(
    procs.map((x, i) => ({
      id: `p${i}`,
      kind: "process" as const,
      label: `${x.pid} · prio ${x.priority}`,
      sub: `chega ${x.arrival} · CPU ${x.burst}`,
      at: [0, 0] as const,
    })),
    { x0: 40, x1: 920, y: 70, rowGap: 70 },
  );
  const dy = (row.rows - 1) * 70;
  return {
    viewBox: [960, 620 + dy],
    nodes: row.nodes,
    links: [],
    widgets: [
      {
        kind: "gantt",
        id: "gantt",
        title: "Quem usa a CPU em cada tick, por algoritmo",
        at: [40, 130 + dy],
        lanes: [...LANES],
        span,
        width: 880,
      },
      {
        kind: "table",
        id: "res",
        title: "Médias (ticks)",
        at: [40, 420 + dy],
        columns: ["Algoritmo", "Espera", "Resposta", "Retorno", "Trocas"],
        widths: [150, 110, 110, 110, 90],
        rows: 5,
      },
    ],
  };
}

export function build(p: Params) {
  const { quantum, procs, runs } = read(p);
  const b = lessonBuilder();
  const idx = new Map(procs.map((x, i) => [x.pid, i]));
  const role = (pid: string): Role => ROLES[idx.get(pid) ?? 0] ?? "a";
  let seq = 0;
  const [fcfs, sjf, srtf, prio, rr] = runs as [
    SchedResult,
    SchedResult,
    SchedResult,
    SchedResult,
    SchedResult,
  ];

  const lane = (i: number) => {
    const r = runs[i] as SchedResult;
    const name = LANES[i] as string;
    for (const s of r.slices) {
      seq += 1;
      if (s.kind === "run" && s.pid)
        b.ev({
          t: seq,
          kind: "gantt",
          lane: name,
          from: s.from,
          to: s.to,
          item: s.pid,
          itemRole: role(s.pid),
          role: role(s.pid),
          label: `${name}: ${s.pid} de ${s.from} a ${s.to}`,
          row: {
            cols: {
              t: `${s.from}–${s.to}`,
              who: name,
              what: s.pid,
              detail: s.to - s.from === 1 ? "1 tick" : `${s.to - s.from} ticks`,
            },
          },
        });
      else
        b.ev({
          t: seq,
          kind: "gantt",
          lane: name,
          from: s.from,
          to: s.to,
          item: "ociosa",
          itemRole: "muted",
          role: "muted",
          label: `${name}: CPU ociosa de ${s.from} a ${s.to}`,
        });
    }
    b.ev({
      t: seq,
      kind: "row",
      table: "res",
      index: i,
      cells: [name, fmt(r.avgWait), fmt(r.avgResponse), fmt(r.avgTurnaround), String(r.switches)],
      mark: "new",
      role: "b",
      label: `${name}: espera média ${fmt(r.avgWait)}`,
    });
  };

  const first = [...procs].sort((x, y) => x.arrival - y.arrival)[0] as Proc;
  const shortest = [...procs].sort((x, y) => x.burst - y.burst || x.arrival - y.arrival)[0] as Proc;
  const top = [...procs].sort((x, y) => x.priority - y.priority || x.arrival - y.arrival)[0] as Proc;
  const low = [...procs].sort((x, y) => y.priority - x.priority || x.arrival - y.arrival)[0] as Proc;
  const w = (r: SchedResult, pid: string) => r.stats[pid]?.wait ?? 0;
  const maxWait = (r: SchedResult) =>
    procs.reduce((a, x) => (w(r, x.pid) > w(r, a.pid) ? x : a), procs[0] as Proc);
  const best = runs.reduce((a, r, i) => (r.avgWait < (runs[a] as SchedResult).avgWait ? i : a), 0);
  const bestResp = runs.reduce(
    (a, r, i) => (r.avgResponse < (runs[a] as SchedResult).avgResponse ? i : a),
    0,
  );

  b.step(
    {
      id: "s1-fcfs",
      title: "Por ordem de chegada",
      subtitle: "FCFS: quem chega primeiro usa primeiro",
      text: `O [[escalonador]] mais simples é uma fila: quem chega primeiro roda até terminar. O ${first.pid} chegou primeiro e segura a CPU por ${first.burst} ticks. Enquanto isso, o ${shortest.pid}, que só precisava de ${shortest.burst}, espera ${w(fcfs, shortest.pid)} ticks. É o efeito comboio: um processo longo na frente atrasa todos os curtos. A [[tempo-de-espera|espera]] média fica em ${fmt(fcfs.avgWait)} ticks.`,
      facts: [
        ["Espera média", `${fmt(fcfs.avgWait)} ticks`],
        [`Espera do ${shortest.pid}`, `${w(fcfs, shortest.pid)} ticks`],
        ["Trocas", String(fcfs.switches)],
      ],
      highlight: [`p${idx.get(first.pid)}`],
    },
    () => lane(0),
  );

  b.step(
    {
      id: "s2-sjf",
      title: "O mais curto primeiro",
      subtitle: "SJF, sem interromper ninguém",
      text: `O SJF escolhe, entre os que esperam, o de menor tempo de CPU. Quando a fila é a mesma, isso dá a menor espera média possível. Mas ele não interrompe quem já está rodando: no tick ${first.arrival} só havia o ${first.pid}, que roda até o fim. Depois os curtos passam na frente, e a espera média cai para ${fmt(sjf.avgWait)} ticks. O problema prático: o sistema não sabe de antemão quanto cada processo vai usar.`,
      facts: [
        ["Espera média", `${fmt(sjf.avgWait)} ticks`],
        ["Interrompe?", "não"],
        ["Precisa saber", "o tempo de CPU de cada um"],
      ],
      highlight: [`p${idx.get(shortest.pid)}`],
    },
    () => lane(1),
  );

  const srtfLast = [...procs].sort(
    (x, y) => (srtf.stats[y.pid]?.finish ?? 0) - (srtf.stats[x.pid]?.finish ?? 0),
  )[0] as Proc;
  b.step(
    {
      id: "s3-srtf",
      title: "Interromper pelo restante",
      subtitle: "SRTF: a versão com preempção",
      text: `O SRTF faz a mesma escolha a cada chegada: se o novo processo precisa de menos tempo do que falta ao atual, ganha a CPU na hora. Isso é [[preempcao]]. A espera média desce para ${fmt(srtf.avgWait)} ticks e a resposta média para ${fmt(srtf.avgResponse)}. O preço aparece no ${maxWait(srtf).pid}: interrompido por todos os curtos, ele espera ${w(srtf, maxWait(srtf).pid)} ticks.`,
      facts: [
        ["Espera média", `${fmt(srtf.avgWait)} ticks`],
        ["Quem mais espera", `${maxWait(srtf).pid}, ${w(srtf, maxWait(srtf).pid)} ticks`],
        ["Trocas", String(srtf.switches)],
      ],
      highlight: [`p${idx.get(maxWait(srtf).pid)}`],
      quiz: {
        kind: "number",
        prompt: `No SRTF, em que tick o último processo (${srtfLast.pid}) termina?`,
        answer: srtf.stats[srtfLast.pid]?.finish ?? 0,
        unit: "tick",
        explain: `Somando todo o trabalho e descontando a CPU ociosa, o último processo termina no tick ${srtf.stats[srtfLast.pid]?.finish}. O SRTF muda a ordem, não o total de trabalho; quem fica para o fim é quem tem mais a fazer.`,
      },
    },
    () => lane(2),
  );

  b.step(
    {
      id: "s4-prio",
      title: "Prioridade fixa",
      subtitle: "Importância em vez de tamanho",
      text: `Com prioridades, roda sempre o processo mais importante (menor número), interrompendo os outros. O ${top.pid}, prioridade ${top.priority}, passa na frente de todos; o ${low.pid}, prioridade ${low.priority}, espera ${w(prio, low.pid)} ticks. Se processos importantes não pararem de chegar, os de baixa prioridade podem nunca rodar: é a [[inanicao]]. A saída comum é o envelhecimento, que aumenta a prioridade de quem espera muito.`,
      facts: [
        ["Espera média", `${fmt(prio.avgWait)} ticks`],
        [`Espera do ${low.pid}`, `${w(prio, low.pid)} ticks`],
        ["Remédio", "envelhecimento (aging)"],
      ],
      highlight: [`p${idx.get(top.pid)}`, `p${idx.get(low.pid)}`],
    },
    () => lane(3),
  );

  b.step(
    {
      id: "s5-rr",
      title: "Revezamento com quantum",
      subtitle: `Round Robin, quantum ${quantum}`,
      text: `O Round Robin não precisa adivinhar nada: cada processo usa no máximo ${quantum} ticks, o [[quantum]], e volta para o fim da fila. Todos começam cedo: a resposta média é ${fmt(rr.avgResponse)} ticks. Em troca, a espera média sobe para ${fmt(rr.avgWait)} e há ${rr.switches} trocas de contexto. Aqui a troca custa zero; num sistema real cada uma gasta tempo.`,
      facts: [
        ["Resposta média", `${fmt(rr.avgResponse)} ticks`],
        ["Espera média", `${fmt(rr.avgWait)} ticks`],
        ["Trocas", String(rr.switches)],
      ],
      highlight: procs.map((_, i) => `p${i}`),
    },
    () => lane(4),
  );

  b.step(
    {
      id: "s6-comparar",
      title: "Comparando os cinco",
      subtitle: "Toda vitória tem um preço",
      text: `Na tabela, a menor espera média é do ${LANES[best]} e a menor resposta média, do ${LANES[bestResp]}. Mas cada vitória tem um preço: SJF e SRTF precisam saber quanto cada processo vai usar, e a prioridade depende de alguém marcar certo o que importa. O Round Robin não precisa de informação nenhuma e ainda responde em ${fmt(rr.avgResponse)} ticks. Sistemas reais misturam as ideias: filas de várias prioridades, e processos que descem de fila quando gastam muita CPU.`,
      facts: [
        ["Menor espera", `${LANES[best]} (${fmt((runs[best] as SchedResult).avgWait)})`],
        ["Menor resposta", `${LANES[bestResp]} (${fmt((runs[bestResp] as SchedResult).avgResponse)})`],
        ["Na prática", "filas múltiplas com realimentação"],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: "Por que os sistemas não usam o SRTF puro, se ele dá a menor espera média?",
        options: [
          "Porque ele não usa preempção",
          "Porque precisa saber quanto de CPU falta a cada processo, e isso não se sabe de antemão",
          "Porque deixa a CPU ociosa",
          "Porque só funciona com um processo",
        ],
        answer: 1,
        explain:
          "O SRTF escolhe pelo tempo de CPU restante, algo que o sistema só consegue estimar pelo comportamento passado. Além disso, processos longos podem esperar indefinidamente. Por isso os sistemas reais aproximam a ideia com filas de prioridade que se ajustam sozinhas.",
      },
    },
    () => {
      seq += 1;
      b.ev({
        t: seq,
        kind: "row",
        table: "res",
        index: best,
        cells: [
          LANES[best] as string,
          fmt((runs[best] as SchedResult).avgWait),
          fmt((runs[best] as SchedResult).avgResponse),
          fmt((runs[best] as SchedResult).avgTurnaround),
          String((runs[best] as SchedResult).switches),
        ],
        mark: "hit",
        role: "b",
        label: `Menor espera média: ${LANES[best]}`,
      });
    },
  );

  return b.done({
    fcfs: fcfs.avgWait,
    sjf: sjf.avgWait,
    srtf: srtf.avgWait,
    prio: prio.avgWait,
    rr: rr.avgWait,
    rrResp: rr.avgResponse,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "escalonamento",
    site: "so",
    title: "Escalonamento: cinco jeitos de dividir a CPU",
    summary:
      "Os mesmos quatro processos sob FCFS, SJF, SRTF, prioridade e Round Robin, lado a lado: espera, resposta, trocas e quem sai perdendo.",
    area: "Escalonamento",
    refs: [
      {
        book: "tanenbaum-mos",
        chapter: 2,
        section: "2.4.2",
        note: "Escalonamento em sistemas em lote",
        verified: true,
      },
      {
        book: "tanenbaum-mos",
        chapter: 2,
        section: "2.4.3",
        note: "Escalonamento em sistemas interativos",
        verified: true,
      },
      {
        book: "maziero-so",
        chapter: 6,
        section: "6.4",
        note: "Algoritmos de escalonamento de tarefas",
        verified: true,
      },
    ],
    simplifications: [
      "Só rajadas de CPU, sem entrada e saída; um único núcleo.",
      "Troca de contexto sem custo, para comparar só as políticas.",
      "Empates resolvidos por ordem de chegada.",
    ],
  },
  scene,
  params: {
    defaults: { quantum: 2, processos: DEFAULT_PROCS },
    fields: [
      { key: "quantum", kind: "int", label: "Quantum do Round Robin (ticks)", min: 1, max: 6 },
      {
        key: "processos",
        kind: "list",
        label: "Processos (chegada:CPU:prioridade)",
        maxItems: 6,
        pattern: "\\d{1,2}:\\d{1,2}:\\d",
        placeholder: DEFAULT_PROCS,
        help: "De 2 a 6 processos, na ordem backup, editor, compilador, player, planilha, terminal. Prioridade 0 é a mais alta.",
      },
    ],
  },
  build,
  intro: {
    text: "Quando vários programas querem a CPU, alguém decide quem vai primeiro. Essa decisão muda quanto cada um espera e quanto o sistema parece rápido. Você vai rodar os mesmos quatro processos sob cinco políticas e comparar, lado a lado, quem ganha e quem perde em cada uma.",
    facts: [
      ["Processos", "backup, editor, compilador, player"],
      ["Políticas", "FCFS, SJF, SRTF, prioridade, Round Robin"],
      ["Métricas", "espera, resposta, retorno, trocas"],
    ],
  },
  outro: {
    title: "Escalonamento em resumo",
    text: "Escolher pelo menor tempo reduz a espera média, mas exige prever o futuro e pode deixar os longos para trás. Prioridades atendem o que importa e arriscam inanição. O rodízio responde rápido e paga em trocas. Por isso os sistemas combinam as ideias.",
    facts: (run) => [
      ["Espera média FCFS", fmt(Number(run.stats.fcfs))],
      ["Espera média SRTF", fmt(Number(run.stats.srtf))],
      ["Resposta média RR", fmt(Number(run.stats.rrResp))],
    ],
  },
  next: ["round-robin", "produtor-consumidor"],
  practice,
};

export default lesson;
