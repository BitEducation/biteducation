import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { KLASS_LABEL, KLASSES, MACHINES, MIX, perfRun } from "../../../sim/arch/perf.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { big, num } from "../../shared/practice-kit.ts";
import { desempenho as practice } from "../practice.ts";

/**
 * Measuring performance: the equation time = instructions × CPI × cycle, a weighted CPI from an
 * instruction mix, a faster clock that loses to dearer instructions, and an optimizer that makes
 * the program faster while its MIPS rating drops.
 */
export const DEFAULTS = { mhzB: 4000 };

function clamp(p: Params) {
  return Math.min(5000, Math.max(2000, Math.round(Number(p.mhzB ?? DEFAULTS.mhzB) / 100) * 100));
}

function scene(): SceneSpec {
  return {
    viewBox: [960, 560],
    nodes: [],
    links: [],
    widgets: [
      {
        kind: "table",
        id: "mix",
        title: "O programa: instruções por classe (milhões)",
        at: [40, 40],
        columns: ["Classe", "Sem otimizar", "Otimizado", "CPI em A", "CPI em B"],
        widths: [150, 140, 130, 120, 120],
        rows: 3,
      },
      { kind: "counter", id: "tempo", title: "Tempo de CPU", at: [760, 50] },
      {
        kind: "table",
        id: "res",
        title: "Tempo = instruções × CPI ÷ frequência",
        at: [40, 230],
        columns: ["Máquina e código", "Instruções (mi)", "CPI médio", "Frequência", "Tempo", "MIPS"],
        widths: [190, 120, 120, 130, 120, 120],
        rows: 4,
      },
    ],
  };
}

export function build(p: Params) {
  const mhzB = clamp(p);
  const a0 = perfRun(MACHINES.A.mhz, MACHINES.A.cpi, MIX.O0);
  const b0 = perfRun(mhzB, MACHINES.B.cpi, MIX.O0);
  const a2 = perfRun(MACHINES.A.mhz, MACHINES.A.cpi, MIX.O2);
  const b2 = perfRun(mhzB, MACHINES.B.cpi, MIX.O2);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => `t${t}`);
  const ghz = (m: number) => `${num(m / 1000, 1)} GHz`;
  const s = (x: number) => `${num(x, 3)} s`;
  const mi = (x: number) => `${big(x)} milhões`;
  const row = (i: number, name: string, r: typeof a0, mhz: number, mark: "new" | "hit" | "warn") =>
    c.row("res", i, [name, big(r.instr), num(r.cpi, 3), ghz(mhz), s(r.seconds), String(Math.round(r.mips))], {
      dt: 1,
      mark,
    });
  const cpiSum = (cpi: Record<string, number>) =>
    KLASSES.map((k) => `${num(MIX.O0[k] / a0.instr)} × ${cpi[k]}`).join(" + ");
  const faster = b0.seconds < a0.seconds ? "B" : b0.seconds > a0.seconds ? "A" : "nenhuma";
  const ratio = Math.max(a0.seconds, b0.seconds) / Math.min(a0.seconds, b0.seconds);

  b.step(
    {
      id: "s1-equacao",
      title: "Três fatores do tempo",
      subtitle: "Instruções × CPI × ciclo",
      text: `O tempo que um programa leva na CPU é o produto de três coisas: quantas instruções ele executa, quantos ciclos cada uma leva em média, o [[cpi|CPI]], e quanto dura um ciclo, o inverso da frequência. Nenhum fator sozinho decide. Nosso programa executa ${mi(a0.instr)} de instruções de três classes, e cada classe custa um número diferente de ciclos.`,
      facts: [
        ["Instruções", mi(a0.instr)],
        ["Classes", String(KLASSES.length)],
        ["Tempo", "N × CPI × T"],
      ],
      highlight: ["mix"],
    },
    () => {
      KLASSES.forEach((k, i) => {
        c.row(
          "mix",
          i,
          [
            KLASS_LABEL[k],
            String(MIX.O0[k]),
            String(MIX.O2[k]),
            String(MACHINES.A.cpi[k]),
            String(MACHINES.B.cpi[k]),
          ],
          {
            dt: 1,
            mark: "new",
          },
        );
      });
    },
  );

  b.step(
    {
      id: "s2-cpi",
      title: "CPI é uma média",
      subtitle: `CPI de A: ${num(a0.cpi, 3)}`,
      text: `O CPI médio pesa o custo de cada classe pela fração que ela ocupa no programa. Na máquina A, a ${ghz(MACHINES.A.mhz)}: ${cpiSum(MACHINES.A.cpi)} = ${num(a0.cpi, 3)} ciclos por instrução. As instruções de memória são só ${Math.round((MIX.O0.mem / a0.instr) * 100)}% do programa, mas respondem por mais da metade dos ciclos. É onde vale a pena atacar.`,
      facts: [
        ["CPI de A", num(a0.cpi, 3)],
        ["Ciclos", mi(a0.cycles)],
        ["Memória nos ciclos", `${Math.round(((MIX.O0.mem * MACHINES.A.cpi.mem) / a0.cycles) * 100)}%`],
      ],
      highlight: ["mix"],
      quiz: {
        kind: "number",
        prompt: `${KLASSES.map((k) => `${Math.round((MIX.O0[k] / a0.instr) * 100)}% de ${KLASS_LABEL[k]} com CPI ${MACHINES.A.cpi[k]}`).join(", ")}. Qual o CPI médio?`,
        answer: Math.round(a0.cpi * 1000) / 1000,
        tolerance: 0.01,
        explain: `${cpiSum(MACHINES.A.cpi)} = ${num(a0.cpi, 3)}.`,
      },
    },
    () => {
      row(0, "A, sem otimizar", a0, MACHINES.A.mhz, "new");
      c.count("tempo", s(a0.seconds), { label: `A: ${s(a0.seconds)}` });
    },
  );

  b.step(
    {
      id: "s3-maquina-b",
      title: "Mais gigahertz",
      subtitle: `B a ${ghz(mhzB)}`,
      text: `A máquina B tem relógio de ${ghz(mhzB)}, conseguido com um pipeline mais longo. O preço é pago em ciclos: uma falha de cache e um desvio errado custam mais estágios, e o CPI médio sobe para ${num(b0.cpi, 3)}. O tempo é ${mi(b0.instr)} de instruções × ${num(b0.cpi, 3)} ÷ ${ghz(mhzB)} = ${s(b0.seconds)}, contra ${s(a0.seconds)} em A. ${faster === "nenhuma" ? "Empate: o relógio mais rápido não comprou nada." : `Mais rápida: ${faster}, ${num(ratio, 2)} vezes.`}`,
      facts: [
        ["CPI de B", num(b0.cpi, 3)],
        ["Tempo de B", s(b0.seconds)],
        ["Tempo de A", s(a0.seconds)],
      ],
      highlight: ["res"],
      quiz: {
        kind: "number",
        prompt: `B executa ${big(a0.instr)} milhões de instruções com CPI ${num(b0.cpi, 3)} a ${ghz(mhzB)}. Quantos segundos leva?`,
        answer: Math.round(b0.seconds * 1000) / 1000,
        tolerance: 0.005,
        unit: "s",
        explain: `${b0.instr} × 10⁶ × ${num(b0.cpi, 3)} ÷ (${num(mhzB / 1000, 1)} × 10⁹) = ${s(b0.seconds)}.`,
      },
    },
    () => {
      row(1, "B, sem otimizar", b0, mhzB, b0.seconds < a0.seconds ? "hit" : "warn");
      c.count("tempo", s(b0.seconds), { label: `B: ${s(b0.seconds)}` });
    },
  );

  b.step(
    {
      id: "s4-compilador",
      title: "O compilador entra",
      subtitle: `${mi(a0.instr)} → ${mi(a2.instr)}`,
      text: `Agora o compilador otimiza: guarda valores em registradores e elimina ${MIX.O0.alu - MIX.O2.alu} milhões de instruções aritméticas redundantes. As instruções caem para ${mi(a2.instr)} e o tempo em A cai para ${s(a2.seconds)}. Repare no CPI: ele subiu, de ${num(a0.cpi, 3)} para ${num(a2.cpi, 3)}, porque saíram justamente as instruções baratas. O programa ficou mais rápido mesmo assim.`,
      facts: [
        ["Instruções", mi(a2.instr)],
        ["CPI de A", `${num(a0.cpi, 3)} → ${num(a2.cpi, 3)}`],
        ["Tempo de A", `${s(a0.seconds)} → ${s(a2.seconds)}`],
      ],
      highlight: ["res", "mix"],
    },
    () => {
      row(2, "A, otimizado", a2, MACHINES.A.mhz, "hit");
      row(3, "B, otimizado", b2, mhzB, "hit");
      c.count("tempo", s(a2.seconds), { label: `A otimizado: ${s(a2.seconds)}` });
    },
  );

  b.step(
    {
      id: "s5-mips",
      title: "A armadilha do MIPS",
      subtitle: `${Math.round(a0.mips)} → ${Math.round(a2.mips)} MIPS`,
      text: `[[mips-metrica|MIPS]], milhões de instruções por segundo, parece uma boa nota: frequência ÷ CPI. Mas em A ele caiu de ${Math.round(a0.mips)} para ${Math.round(a2.mips)} com o código otimizado, que roda em menos tempo. MIPS conta instruções, não trabalho: um programa com mais instruções baratas tem MIPS alto e demora mais. Para comparar máquinas, só vale o tempo do mesmo programa.`,
      facts: [
        ["MIPS sem otimizar", String(Math.round(a0.mips))],
        ["MIPS otimizado", String(Math.round(a2.mips))],
        ["Mais rápido", "o otimizado"],
      ],
      highlight: ["res"],
      quiz: {
        kind: "choice",
        prompt: "O código otimizado tem MIPS menor e termina antes. Como isso é possível?",
        options: [
          "Ele executa menos instruções; as que sobraram são, em média, mais caras",
          "A frequência da máquina caiu com o código otimizado",
          "MIPS mede o tempo, então a conta está errada",
        ],
        answer: 0,
        explain:
          "MIPS = frequência ÷ CPI. Tirar instruções baratas aumenta o CPI e derruba o MIPS, mas o tempo depende também de quantas instruções existem, que caiu mais.",
      },
    },
    () => {
      c.note("res", "MIPS caiu, tempo também", "warn", { dt: 1 });
    },
  );

  b.step(
    {
      id: "s6-medir",
      title: "Como medir de verdade",
      subtitle: "O mesmo programa, o tempo",
      text: `Por isso fabricantes e revistas usam conjuntos de programas reais, como o SPEC, e comparam tempos: o compilador, a memória e o CPI entram todos na conta. Na hora de melhorar, a equação diz onde mexer: menos instruções com melhor algoritmo e compilador, CPI menor com cache e previsão de desvio, ciclo mais curto com tecnologia. Cada um costuma piorar outro.`,
      facts: [
        ["Instruções", "algoritmo, compilador"],
        ["CPI", "cache, pipeline, previsão"],
        ["Ciclo", "tecnologia, pipeline"],
      ],
      highlight: ["res"],
    },
    () => {
      c.count("tempo", s(Math.min(a2.seconds, b2.seconds)), { label: "melhor tempo" });
    },
  );

  return b.done({
    cpiA: Math.round(a0.cpi * 1000) / 1000,
    timeA: Math.round(a0.seconds * 1000) / 1000,
    timeB: Math.round(b0.seconds * 1000) / 1000,
    mipsA: Math.round(a0.mips),
    mipsA2: Math.round(a2.mips),
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "desempenho",
    site: "arq",
    title: "Medindo desempenho",
    summary:
      "Tempo de CPU = instruções × CPI × duração do ciclo. Um relógio mais rápido pode perder para instruções mais baratas, e um compilador melhor deixa o programa mais rápido enquanto a nota em MIPS cai.",
    area: "Visão geral",
    refs: [
      { book: "tanenbaum-sco", chapter: 4, section: "4.5", note: "Melhoria de desempenho", verified: true },
      { book: "tanenbaum-sco", chapter: 2, section: "2.1.3", note: "RISC contra CISC", verified: true },
    ],
    simplifications: [
      "Cada classe de instrução tem um CPI fixo; na prática ele varia com cache e desvios.",
      "O programa não espera por E/S: só o tempo de CPU conta.",
      "A otimização só remove instruções aritméticas.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [{ key: "mhzB", kind: "int", label: "Frequência da máquina B (MHz)", min: 2000, max: 5000 }],
  },
  build,
  practice,
  intro: {
    text: "Uma CPU de 4 GHz é mais rápida que uma de 3 GHz? Depende. Você vai calcular o tempo do mesmo programa em duas máquinas, com e sem otimização, e ver por que frequência e MIPS enganam.",
    facts: [
      ["Máquina A", "3 GHz"],
      ["Máquina B", "4 GHz"],
      ["Programa", "1 bilhão de instruções"],
    ],
  },
  outro: {
    title: "Desempenho em resumo",
    text: "O tempo de CPU é instruções × CPI × duração do ciclo, e melhorar um fator costuma piorar outro. O CPI médio pondera cada classe de instrução pela frequência dela. Frequência e MIPS, sozinhos, não comparam máquinas; o tempo do mesmo programa, sim.",
    facts: (r) => [
      ["CPI de A", num(Number(r.stats.cpiA), 3)],
      ["Tempo de A", `${num(Number(r.stats.timeA), 3)} s`],
      ["Tempo de B", `${num(Number(r.stats.timeB), 3)} s`],
    ],
  },
  next: ["amdahl", "pipeline", "cache-associativa"],
};

export default lesson;
