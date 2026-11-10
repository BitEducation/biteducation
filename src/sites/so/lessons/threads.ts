import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import { serve, type ThreadMode, type ThreadRun } from "../../../sim/os/threads.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { threads as practice } from "../practice.ts";

/**
 * Threads in a server process: what threads share and what each one owns, a single thread leaving
 * the CPU idle during I/O, one kernel thread per request overlapping the waits, user-level threads
 * stuck behind a blocking call, the shared counter that needs a mutex, and when threads do not help.
 */
export const DEFAULTS = { pedidos: 3, cpu: 2, es: 6 };
const ROLES: Role[] = ["a", "b", "s3", "s4", "s5", "s6"];
const LANES: Record<ThreadMode, string> = {
  single: "1 thread",
  kernel: "do kernel",
  user: "de usuário",
};
const FULL: Record<ThreadMode, string> = {
  single: "1 thread",
  kernel: "threads do kernel",
  user: "threads de usuário",
};
const GANTT_W = 880;
const ticks = (n: number) => (n === 1 ? "1 tick" : `${n} ticks`);

function clamp(p: Params) {
  const pick = (v: unknown, d: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, Math.round(Number(v ?? d))));
  return {
    n: pick(p.pedidos, DEFAULTS.pedidos, 1, 6),
    cpu: pick(p.cpu, DEFAULTS.cpu, 1, 5),
    io: pick(p.es, DEFAULTS.es, 0, 12),
  };
}

const SHARED = [
  ["código do programa", "compartilhado"],
  ["variáveis globais e heap", "compartilhado"],
  ["arquivos abertos", "compartilhado"],
  ["PC e registradores", "um por thread"],
  ["pilha", "uma por thread"],
] as const;

function scene(p: Params): SceneSpec {
  const { n, cpu, io } = clamp(p);
  return {
    viewBox: [960, 600],
    nodes: [],
    links: [],
    widgets: [
      {
        kind: "gantt",
        id: "cpu",
        title: "Quem usa a CPU a cada tick · lacuna = CPU parada esperando E/S",
        at: [40, 50],
        lanes: [LANES.single, LANES.kernel, LANES.user],
        span: serve(n, cpu, io, "single").end + 2,
        width: GANTT_W,
      },
      {
        kind: "table",
        id: "parte",
        title: "Dentro de um processo com várias threads",
        at: [40, 250],
        columns: ["Item", "Quem tem"],
        widths: [190, 240],
        rows: SHARED.length + 1,
      },
      {
        kind: "table",
        id: "cmp",
        title: `${n} ${n === 1 ? "pedido" : "pedidos"}, cada um: CPU ${cpu}, E/S ${io}, CPU ${cpu}`,
        at: [500, 250],
        columns: ["Modelo", "Termina em", "CPU parada"],
        widths: [170, 110, 110],
        rows: 3,
      },
      { kind: "counter", id: "fim", title: "Último pedido termina", at: [500, 450] },
    ],
  };
}

export function build(p: Params) {
  const { n, cpu, io } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const runs: Record<ThreadMode, ThreadRun> = {
    single: serve(n, cpu, io, "single"),
    kernel: serve(n, cpu, io, "kernel"),
    user: serve(n, cpu, io, "user"),
  };
  const span = runs.single.end + 2;
  const scale = (GANTT_W - 92) / span;
  const one = runs.single;
  const ker = runs.kernel;
  const noIo = serve(n, cpu, 0, "kernel").end;
  const plural = n === 1 ? "pedido" : "pedidos";

  const draw = (mode: ThreadMode) => {
    for (const s of runs[mode].slices) {
      const t = c.t + 1;
      c.at(t);
      const name = `r${s.req + 1}`;
      b.ev({
        t,
        kind: "gantt",
        lane: LANES[mode],
        from: s.from,
        to: s.to,
        item: (s.to - s.from) * scale >= 22 ? name : "",
        itemRole: ROLES[s.req] ?? "a",
        role: ROLES[s.req] ?? "a",
        label: `${FULL[mode]}: pedido ${s.req + 1} na CPU, ticks ${s.from} a ${s.to}`,
        row: { cols: { t: `${s.from}–${s.to}`, who: name, what: "usa a CPU", detail: FULL[mode] } },
      });
    }
  };
  const result = (mode: ThreadMode, i: number, mark: "new" | "hit" | "bad") => {
    const r = runs[mode];
    c.row("cmp", i, [FULL[mode], `tick ${r.end}`, ticks(r.idle)], { dt: 1, mark });
    c.count("fim", `tick ${r.end}`, { dt: 0, label: `${FULL[mode]}: termina no tick ${r.end}` });
  };

  b.step(
    {
      id: "s1-linhas",
      title: "Várias linhas, um processo",
      subtitle: "O que se divide e o que não",
      text: `Um servidor recebe ${n} ${plural}. Cada um usa a CPU por ${ticks(cpu)}, espera ${ticks(io)} por uma leitura de disco e usa a CPU mais ${ticks(cpu)}. Uma [[thread]] é uma linha de execução dentro do [[processo]]: todas veem o mesmo código, as mesmas variáveis globais e os mesmos arquivos abertos, mas cada uma tem o próprio contador de programa, os próprios registradores e a própria pilha. É isso que deixa cada thread parar num ponto diferente do código.`,
      facts: [
        ["Compartilham", "memória e arquivos"],
        ["Cada uma tem", "PC, registradores e pilha"],
        ["Pedidos", String(n)],
      ],
      highlight: ["parte"],
    },
    () => {
      SHARED.forEach(([item, who], i) => {
        c.row("parte", i, [item, who], { dt: 1, mark: who === "compartilhado" ? "hit" : "new" });
      });
    },
  );

  b.step(
    {
      id: "s2-uma",
      title: "Uma thread só",
      subtitle: `Termina no tick ${one.end}`,
      text: `Com uma thread, o servidor atende um pedido de cada vez. Quando o pedido 1 pede o disco, a thread fica [[bloqueado|bloqueada]] e não há mais ninguém no processo para usar a CPU, que passa ${ticks(io)} parada. O último pedido termina no tick ${one.end}, e a CPU fica ociosa por ${ticks(one.idle)} desse total. O código é o mais fácil de escrever, mas o servidor desperdiça a máquina sempre que espera.`,
      facts: [
        ["Termina em", `tick ${one.end}`],
        ["CPU ocupada", ticks(one.busy)],
        ["CPU parada", ticks(one.idle)],
      ],
      highlight: ["cpu", "cmp"],
    },
    () => {
      draw("single");
      result("single", 0, "bad");
    },
  );

  b.step(
    {
      id: "s3-kernel",
      title: "Uma thread por pedido",
      subtitle: `Termina no tick ${ker.end}`,
      text: `Agora cada pedido ganha uma thread criada pelo kernel. Quando a thread do pedido 1 bloqueia no disco, o [[escalonador]] passa a CPU para a do pedido 2, que já está pronta. As esperas de E/S se sobrepõem e a CPU só fica parada ${ticks(ker.idle)}. O último pedido termina no tick ${ker.end} em vez de ${one.end}. Trocar entre threads do mesmo processo também é mais barato que entre processos: a tabela de páginas é a mesma.`,
      facts: [
        ["Termina em", `tick ${ker.end}`],
        ["CPU parada", ticks(ker.idle)],
        ["Ganho", `${one.end - ker.end} ${one.end - ker.end === 1 ? "tick" : "ticks"} a menos`],
      ],
      highlight: ["cpu", "cmp"],
      quiz: {
        kind: "number",
        prompt: `Com uma thread do kernel por pedido, em que tick o último dos ${n} ${plural} termina?`,
        answer: ker.end,
        unit: "tick",
        explain: `As primeiras rajadas rodam em fila (${n} × ${cpu}); as segundas começam quando cada E/S volta. O último termina no tick ${ker.end}.`,
      },
    },
    () => {
      draw("kernel");
      result("kernel", 1, "hit");
    },
  );

  b.step(
    {
      id: "s4-usuario",
      title: "Threads de usuário",
      subtitle: "Uma chamada bloqueia todas",
      text: `Uma biblioteca pode criar as threads sozinha, sem o kernel saber: são as [[thread-de-usuario|threads de usuário]]. Trocar entre elas é só uma chamada de função, sem [[trap]]. O problema aparece na leitura de disco: o kernel só vê um processo, e quando a [[syscall]] bloqueia, bloqueia todas as threads juntas. O resultado volta ao tick ${runs.user.end}, igual a uma thread só. Por isso Linux e Windows usam threads do kernel, uma para cada thread do programa.`,
      facts: [
        ["Troca", "sem passar pelo kernel"],
        ["Leitura bloqueante", "para o processo todo"],
        ["Termina em", `tick ${runs.user.end}`],
      ],
      highlight: ["cpu", "cmp"],
      quiz: {
        kind: "choice",
        prompt: "Por que as threads de usuário não aproveitam a espera de disco?",
        options: [
          "O kernel só enxerga o processo, então bloqueia o processo inteiro",
          "Threads de usuário não podem fazer chamadas de sistema",
          "A troca entre threads de usuário é lenta demais",
        ],
        answer: 0,
        explain:
          "A biblioteca escalona as threads, mas quem bloqueia na leitura é o processo que o kernel conhece. Nenhuma outra thread roda até o disco responder.",
      },
    },
    () => {
      draw("user");
      result("user", 2, "bad");
    },
  );

  b.step(
    {
      id: "s5-compartilhar",
      title: "O preço de compartilhar",
      subtitle: "Um contador para todas",
      text: `Como as threads veem as mesmas variáveis, um contador global de pedidos atendidos é visível para todas. Se duas threads fazem contador++ ao mesmo tempo, as duas podem ler o mesmo valor e uma soma se perde: é a [[condicao-de-corrida]]. Entre processos isso não acontece por acidente, porque cada um tem a sua memória. Com threads, todo dado compartilhado que é alterado precisa de um [[mutex]] ou de uma operação atômica.`,
      facts: [
        ["Contador global", "visto por todas"],
        ["Risco", "condição de corrida"],
        ["Proteção", "mutex ou operação atômica"],
      ],
      highlight: ["parte"],
    },
    () => {
      c.row("parte", SHARED.length, ["contador de pedidos", "compartilhado: precisa de mutex"], {
        dt: 1,
        mark: "warn",
      });
    },
  );

  b.step(
    {
      id: "s6-quando",
      title: "Quando threads ajudam",
      subtitle: io === 0 ? "Sem espera, sem ganho" : `${one.end} contra ${ker.end} ticks`,
      text: `Num núcleo só, threads ganham porque escondem a espera: se a E/S fosse zero, os ${n} ${plural} terminariam no tick ${noIo} com uma ou com várias threads, porque a CPU já estaria ocupada o tempo todo. Com vários núcleos, as threads do kernel também rodam em paralelo de verdade, uma em cada núcleo; threads de usuário ficam presas no núcleo do processo. Threads além do que os núcleos e as esperas aproveitam só custam memória de pilha e trocas de contexto.`,
      facts: [
        ["Sem E/S", `tick ${noIo} nos dois casos`],
        ["Vários núcleos", "só threads do kernel usam"],
        ["Custo", "pilhas e trocas"],
      ],
      highlight: ["cmp"],
    },
    () => {
      c.count("fim", `tick ${ker.end}`, { dt: 1, label: `melhor caso: tick ${ker.end}` });
    },
  );

  return b.done({
    single: one.end,
    kernel: ker.end,
    user: runs.user.end,
    idleSingle: one.idle,
    idleKernel: ker.idle,
    noIo,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "threads",
    site: "so",
    title: "Threads: várias linhas de execução num processo",
    summary:
      "Um servidor com uma thread deixa a CPU parada durante o disco; com uma thread do kernel por pedido, as esperas se sobrepõem. Threads de usuário param todas juntas, e o que é compartilhado precisa de trava.",
    area: "Processos",
    refs: [
      { book: "tanenbaum-mos", chapter: 2, section: "2.2", note: "Threads", verified: true },
      { book: "maziero-so", chapter: 5, section: "5.4", note: "Threads", verified: true },
    ],
    simplifications: [
      "Um núcleo só, e a CPU escolhe a thread pronta há mais tempo, sem fatia de tempo.",
      "As esperas de E/S não disputam o disco entre si.",
      "Criar e trocar threads não custa ticks neste modelo.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "pedidos", kind: "int", label: "Pedidos simultâneos", min: 1, max: 6 },
      { key: "cpu", kind: "int", label: "CPU por rajada (ticks)", min: 1, max: 5 },
      { key: "es", kind: "int", label: "Espera de E/S (ticks)", min: 0, max: 12 },
    ],
  },
  build,
  intro: {
    text: "Um navegador baixa imagens enquanto você rola a página, e um servidor atende várias pessoas ao mesmo tempo. Você vai ver um servidor com uma thread, com uma thread do kernel por pedido e com threads de usuário, e onde a CPU fica parada em cada caso.",
    facts: [
      ["Pedidos", String(DEFAULTS.pedidos)],
      ["Cada pedido", `CPU ${DEFAULTS.cpu}, E/S ${DEFAULTS.es}, CPU ${DEFAULTS.cpu}`],
      ["Núcleos", "1"],
    ],
  },
  outro: {
    title: "Threads em resumo",
    text: "Threads de um processo dividem memória e arquivos e têm cada uma a sua pilha e os seus registradores. Com threads do kernel, quando uma bloqueia, outra usa a CPU, e em vários núcleos elas rodam em paralelo. Threads de usuário trocam mais rápido, mas uma chamada bloqueante para todas. Tudo que é compartilhado e alterado precisa de sincronização.",
    facts: (run) => [
      ["1 thread", `tick ${run.stats.single}`],
      ["Threads do kernel", `tick ${run.stats.kernel}`],
      ["Threads de usuário", `tick ${run.stats.user}`],
    ],
  },
  next: ["condicao-de-corrida", "round-robin", "fork-exec"],
  practice,
};

export default lesson;
