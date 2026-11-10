import type { LessonModule, Role, SceneSpec } from "../../../contracts/types.ts";
import { free, type Span, withBarrier } from "../../../sim/os/barrier.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { barreiras as practice } from "../practice.ts";

/**
 * Barriers: four threads of a simulation advance in three phases, each reading its neighbour's
 * previous result. Without a barrier some read stale data; with one, the fast ones wait.
 */
const WORK = [
  [4, 5, 3],
  [6, 2, 4],
  [3, 4, 6],
  [5, 5, 2],
];
const N = WORK.length;
const LANES = WORK.map((_, i) => `T${i + 1}`);
const ROLES: Role[] = ["a", "b", "s3", "s4"];

const scene: SceneSpec = {
  viewBox: [960, 600],
  nodes: [],
  links: [],
  widgets: [
    {
      kind: "gantt",
      id: "sem",
      title: "Sem barreira: cada thread segue no seu ritmo",
      at: [40, 40],
      lanes: LANES,
      span: 18,
      width: 880,
    },
    {
      kind: "gantt",
      id: "com",
      title: "Com barreira ao fim de cada fase",
      at: [40, 250],
      lanes: LANES,
      span: 18,
      width: 880,
    },
    { kind: "counter", id: "velhas", title: "Leituras de dados velhos", at: [40, 470] },
    { kind: "counter", id: "espera", title: "Tiques esperando", at: [360, 470] },
    { kind: "counter", id: "chegaram", title: "Chegaram à barreira", at: [680, 470] },
  ],
};

export function build() {
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const f = free(WORK);
  const w = withBarrier(WORK);
  let seq = 0;
  const bar = (g: "sem" | "com", s: Span, stale = false) => {
    seq += 1;
    const lane = LANES[s.thread] as string;
    const role = stale ? "bad" : (ROLES[s.thread] as Role);
    b.ev({
      t: seq,
      kind: "gantt",
      gantt: g,
      lane,
      from: s.from,
      to: s.to,
      item: `F${s.phase + 1}${stale ? "!" : ""}`,
      itemRole: role,
      role,
      label: `${lane}, fase ${s.phase + 1}: ${s.from} a ${s.to}${stale ? ", leu dado velho" : ""}`,
      row: {
        cols: {
          t: `${s.from}–${s.to}`,
          who: lane,
          what: `fase ${s.phase + 1}`,
          detail: stale ? `leu o resultado de T${((s.thread + 1) % N) + 1} antes de ele terminar` : "",
        },
      },
    });
  };
  const isStale = (s: Span) => f.stale.some((x) => x.thread === s.thread && x.phase === s.phase);
  const pct = Math.round((w.waited / (N * w.total)) * 100);
  const first = f.stale[0] as { thread: number; phase: number };

  b.step(
    {
      id: "s1-fases",
      title: "Trabalho em fases",
      subtitle: `${N} threads, 3 fases`,
      text: `Uma simulação de calor numa placa divide a placa em ${N} faixas, uma por [[thread]]. A cada fase, cada thread calcula a sua faixa usando a borda que a vizinha calculou na fase anterior. As faixas não dão o mesmo trabalho: as durações vão de 2 a 6 tiques. Sem coordenação, cada thread passa para a fase seguinte assim que termina a sua.`,
      facts: [
        ["Threads", String(N)],
        ["Fases", "3"],
        ["Depende de", "resultado da vizinha na fase anterior"],
      ],
      highlight: [],
    },
    () => {
      c.count("velhas", "0", { dt: 1, role: "a", label: "nenhuma leitura ainda" });
    },
  );

  b.step(
    {
      id: "s2-sem",
      title: "Ler antes da hora",
      subtitle: `${f.stale.length} leituras de dados velhos`,
      text: `Sem barreira, ${LANES[first.thread]} começa a fase ${first.phase + 1} e lê a borda de ${LANES[(first.thread + 1) % N]}, que ainda não terminou a fase ${first.phase}: pega o valor velho. Isso acontece ${f.stale.length} vezes nas três fases. O programa termina mais cedo e dá um resultado errado, que muda de uma execução para outra conforme a ordem em que as threads rodam.`,
      facts: [
        ["Dados velhos", String(f.stale.length)],
        ["Primeiro", `${LANES[first.thread]} na fase ${first.phase + 1}`],
        ["Sintoma", "resultado que varia"],
      ],
      highlight: [],
    },
    () => {
      for (const s of f.spans) bar("sem", s, isStale(s));
      c.at(seq);
      c.count("velhas", String(f.stale.length), {
        dt: 1,
        role: "bad",
        label: `${f.stale.length} leituras velhas`,
      });
      seq = c.t;
    },
  );

  b.step(
    {
      id: "s3-com",
      title: "Todas esperam todas",
      subtitle: `Fases terminam em ${w.ends.join(", ")}`,
      text: `Uma [[barreira]] no fim de cada fase segura quem chega primeiro até a última thread chegar. Então todas passam juntas, e quem lê a borda da vizinha sempre encontra o valor da fase certa. A fase dura o tempo da thread mais lenta: as fases terminam nos tiques ${w.ends.join(", ")}, e o programa inteiro leva ${w.total} tiques, com zero leituras velhas.`,
      facts: [
        ["Fim das fases", w.ends.join(", ")],
        ["Total", `${w.total} tiques`],
        ["Dados velhos", "0"],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: "Com a barreira, em quantos tiques o programa termina?",
        answer: w.total,
        unit: "tiques",
        explain: `Cada fase dura o tempo da thread mais lenta: ${WORK.map((_, k) => Math.max(...WORK.map((x) => x[k] as number))).join(" + ")} = ${w.total}.`,
      },
    },
    () => {
      for (let k = 0; k < 3; k++) {
        const phase = w.spans.filter((s) => s.phase === k);
        phase.forEach((s, i) => {
          bar("com", s);
          c.at(seq);
          c.count("chegaram", `${i + 1} de ${N}`, { dt: 0, role: "b", label: `${LANES[s.thread]} chegou` });
        });
        c.at(seq);
        c.note("com", `Fase ${k + 1}: todas chegaram no tique ${w.ends[k]}`, "good", { dt: 1 });
        seq = c.t;
      }
      c.count("velhas", "0", { dt: 1, role: "a", label: "sem leituras velhas" });
      seq = c.t;
    },
  );

  b.step(
    {
      id: "s4-espera",
      title: "O preço da espera",
      subtitle: `${w.waited} de ${N * w.total} tiques parados`,
      text: `As threads rápidas ficam paradas na barreira: somando todas, são ${w.waited} tiques de espera em ${N * w.total}, ${pct}% do tempo. A barreira não cria esse desperdício, só o revela: ele vem do desequilíbrio entre as faixas. Dividir a placa de modo que cada fase dê trabalho parecido a todas é o que reduz a espera.`,
      facts: [
        ["Espera", `${w.waited} tiques`],
        ["Fração parada", `${pct}%`],
        ["Remédio", "equilibrar o trabalho"],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `As três fases levam, por thread, ${WORK.map((r) => r.join(", ")).join("; ")} tiques (T1 a T${N}). Com barreira ao fim de cada fase, quantos tiques leva tudo?`,
        answer: w.total,
        tolerance: 0,
        unit: "tiques",
        explain: `Cada fase dura o tempo da thread mais lenta: ${[0, 1, 2].map((k) => Math.max(...WORK.map((r) => r[k] as number))).join(" + ")} = ${w.total} tiques.`,
      },
    },
    () => {
      for (const x of w.waits) {
        seq += 1;
        b.ev({
          t: seq,
          kind: "gantt",
          gantt: "com",
          lane: LANES[x.thread] as string,
          from: x.from,
          to: x.to,
          item: "espera",
          itemRole: "muted",
          role: "muted",
          label: `${LANES[x.thread]} espera de ${x.from} a ${x.to}`,
          row: {
            cols: {
              t: `${x.from}–${x.to}`,
              who: LANES[x.thread] as string,
              what: "espera na barreira",
              detail: `${x.to - x.from} tiques`,
            },
          },
        });
      }
      c.at(seq);
      c.count("espera", String(w.waited), { dt: 1, role: "warn", label: `${w.waited} tiques de espera` });
    },
  );

  b.step(
    {
      id: "s5-por-dentro",
      title: "Por dentro da barreira",
      subtitle: "Contador, mutex e condição",
      text: "Uma barreira simples é um contador protegido por um mutex. Cada thread que chega incrementa o contador; se não for a última, dorme numa variável de condição. A última zera o contador e acorda todas. Para reusar a mesma barreira na fase seguinte sem confundir quem ainda está saindo, guarda-se também o número da fase. Em POSIX, isso já vem pronto em pthread_barrier_wait.",
      facts: [
        ["Estado", "contador + número da fase"],
        ["Quem acorda as outras", "a última a chegar"],
        ["POSIX", "pthread_barrier_wait"],
      ],
      highlight: [],
    },
    () => {
      c.count("chegaram", `${N} de ${N}`, { dt: 1, label: "a última acorda todas" });
    },
  );

  return b.done({ stale: f.stale.length, total: w.total, waited: w.waited, pct });
}

const lesson: LessonModule = {
  meta: {
    slug: "barreiras",
    site: "so",
    title: "Barreiras: ninguém começa a fase antes de todos",
    summary:
      "Quatro threads em três fases: sem barreira, leituras de dados velhos; com barreira, resultados certos e a espera que o desequilíbrio custa.",
    area: "Concorrência",
    refs: [
      { book: "tanenbaum-mos", chapter: 2, section: "2.3.9", note: "Barreiras", verified: true },
      { book: "maziero-so", chapter: 12, note: "Problemas clássicos: exercício da barreira", verified: true },
    ],
    simplifications: [
      "Cada thread tem um núcleo só para ela; não há disputa pela CPU.",
      "A barreira não custa tempo para atravessar.",
    ],
  },
  scene,
  params: { defaults: {} },
  build,
  intro: {
    text: "Alguns programas paralelos avançam em rodadas: ninguém pode começar a rodada seguinte antes de todos terminarem a atual. Você vai ver o que dá errado sem essa regra e quanto ela custa.",
    facts: [
      ["Threads", String(N)],
      ["Fases", "3"],
      ["Trabalho por fase", "2 a 6 tiques"],
    ],
  },
  outro: {
    title: "Barreiras em resumo",
    text: "Sem barreira, threads rápidas leem resultados que ainda não existem. A barreira faz todas esperarem a mais lenta a cada fase: o resultado fica certo, e o tempo parado mostra quanto o trabalho está desequilibrado.",
    facts: (run) => [
      ["Dados velhos sem barreira", String(run.stats.stale)],
      ["Total com barreira", `${run.stats.total} tiques`],
      ["Espera", `${run.stats.pct}%`],
    ],
  },
  next: ["monitores", "produtor-consumidor"],
  practice,
};

export default lesson;
