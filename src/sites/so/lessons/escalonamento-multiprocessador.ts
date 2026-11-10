import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import { CORES, type SmpPolicy, type SmpRun, type SmpTask, smp } from "../../../sim/os/smp.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Scheduling on two cores: a shared ready queue that balances load but moves tasks between caches,
 * per-core queues with affinity that keep caches warm but leave a core idle, work stealing that
 * gets both, how Linux balances, and why cooperating threads are scheduled as a gang.
 */
export const DEFAULTS = { quantum: 2, aquecimento: 2 };
const TASKS: SmpTask[] = [
  { name: "A", burst: 6, home: 0 },
  { name: "B", burst: 6, home: 0 },
  { name: "C", burst: 6, home: 0 },
  { name: "D", burst: 2, home: 1 },
];
const ROLE: Record<string, Role> = { A: "a", B: "b", C: "s3", D: "s4" };
const SHORT: Record<SmpPolicy, string> = { single: "única", affinity: "afinidade", steal: "roubo" };
const LONG: Record<SmpPolicy, string> = {
  single: "fila única",
  affinity: "fila por núcleo",
  steal: "fila por núcleo com roubo",
};
const POLICIES: SmpPolicy[] = ["single", "affinity", "steal"];
const lane = (p: SmpPolicy, core: number) => `${SHORT[p]} · N${core}`;
const GANTT_W = 880;
const ticks = (n: number) => (n === 1 ? "1 tick" : `${n} ticks`);
const times = (n: number) => (n === 1 ? "1 vez" : `${n} vezes`);
const work = TASKS.reduce((s, t) => s + t.burst, 0);

function clamp(p: Params) {
  const pick = (v: unknown, d: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, Math.round(Number(v ?? d))));
  return { q: pick(p.quantum, DEFAULTS.quantum, 1, 6), w: pick(p.aquecimento, DEFAULTS.aquecimento, 0, 4) };
}

function runs(q: number, w: number) {
  return Object.fromEntries(POLICIES.map((p) => [p, smp(TASKS, p, q, w)])) as Record<SmpPolicy, SmpRun>;
}

function scene(p: Params): SceneSpec {
  const { q, w } = clamp(p);
  const r = runs(q, w);
  return {
    viewBox: [960, 640],
    nodes: [],
    links: [],
    widgets: [
      {
        kind: "gantt",
        id: "cpu",
        title: "Dois núcleos, N0 e N1, em cada política · ~ = recarregando a cache",
        at: [40, 50],
        lanes: POLICIES.flatMap((x) => [lane(x, 0), lane(x, 1)]),
        span: Math.max(...POLICIES.map((x) => r[x].end)) + 2,
        width: GANTT_W,
      },
      {
        kind: "table",
        id: "tarefas",
        title: "Tarefas",
        at: [40, 360],
        columns: ["Tarefa", "CPU", "Criada em"],
        widths: [80, 80, 110],
        rows: TASKS.length,
      },
      {
        kind: "table",
        id: "cmp",
        title: `Quantum ${q}, migrar custa ${ticks(w)}`,
        at: [360, 360],
        columns: ["Política", "Termina em", "Migrações", "Núcleo parado"],
        widths: [190, 100, 100, 130],
        rows: POLICIES.length + 1,
      },
    ],
  };
}

export function build(p: Params) {
  const { q, w } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const r = runs(q, w);
  const span = Math.max(...POLICIES.map((x) => r[x].end)) + 2;
  const scale = (GANTT_W - 92) / span;
  const one = r.single;
  const aff = r.affinity;
  const st = r.steal;
  const free = smp(TASKS, "single", q, 0);
  const affN1 = aff.slices.filter((s) => s.core === 1).reduce((m, s) => Math.max(m, s.to), 0);

  const draw = (x: SmpPolicy) => {
    for (const s of r[x].slices) {
      const t = c.t + 1;
      c.at(t);
      const warm = s.kind === "warm";
      const name = warm ? `${s.task}~` : s.task;
      b.ev({
        t,
        kind: "gantt",
        lane: lane(x, s.core),
        from: s.from,
        to: s.to,
        item: (s.to - s.from) * scale >= 18 ? name : "",
        itemRole: warm ? "muted" : (ROLE[s.task] ?? "a"),
        role: ROLE[s.task] ?? "a",
        label: `${LONG[x]}, N${s.core}: ${s.task} ${warm ? "recarrega a cache" : "executa"}, ticks ${s.from} a ${s.to}`,
        row: {
          cols: {
            t: `${s.from}–${s.to}`,
            who: s.task,
            what: warm ? "recarrega a cache" : "executa",
            detail: `${LONG[x]}, N${s.core}`,
          },
        },
      });
    }
  };
  const result = (x: SmpPolicy, i: number, mark: "new" | "hit" | "bad" | "warn") => {
    const run = r[x];
    c.row("cmp", i, [LONG[x], `tick ${run.end}`, String(run.migrations), ticks(run.idle)], { dt: 1, mark });
  };

  b.step(
    {
      id: "s1-nucleos",
      title: "Dois núcleos, duas caches",
      subtitle: `${TASKS.length} tarefas, ${work} ticks de CPU`,
      text: `Agora há ${CORES} núcleos, e cada um tem a sua [[cache]]. Uma tarefa que roda sempre no mesmo núcleo encontra os seus dados ali; se mudar de núcleo, passa os primeiros ${ticks(w)} buscando tudo de novo na memória. As tarefas A, B e C foram criadas por um processo que rodava no núcleo N0, e D nasceu no N1. Com ${work} ticks de trabalho, o melhor possível seria terminar no tick ${work / CORES}, com os dois núcleos ocupados o tempo todo.`,
      facts: [
        ["Núcleos", String(CORES)],
        ["Trabalho total", ticks(work)],
        ["Custo de migrar", ticks(w)],
      ],
      highlight: ["tarefas"],
    },
    () => {
      TASKS.forEach((t, i) => {
        c.row("tarefas", i, [t.name, ticks(t.burst), `N${t.home}`], {
          dt: 1,
          mark: "new",
          role: ROLE[t.name] ?? "a",
        });
      });
    },
  );

  b.step(
    {
      id: "s2-unica",
      title: "Uma fila para todos",
      subtitle: `Termina no tick ${one.end}`,
      text: `Na fila única, o núcleo que fica livre pega quem está na frente, como no [[quantum|round robin]] de um núcleo só. A carga se equilibra sozinha: nenhum núcleo fica parado enquanto há tarefa esperando. ${one.migrations === 0 ? `Com quantum ${q}, nenhuma tarefa chegou a mudar de núcleo; com fatias menores, elas pulam, e cada pulo gasta ${ticks(w)} recarregando a cache.` : `O preço é que as tarefas pulam de um núcleo para outro: ${times(one.migrations)} aqui, e cada pulo gasta ${ticks(w)} recarregando a cache, marcados com ~.`} Com muitos núcleos, a própria fila vira gargalo, porque todos disputam a mesma trava para mexer nela.`,
      facts: [
        ["Termina em", `tick ${one.end}`],
        ["Migrações", String(one.migrations)],
        ["Núcleo parado", ticks(one.idle)],
      ],
      highlight: ["cpu", "cmp"],
    },
    () => {
      draw("single");
      result("single", 0, "warn");
    },
  );

  b.step(
    {
      id: "s3-afinidade",
      title: "Cada núcleo com a sua",
      subtitle: `N1 parado do tick ${affN1} em diante`,
      text: `Com uma fila por núcleo, cada tarefa fica onde nasceu: é a [[afinidade]]. Nenhuma migração, e a cache está sempre quente. Mas A, B e C estão todas na fila do N0, e o N1 termina D no tick ${affN1} e fica parado até o fim, ${ticks(aff.idle)} jogados fora. O último a terminar sai no tick ${aff.end}, pior que a fila única. Afinidade sem equilíbrio de carga só funciona se o trabalho já nasce bem dividido.`,
      facts: [
        ["Termina em", `tick ${aff.end}`],
        ["Migrações", String(aff.migrations)],
        ["Núcleo parado", ticks(aff.idle)],
      ],
      highlight: ["cpu", "cmp"],
      quiz: {
        kind: "number",
        prompt: `Com uma fila por núcleo e sem nunca mover tarefas, em que tick o N0 termina A, B e C?`,
        answer: aff.end,
        unit: "tick",
        explain: `O N0 faz sozinho os ${TASKS.filter((t) => t.home === 0).reduce((s, t) => s + t.burst, 0)} ticks de A, B e C, sem migração: termina no tick ${aff.end}.`,
      },
    },
    () => {
      draw("affinity");
      result("affinity", 1, "bad");
    },
  );

  b.step(
    {
      id: "s4-roubo",
      title: "Roubar quando sobra",
      subtitle: `Termina no tick ${st.end}`,
      text: `A saída é manter as filas por núcleo e deixar o núcleo ocioso roubar trabalho: quando o N1 esvazia a sua fila, ele tira uma tarefa do fim da fila do N0. ${st.migrations === 0 ? "A tarefa roubada ainda não tinha rodado, então não havia cache para perder" : `Ela paga a migração uma vez e depois fica no N1, com a cache quente. Aqui houve ${times(st.migrations)}, contra ${one.migrations} da fila única`}, e o último termina no tick ${st.end}. Roubar só quando se está ocioso evita mexer em quem está indo bem.`,
      facts: [
        ["Termina em", `tick ${st.end}`],
        ["Migrações", String(st.migrations)],
        ["Núcleo parado", ticks(st.idle)],
      ],
      highlight: ["cpu", "cmp"],
      quiz: {
        kind: "choice",
        prompt: "Por que o núcleo só rouba quando a própria fila está vazia?",
        options: [
          "Toda migração custa recarregar a cache, então só vale quando o núcleo ficaria parado",
          "Porque a fila do outro núcleo fica travada enquanto ele trabalha",
          "Porque tarefas roubadas rodam com prioridade mais baixa",
        ],
        answer: 0,
        explain: `Cada migração custou ${ticks(w)} aqui. Se o núcleo tem trabalho próprio, roubar só trocaria cache quente por cache fria.`,
      },
    },
    () => {
      draw("steal");
      result("steal", 2, "hit");
    },
  );

  b.step(
    {
      id: "s5-linux",
      title: "Como o Linux faz",
      subtitle: `Sem custo de migrar: tick ${free.end}`,
      text: `Se migrar fosse de graça, a fila única terminaria no tick ${free.end}, e não haveria motivo para afinidade. Como não é, o Linux dá a cada núcleo a sua fila e equilibra de tempos em tempos e sempre que um núcleo fica ocioso. Ele prefere mover tarefas entre núcleos que dividem cache, depois dentro do mesmo processador e só por último entre processadores. Um programa pode fixar as suas threads em núcleos com sched_setaffinity.`,
      facts: [
        ["Fila única sem custo", `tick ${free.end}`],
        ["Linux", "fila por núcleo + equilíbrio"],
        ["Fixar núcleo", "sched_setaffinity"],
      ],
      highlight: ["cmp"],
    },
    () => {
      c.row(
        "cmp",
        3,
        ["fila única, migrar grátis", `tick ${free.end}`, String(free.migrations), ticks(free.idle)],
        {
          dt: 1,
          mark: "new",
        },
      );
    },
  );

  b.step(
    {
      id: "s6-gangue",
      title: "Threads que andam juntas",
      subtitle: "Escalonamento em gangue",
      text: `Há um caso em que equilibrar tarefa por tarefa não basta: threads de um mesmo programa que trocam mensagens o tempo todo. Se uma roda e a parceira está na fila, cada resposta espera um quantum inteiro. O [[escalonamento-em-gangue]] põe as threads do grupo para rodar ao mesmo tempo, cada uma num núcleo, e as tira juntas no fim do quantum. É comum em computação científica e em máquinas virtuais com vários processadores virtuais.`,
      facts: [
        ["Problema", "parceira fora da CPU"],
        ["Solução", "rodar o grupo junto"],
        ["Onde", "MPI e VMs com várias vCPUs"],
      ],
      highlight: [],
    },
    () => {
      c.row("cmp", 2, [LONG.steal, `tick ${st.end}`, String(st.migrations), ticks(st.idle)], {
        dt: 1,
        mark: "hit",
      });
    },
  );

  return b.done({
    single: one.end,
    affinity: aff.end,
    steal: st.end,
    migSingle: one.migrations,
    migSteal: st.migrations,
    idleAffinity: aff.idle,
    free: free.end,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "escalonamento-multiprocessador",
    site: "so",
    title: "Escalonamento com vários núcleos",
    summary:
      "Fila única equilibra mas faz tarefas pularem de cache em cache; fila por núcleo mantém a cache quente mas deixa núcleo parado; roubar trabalho quando sobra dá o melhor dos dois.",
    area: "Escalonamento",
    refs: [
      {
        book: "tanenbaum-mos",
        chapter: 8,
        section: "8.1.4",
        note: "Escalonamento de multiprocessadores",
        verified: true,
      },
    ],
    simplifications: [
      "Dois núcleos e round robin em cada um; o Linux usa o CFS, com prioridades e pesos.",
      "Migrar custa um número fixo de ticks; na prática depende de quanto dado a tarefa usa.",
      "A fila única não cobra o custo da trava que os núcleos disputam.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "quantum", kind: "int", label: "Quantum (ticks)", min: 1, max: 6 },
      { key: "aquecimento", kind: "int", label: "Custo de migrar (ticks)", min: 0, max: 4 },
    ],
  },
  build,
  intro: {
    text: "Com vários núcleos, o escalonador decide também onde cada tarefa roda. Você vai comparar uma fila única, uma fila por núcleo e o roubo de trabalho, e ver o que cada uma faz com a cache e com o núcleo que fica sem nada.",
    facts: [
      ["Núcleos", String(CORES)],
      ["Tarefas", TASKS.map((t) => t.name).join(", ")],
      ["Custo de migrar", ticks(DEFAULTS.aquecimento)],
    ],
  },
  outro: {
    title: "Vários núcleos em resumo",
    text: "Fila única equilibra a carga, mas espalha tarefas pelas caches e vira gargalo. Filas por núcleo preservam a afinidade, mas precisam de equilíbrio: o núcleo ocioso rouba trabalho, e o kernel prefere mover tarefas entre núcleos próximos. Threads que conversam muito rodam melhor juntas, em gangue.",
    facts: (run) => [
      ["Fila única", `tick ${run.stats.single}`],
      ["Fila por núcleo", `tick ${run.stats.affinity}`],
      ["Com roubo", `tick ${run.stats.steal}`],
    ],
  },
  next: ["round-robin", "escalonamento", "threads"],
};

export default lesson;
