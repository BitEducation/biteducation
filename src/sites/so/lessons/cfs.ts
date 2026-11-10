import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import { type Result, run, type Task, WEIGHT } from "../../../sim/os/cfs.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Linux CFS: editor and compilador (nice 0) share the CPU with a backup at nice 5; a player
 * arrives at tick 16. Run twice: new task placed at the minimum vruntime, and at 0.
 */
export const DEFAULTS = { nice: "5" };
const NICES = ["-5", "0", "5", "10"];
const niceOf = (p: Params) => Number(NICES.includes(String(p.nice)) ? p.nice : DEFAULTS.nice);
const tasksFor = (nice: number): Task[] => [
  { name: "editor", nice: 0, arrival: 0 },
  { name: "compilador", nice: 0, arrival: 0 },
  { name: "backup", nice, arrival: 0 },
  { name: "player", nice: 0, arrival: 16 },
];
const TASKS = tasksFor(niceOf(DEFAULTS));
const TICKS = 32;
const ROLES: Role[] = ["a", "b", "s3", "s4"];
const LATE = 3;
const ARRIVE = (TASKS[LATE] as Task).arrival;

const dec = (x: number, d = 2) => String(Math.round(x * 10 ** d) / 10 ** d).replace(".", ",");

function scene(p: Params): SceneSpec {
  const r = run(tasksFor(niceOf(p)), TICKS, "min");
  const top = Math.max(14, Math.ceil(Math.max(...r.vr.flat().map((v) => v ?? 0))) + 1);
  return {
    viewBox: [960, 600],
    nodes: [],
    links: [],
    widgets: [
      {
        kind: "gantt",
        id: "cpu",
        title: "Quem roda em cada ms (E editor, C compilador, B backup, P player)",
        at: [40, 40],
        lanes: ["Novato no mínimo", "Novato em zero"],
        span: TICKS,
        width: 880,
      },
      {
        kind: "chart",
        id: "vr",
        title: "Tempo virtual (vruntime) de cada tarefa",
        at: [40, 170],
        width: 520,
        height: 220,
        x: { label: "ms", max: TICKS },
        y: { label: "vruntime (ms)", max: top },
      },
      {
        kind: "table",
        id: "tarefas",
        title: "Tarefas",
        at: [600, 170],
        columns: ["Tarefa", "nice", "Peso", "ms de CPU"],
        widths: [110, 60, 70, 90],
        rows: TASKS.length,
      },
      {
        kind: "table",
        id: "comparar",
        title: "O novato chega no ms 16",
        at: [40, 440],
        columns: ["Onde o novato começa", "Maior rajada seguida", "ms do editor"],
        widths: [260, 200, 160],
        rows: 2,
      },
    ],
  };
}

export function build(p: Params = DEFAULTS) {
  const nice = niceOf(p);
  const TASKS = tasksFor(nice);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => `ms ${t}`);
  const min = run(TASKS, TICKS, "min");
  const zero = run(TASKS, TICKS, "zero");
  let seq = 0;
  const drawn = { min: 0, zero: 0 };
  const draw = (r: Result, lane: "min" | "zero", until: number) => {
    const name = lane === "min" ? "Novato no mínimo" : "Novato em zero";
    for (const s of r.slices) {
      if (s.from < drawn[lane] || s.from >= until) continue;
      const k = TASKS[s.task] as Task;
      seq += 1;
      b.ev({
        t: seq,
        kind: "gantt",
        gantt: "cpu",
        lane: name,
        from: s.from,
        to: s.to,
        item: (k.name[0] as string).toUpperCase(),
        itemRole: ROLES[s.task] as Role,
        role: ROLES[s.task] as Role,
        label: `${k.name} do ms ${s.from} ao ${s.to}`,
        row: { cols: { t: `ms ${s.from}`, who: name, what: k.name, detail: `${s.to - s.from} ms` } },
      });
      if (lane === "min") {
        const v = r.vr[s.to - 1] as (number | null)[];
        v.forEach((y, i) => {
          if (y !== null && (i === s.task || s.from === ARRIVE))
            c.plot("vr", (TASKS[i] as Task).name, s.to, Math.round(y * 100) / 100, {
              role: ROLES[i] as Role,
              dt: 0,
              label: `${(TASKS[i] as Task).name}: ${dec(y)}`,
            });
        });
      }
    }
    drawn[lane] = until;
    c.at(seq);
    seq = c.t;
  };
  const ranUntil = (r: Result, task: number, until: number) =>
    r.slices.filter((s) => s.task === task && s.to <= until).reduce((a, s) => a + s.to - s.from, 0);
  const table = (until: number) => {
    TASKS.forEach((k, i) => {
      if (k.arrival >= until) return;
      c.row("tarefas", i, [k.name, String(k.nice), String(WEIGHT[k.nice]), String(ranUntil(min, i, until))], {
        dt: 0,
        mark: "new",
      });
    });
  };
  const wb = WEIGHT[nice] as number;
  const step = 1024 / wb;
  const wrong = step === 1 ? [1024 / 335, 335 / 1024] : [1, 1 / step];
  const why = nice > 0 ? "para incomodar menos" : nice < 0 ? "para ter prioridade" : "como os outros";
  const before = [0, 1, 2].map((i) => ranUntil(min, i, ARRIVE));
  const total = [0, 1, 2].reduce((a, i) => a + (WEIGHT[(TASKS[i] as Task).nice] as number), 0);
  const share = Math.round((wb / total) * 100);
  const atArrival = (min.vr[ARRIVE] as (number | null)[])[LATE] as number;
  const firstThree = min.slices.filter((s) => s.from < 3).map((s) => (TASKS[s.task] as Task).name);

  b.step(
    {
      id: "s1-tempo-virtual",
      title: "Quem rodou menos roda",
      subtitle: "O menor vruntime ganha a CPU",
      text: `O escalonador do Linux de 2007 a 2023, o [[cfs]], não usa fila nem quantum fixo. Cada tarefa guarda um [[vruntime]], o tempo de CPU que já usou, e a escolhida é sempre a de menor valor. Nos primeiros 3 ms rodam ${firstThree.join(", ")}: cada uma, ao rodar, passa a ter mais vruntime que as outras e cede a vez. Ninguém espera muito porque ninguém fica muito à frente.`,
      facts: [
        ["Escolha", "menor vruntime"],
        ["Tarefas", "3 no começo"],
        ["Fatia", "1 ms"],
      ],
      highlight: [],
    },
    () => {
      draw(min, "min", 3);
      table(3);
    },
  );

  b.step(
    {
      id: "s2-pesos",
      title: "O nice vira peso",
      subtitle: `backup: ${before[2]} de ${ARRIVE} ms`,
      text: `O backup roda com nice ${nice}, ${why}. O núcleo traduz nice em [[peso-de-escalonamento|peso]]: 1024 para nice 0 e ${wb} para nice ${nice}. O vruntime cresce o tempo real vezes 1024 dividido pelo peso, então cada ms do backup conta ${dec(step)} ms virtuais. Até o ms ${ARRIVE}, editor e compilador rodaram ${before[0]} e ${before[1]} ms e o backup ${before[2]}: perto dos ${share}% que o peso promete.`,
      facts: [
        ["Peso nice 0", "1024"],
        [`Peso nice ${nice}`, String(wb)],
        ["Fatia prometida ao backup", `${share}%`],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: `O backup (nice ${nice}) roda 1 ms. Quanto cresce o vruntime dele?`,
        options: [`${dec(step)} ms`, ...wrong.map((x) => `${dec(x)} ms`)],
        answer: 0,
        explain: `O crescimento é 1024 / ${wb} = ${dec(step)} ms por ms real; quanto menor o peso, mais rápido o vruntime sobe e mais tarde a tarefa volta a ser escolhida.`,
      },
    },
    () => {
      draw(min, "min", ARRIVE);
      table(ARRIVE);
    },
  );

  b.step(
    {
      id: "s3-novato",
      title: "Quem chega entra no fim",
      subtitle: `player começa com ${dec(atArrival)}`,
      text: `No ms ${ARRIVE} o player acorda. Se começasse com vruntime 0, ficaria muito atrás de todos e ganharia a CPU por um bom tempo. O CFS faz o novato começar no menor vruntime entre as tarefas prontas, ${dec(atArrival)} aqui. A partir daí ele entra no revezamento como os outros e, até o ms ${TICKS}, roda ${min.ran[LATE]} ms, nunca mais de ${min.longest[LATE]} ms seguido.`,
      facts: [
        ["Chegada", `ms ${ARRIVE}`],
        ["vruntime inicial", dec(atArrival)],
        ["Maior rajada", `${min.longest[LATE]} ms`],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: "Por que o player não começa com vruntime 0 ao acordar?",
        options: [
          "Ficaria tão atrás dos outros que tomaria a CPU por muito tempo",
          "Porque vruntime 0 é reservado para tarefas do núcleo",
          "Porque a árvore rubro-negra não aceita a chave 0",
        ],
        answer: 0,
        explain: `Com 0, o player teria o menor vruntime de longe e seria escolhido em sequência até alcançar ${dec(atArrival)}. Começar no mínimo atual o põe no revezamento na hora.`,
      },
    },
    () => {
      draw(min, "min", TICKS);
      table(TICKS);
      c.row("comparar", 0, ["No menor vruntime", `${min.longest[LATE]} ms`, String(min.ran[0])], {
        dt: 1,
        mark: "hit",
        log: { who: "novato no mínimo", what: `${min.longest[LATE]} ms seguidos`, detail: "" },
      });
    },
  );

  b.step(
    {
      id: "s4-em-zero",
      title: "E se começasse em zero",
      subtitle: `${zero.longest[LATE]} ms seguidos de player`,
      text: `A segunda linha refaz a conta com o novato começando em vruntime 0. Ele monopoliza a CPU por ${zero.longest[LATE]} ms seguidos até alcançar os outros, e o editor fica sem rodar nesse tempo, terminando com ${zero.ran[0]} ms em vez de ${min.ran[0]}. Num sistema ligado há dias, a diferença seria de horas, não de milissegundos. Por isso o ponto de partida é o mínimo, não o zero.`,
      facts: [
        ["Rajada do novato", `${zero.longest[LATE]} ms`],
        ["Editor com mínimo", `${min.ran[0]} ms`],
        ["Editor com zero", `${zero.ran[0]} ms`],
      ],
      highlight: [],
    },
    () => {
      draw(zero, "zero", TICKS);
      c.row("comparar", 1, ["Em zero", `${zero.longest[LATE]} ms`, String(zero.ran[0])], {
        dt: 1,
        mark: "bad",
        log: { who: "novato em zero", what: `${zero.longest[LATE]} ms seguidos`, detail: "o editor espera" },
      });
    },
  );

  b.step(
    {
      id: "s5-arvore",
      title: "Uma árvore, não fila",
      subtitle: "Do CFS ao EEVDF",
      text: "Achar o menor vruntime entre milhares de tarefas precisa ser rápido. O CFS as guarda numa árvore rubro-negra ordenada por vruntime: a mais à esquerda é a próxima, e inserir ou remover custa log n. Em 2023, o Linux 6.6 trocou o CFS pelo EEVDF, que mantém o tempo virtual e os pesos mas também considera um prazo por tarefa, para atender melhor quem precisa de pouca CPU com frequência, como áudio.",
      facts: [
        ["Estrutura", "árvore rubro-negra"],
        ["Custo", "log n"],
        ["Sucessor", "EEVDF, Linux 6.6"],
      ],
      highlight: [],
    },
    () => {
      c.note("cpu", "A tarefa mais à esquerda da árvore é a de menor vruntime", "info", { dt: 1 });
    },
  );

  return b.done(
    {
      before: before.join(","),
      atArrival: dec(atArrival),
      longestMin: min.longest[LATE] ?? 0,
      longestZero: zero.longest[LATE] ?? 0,
      editorMin: min.ran[0] ?? 0,
      editorZero: zero.ran[0] ?? 0,
    },
    nice === Number(DEFAULTS.nice)
      ? []
      : [
          `Com nice ${nice}, o backup tem peso ${wb} e roda ${before[2]} dos primeiros ${ARRIVE} ms, perto dos ${share}% que o peso promete.`,
        ],
  );
}

const lesson: LessonModule = {
  meta: {
    slug: "cfs",
    site: "so",
    title: "CFS: o escalonador por tempo virtual do Linux",
    summary:
      "Três tarefas com pesos diferentes e um novato que chega depois: vruntime, nice e por que o novato não começa em zero.",
    area: "Escalonamento",
    refs: [
      {
        book: "tanenbaum-mos",
        chapter: 10,
        section: "10.3.4",
        note: "Escalonamento no Linux: CFS",
        verified: true,
      },
      {
        url: "https://docs.kernel.org/scheduler/sched-design-CFS.html",
        title: "CFS Scheduler, documentação do kernel",
      },
    ],
    simplifications: [
      "Cada decisão vale 1 ms; o CFS real calcula a fatia a partir de uma latência alvo e do número de tarefas.",
      "Não há sono, grupos de controle nem vários núcleos; o novato entra no mínimo exato, sem o ajuste fino do kernel.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "nice",
        kind: "choice",
        label: "nice do backup",
        options: NICES.map((n) => ({ value: n, label: `nice ${n} (peso ${WEIGHT[Number(n)]})` })),
      },
    ],
  },
  build,
  intro: {
    text: "Round Robin divide a CPU em fatias iguais. O Linux quis algo que respeitasse prioridades sem deixar ninguém de fora. Você vai acompanhar milissegundo a milissegundo quatro tarefas no CFS e ver o efeito de um único número, o nice.",
    facts: [
      ["Tarefas", "editor, compilador, backup, player"],
      ["nice", TASKS.map((t) => t.nice).join(", ")],
      ["Duração", `${TICKS} ms`],
    ],
  },
  outro: {
    title: "CFS em resumo",
    text: "Roda quem tem o menor tempo virtual; o nice muda o peso e, com ele, a velocidade com que o tempo virtual cresce. Quem chega começa no mínimo atual, para não tomar a CPU de quem já estava lá.",
    facts: (run) => [
      ["Rajada do novato no mínimo", `${run.stats.longestMin} ms`],
      ["Rajada do novato em zero", `${run.stats.longestZero} ms`],
      ["vruntime de entrada", String(run.stats.atArrival)],
    ],
  },
  next: ["round-robin", "escalonamento-multiprocessador"],
};

export default lesson;
