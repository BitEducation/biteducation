import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import { type Guess, loopOutcomes, type PredResult, predict } from "../../../sim/arch/branch.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { prng, randInt } from "../../../sim/shared/prng.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { previsaoDesvio as practice } from "../practice.ts";

/**
 * Branch prediction: a loop branch under "always taken", 1-bit and 2-bit predictors, the 2-bit
 * state machine, and a data-dependent branch over random versus sorted values.
 */
export const DEFAULTS = { iteracoes: 4, repeticoes: 3, penalidade: 3 };
const NDATA = 16;
const SEED = 754;
const STATES = [
  { id: "q0", label: "00", sub: "forte: não toma" },
  { id: "q1", label: "01", sub: "fraco: não toma" },
  { id: "q2", label: "10", sub: "fraco: toma" },
  { id: "q3", label: "11", sub: "forte: toma" },
];

function setup(p: Params) {
  const iters = Math.min(8, Math.max(2, Math.round(Number(p.iteracoes ?? DEFAULTS.iteracoes))));
  const reps = Math.min(4, Math.max(1, Math.round(Number(p.repeticoes ?? DEFAULTS.repeticoes))));
  const pen = Math.min(20, Math.max(1, Math.round(Number(p.penalidade ?? DEFAULTS.penalidade))));
  const loop = loopOutcomes(iters, reps);
  const rand = prng(SEED);
  const values = Array.from({ length: NDATA }, () => randInt(rand, 0, 255));
  const sorted = [...values].sort((a, b) => a - b);
  return { iters, reps, pen, loop, values, sorted };
}

const LANES = ["Real (laço)", "Sempre toma", "1 bit", "2 bits", "Dados aleatórios", "Dados ordenados"];

function scene(p: Params): SceneSpec {
  const { loop } = setup(p);
  return {
    viewBox: [960, 590],
    nodes: STATES.map((s, i) => ({
      id: s.id,
      kind: "box" as const,
      label: s.label,
      sub: s.sub,
      at: [170 + i * 210, 330] as const,
      w: 150,
    })),
    links: [
      { id: "e01", from: "q0", to: "q1" },
      { id: "e12", from: "q1", to: "q2" },
      { id: "e23", from: "q2", to: "q3" },
    ],
    widgets: [
      {
        kind: "gantt",
        id: "linha",
        title: "Cada barra é uma execução do desvio · T = toma, N = não toma",
        at: [40, 50],
        lanes: LANES,
        span: Math.max(loop.length, NDATA),
        width: 880,
      },
      {
        kind: "table",
        id: "res",
        title: "Erros e ciclos perdidos",
        at: [40, 400],
        columns: ["Preditor", "Desvios", "Erros", "Acerto", "Ciclos perdidos"],
        widths: [220, 110, 110, 120, 160],
        rows: 5,
      },
    ],
  };
}

const tn = (x: boolean) => (x ? "T" : "N");
const pct = (hit: number, n: number) => `${Math.round((100 * hit) / Math.max(1, n))}%`;

export function build(p: Params) {
  const { iters, reps, pen, loop, values, sorted } = setup(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => `${t}`);
  let seq = 0;

  const bar = (lane: string, i: number, item: string, role: Role, label: string, detail: string) => {
    seq += 1;
    b.ev({
      t: seq,
      kind: "gantt",
      lane,
      from: i,
      to: i + 1,
      item,
      itemRole: role,
      role,
      label,
      row: { cols: { t: String(i + 1), who: lane, what: item, detail } },
    });
    c.at(seq);
  };
  const real = () =>
    loop.forEach((x, i) => {
      bar(
        LANES[0] as string,
        i,
        tn(x),
        "muted",
        `execução ${i + 1}: ${tn(x)}`,
        x ? "volta ao laço" : "sai do laço",
      );
    });
  const lane = (name: string, r: PredResult, onGuess?: (g: Guess, i: number) => void) =>
    r.guesses.forEach((g, i) => {
      bar(
        name,
        i,
        tn(g.pred),
        g.hit ? "a" : "bad",
        `${name}, execução ${i + 1}: previu ${tn(g.pred)}, foi ${tn(g.actual)}`,
        g.hit ? `previu ${tn(g.pred)}: acertou` : `previu ${tn(g.pred)}, foi ${tn(g.actual)}: erro`,
      );
      onGuess?.(g, i);
    });
  const result = (row: number, name: string, r: PredResult) =>
    c.row(
      "res",
      row,
      [
        name,
        String(r.guesses.length),
        String(r.misses),
        pct(r.guesses.length - r.misses, r.guesses.length),
        String(r.misses * pen),
      ],
      {
        mark: "new",
        log: { who: name, what: `${r.misses} erros`, detail: `${r.misses * pen} ciclos perdidos` },
      },
    );

  b.step(
    {
      id: "s1-problema",
      title: "Adivinhar o caminho",
      subtitle: `Um laço de ${iters} voltas, ${reps} ${reps === 1 ? "vez" : "vezes"}`,
      text: `No [[pipeline]], a próxima instrução precisa entrar antes de o [[desvio]] ser resolvido, alguns estágios depois. Esperar custaria ciclos em todo desvio; por isso o processador chuta o caminho e, se errar, descarta o que entrou: ${pen} ${pen === 1 ? "ciclo perdido" : "ciclos perdidos"} por erro, aqui. O desvio do fim de um laço de ${iters} voltas é tomado ${iters - 1} vezes e não tomado na saída.`,
      facts: [
        ["Execuções do desvio", String(loop.length)],
        ["Padrão", loop.slice(0, iters).map(tn).join(" ")],
        ["Penalidade", `${pen} ${pen === 1 ? "ciclo" : "ciclos"}`],
      ],
      highlight: [],
    },
    real,
  );

  const always = predict(loop, "taken");
  b.step(
    {
      id: "s2-estatico",
      title: "Sempre toma",
      subtitle: `${always.misses} erros`,
      text: `A previsão mais simples é fixa: desvio para trás, que costuma fechar laços, é sempre tomado. Não precisa de memória nenhuma e erra só na saída de cada laço: ${always.misses} de ${loop.length}. Funciona bem para laços longos, mas não aprende nada com desvios que mudam de comportamento.`,
      facts: [
        ["Erros", String(always.misses)],
        ["Acerto", pct(loop.length - always.misses, loop.length)],
        ["Ciclos perdidos", String(always.misses * pen)],
      ],
      highlight: [],
    },
    () => {
      lane(LANES[1] as string, always);
      result(0, "Sempre toma", always);
    },
  );

  const one = predict(loop, "1bit");
  b.step(
    {
      id: "s3-um-bit",
      title: "Lembrar a última vez",
      subtitle: `1 bit: ${one.misses} erros`,
      text: `Um [[preditor-de-desvio]] dinâmico guarda, numa tabela indexada pelo endereço do desvio, o que aconteceu da última vez. Com 1 bit, ele erra na saída do laço e erra de novo na volta seguinte, porque a saída deixou o bit em "não toma". São ${one.misses} erros, ${one.misses > always.misses ? "mais do que a regra fixa" : one.misses === always.misses ? "tantos quanto a regra fixa" : "menos que a regra fixa"}.`,
      facts: [
        ["Erros", String(one.misses)],
        ["Erro típico", "saída e reentrada"],
        ["Ciclos perdidos", String(one.misses * pen)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `O preditor de 1 bit começa em "não toma". Quantos erros ele comete nas ${loop.length} execuções do desvio?`,
        answer: one.misses,
        explain: `Em cada entrada no laço ele erra a primeira volta (o bit diz "não toma") e erra a saída (o bit diz "toma"): ${one.misses} erros.`,
      },
    },
    () => {
      lane(LANES[2] as string, one);
      result(1, "1 bit", one);
    },
  );

  const two = predict(loop, "2bit");
  b.step(
    {
      id: "s4-dois-bits",
      quiz: {
        kind: "choice",
        prompt:
          "O contador está em 3 e o laço sai uma vez (não tomado). O que ele prevê na próxima execução do desvio?",
        options: [
          "Toma: o contador só desce para 2",
          "Não toma: o último resultado manda",
          "Depende do endereço do desvio",
        ],
        answer: 0,
        explain:
          'Um erro só tira o contador do estado mais forte. Como 2 ainda prevê "toma", a volta seguinte do laço acerta, onde o preditor de 1 bit erraria.',
      },
      title: "Um contador de 2 bits",
      subtitle: `2 bits: ${two.misses} erros`,
      text: `Com 2 bits, o preditor é um contador saturado de 0 a 3: tomou, soma 1; não tomou, subtrai 1. Os estados 2 e 3 preveem "toma". Uma única saída do laço só leva de 3 para 2, e a previsão continua "toma" na volta seguinte. É preciso errar duas vezes seguidas para mudar de ideia. Resultado: ${two.misses} erros, contra ${one.misses} com 1 bit${two.misses > reps ? `; ${two.misses - reps === 1 ? "o erro a mais é" : "os erros a mais são"} de aquecimento, porque o contador começa em 01` : ""}.`,
      facts: [
        ["Erros", String(two.misses)],
        ["Estados", "00, 01, 10, 11"],
        ["Ciclos perdidos", String(two.misses * pen)],
      ],
      highlight: [],
    },
    () => {
      let prev = -1;
      lane(LANES[3] as string, two, (g) => {
        const after = g.actual ? Math.min(3, g.state + 1) : Math.max(0, g.state - 1);
        if (prev >= 0)
          b.ev({
            t: c.t,
            kind: "state",
            target: `q${prev}`,
            text: "",
            tone: "none",
            role: "muted",
            label: "sai",
          });
        b.ev({
          t: c.t,
          kind: "state",
          target: `q${after}`,
          text: g.hit ? "acertou" : "errou",
          tone: g.hit ? "active" : "bad",
          role: g.hit ? "a" : "bad",
          label: `contador: ${g.state} → ${after}`,
        });
        prev = after;
      });
      result(2, "2 bits", two);
    },
  );

  const rnd = predict(
    values.map((v) => v >= 128),
    "2bit",
  );
  const srt = predict(
    sorted.map((v) => v >= 128),
    "2bit",
  );
  b.step(
    {
      id: "s5-dados",
      title: "Quando os dados decidem",
      subtitle: "if (v >= 128) sobre 16 valores",
      text: `Nem todo desvio tem padrão. Num if (v >= 128) sobre ${NDATA} valores sorteados, o contador de 2 bits erra ${rnd.misses} vezes: o resultado parece cara ou coroa. Com os mesmos valores ordenados, ficam primeiro todos os menores e depois todos os maiores, e ele erra só ${srt.misses}. Por isso o mesmo código pode rodar bem mais rápido sobre dados ordenados.`,
      facts: [
        ["Aleatórios", `${rnd.misses} erros`],
        ["Ordenados", `${srt.misses} erros`],
        ["Valores", `${values.slice(0, 6).join(", ")}…`],
      ],
      highlight: [],
    },
    () => {
      lane(LANES[4] as string, rnd);
      lane(LANES[5] as string, srt);
      result(3, "2 bits, dados aleatórios", rnd);
      result(4, "2 bits, dados ordenados", srt);
    },
  );

  const best = Math.min(always.misses, one.misses, two.misses);
  const bestName =
    best === two.misses
      ? "o contador de 2 bits"
      : best === always.misses
        ? "a regra fixa"
        : "o preditor de 1 bit";
  b.step(
    {
      id: "s6-custo",
      title: "O preço de errar",
      subtitle: `${pen} ${pen === 1 ? "ciclo" : "ciclos"} por erro`,
      text: `Cada erro custa ${pen} ${pen === 1 ? "ciclo" : "ciclos"} aqui; num processador moderno, com pipelines de 15 a 20 estágios, passa de 15. No laço, o que menos errou foi ${bestName}, com ${best} ${best === 1 ? "erro" : "erros"}; nos dados aleatórios, ${rnd.misses * pen} ciclos se perderam. CPUs atuais combinam o histórico de vários desvios recentes e acertam bem mais de 90%, e ainda executam o caminho previsto de forma especulativa.`,
      facts: [
        ["Melhor no laço", `${best} erros`],
        ["Perdido nos aleatórios", `${rnd.misses * pen} ciclos`],
        ["CPUs modernas", "histórico global"],
      ],
      highlight: [],
    },
    () => {
      for (const s of STATES)
        b.ev({ t: c.t, kind: "state", target: s.id, text: "", tone: "none", role: "muted", label: "limpa" });
    },
  );

  return b.done({
    always: always.misses,
    one: one.misses,
    two: two.misses,
    random: rnd.misses,
    sorted: srt.misses,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "previsao-desvio",
    site: "arq",
    title: "Previsão de desvio",
    summary:
      "Por que o processador chuta o resultado dos desvios: previsão fixa, de 1 bit e de 2 bits num laço, a máquina de estados do contador e um if sobre dados aleatórios e ordenados.",
    area: "Microarquitetura",
    refs: [
      { book: "tanenbaum-sco", chapter: 4, section: "4.5.2", note: "Previsão de desvio", verified: true },
      { book: "tanenbaum-sco", chapter: 4, section: "4.5.4", note: "Execução especulativa", verified: true },
    ],
    simplifications: [
      "Um único desvio por vez, sem colisões na tabela de previsão.",
      "Penalidade fixa por erro; na prática ela depende de onde o desvio é resolvido.",
      `Os ${NDATA} valores aleatórios vêm de uma semente fixa, para a lição ser sempre igual.`,
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "iteracoes", kind: "int", label: "Voltas do laço", min: 2, max: 8 },
      { key: "repeticoes", kind: "int", label: "Vezes que o laço roda", min: 1, max: 4 },
      { key: "penalidade", kind: "int", label: "Ciclos perdidos por erro", min: 1, max: 20 },
    ],
  },
  build,
  intro: {
    text: "Um processador com pipeline busca instruções antes de saber para onde um desvio vai. Em vez de esperar, ele chuta. Você vai comparar três jeitos de chutar num laço, ver a máquina de estados de um contador de 2 bits e descobrir por que ordenar os dados pode acelerar um if.",
    facts: [
      ["Laço", `${DEFAULTS.iteracoes} voltas`],
      ["Repetições", String(DEFAULTS.repeticoes)],
      ["Penalidade", `${DEFAULTS.penalidade} ciclos`],
    ],
  },
  outro: {
    title: "Previsão de desvio em resumo",
    text: "Errar a previsão esvazia parte do pipeline. Uma regra fixa já acerta muitos laços; 1 bit erra duas vezes por laço; um contador de 2 bits só erra na saída. Desvios que dependem de dados sem padrão continuam difíceis, e ordenar os dados cria o padrão que faltava.",
    facts: (run) => [
      ["1 bit", `${run.stats.one} erros`],
      ["2 bits", `${run.stats.two} erros`],
      ["Aleatório × ordenado", `${run.stats.random} × ${run.stats.sorted}`],
    ],
  },
  next: ["pipeline", "cache-direta"],
  practice,
};

export default lesson;
