import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { type ConcResult, type Op, runConc, type Thread } from "../../../sim/os/conc.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Dining philosophers on counting semaphores: the naive left-then-right protocol deadlocks under
 * round robin; ordering the forks or seating at most four breaks the circular wait.
 */
export const DEFAULTS = { refeicoes: 2, quantum: 1 };
const N = 5;
const CX = 330;
const CY = 255;
const fork = (i: number) => `g${i}`;
const phil = (i: number) => `f${i}`;
const NAMES = ["Ana", "Beto", "Caio", "Duda", "Eva"];

function pos(i: number, r: number, offset = 0): [number, number] {
  const a = -Math.PI / 2 + ((i + offset) * 2 * Math.PI) / N;
  return [Math.round(CX + r * Math.cos(a)), Math.round(CY + r * Math.sin(a))];
}

const scene: SceneSpec = {
  viewBox: [960, 540],
  nodes: [
    ...NAMES.map((n, i) => ({
      id: phil(i),
      kind: "process" as const,
      label: n,
      sub: `garfos ${i} e ${(i + 1) % N}`,
      at: pos(i, 200),
      w: 130,
    })),
    ...NAMES.map((_, i) => ({
      id: fork(i),
      kind: "box" as const,
      label: `garfo ${i}`,
      at: pos(i, 105, 0.5),
      w: 74,
      h: 30,
    })),
  ],
  links: [],
  widgets: [
    {
      kind: "table",
      id: "res",
      title: "Três protocolos, mesma mesa",
      at: [600, 60],
      columns: ["Protocolo", "Resultado", "Passos", "Bloqueios"],
      widths: [110, 110, 60, 70],
      rows: 3,
    },
    { kind: "counter", id: "comendo", title: "Comendo agora", at: [600, 220] },
    { kind: "counter", id: "passos", title: "Passos do escalonador", at: [780, 220] },
  ],
};

type Proto = "ingenuo" | "ordem" | "garcom";

function threads(proto: Proto, meals: number): Thread[] {
  return NAMES.map((_, i) => {
    const left = fork(i);
    const right = fork((i + 1) % N);
    // ordered: always the lower-numbered fork first (only the last philosopher is affected)
    const [first, second] = proto === "ordem" && i === N - 1 ? [right, left] : [left, right];
    const ops: Op[] = [];
    for (let m = 0; m < meals; m++) {
      ops.push({ op: "work", what: "pensa" });
      if (proto === "garcom") ops.push({ op: "P", sem: "mesa" });
      ops.push({ op: "P", sem: first }, { op: "P", sem: second });
      ops.push({ op: "work", what: "come" });
      ops.push({ op: "V", sem: second }, { op: "V", sem: first });
      if (proto === "garcom") ops.push({ op: "V", sem: "mesa" });
    }
    return { id: phil(i), ops };
  });
}

function run(proto: Proto, meals: number, quantum: number): ConcResult {
  const sems: Record<string, number> = Object.fromEntries(NAMES.map((_, i) => [fork(i), 1]));
  if (proto === "garcom") sems.mesa = N - 1;
  return runConc(threads(proto, meals), { sems, capacity: 1, policy: "rr", quantum, maxSteps: 600 });
}

export function build(p: Params) {
  const meals = Math.min(3, Math.max(1, Math.round(Number(p.refeicoes ?? DEFAULTS.refeicoes))));
  const quantum = Math.min(3, Math.max(1, Math.round(Number(p.quantum ?? DEFAULTS.quantum))));
  const b = lessonBuilder();
  const names = Object.fromEntries([
    ...NAMES.map((n, i) => [phil(i), n]),
    ...NAMES.map((_, i) => [fork(i), `garfo ${i}`]),
  ]);
  const c = talk(b, names, (t) => `${t}`);
  const who = (id: string) => NAMES[Number(id.slice(1))] ?? id;

  const reset = () => {
    NAMES.forEach((_, i) => {
      c.state(phil(i), "pensando", { tone: "none", label: `${NAMES[i]} pensa`, dt: i === 0 ? 1 : 0 });
      c.state(fork(i), "livre", { tone: "none", label: `garfo ${i} livre` });
    });
    c.count("comendo", "0");
    c.count("passos", "0");
  };

  const play = (r: ConcResult, row: number, label: string) => {
    reset();
    const eating = new Set<string>();
    let k = 0;
    for (const s of r.steps) {
      k++;
      const name = who(s.tid);
      if (s.op.op === "work" && s.op.what === "come") {
        eating.add(s.tid);
        c.state(s.tid, "comendo", { tone: "good", label: `${name} come`, dt: 1 });
        c.count("comendo", String(eating.size));
      } else if (s.op.op === "work") {
        c.state(s.tid, "pensando", { tone: "none", label: `${name} pensa`, dt: 1 });
      } else if (s.op.op === "P" && s.op.sem.startsWith("g")) {
        if (s.outcome === "ok") {
          c.state(s.op.sem, `com ${name}`, {
            tone: "active",
            label: `${name} pega o ${names[s.op.sem]}`,
            dt: 1,
          });
          c.state(s.tid, "com fome", { tone: "warn", label: `${name} segura o ${names[s.op.sem]}` });
        } else
          c.state(s.tid, `espera ${s.op.sem.replace("g", "garfo ")}`, {
            tone: "bad",
            label: `${name} bloqueia esperando o ${names[s.op.sem]}`,
            dt: 1,
          });
      } else if (s.op.op === "P") {
        c.state(s.tid, s.outcome === "ok" ? "sentou" : "espera vaga", {
          tone: s.outcome === "ok" ? "warn" : "bad",
          label: s.outcome === "ok" ? `${name} ganha um lugar` : `${name} espera o garçom`,
          dt: 1,
        });
      } else if (s.op.op === "V" && s.op.sem.startsWith("g")) {
        if (eating.delete(s.tid))
          c.state(s.tid, "satisfeito", { tone: "none", label: `${name} terminou de comer` });
        c.count("comendo", String(eating.size));
        if (s.woke)
          c.state(s.op.sem, `com ${who(s.woke)}`, {
            tone: "active",
            label: `${name} devolve o ${names[s.op.sem]}, que vai para ${who(s.woke)}`,
            dt: 1,
          });
        else
          c.state(s.op.sem, "livre", { tone: "none", label: `${name} devolve o ${names[s.op.sem]}`, dt: 1 });
      }
      if (k % 5 === 0) c.count("passos", String(k), { label: `${k} passos` });
    }
    c.count("passos", String(r.steps.length), { label: `${r.steps.length} passos no total` });
    const blocks = r.steps.filter((s) => s.outcome === "block").length;
    c.row(
      "res",
      row,
      [label, r.deadlock ? "impasse" : "todos comeram", String(r.steps.length), String(blocks)],
      {
        mark: r.deadlock ? "bad" : "hit",
        log: { who: label, what: r.deadlock ? "impasse" : "terminou", detail: `${r.steps.length} passos` },
      },
    );
    return blocks;
  };

  b.step(
    {
      id: "s1-mesa",
      title: "Cinco filósofos, cinco garfos",
      subtitle: `${meals} ${meals === 1 ? "refeição" : "refeições"} cada`,
      text: `Cinco filósofos alternam entre pensar e comer, numa mesa redonda com um garfo entre cada par. Para comer, cada um precisa dos dois garfos ao seu lado, e um garfo só serve a um por vez. Cada garfo é um [[semaforo]] iniciado em 1. O problema, proposto por Dijkstra, resume a disputa de várias [[thread|threads]] por vários recursos compartilhados.`,
      facts: [
        ["Filósofos", String(N)],
        ["Garfos", String(N)],
        ["Garfos para comer", "2"],
      ],
      highlight: [],
    },
    reset,
  );

  const naive = run("ingenuo", meals, quantum);
  const holding = naive.blocked.length;
  b.step(
    {
      id: "s2-ingenuo",
      title: "Esquerda, depois direita",
      subtitle: naive.deadlock ? "Todos travam" : "Desta vez escapou",
      text: naive.deadlock
        ? `O protocolo óbvio: pegar o garfo da esquerda, depois o da direita. Com o escalonador trocando de thread a cada ${quantum === 1 ? "operação" : `${quantum} operações`}, os cinco pegam o garfo da esquerda antes de alguém tentar o da direita. Cada um segura um garfo e espera o do vizinho, que nunca será devolvido: [[deadlock]], depois de ${naive.steps.length} passos.`
        : `O protocolo óbvio: pegar o garfo da esquerda, depois o da direita. Com troca a cada ${quantum} operações, um filósofo conseguiu os dois garfos antes de o vizinho pegar o primeiro, e a mesa terminou. Mas basta uma ordem azarada, como trocar a cada operação, para os cinco segurarem um garfo cada e ficarem esperando para sempre.`,
      facts: [
        ["Resultado", naive.deadlock ? "impasse" : "terminou"],
        ["Bloqueados no fim", String(holding)],
        ["Passos", String(naive.steps.length)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Com esse protocolo e troca a cada ${quantum === 1 ? "operação" : `${quantum} operações`}, quantos filósofos ficam bloqueados no fim?`,
        answer: holding,
        explain: naive.deadlock
          ? `Os ${holding} seguram o garfo da esquerda e esperam o da direita, que está com o vizinho.`
          : "Ninguém: nesta ordem, cada filósofo pegou os dois garfos antes de o vizinho atrapalhar.",
      },
    },
    () => play(naive, 0, "Ingênuo"),
  );

  b.step(
    {
      id: "s3-ciclo",
      quiz: {
        kind: "choice",
        prompt:
          "Numerar os garfos e pegar sempre o de menor número primeiro quebra qual das quatro condições?",
        options: ["A espera circular", "A exclusão mútua", "A posse e espera", "A ausência de preempção"],
        answer: 0,
        explain:
          "Com uma ordem global, toda espera aponta de um garfo menor para um maior. Um círculo precisaria voltar a um número menor, o que a regra proíbe. Os garfos continuam exclusivos e ninguém solta o que pegou.",
      },
      title: "Uma espera em círculo",
      subtitle: "As quatro condições, de novo",
      text: `O impasse dos filósofos reúne as quatro condições de Coffman: garfo não se divide (exclusão mútua), quem tem um garfo espera o outro sem soltar (posse e espera), ninguém tira um garfo da mão de outro (sem preempção) e cada um espera o vizinho, fechando um círculo de cinco ([[espera-circular]]). Basta quebrar uma delas. Os dois próximos protocolos atacam a última.`,
      facts: [
        ["Exclusão mútua", "garfo é de um só"],
        ["Posse e espera", "segura e espera"],
        ["Espera circular", "Ana → Beto → … → Eva → Ana"],
      ],
      highlight: NAMES.map((_, i) => phil(i)),
    },
    () => {
      if (naive.deadlock)
        NAMES.forEach((n, i) => {
          c.note(phil(i), `espera ${NAMES[(i + 1) % N]}`, "warn", {
            dt: i === 0 ? 1 : 0,
            label: `${n} espera ${NAMES[(i + 1) % N]}`,
          });
        });
      else c.note(phil(0), "numa ordem azarada, cada um esperaria o vizinho", "info", { dt: 1 });
    },
  );

  const ordered = run("ordem", meals, quantum);
  const orderedBlocks = ordered.steps.filter((s) => s.outcome === "block").length;
  b.step(
    {
      id: "s4-ordem",
      title: "Uma ordem para os garfos",
      subtitle: "Menor número primeiro",
      text: `Numerando os garfos e exigindo que todos peguem primeiro o de menor número, Eva, sentada entre o garfo 4 e o 0, passa a pegar o 0 antes. Ela compete com Ana pelo primeiro garfo em vez de fechar o círculo, e um ciclo de esperas fica impossível. A mesa termina ${ordered.deadlock ? "em impasse, o que não deveria acontecer" : `em ${ordered.steps.length} passos, com ${orderedBlocks} ${orderedBlocks === 1 ? "bloqueio" : "bloqueios"} passageiros`}. É a mesma regra das travas ordenadas no código real.`,
      facts: [
        ["Regra", "menor garfo primeiro"],
        ["Resultado", ordered.deadlock ? "impasse" : "todos comeram"],
        ["Passos", String(ordered.steps.length)],
      ],
      highlight: [phil(N - 1)],
    },
    () => {
      play(ordered, 1, "Ordem");
    },
  );

  const waiter = run("garcom", meals, quantum);
  b.step(
    {
      id: "s5-garcom",
      title: "Um garçom na porta",
      subtitle: `No máximo ${N - 1} à mesa`,
      text: `Outra saída: um semáforo mesa, iniciado em ${N - 1}, que cada filósofo decrementa antes de pegar garfos. Com no máximo quatro sentados e cinco garfos, pelo menos um deles sempre consegue os dois, come e devolve. O protocolo da esquerda e direita continua igual, e a mesa termina ${waiter.deadlock ? "em impasse" : `em ${waiter.steps.length} passos`}. O custo é limitar o paralelismo, mesmo quando ele não causaria problema.`,
      facts: [
        ["Semáforo mesa", String(N - 1)],
        ["Resultado", waiter.deadlock ? "impasse" : "todos comeram"],
        ["Passos", String(waiter.steps.length)],
      ],
      highlight: [],
    },
    () => {
      play(waiter, 2, "Garçom");
    },
  );

  b.step(
    {
      id: "s6-comparar",
      title: "Sem impasse, mas justo?",
      subtitle: "Comparando os protocolos",
      text: `Os dois protocolos corrigidos terminam: ordem em ${ordered.steps.length} passos e garçom em ${waiter.steps.length}. Nenhum dos dois, sozinho, garante que um filósofo azarado não espere muito mais que os outros. Para isso existem soluções com estados explícitos (pensando, com fome, comendo), em que quem termina avisa o vizinho faminto, normalmente escritas com um monitor.`,
      facts: [
        ["Ingênuo", naive.deadlock ? "impasse" : `${naive.steps.length} passos`],
        ["Ordem", `${ordered.steps.length} passos`],
        ["Garçom", `${waiter.steps.length} passos`],
      ],
      highlight: [],
    },
    () => {
      c.row(
        "res",
        0,
        [
          "Ingênuo",
          naive.deadlock ? "impasse" : "todos comeram",
          String(naive.steps.length),
          String(naive.steps.filter((s) => s.outcome === "block").length),
        ],
        { mark: naive.deadlock ? "bad" : "hit", dt: 1 },
      );
    },
  );

  return b.done({
    naiveDeadlock: naive.deadlock ? 1 : 0,
    blocked: holding,
    naiveSteps: naive.steps.length,
    ordered: ordered.steps.length,
    waiter: waiter.steps.length,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "filosofos",
    site: "so",
    title: "O jantar dos filósofos",
    summary:
      "Cinco threads disputando cinco recursos: o protocolo ingênuo trava em espera circular, e duas correções, ordenar os garfos e limitar a mesa, quebram o ciclo.",
    area: "Concorrência",
    refs: [
      { book: "tanenbaum-mos", chapter: 2, section: "2.5.1", note: "O jantar dos filósofos", verified: true },
      { book: "maziero-so", chapter: 12, section: "12.4", note: "O jantar dos filósofos", verified: true },
    ],
    simplifications: [
      "Pensar e comer duram uma operação cada.",
      "O escalonador é um Round Robin fixo; com outra ordem os passos mudam, mas o impasse continua possível.",
      "Semáforos acordam em ordem de chegada.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "refeicoes", kind: "int", label: "Refeições por filósofo", min: 1, max: 3 },
      {
        key: "quantum",
        kind: "int",
        label: "Operações por vez",
        min: 1,
        max: 3,
        help: "Quantas operações cada filósofo faz antes de o escalonador trocar.",
      },
    ],
  },
  build,
  intro: {
    text: "Cinco filósofos, cinco garfos e uma regra: para comer, são precisos dois. O problema clássico mostra como threads que disputam vários recursos podem travar todas ao mesmo tempo. Você vai ver o impasse acontecer e comparar duas formas de impedi-lo.",
    facts: [
      ["Filósofos", String(N)],
      ["Refeições", String(DEFAULTS.refeicoes)],
      ["Troca", "a cada operação"],
    ],
  },
  outro: {
    title: "Filósofos em resumo",
    text: "Pegar um recurso e esperar o próximo sem soltar o primeiro cria espera circular. Impor uma ordem global aos recursos ou limitar quantos competem ao mesmo tempo quebra o ciclo. Ausência de impasse não garante justiça; para isso é preciso controlar quem espera.",
    facts: (run) => [
      ["Ingênuo", run.stats.naiveDeadlock ? "impasse" : "terminou"],
      ["Ordem", `${run.stats.ordered} passos`],
      ["Garçom", `${run.stats.waiter} passos`],
    ],
  },
  next: ["impasses", "condicao-de-corrida"],
};

export default lesson;
