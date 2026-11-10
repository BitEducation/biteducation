import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import {
  type ConcResult,
  type ConcStep,
  type Op,
  producerConsumer,
  runConc,
  type Thread,
} from "../../../sim/os/conc.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";

/**
 * Bounded buffer with semaphores. Worked by hand.
 * Default: buffer of 4, 8 items, the producer runs 12 micro-ops per turn and the consumer 6.
 */
const SEMS = ["vazias", "cheias", "mutex"] as const;
const ROLE: Record<string, Role> = { Produtor: "a", Consumidor: "b" };
const NODE: Record<string, string> = { Produtor: "prod", Consumidor: "cons" };

function opText(op: Op): string {
  switch (op.op) {
    case "P":
    case "V":
      return `${op.op}(${op.sem})`;
    case "put":
      return `insere ${op.item}`;
    case "take":
      return "retira";
    case "work":
      return op.what;
  }
}

function readParams(p: Params) {
  const capacity = Number(p.buffer ?? 4);
  const items = Number(p.itens ?? 8);
  const vp = Number(p.velProdutor ?? 12);
  const vc = Number(p.velConsumidor ?? 6);
  const script = String(p.roteiro ?? "")
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((c) => (c.toUpperCase() === "P" ? "Produtor" : "Consumidor"));
  return { capacity, items, vp, vc, script };
}

function threads(items: number, vp: number, vc: number, invert = false): Thread[] {
  const [prod, cons] = producerConsumer(items, { invertProducer: invert }) as [Thread, Thread];
  // the consumer is listed first: it reaches the empty buffer before anything is produced
  return [
    { ...cons, weight: vc },
    { ...prod, weight: vp },
  ];
}

function scene(p: Params): SceneSpec {
  const { capacity, items } = readParams(p);
  const bx = 480 - (capacity * 58) / 2;
  return {
    viewBox: [960, 600],
    zones: [
      { id: "shared", title: "Memória compartilhada", rect: { x: 220, y: 20, w: 520, h: 250 }, tone: "mem" },
    ],
    nodes: [
      { id: "prod", kind: "process", label: "Produtor", sub: "thread P", at: [105, 140], w: 150 },
      { id: "cons", kind: "process", label: "Consumidor", sub: "thread C", at: [855, 140], w: 150 },
    ],
    widgets: [
      {
        kind: "grid",
        id: "buf",
        title: `Buffer (${capacity} posições)`,
        at: [bx, 70],
        cols: capacity,
        rows: 1,
        cellW: 54,
      },
      { kind: "counter", id: "c-vazias", title: "vazias", at: [255, 180] },
      { kind: "counter", id: "c-cheias", title: "cheias", at: [425, 180] },
      { kind: "counter", id: "c-mutex", title: "mutex", at: [595, 180] },
      { kind: "queue", id: "w-vazias", title: "Esperando vazias", at: [40, 330], capacity: 2 },
      { kind: "queue", id: "w-cheias", title: "Esperando cheias", at: [370, 330], capacity: 2 },
      { kind: "queue", id: "w-mutex", title: "Esperando mutex", at: [700, 330], capacity: 2 },
      {
        kind: "grid",
        id: "out",
        title: "Consumidos, em ordem",
        at: [40, 430],
        cols: Math.min(12, Math.max(items, 4)),
        rows: 1,
        cellW: 60,
        indexLabel: "none",
      },
    ],
  };
}

export function build(p: Params) {
  const { capacity, items, vp, vc, script } = readParams(p);
  const sems = { vazias: capacity, cheias: 0, mutex: 1 };
  const b = lessonBuilder();
  let seq = 0;
  const row = (t: number | string, who: string, what: string, detail: string) => ({
    cols: { t: String(t), who, what, detail },
  });

  const counters = (values: Record<string, number>) => {
    for (const s of SEMS)
      b.ev({
        t: seq,
        kind: "count",
        counter: `c-${s}`,
        value: String(values[s] ?? 0),
        role: "ctrl",
        label: `${s} = ${values[s]}`,
      });
  };
  const resetWidgets = () => {
    seq++;
    for (let k = 0; k < capacity; k++)
      b.ev({
        t: seq,
        kind: "cell",
        grid: "buf",
        index: k,
        value: "",
        role: "muted",
        label: `posição ${k} vazia`,
      });
    counters(sems);
    for (const tid of ["Produtor", "Consumidor"])
      b.ev({
        t: seq,
        kind: "state",
        target: NODE[tid] as string,
        text: "",
        tone: "none",
        role: ROLE[tid] as Role,
        label: `${tid} pronto`,
      });
  };

  /* ---------- the run with the right order ---------- */
  const run = runConc(threads(items, vp, vc), {
    sems,
    capacity,
    policy: script.length ? "script" : "rr",
    ...(script.length ? { script } : {}),
  });
  let outCount = 0;
  let prevBuf: (string | null)[] = Array.from({ length: capacity }, () => null);
  let prevWait: Record<string, string[]> = { vazias: [], cheias: [], mutex: [] };

  const emitStep = (s: ConcStep, emitRow = true) => {
    seq++;
    const node = NODE[s.tid] as string;
    const role = ROLE[s.tid] as Role;
    const text = opText(s.op);
    const tone = s.outcome === "block" ? "bad" : "active";
    b.ev({
      t: seq,
      kind: "state",
      target: node,
      text: s.outcome === "block" ? `bloqueado em ${text}` : text,
      tone,
      role: s.outcome === "block" ? "bad" : role,
      label: `${s.tid}: ${text}`,
      ...(emitRow
        ? {
            row: row(
              s.t + 1,
              s.tid,
              text,
              s.outcome === "block"
                ? `${s.op.op === "P" ? s.op.sem : ""} = 0: dorme`
                : s.outcome === "wake"
                  ? `acorda ${s.woke}`
                  : s.op.op === "P" || s.op.op === "V"
                    ? `${s.op.sem} = ${s.sems[s.op.sem]}`
                    : s.took
                      ? `pegou ${s.took}`
                      : "",
            ),
          }
        : {}),
    });
    if (s.op.op === "P" || s.op.op === "V") counters(s.sems);
    s.buffer.forEach((v, k) => {
      if (v !== prevBuf[k]) {
        b.ev({
          t: seq,
          kind: "cell",
          grid: "buf",
          index: k,
          value: v ?? "",
          mark: v ? "new" : "evict",
          role,
          label: v ? `${v} na posição ${k}` : `posição ${k} liberada`,
        });
        if (v) b.ev({ t: seq, kind: "move", from: node, to: "buf", role, label: `${s.tid} escreve ${v}` });
        else
          b.ev({ t: seq, kind: "move", from: "buf", to: node, role, label: `${s.tid} retira ${prevBuf[k]}` });
      }
    });
    prevBuf = s.buffer;
    for (const sem of SEMS) {
      const now = s.waiting[sem] ?? [];
      const before = prevWait[sem] ?? [];
      for (const tid of now)
        if (!before.includes(tid))
          b.ev({
            t: seq,
            kind: "enqueue",
            queue: `w-${sem}`,
            item: tid === "Produtor" ? "P" : "C",
            itemRole: ROLE[tid] as Role,
            role: "bad",
            label: `${tid} dorme em ${sem}`,
          });
      for (const tid of before)
        if (!now.includes(tid))
          b.ev({
            t: seq,
            kind: "dequeue",
            queue: `w-${sem}`,
            item: tid === "Produtor" ? "P" : "C",
            role: ROLE[tid] as Role,
            label: `${tid} acorda`,
          });
    }
    prevWait = s.waiting;
    if (s.took) {
      b.ev({
        t: seq,
        kind: "cell",
        grid: "out",
        index: outCount % Math.min(12, Math.max(items, 4)),
        value: s.took,
        mark: "new",
        role: "b",
        label: `Consumido: ${s.took}`,
      });
      outCount++;
    }
  };
  const emitRange = (from: number, to: number) => {
    for (let k = from; k < to; k++) emitStep(run.steps[k] as ConcStep);
  };

  /* ---------- step 1: no synchronization ---------- */
  b.step(
    {
      id: "s1-problema",
      title: "Sem sincronização",
      subtitle: "O produtor sobrescreve o que ninguém leu",
      text: `O produtor coloca itens no [[buffer-limitado]] e o consumidor os retira. Sem combinar nada, um produtor mais rápido dá a volta no buffer e **sobrescreve** um item que o consumidor ainda não leu. O contrário também quebra: um consumidor rápido lê uma posição vazia. Precisamos que cada lado espere quando não pode avançar.`,
      facts: [
        ["Buffer", `${capacity} posições`],
        ["Itens perdidos aqui", "1"],
        ["Causa", "nenhuma espera"],
      ],
      highlight: ["prod"],
    },
    () => {
      resetWidgets();
      for (let k = 0; k <= capacity; k++) {
        seq++;
        const item = `i${k + 1}`;
        const slot = k % capacity;
        b.ev({
          t: seq,
          kind: "move",
          from: "prod",
          to: "buf",
          role: k === capacity ? "bad" : "a",
          label: `escreve ${item}`,
        });
        b.ev({
          t: seq,
          kind: "cell",
          grid: "buf",
          index: slot,
          value: item,
          mark: k === capacity ? "evict" : "new",
          role: k === capacity ? "bad" : "a",
          label: k === capacity ? `${item} sobrescreve i1` : `${item} na posição ${slot}`,
          row: row(
            "—",
            "Produtor",
            `insere ${item}`,
            k === capacity ? "i1 ainda não foi lido: perdido!" : `posição ${slot}`,
          ),
        });
      }
      seq++;
      b.ev({
        t: seq,
        kind: "note",
        at: "buf",
        text: "i1 foi perdido",
        tone: "bad",
        role: "bad",
        label: "Item perdido",
      });
      resetWidgets();
    },
  );

  const steps = run.steps;
  const idx = (pred: (s: ConcStep) => boolean, from = 0) => {
    for (let k = from; k < steps.length; k++) if (pred(steps[k] as ConcStep)) return k;
    return -1;
  };
  let at = 0;
  const firstConsBlock = idx((s) => s.tid === "Consumidor" && s.outcome === "block");
  if (firstConsBlock >= 0) {
    b.step(
      {
        id: "s2-espera",
        title: "O consumidor espera",
        subtitle: "P(cheias) com o buffer vazio",
        text: `Agora cada lado usa [[semaforo|semáforos]]. **cheias** conta itens prontos (começa em 0) e **vazias** conta posições livres (começa em ${capacity}). O consumidor chega primeiro e faz P(cheias): o valor é 0, então ele **dorme** na fila do semáforo em vez de ler lixo. Dormir não gasta CPU.`,
        facts: [
          ["vazias", String(capacity)],
          ["cheias", "0"],
          ["mutex", "1"],
          ["Consumidor", "bloqueado"],
        ],
        highlight: ["cons"],
      },
      () => {
        emitRange(0, firstConsBlock + 1);
        at = firstConsBlock + 1;
      },
    );
  }
  const firstWakeCons = idx((s) => s.outcome === "wake" && s.woke === "Consumidor", at);
  if (firstWakeCons >= at)
    b.step(
      {
        id: "s3-insere",
        title: "O produtor insere",
        subtitle: "P(vazias), P(mutex), insere, V(mutex), V(cheias)",
        text: "O produtor reserva uma posição com P(vazias), entra na [[secao-critica]] com P(mutex), insere o item e sai com V(mutex). Por fim, V(cheias) avisa que há um item pronto. Como o consumidor estava dormindo em cheias, esse V o **acorda** em vez de incrementar o contador.",
        facts: [
          ["Ordem", "vazias → mutex → insere"],
          ["mutex", "protege o índice do buffer"],
          ["V(cheias)", "acorda o consumidor"],
        ],
        highlight: ["prod"],
      },
      () => {
        emitRange(at, firstWakeCons + 1);
        at = firstWakeCons + 1;
      },
    );
  const firstTake = idx((s) => s.op.op === "work" && s.tid === "Consumidor", at);
  if (firstTake >= at)
    b.step(
      {
        id: "s4-retira",
        title: "O consumidor retira",
        subtitle: "O mesmo protocolo, espelhado",
        text: "Acordado, o consumidor entra na seção crítica com P(mutex), retira o item mais antigo e libera o mutex. Depois faz V(vazias): uma posição a mais está livre para o produtor. Repare que os dois usam o mesmo mutex, mas semáforos de contagem diferentes.",
        facts: [
          ["Retirou", steps.slice(at, firstTake + 1).find((s) => s.took)?.took ?? "—"],
          ["V(vazias)", "libera uma posição"],
        ],
        highlight: ["cons"],
      },
      () => {
        emitRange(at, firstTake + 1);
        at = firstTake + 1;
      },
    );
  const prodBlock = idx(
    (s) => s.tid === "Produtor" && s.outcome === "block" && s.op.op === "P" && s.op.sem === "vazias",
    at,
  );
  const prodWake = prodBlock >= 0 ? idx((s) => s.outcome === "wake" && s.woke === "Produtor", prodBlock) : -1;
  if (prodBlock >= at && prodWake > prodBlock)
    b.step(
      {
        id: "s5-cheio",
        title: "Buffer cheio",
        subtitle: "Agora quem dorme é o produtor",
        text: `O produtor é mais rápido (${vp} micro-operações por vez contra ${vc} do consumidor) e enche as ${capacity} posições. Na próxima P(vazias) o contador está em 0 e ele dorme. Só o V(vazias) do consumidor, depois de retirar um item, o acorda. Nada é sobrescrito: compare com o primeiro passo.`,
        facts: [
          ["vazias", "0"],
          ["Produtor", "bloqueado"],
          ["Itens perdidos", "0"],
        ],
        highlight: ["prod", "buf"],
        quiz: {
          kind: "choice",
          prompt: "O buffer está cheio e o produtor faz P(vazias). O que acontece?",
          options: [
            "Ele sobrescreve o item mais antigo",
            "Ele dorme até o consumidor liberar uma posição",
            "Ele descarta o item que produziu",
            "Ele fica testando o contador em laço, gastando CPU",
          ],
          answer: 1,
          explain:
            "Com vazias = 0, a operação P **bloqueia**: o produtor sai da CPU e vai para a fila do semáforo. O V(vazias) do consumidor o acorda. Ficar testando em laço seria espera ocupada, o que um semáforo evita.",
        },
      },
      () => {
        emitRange(at, prodWake + 1);
        at = prodWake + 1;
      },
    );
  if (at < steps.length)
    b.step(
      {
        id: "s6-ritmo",
        title: "Cada um no seu ritmo",
        subtitle: "Os semáforos ajustam as velocidades",
        text: `O resto da execução segue o mesmo padrão: quando um lado está adiantado, ele dorme e o outro alcança. No fim, os ${items} itens saem na mesma ordem em que entraram, e o buffer nunca passou de ${capacity} itens.`,
        facts: [
          ["Consumidos", `${run.consumed.length} de ${items}`],
          ["Ocupação máxima", `${run.maxFill} de ${capacity}`],
          ["Ordem", run.consumed.every((x, k) => x === `i${k + 1}`) ? "preservada" : "alterada"],
        ],
      },
      () => emitRange(at, steps.length),
    );

  /* ---------- deadlock with the wrong order ---------- */
  const bad: ConcResult = runConc(threads(items, vp, vc, true), { sems, capacity, policy: "rr" });
  b.step(
    {
      id: "s7-deadlock",
      quiz: {
        kind: "choice",
        prompt: "O produtor faz P(mutex) e só depois P(vazias), com o buffer cheio. O que acontece?",
        options: [
          "Deadlock: ele dorme segurando o mutex que o consumidor precisa",
          "Nada muda: a ordem dos P não importa",
          "O produtor sobrescreve o item mais antigo",
        ],
        answer: 0,
        explain:
          "Ele dorme em vazias com o mutex na mão. O consumidor, que liberaria uma posição, para em P(mutex). Cada um espera o outro, e ninguém acorda.",
      },
      title: "A ordem errada",
      subtitle: "P(mutex) antes de P(vazias)",
      text: bad.deadlock
        ? "Troque só a ordem no produtor: primeiro P(mutex), depois P(vazias). Com o buffer cheio, ele pega o mutex e dorme em vazias **segurando o mutex**. O consumidor, que liberaria uma posição, dorme em P(mutex). Cada um espera o outro: é um [[deadlock]]. A regra prática: espere pelo recurso contado antes de pegar a trava."
        : "Troque só a ordem no produtor: primeiro P(mutex), depois P(vazias). Com estes parâmetros o buffer nunca chegou a encher com o produtor dentro do mutex, então o impasse não aconteceu. Ele continua possível: aumente a velocidade do produtor no Laboratório.",
      facts: bad.deadlock
        ? [
            ["Produtor", `espera ${bad.blocked.find((x) => x.tid === "Produtor")?.sem ?? "?"}`],
            ["Consumidor", `espera ${bad.blocked.find((x) => x.tid === "Consumidor")?.sem ?? "?"}`],
            ["Itens consumidos", `${bad.consumed.length} de ${items}`],
          ]
        : [["Deadlock", "não ocorreu nesta execução"]],
      highlight: ["prod", "cons"],
    },
    () => {
      resetWidgets();
      for (let k = 0; k < Math.min(12, Math.max(items, 4)); k++)
        b.ev({
          t: seq,
          kind: "cell",
          grid: "out",
          index: k,
          value: "",
          role: "muted",
          label: `saída ${k} limpa`,
        });
      outCount = 0;
      prevBuf = Array.from({ length: capacity }, () => null);
      prevWait = { vazias: [], cheias: [], mutex: [] };
      seq++;
      b.ev({
        t: seq,
        kind: "note",
        at: "prod",
        text: "produtor: P(mutex) antes de P(vazias)",
        tone: "warn",
        role: "warn",
        label: "Ordem invertida",
        row: row("—", "Produtor", "Nova ordem", "P(mutex) → P(vazias)"),
      });
      for (const s of bad.steps) emitStep(s, s.outcome !== "ok" || s.op.op === "put" || s.op.op === "take");
      if (bad.deadlock) {
        seq++;
        b.ev({
          t: seq,
          kind: "note",
          at: "buf",
          text: "deadlock: ninguém pode avançar",
          tone: "bad",
          role: "bad",
          label: "Deadlock",
          row: row("—", "Sistema", "Deadlock", bad.blocked.map((x) => `${x.tid} em ${x.sem}`).join(" · ")),
        });
      }
    },
  );

  const notes: string[] = [];
  if (run.deadlock)
    notes.push("Atenção: a execução correta terminou em deadlock, o que não deveria acontecer.");
  if (script.length)
    notes.push(
      `Você escolheu a ordem de ${script.length} micro-operações; depois disso, as threads revezam sozinhas.`,
    );
  if (prodBlock < 0)
    notes.push(
      "O produtor nunca encontrou o buffer cheio: ele não é rápido o bastante em relação ao consumidor.",
    );
  return b.done(
    {
      consumed: run.consumed.length,
      maxFill: run.maxFill,
      deadlock: bad.deadlock ? 1 : 0,
      ops: run.steps.length,
    },
    notes,
  );
}

const lesson: LessonModule = {
  meta: {
    slug: "produtor-consumidor",
    site: "so",
    title: "Semáforos: produtor e consumidor",
    summary:
      "Três semáforos resolvem o buffer limitado: um conta as vagas, outro os itens e o terceiro protege a seção crítica. E uma troca de ordem causa deadlock.",
    area: "Concorrência e sincronização",
    refs: [
      { book: "tanenbaum-mos", chapter: 2, section: "2.3.5", note: "Semáforos", verified: true },
      { book: "maziero-so", chapter: 12, section: "12.1", note: "Produtores / consumidores", verified: true },
    ],
    simplifications: [
      "Cada micro-operação é atômica e o escalonador alterna as threads entre elas.",
      "As velocidades são números de micro-operações por vez, não tempos reais.",
      "V acorda o primeiro da fila (FIFO); semáforos reais nem sempre garantem essa ordem.",
      "Um produtor e um consumidor; com vários de cada, o mesmo protocolo continua correto.",
    ],
  },
  scene,
  params: {
    defaults: { buffer: 4, itens: 8, velProdutor: 12, velConsumidor: 6, roteiro: "" },
    fields: [
      { key: "buffer", kind: "int", label: "Posições no buffer", min: 1, max: 8 },
      { key: "itens", kind: "int", label: "Itens produzidos", min: 1, max: 12 },
      {
        key: "velProdutor",
        kind: "int",
        label: "Velocidade do produtor (operações por vez)",
        min: 1,
        max: 24,
      },
      {
        key: "velConsumidor",
        kind: "int",
        label: "Velocidade do consumidor (operações por vez)",
        min: 1,
        max: 24,
      },
      {
        key: "roteiro",
        kind: "list",
        label: "Eu escolho quem roda (opcional)",
        maxItems: 60,
        pattern: "[PCpc]",
        placeholder: "C P P C P",
        help: "Uma letra por micro-operação: P = produtor, C = consumidor. Se a escolhida estiver dormindo, roda a outra.",
      },
    ],
  },
  build,
  intro: {
    text: "O player da Lia decodifica áudio numa [[thread]] e outra thread manda as amostras para a placa de som. Entre as duas há um buffer de tamanho fixo. Quem produz não pode encher demais; quem consome não pode ler o vazio; e os dois não podem mexer no buffer ao mesmo tempo. Três [[semaforo|semáforos]] resolvem tudo, desde que usados na ordem certa.",
    facts: [
      ["Buffer", "4 posições"],
      ["Semáforos", "vazias = 4, cheias = 0, mutex = 1"],
      ["Itens", "8"],
    ],
  },
  outro: {
    title: "Semáforos em resumo",
    text: "Semáforos de contagem fazem cada lado dormir quando não pode avançar; o mutex protege a seção crítica. A ordem importa: pegue a trava por último e solte-a primeiro.",
    facts: (run) => [
      ["Itens entregues", String(run.stats.consumed)],
      ["Ocupação máxima", String(run.stats.maxFill)],
      ["Deadlock com a ordem errada", run.stats.deadlock ? "sim" : "não"],
    ],
  },
  next: ["chamada-de-sistema"],
};

export default lesson;
