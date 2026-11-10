import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { type Alarm, deltaList, overhead, program } from "../../../sim/os/clock.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { relogios as practice } from "../practice.ts";

/**
 * Clocks and timers: the PC's 1.193182 MHz crystal programmed for HZ ticks per second, a list of
 * pending alarms kept as differences, and alarms firing late by up to one tick.
 */
const CRYSTAL = 1_193_182;
const HANDLER_US = 2;
const ALARMS: Alarm[] = [
  { who: "navegador", ms: 20 },
  { who: "player", ms: 30 },
  { who: "compilador", ms: 45 },
  { who: "editor", ms: 50 },
  { who: "planilha", ms: 51 },
];
export const DEFAULTS = { hz: "250" };
const HZS = ["100", "250", "1000"];

const hzOf = (p: Params) => Number(HZS.includes(String(p.hz)) ? p.hz : DEFAULTS.hz);

const scene: SceneSpec = {
  viewBox: [960, 600],
  nodes: [
    { id: "cristal", kind: "timer", label: "Cristal", sub: "1.193.182 Hz", at: [120, 110] },
    { id: "contador", kind: "box", label: "Contador", sub: "decrementa", at: [360, 110], w: 160 },
    { id: "cpu", kind: "cpu", label: "CPU", sub: "interrupção", at: [620, 110] },
  ],
  links: [
    { id: "l1", from: "cristal", to: "contador" },
    { id: "l2", from: "contador", to: "cpu" },
  ],
  widgets: [
    {
      kind: "table",
      id: "alarmes",
      title: "Alarmes pendentes, em ordem de disparo",
      at: [30, 250],
      columns: ["Processo", "Pediu", "Diferença", "Dispara", "Atraso"],
      widths: [150, 100, 120, 110, 100],
      rows: ALARMS.length,
    },
    { kind: "counter", id: "tique", title: "Tique atual", at: [680, 260] },
    { kind: "counter", id: "carga", title: "Registrador de carga", at: [680, 360] },
    { kind: "counter", id: "custo", title: "CPU no tratador", at: [680, 460] },
  ],
};

const dec = (x: number, d = 2) => String(Math.round(x * 10 ** d) / 10 ** d).replace(".", ",");

export function build(p: Params) {
  const hz = hzOf(p);
  const tickMs = 1000 / hz;
  const b = lessonBuilder();
  const c = talk(b, { cristal: "Cristal", contador: "Contador", cpu: "CPU" }, (t) => `${t}`);
  const prog = program(CRYSTAL, hz);
  const list = deltaList(ALARMS, tickMs);
  const cost = overhead(hz, HANDLER_US);
  const late = list.filter((a) => a.lateMs > 0);
  const worst = list.reduce((a, x) => (x.lateMs > a.lateMs ? x : a), list[0] as (typeof list)[number]);
  const comp = list.find((a) => a.who === "compilador") as (typeof list)[number];
  const lastTick = Math.max(...list.map((a) => a.firesMs / tickMs));
  const show = (i: number, mark: "new" | "hit" | "warn", fired = false) => {
    const a = list[i] as (typeof list)[number];
    c.row(
      "alarmes",
      i,
      [
        a.who,
        `${a.ms} ms`,
        fired ? "disparou" : `${a.delta} ${a.delta === 1 ? "tique" : "tiques"}`,
        `${dec(a.firesMs)} ms`,
        `${dec(a.lateMs)} ms`,
      ],
      { dt: 0, mark },
    );
  };

  b.step(
    {
      id: "s1-cristal",
      title: "Um cristal e um contador",
      subtitle: `${prog.holding} pulsos por tique`,
      text: `O relógio do PC é um cristal que oscila 1.193.182 vezes por segundo. Cada pulso decrementa um contador; quando ele chega a zero, o hardware gera uma interrupção e recarrega o contador a partir do [[registrador-de-carga]]. Para ${hz} interrupções por segundo, o núcleo escreve ${prog.holding} nesse registrador, e cada [[tique]] dura ${dec(prog.tickUs / 1000, 3)} ms. Trocar o valor muda a frequência sem mudar o cristal.`,
      facts: [
        ["Cristal", "1.193.182 Hz"],
        ["Registrador de carga", String(prog.holding)],
        ["Tique", `${dec(prog.tickUs / 1000, 3)} ms`],
      ],
      highlight: ["cristal", "contador"],
      quiz: {
        kind: "number",
        prompt: `Que valor o núcleo põe no registrador de carga para ter ${hz} tiques por segundo com o cristal de 1.193.182 Hz?`,
        answer: prog.holding,
        tolerance: 1,
        explain: `Cada tique precisa de 1.193.182 ÷ ${hz} ≈ ${prog.holding} pulsos. O valor é arredondado, então a frequência real sai um pouco diferente de ${hz}.`,
      },
    },
    () => {
      c.send("cristal", "contador", "pulsos", { role: "muted", what: `${prog.holding} pulsos` });
      c.state("contador", `${prog.holding} → 0`, {
        dt: 0,
        label: `contador recarregado com ${prog.holding}`,
      });
      c.send("contador", "cpu", "interrupção", { role: "warn", detail: "um tique" });
      c.count("carga", String(prog.holding), { label: `carga ${prog.holding}` });
    },
  );

  b.step(
    {
      id: "s2-tratador",
      title: "O preço de cada tique",
      subtitle: `${dec(cost)}% da CPU`,
      text: `A cada tique, o [[timer|tratador do relógio]] soma o tempo do dia, desconta o quantum do processo que está rodando e cuida dos alarmes. Se ele leva ${HANDLER_US} µs, ${hz} tiques por segundo custam ${dec(cost)}% da CPU. Mais tiques dão alarmes mais precisos e quanta mais curtos, mas acordam a CPU mais vezes, o que gasta energia num notebook parado. O Linux deixa escolher entre 100, 250 e 1000.`,
      facts: [
        ["Tiques por segundo", String(hz)],
        ["Tratador", `${HANDLER_US} µs`],
        ["Custo", `${dec(cost)}% da CPU`],
      ],
      highlight: ["cpu"],
    },
    () => {
      c.count("custo", `${dec(cost)}%`, { dt: 1, role: "warn", label: `${dec(cost)}% da CPU` });
    },
  );

  b.step(
    {
      id: "s3-lista",
      title: "Uma fila de diferenças",
      subtitle: list.map((a) => a.delta).join(", "),
      text: `Cinco processos pedem alarmes: ${ALARMS.map((a) => `${a.who} em ${a.ms} ms`).join(", ")}. O núcleo converte cada pedido em tiques, arredondando para cima, e guarda a fila em ordem. Cada entrada não guarda o tempo total, só a diferença para a anterior: ${list.map((a) => a.delta).join(", ")}. Assim, a cada tique, basta decrementar a primeira entrada, sem percorrer a fila.`,
      facts: [
        ["Pedidos", String(ALARMS.length)],
        ["Diferenças", list.map((a) => a.delta).join(", ")],
        ["Trabalho por tique", "decrementar o primeiro"],
      ],
      highlight: [],
    },
    () => {
      list.forEach((_, i) => {
        c.at(c.t + 1);
        show(i, "new");
      });
    },
  );

  b.step(
    {
      id: "s4-disparos",
      title: "Sempre num tique",
      subtitle: `${late.length} de ${list.length} disparam atrasados`,
      text: `Agora os tiques correm. Um alarme só pode disparar num tique, então quem pediu um tempo que não é múltiplo de ${dec(tickMs)} ms espera o tique seguinte. ${late.length ? `${late.length} dos ${list.length} alarmes atrasam; o pior é o de ${worst.who}, ${dec(worst.lateMs)} ms.` : "Com esta frequência, nenhum alarme atrasa."} Entradas com diferença 0 disparam no mesmo tique que a anterior.`,
      facts: [
        ["Tique", `${dec(tickMs)} ms`],
        ["Atrasados", `${late.length} de ${list.length}`],
        ["Maior atraso", `${dec(worst.lateMs)} ms`],
      ],
      highlight: ["cpu"],
      quiz: {
        kind: "number",
        prompt: `Com tique de ${dec(tickMs)} ms, em que instante dispara o alarme que o compilador pediu para ${comp.ms} ms?`,
        answer: comp.firesMs,
        unit: "ms",
        explain: `${comp.ms} ÷ ${dec(tickMs)} = ${dec(comp.ms / tickMs)}, arredondado para cima dá ${comp.firesMs / tickMs} tiques: ${dec(comp.firesMs)} ms.`,
      },
    },
    () => {
      for (let t = 1; t <= lastTick; t++) {
        c.count("tique", `${t} (${dec(t * tickMs)} ms)`, { dt: 1, role: "a", label: `tique ${t}` });
        list.forEach((a, i) => {
          if (a.firesMs / tickMs === t) {
            show(i, a.lateMs > 0 ? "warn" : "hit", true);
            c.note("alarmes", `${a.who}: alarme aos ${dec(a.firesMs)} ms`, a.lateMs > 0 ? "warn" : "good");
          }
        });
      }
    },
  );

  b.step(
    {
      id: "s5-sem-tique",
      title: "Acordar só quando precisa",
      subtitle: "Núcleo sem tique fixo",
      text: "Os núcleos modernos evitam o tique quando não há nada a fazer: com a CPU ociosa, programam o temporizador em modo de disparo único para o próximo alarme da fila, e a CPU dorme até lá. Temporizadores de alta resolução fazem o mesmo com precisão de microssegundos, sem esperar o próximo tique. O tique periódico continua útil para dividir a CPU entre processos prontos.",
      facts: [
        ["CPU ociosa", "sem tique periódico"],
        ["Próximo alarme", "disparo único"],
        ["Precisão", "microssegundos"],
      ],
      highlight: ["contador"],
    },
    () => {
      c.state("contador", "disparo único", { dt: 1, label: "temporizador em disparo único" });
    },
  );

  return b.done({
    holding: prog.holding,
    deltas: list.map((a) => a.delta).join(","),
    late: late.length,
    worst: worst.lateMs,
    cost: dec(cost),
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "relogios",
    site: "so",
    title: "Relógios e temporizadores: o tique do sistema",
    summary:
      "Um cristal, um contador e um registrador de carga geram o tique; a fila de alarmes em diferenças e o atraso de até um tique.",
    area: "Arquivos e E/S",
    refs: [
      {
        book: "tanenbaum-mos",
        chapter: 5,
        section: "5.5",
        note: "Relógios: hardware, software e temporizadores",
        verified: true,
      },
    ],
    simplifications: [
      "O tique é tratado como exatamente 1000 ÷ HZ ms; o valor inteiro no registrador deixa um erro de partes por milhão.",
      "O tratador leva sempre o mesmo tempo.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "hz",
        kind: "choice",
        label: "Tiques por segundo (HZ)",
        options: HZS.map((h) => ({ value: h, label: `${h} Hz` })),
      },
    ],
  },
  build,
  intro: {
    text: "O sistema operacional precisa saber a hora, tirar a CPU de um processo quando o quantum acaba e acordar quem pediu para dormir 30 ms. Tudo isso vem de um único circuito que interrompe a CPU num ritmo fixo.",
    facts: [
      ["Cristal", "1.193.182 Hz"],
      ["HZ", DEFAULTS.hz],
      ["Alarmes", String(ALARMS.length)],
    ],
  },
  outro: {
    title: "Relógios em resumo",
    text: "O cristal e o registrador de carga fixam a duração do tique; a cada tique o núcleo atualiza a hora, o quantum e a fila de alarmes. Alarmes disparam no primeiro tique depois do pedido, e núcleos modernos programam o próximo disparo em vez de acordar à toa.",
    facts: (run) => [
      ["Registrador de carga", String(run.stats.holding)],
      ["Diferenças", String(run.stats.deltas)],
      ["Alarmes atrasados", String(run.stats.late)],
    ],
  },
  next: ["round-robin", "entrada-saida"],
  practice,
};

export default lesson;
