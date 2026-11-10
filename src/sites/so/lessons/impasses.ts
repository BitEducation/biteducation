import type { LessonModule, Params } from "../../../contracts/types.ts";
import { type BankProc, bankerRequest, bankerSafe, findCycle } from "../../../sim/os/deadlock.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { seqScene, talk } from "../../../sim/shared/seq.ts";

/**
 * Deadlock: two processes and two devices in a cycle, the four conditions, prevention by
 * resource ordering, the banker's algorithm for one resource type and detection as an option.
 */
export const DEFAULTS = { quem: "A", quantidade: 1 };
export const BANK: BankProc[] = [
  { id: "A", has: 3, max: 9 },
  { id: "B", has: 2, max: 4 },
  { id: "C", has: 2, max: 7 },
];
export const FREE = 3;
const TOTAL = FREE + BANK.reduce((n, p) => n + p.has, 0);
const CONDS = ["Exclusão mútua", "Posse e espera", "Não preempção", "Espera circular"];

const scene = seqScene(
  [
    { id: "p1", kind: "process", label: "P1 · digitaliza", sub: "processo", at: [110, 100], w: 150 },
    { id: "imp", kind: "device", label: "Impressora", sub: "1 unidade", at: [400, 100] },
    { id: "p2", kind: "process", label: "P2 · imprime", sub: "processo", at: [110, 280], w: 150 },
    { id: "scan", kind: "device", label: "Scanner", sub: "1 unidade", at: [400, 280] },
  ],
  {
    width: 960,
    height: 620,
    links: [
      { id: "l1", from: "p1", to: "imp", style: "dashed" },
      { id: "l2", from: "p2", to: "scan", style: "dashed" },
      {
        id: "l3",
        from: "p1",
        to: "scan",
        style: "dashed",
        via: [
          [250, 100],
          [250, 280],
        ],
      },
      {
        id: "l4",
        from: "p2",
        to: "imp",
        style: "dashed",
        via: [
          [270, 280],
          [270, 100],
        ],
      },
    ],
    widgets: [
      {
        kind: "table",
        id: "cond",
        title: "As quatro condições de Coffman",
        at: [540, 60],
        columns: ["Condição", "Neste cenário"],
        widths: [190, 190],
        rows: 4,
      },
      {
        kind: "table",
        id: "banco",
        title: `Banqueiro: ${TOTAL} unidades no total`,
        at: [40, 400],
        columns: ["Processo", "Tem", "Máximo", "Precisa"],
        widths: [90, 60, 80, 80],
        rows: 3,
      },
      { kind: "counter", id: "livres", title: "Livres", at: [390, 400] },
      {
        kind: "table",
        id: "seq",
        title: "Simulação: alguém consegue terminar?",
        at: [540, 400],
        columns: ["Ordem", "Livres antes", "Termina", "Livres depois"],
        widths: [60, 110, 90, 120],
        rows: 3,
      },
    ],
  },
);

export function build(p: Params) {
  const who = ["A", "B", "C"].includes(String(p.quem)) ? String(p.quem) : "A";
  const amount = Math.min(3, Math.max(1, Number(p.quantidade ?? 1)));
  const b = lessonBuilder();
  const c = talk(b, { p1: "P1", p2: "P2", imp: "Impressora", scan: "Scanner" }, (t) => `${t}`);

  const cycle = findCycle({ p1: ["scan"], scan: ["p2"], p2: ["imp"], imp: ["p1"] }) ?? [];
  const names: Record<string, string> = { p1: "P1", p2: "P2", imp: "impressora", scan: "scanner" };
  const cycleText = [...cycle, cycle[0] ?? ""].map((x) => names[x] ?? x).join(" → ");

  b.step(
    {
      id: "s1-espera",
      title: "Cada um espera o outro",
      subtitle: "Um impasse com dois aparelhos",
      text: "O P1 digitaliza e imprime; o P2 imprime e digitaliza. O P1 pega a impressora, o P2 pega o scanner. Agora o P1 pede o scanner, que está com o P2, e o P2 pede a impressora, que está com o P1. Os dois ficam [[bloqueado|bloqueados]] para sempre, sem erro nenhum na tela: é um [[deadlock]], ou impasse.",
      facts: [
        ["P1 tem / quer", "impressora / scanner"],
        ["P2 tem / quer", "scanner / impressora"],
        ["Progresso", "nenhum"],
      ],
      highlight: ["p1", "p2"],
    },
    () => {
      c.send("p1", "imp", "pede", { role: "a" });
      c.state("imp", "com P1", { dt: 0, tone: "active", label: "Impressora vai para P1" });
      c.send("p2", "scan", "pede", { role: "b" });
      c.state("scan", "com P2", { dt: 0, tone: "active", label: "Scanner vai para P2" });
      c.send("p1", "scan", "pede", { role: "a", detail: "ocupado: espera" });
      c.state("p1", "esperando o scanner", { dt: 0, tone: "warn" });
      c.send("p2", "imp", "pede", { role: "b", detail: "ocupada: espera" });
      c.state("p2", "esperando a impressora", { dt: 0, tone: "warn" });
      c.note("p1", "ninguém avança", "bad", { dt: 1 });
    },
  );

  b.step(
    {
      id: "s2-condicoes",
      title: "As quatro condições",
      subtitle: "Todas presentes ao mesmo tempo",
      text: `Um impasse exige quatro condições juntas: cada aparelho atende um processo por vez, quem tem um recurso pode pedir outro, ninguém tira um recurso à força e existe uma [[espera-circular]]. No [[grafo-de-alocacao]], com setas de pedido e de posse, o ciclo aparece: ${cycleText}. Com um recurso de cada tipo, ciclo no grafo significa impasse.`,
      facts: [
        ["Ciclo encontrado", cycleText],
        ["Condições presentes", "4 de 4"],
      ],
      highlight: ["p1", "p2", "imp", "scan"],
    },
    () => {
      const why = ["um processo por vez", "têm um e pedem outro", "ninguém toma à força", "P1 → P2 → P1"];
      CONDS.forEach((name, i) => {
        c.row("cond", i, [name, why[i] as string], { mark: "bad", dt: i === 0 ? 1 : 0 });
      });
      c.state("l3", "", { dt: 1, tone: "bad", label: "Pedido de P1 no ciclo" });
      c.state("l4", "", { dt: 0, tone: "bad", label: "Pedido de P2 no ciclo" });
    },
  );

  const ordered = findCycle({ p1: [], imp: ["p1"], p2: ["imp"] });
  b.step(
    {
      id: "s3-ordem",
      title: "Uma ordem para pedir",
      subtitle: "Prevenção: quebrar a espera circular",
      text: `Basta quebrar uma das quatro condições. A mais prática é numerar os recursos e exigir que todos peçam em ordem crescente: primeiro a impressora, depois o scanner. Agora o P2 pede a impressora antes de tudo e espera sem segurar nada. O P1 pega os dois, termina e libera. O grafo ${ordered ? "ainda tem ciclo" : "não tem mais ciclo"}: o P2 só espera, e a espera acaba.`,
      facts: [
        ["Regra", "impressora antes do scanner"],
        ["Ciclo no grafo", ordered ? "sim" : "não"],
        ["Condição quebrada", "espera circular"],
      ],
      highlight: ["p2"],
    },
    () => {
      c.state("l3", "", { dt: 1, tone: "none", label: "Reinicia o cenário" });
      c.state("l4", "", { dt: 0, tone: "none", label: "Reinicia o cenário" });
      c.state("imp", "com P1", { dt: 0, tone: "active", label: "Impressora com P1" });
      c.state("scan", "livre", { dt: 0, tone: "none", label: "Scanner livre" });
      c.state("p1", "", { dt: 0, tone: "none", label: "P1 recomeça" });
      c.send("p2", "imp", "pede", { role: "b", detail: "ocupada: espera sem segurar nada" });
      c.state("p2", "esperando, sem recursos", { dt: 0, tone: "warn" });
      c.send("p1", "scan", "pede", { role: "a", detail: "livre" });
      c.state("scan", "com P1", { dt: 0, tone: "active", label: "Scanner vai para P1" });
      c.state("p1", "terminou e liberou", { dt: 1, tone: "good" });
      c.state("imp", "com P2", { dt: 1, tone: "active", label: "Impressora vai para P2" });
      c.state("p2", "seguindo", { dt: 0, tone: "good" });
      c.row("cond", 3, [CONDS[3] as string, "quebrada pela ordem"], { mark: "hit" });
    },
  );

  const safe = bankerSafe(FREE, BANK);
  const order = safe.steps.map((s) => s.id).join(", ");
  const afterFirst = safe.steps[0]?.after ?? FREE;
  b.step(
    {
      id: "s4-seguro",
      title: "Um estado seguro",
      subtitle: "O banqueiro faz as contas antes",
      text: `Outra saída é evitar o impasse recusando pedidos perigosos. Cada processo declara o máximo que vai usar. O [[algoritmo-do-banqueiro]] verifica se existe uma ordem em que todos terminam: com ${FREE} unidades livres, ${safe.steps[0]?.id} consegue terminar e devolve o que tem; depois os outros. A ordem ${order} existe, então o estado é [[estado-seguro|seguro]].`,
      facts: [
        ["Livres", String(FREE)],
        ["Ordem segura", order],
        ["Estado", safe.safe ? "seguro" : "inseguro"],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Depois que ${safe.steps[0]?.id} termina e devolve o que tem, quantas unidades ficam livres?`,
        answer: afterFirst,
        unit: "unidades",
        explain: `Eram ${FREE} livres; ${safe.steps[0]?.id} devolve as ${afterFirst - FREE} que tinha, e ficam ${afterFirst}. É assim que a simulação avança: cada processo que termina aumenta o que sobra para os outros.`,
      },
    },
    () => {
      BANK.forEach((x, i) => {
        c.row("banco", i, [x.id, String(x.has), String(x.max), String(x.max - x.has)], {
          dt: i === 0 ? 1 : 0,
        });
      });
      c.count("livres", String(FREE), { dt: 0 });
      safe.steps.forEach((s, i) => {
        c.row("seq", i, [String(i + 1), String(s.before), s.id, String(s.after)], { mark: "new", dt: 1 });
        c.count("livres", String(s.after), { dt: 0 });
      });
    },
  );

  const req = bankerRequest(FREE, BANK, who, amount);
  const me = BANK.find((x) => x.id === who) as BankProc;
  const verdict =
    req.reason === "ok"
      ? `a simulação ainda acha a ordem ${req.check?.steps.map((s) => s.id).join(", ")}, então o pedido é atendido`
      : req.reason === "unsafe"
        ? `a simulação trava com ${req.check?.steps.length ? `${req.check.steps.map((s) => s.id).join(", ")} terminando e ` : ""}${req.check?.stuck.join(" e ")} sem conseguir terminar, então ${who} espera, mesmo havendo unidades livres`
        : req.reason === "claim"
          ? `isso passaria do máximo que ${who} declarou, então o pedido é recusado como erro`
          : `não há unidades livres suficientes, então ${who} espera`;
  b.step(
    {
      id: "s5-pedido",
      title: `${who} pede mais ${amount}`,
      subtitle: "Atender ou fazer esperar",
      text: `Agora ${who}, que tem ${me.has} de no máximo ${me.max}, pede mais ${amount}. O banqueiro finge que atendeu e refaz a simulação com ${FREE - amount} livres: ${verdict}. Estado inseguro não é impasse, mas é um estado em que o sistema não consegue mais garantir que todos terminam. Mude o pedido no Laboratório.`,
      facts: [
        ["Pedido", `${who} + ${amount}`],
        ["Livres se atender", String(FREE - amount)],
        ["Decisão", req.granted ? "atende" : "espera"],
      ],
      highlight: [],
    },
    () => {
      const steps = req.check?.steps ?? [];
      for (let i = 0; i < 3; i++) {
        const s = steps[i];
        c.row("seq", i, s ? [String(i + 1), String(s.before), s.id, String(s.after)] : ["", "", "", ""], {
          ...(s ? { mark: "new" as const } : {}),
          dt: i === 0 ? 1 : 0,
        });
      }
      if (req.check?.stuck.length)
        c.row(
          "seq",
          Math.min(2, steps.length),
          [String(steps.length + 1), String(steps.at(-1)?.after ?? FREE - amount), "ninguém", "—"],
          {
            mark: "bad",
            dt: 1,
          },
        );
      c.count("livres", String(req.granted ? FREE - amount : FREE), { dt: 1 });
      const i = BANK.findIndex((x) => x.id === who);
      c.row(
        "banco",
        i,
        req.granted
          ? [who, String(me.has + amount), String(me.max), String(me.max - me.has - amount)]
          : [who, String(me.has), String(me.max), `${me.max - me.has} (esperando)`],
        { mark: req.granted ? "new" : "warn", dt: 0 },
      );
    },
  );

  b.step(
    {
      id: "s6-detectar",
      title: "Ou deixar acontecer",
      subtitle: "Detecção, recuperação e o avestruz",
      text: "O banqueiro exige saber os máximos de antemão, o que raramente se sabe. Por isso muitos sistemas preferem detectar: de tempos em tempos procuram ciclos no grafo e, se acham, encerram um processo ou desfazem uma transação, como fazem os bancos de dados. E o mais comum nos sistemas de uso geral é ignorar o problema, apostando que ele é raro: o chamado algoritmo do avestruz.",
      facts: [
        ["Prevenir", "quebrar uma condição"],
        ["Evitar", "banqueiro, exige os máximos"],
        ["Detectar", "procurar ciclos e recuperar"],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: "Numa aplicação, duas threads travaram com dois mutexes. Qual mudança evita isso de vez?",
        options: [
          "Aumentar a prioridade de uma delas",
          "Fazer todas as threads pegarem os mutexes sempre na mesma ordem",
          "Trocar mutex por semáforo",
          "Rodar em um processador mais rápido",
        ],
        answer: 1,
        explain:
          "Com uma ordem fixa de aquisição, ninguém segura um mutex de ordem maior enquanto espera um de ordem menor, e a espera circular fica impossível. É a técnica de prevenção mais usada em código real.",
      },
    },
    () => {
      c.note("p1", "procurar ciclos de tempos em tempos", "info", { dt: 1 });
    },
  );

  return b.done({ safe: safe.safe ? 1 : 0, order, granted: req.granted ? 1 : 0, reason: req.reason });
}

const lesson: LessonModule = {
  meta: {
    slug: "impasses",
    site: "so",
    title: "Impasses: quando todos esperam por todos",
    summary:
      "Dois processos travados por dois aparelhos, as quatro condições, a ordem que previne, o banqueiro que evita e a detecção que recupera.",
    area: "Concorrência",
    refs: [
      {
        book: "tanenbaum-mos",
        chapter: 6,
        section: "6.2",
        note: "Condições e modelagem de impasses",
        verified: true,
      },
      {
        book: "tanenbaum-mos",
        chapter: 6,
        section: "6.5",
        note: "Estados seguros e o banqueiro",
        verified: true,
      },
      { book: "tanenbaum-mos", chapter: 6, section: "6.6", note: "Prevenção de impasses", verified: true },
      { book: "maziero-so", chapter: 13, note: "Impasses", verified: true },
    ],
    simplifications: [
      "O banqueiro com um único tipo de recurso; a versão com vários tipos usa vetores na mesma lógica.",
      "Os aparelhos têm uma unidade cada, então ciclo no grafo equivale a impasse.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "quem",
        kind: "choice",
        label: "Quem faz o pedido no passo 5",
        options: [
          { value: "A", label: "A (tem 3, máximo 9)" },
          { value: "B", label: "B (tem 2, máximo 4)" },
          { value: "C", label: "C (tem 2, máximo 7)" },
        ],
      },
      { key: "quantidade", kind: "int", label: "Unidades pedidas", min: 1, max: 3 },
    ],
  },
  build,
  intro: {
    text: "Às vezes um programa para de responder, sem erro e sem usar CPU. Muitas vezes é um impasse: cada processo segura algo que o outro precisa. Você vai provocar um, entender as quatro condições que o tornam possível e ver três estratégias para lidar com ele: prevenir, evitar e detectar.",
    facts: [
      ["Recursos", "impressora e scanner"],
      ["Banqueiro", `${TOTAL} unidades, 3 processos`],
      ["Estratégias", "prevenir, evitar, detectar"],
    ],
  },
  outro: {
    title: "Impasses em resumo",
    text: "Impasse exige exclusão mútua, posse e espera, não preempção e espera circular ao mesmo tempo. Ordenar os pedidos quebra a espera circular; o banqueiro recusa pedidos que levam a estados inseguros; a detecção procura ciclos e recupera depois.",
    facts: (run) => [
      ["Ordem segura", String(run.stats.order)],
      ["Pedido do Laboratório", run.stats.granted ? "atendido" : "fica esperando"],
    ],
  },
  next: ["produtor-consumidor", "escalonamento"],
};

export default lesson;
