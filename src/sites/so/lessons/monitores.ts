import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { type MonEvent, monitorRun, type Recheck, type Semantics } from "../../../sim/os/monitor.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Monitors and condition variables: mutual exclusion for free, wait() that releases the lock
 * atomically, signal() under Mesa semantics, the consumer that wakes up to an empty buffer
 * because another one got there first, and why the condition is always re-checked in a loop.
 */
export const DEFAULTS = { semantica: "mesa", teste: "if" };

function clamp(p: Params): { sem: Semantics; check: Recheck } {
  return {
    sem: p.semantica === "hoare" ? "hoare" : "mesa",
    check: p.teste === "while" ? "while" : "if",
  };
}

function scene(): SceneSpec {
  return {
    viewBox: [960, 560],
    zones: [
      {
        id: "m",
        title: "Monitor do buffer (1 posição)",
        rect: { x: 300, y: 30, w: 360, h: 340 },
        tone: "kernel",
      },
    ],
    nodes: [
      { id: "C1", kind: "process", label: "C1", sub: "consumidor", at: [150, 100], w: 150 },
      { id: "C2", kind: "process", label: "C2", sub: "consumidor", at: [150, 260], w: 150 },
      { id: "P", kind: "process", label: "P", sub: "produtor", at: [830, 180], w: 150 },
      { id: "mon", kind: "box", label: "Trava do monitor", sub: "uma thread por vez", at: [480, 90], w: 200 },
    ],
    links: [],
    widgets: [
      { kind: "counter", id: "itens", title: "Itens no buffer", at: [330, 140] },
      { kind: "queue", id: "entrada", title: "Fila de entrada", at: [330, 210], capacity: 3 },
      { kind: "queue", id: "naoVazio", title: "Esperando: não vazio", at: [330, 290], capacity: 2 },
      {
        kind: "table",
        id: "cmp",
        title: "Duas semânticas de signal()",
        at: [40, 410],
        columns: ["Semântica", "Quem roda após signal()", "if basta?", "Onde se usa"],
        widths: [130, 330, 110, 300],
        rows: 2,
      },
    ],
  };
}

export function build(p: Params) {
  const { sem, check } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, { mon: "monitor" }, (t) => `t${t}`);
  const run = monitorRun(sem, check);
  const alt = monitorRun("mesa", "while");
  let entry: string[] = [];
  let waiting: string[] = [];

  const queueDiff = (id: string, before: string[], now: string[]) => {
    for (const x of now)
      if (!before.includes(x))
        b.ev({
          t: c.t,
          kind: "enqueue",
          queue: id,
          item: x,
          itemRole: x === "P" ? "b" : "a",
          role: "warn",
          label: `${x} espera`,
        });
    for (const x of before)
      if (!now.includes(x))
        b.ev({ t: c.t, kind: "dequeue", queue: id, item: x, role: "a", label: `${x} sai da fila` });
  };
  const play = (evs: MonEvent[]): number => {
    for (const e of evs) {
      c.state(e.who, e.what, { tone: e.tone === "active" ? "active" : e.tone });
      c.state("mon", e.inside ? `dentro: ${e.inside}` : "livre", {
        dt: 0,
        tone: e.inside ? "active" : "none",
      });
      c.count("itens", String(e.count), { label: `${e.count} no buffer` });
      queueDiff("entrada", entry, e.entry);
      queueDiff("naoVazio", waiting, e.waiting);
      entry = e.entry;
      waiting = e.waiting;
    }
    return evs.length;
  };
  const phase = (r: typeof run, ph: MonEvent["phase"]) => r.events.filter((e) => e.phase === ph);

  b.step(
    {
      id: "s1-exclusao",
      title: "Exclusão mútua de graça",
      subtitle: "Só um lá dentro",
      text: `Com [[semaforo|semáforos]], cada P e V fica espalhado pelo código, e trocar dois de ordem causa um impasse. Um monitor junta os dados e os procedimentos que os usam, e a linguagem ou a biblioteca põe uma trava em volta de todos: só uma thread fica lá dentro por vez. O buffer tem uma posição. O consumidor C1 chega primeiro e entra.`,
      facts: [
        ["Buffer", "1 posição"],
        ["Threads", "C1, C2 e P"],
        ["Trava", "automática"],
      ],
      highlight: ["mon", "C1"],
    },
    () => play(phase(run, "entra")),
  );

  b.step(
    {
      id: "s2-wait",
      title: "Esperar soltando a trava",
      subtitle: "wait(naoVazio)",
      text: `O buffer está vazio. O C1 chama wait na [[variavel-de-condicao|variável de condição]] naoVazio. Duas coisas acontecem juntas, sem brecha entre elas: a trava do monitor é liberada e o C1 dorme na fila da condição. Se ele dormisse segurando a trava, o produtor nunca entraria para pôr um item.`,
      facts: [
        ["C1", "dorme em naoVazio"],
        ["Trava", "livre"],
        ["Itens", "0"],
      ],
      highlight: ["naoVazio", "mon"],
      quiz: {
        kind: "choice",
        prompt: "Por que wait() precisa soltar a trava do monitor antes de dormir?",
        options: [
          "Senão o produtor nunca entra para pôr o item, e todos esperam para sempre",
          "Para economizar memória enquanto a thread dorme",
          "Porque threads dormindo não podem ter travas",
        ],
        answer: 0,
        explain:
          "Quem pode mudar a condição precisa entrar no monitor. Dormir com a trava na mão impede isso: é um impasse. Por isso wait() solta a trava e dorme numa operação só.",
      },
    },
    () => play(phase(run, "espera")),
  );

  b.step(
    {
      id: "s3-signal",
      title: "O sinal do produtor",
      subtitle: sem === "mesa" ? "Mesa: o C1 só fica pronto" : "Hoare: o monitor vai direto ao C1",
      text:
        sem === "mesa"
          ? `O produtor entra. Enquanto ele está lá dentro, o C2 chega e espera na entrada. P põe o item e chama signal(naoVazio). Na semântica de Mesa, o sinal é só um aviso: o C1 sai da fila da condição e vai para a fila de entrada, atrás do C2. O produtor continua com a trava até sair.`
          : `O produtor entra. Enquanto ele está lá dentro, o C2 chega e espera na entrada. P põe o item e chama signal(naoVazio). Na semântica de Hoare, o produtor entrega a trava direto ao C1, que volta a rodar na hora, com o item garantido. O produtor espera para retomar depois.`,
      facts: [
        ["Semântica", sem === "mesa" ? "Mesa" : "Hoare"],
        ["Itens", "1"],
        ["Fila de entrada", sem === "mesa" ? "C2, C1" : "C2"],
      ],
      highlight: ["P", "entrada"],
    },
    () => play(phase(run, "sinal")),
  );

  b.step(
    {
      id: "s4-chega-antes",
      title: "Alguém chega antes",
      subtitle: run.stolen ? "C2 leva o item" : "C2 encontra o buffer vazio",
      text: run.stolen
        ? `A trava fica livre e quem estava na frente da fila de entrada era o C2. Ele entra, encontra o item que o produtor pôs e o leva. Nada de errado até aqui: o C2 conferiu o buffer e havia um item. Mas o C1 foi acordado justamente por causa desse item, que já não existe.`
        : `Com Hoare, o C1 já levou o item antes de qualquer outra thread entrar. Quando o C2 finalmente entra, o buffer está vazio, e ele dorme em naoVazio do mesmo jeito que o C1 fez antes. A condição que o C1 viu ao acordar era verdadeira por garantia.`,
      facts: [
        ["Quem leva o item", run.stolen ? "C2" : "C1"],
        ["Itens", "0"],
        ["Esperando", run.stolen ? "C1, na entrada" : "C2, em naoVazio"],
      ],
      highlight: ["C2", "itens"],
      quiz: {
        kind: "choice",
        prompt: run.stolen
          ? "O C1 vai voltar do wait() agora. Há um item no buffer para ele?"
          : "Com Hoare, quando o C2 entra, ainda há item no buffer?",
        options: run.stolen
          ? [
              "Não: o C2 levou o item antes",
              "Sim: o sinal reservou o item para o C1",
              "Sim: o produtor pôs dois itens",
            ]
          : [
              "Não: o C1 já o retirou",
              "Sim: o item é reservado para quem chega primeiro",
              "Sim: o produtor pôs dois itens",
            ],
        answer: 0,
        explain: run.stolen
          ? "Em Mesa, o sinal não reserva nada. Entre o signal e o C1 voltar a rodar, qualquer thread pode entrar e mudar o estado."
          : "Em Hoare, o sinalizado roda imediatamente; ninguém entra no meio. O C2 chega depois e precisa esperar o próximo item.",
      },
    },
    () => play(phase(run, "rouba")),
  );

  b.step(
    {
      id: "s5-volta",
      title: run.bug ? "Confiar no if" : "Voltar do wait()",
      subtitle: run.bug ? "−1 itens: o bug" : "A condição confere",
      text: run.bug
        ? `O C1 recebe a trava e volta do wait(). O código dele era "se o buffer está vazio, espere", com if: como já esperou uma vez, segue em frente e retira de um buffer vazio. O contador vai a −1 e o C1 lê lixo. Nada no código parece errado, e o erro só aparece quando outra thread entra no momento exato.`
        : sem === "hoare"
          ? `Com Hoare, o C1 retirou o item assim que acordou, o produtor recebeu a trava de volta e saiu. O if bastou porque ninguém pôde entrar entre o sinal e o C1. O preço são trocas de contexto a mais: o produtor para no meio do procedimento para ceder a vez.`
          : `O C1 recebe a trava e volta do wait(). Como o teste está num while, ele confere de novo: o buffer está vazio, então chama wait() outra vez e dorme até o próximo item. O C2 ter chegado antes não causa erro nenhum.`,
      facts: [
        ["Teste", check === "if" ? "if" : "while"],
        ["Itens no fim", String(run.final)],
        ["Resultado", run.bug ? "leitura de lixo" : "correto"],
      ],
      highlight: ["C1", "itens"],
    },
    () => {
      if (play(phase(run, "volta")) === 0) c.state("C1", "consumiu o item sem erro", { tone: "good" });
    },
  );

  const altVolta = phase(alt, "volta");
  b.step(
    {
      id: "s6-while",
      title: "Sempre num laço",
      subtitle: "while (vazio) wait(naoVazio)",
      text: `A regra prática é esperar sempre dentro de um laço: while (buffer vazio) wait(naoVazio). Na semântica de Mesa, voltar do wait() quer dizer só "talvez tenha mudado", e quem acorda confere de novo. O laço também protege contra acordar sem sinal, que pthreads e Java permitem. Veja o mesmo momento com while: o C1 reconfere e volta a dormir.`,
      facts: [
        ["Teste", "while"],
        ["C1", "dorme de novo"],
        ["Erro", "nenhum"],
      ],
      highlight: ["C1", "naoVazio"],
    },
    () => {
      entry = ["C1"];
      waiting = [];
      c.note("C1", "reprise com while", "info", { dt: 1 });
      play(altVolta);
    },
  );

  b.step(
    {
      id: "s7-semanticas",
      title: "Mesa ou Hoare",
      subtitle: "O que as bibliotecas fazem",
      text: `Hoare propôs que signal entregasse o monitor direto ao acordado, o que torna o if seguro, mas obriga trocas de contexto a cada sinal. Mesa trata o sinal como dica, mais barato e simples de implementar. pthread_cond_signal, o synchronized do Java e as condições do Python seguem Mesa. Troque a semântica e o teste no Laboratório e compare.`,
      facts: [
        ["Mesa", "sinal é dica"],
        ["Hoare", "entrega o monitor"],
        ["pthreads e Java", "Mesa"],
      ],
      highlight: ["cmp"],
    },
    () => {
      c.row(
        "cmp",
        0,
        ["Mesa", "quem sinalizou continua; o acordado vai para a fila", "não", "pthreads, Java, Python"],
        { dt: 1, mark: "new" },
      );
      c.row(
        "cmp",
        1,
        ["Hoare", "o acordado roda na hora; quem sinalizou espera", "sim", "monitores clássicos, textos"],
        { dt: 1, mark: "new" },
      );
    },
  );

  return b.done({
    bug: run.bug ? 1 : 0,
    stolen: run.stolen ? 1 : 0,
    final: run.final,
    events: run.events.length,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "monitores",
    site: "so",
    title: "Monitores e variáveis de condição",
    summary:
      "Um monitor dá exclusão mútua automática; wait() solta a trava e dorme numa operação só. Com a semântica de Mesa, o consumidor acordado pode encontrar o buffer vazio, e por isso a condição é sempre reconferida num while.",
    area: "Concorrência",
    refs: [
      { book: "maziero-so", chapter: 11, section: "11.3", note: "Variáveis de condição", verified: true },
      { book: "maziero-so", chapter: 11, section: "11.4", note: "Monitores", verified: true },
      { book: "tanenbaum-mos", chapter: 2, section: "2.3.7", note: "Monitores", verified: true },
    ],
    simplifications: [
      "A ordem em que as threads chegam é fixa, escolhida para mostrar o problema.",
      "Um buffer de uma posição e uma condição só (naoVazio); a condição naoCheio fica de fora.",
      "Na semântica de Hoare, o produtor espera numa fila de prioridade que não aparece na cena.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "semantica",
        kind: "choice",
        label: "Semântica de signal()",
        options: [
          { value: "mesa", label: "Mesa (pthreads, Java)" },
          { value: "hoare", label: "Hoare (entrega o monitor)" },
        ],
      },
      {
        key: "teste",
        kind: "choice",
        label: "O consumidor confere com",
        options: [
          { value: "if", label: "if (confere uma vez)" },
          { value: "while", label: "while (reconfere ao acordar)" },
        ],
      },
    ],
  },
  build,
  intro: {
    text: "Semáforos resolvem a sincronização, mas espalham P e V pelo código. Monitores juntam a trava e as condições num lugar só. Você vai ver um consumidor acordar para um buffer que já foi esvaziado por outro, e a linha de código que evita o erro.",
    facts: [
      ["Buffer", "1 posição"],
      ["Threads", "dois consumidores e um produtor"],
      ["Semântica", "Mesa"],
    ],
  },
  outro: {
    title: "Monitores em resumo",
    text: "O monitor garante que só uma thread esteja lá dentro. wait() solta a trava e dorme de forma atômica; signal() acorda uma thread que esperava. Na semântica de Mesa, usada por pthreads e Java, acordar não garante que a condição ainda valha, então toda espera fica num while que reconfere.",
    facts: (r) => [
      ["Bug com if", r.stats.bug === 1 ? "apareceu" : "não apareceu"],
      ["Itens no fim", String(r.stats.final)],
      ["Regra", "while, nunca if"],
    ],
  },
  next: ["produtor-consumidor", "leitores-escritores", "ipc"],
};

export default lesson;
