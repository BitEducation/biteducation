import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { amdahl, ceiling, dec, efficiency, gustafson, times } from "../../../sim/arch/amdahl.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { amdahlPractice as practice } from "../practice.ts";

/**
 * Amdahl's law: a 100-second job split into a serial and a parallel part, run on more and more
 * cores; the speedup flattens at 1 / (1 - f), and Gustafson's view grows the problem instead.
 */
export const DEFAULTS = { paralela: 90, nucleos: 8 };
const TOTAL = 100;
const CURVE = [1, 2, 4, 8, 16, 32, 64];
const FRACTIONS = [50, 75, 90, 95, 99];

function clamp(p: Params) {
  const pct = Math.min(99, Math.max(50, Math.round(Number(p.paralela ?? DEFAULTS.paralela))));
  const n = Math.min(64, Math.max(1, Math.round(Number(p.nucleos ?? DEFAULTS.nucleos))));
  return { pct, f: pct / 100, n };
}

/** The chart tops at the ceiling (or 64, the most cores plotted). */
const yMax = (f: number) => Math.min(64, Math.ceil(ceiling(f)));

function scene(p: Params): SceneSpec {
  const { f } = clamp(p);
  return {
    viewBox: [960, 580],
    nodes: [],
    links: [],
    widgets: [
      {
        kind: "table",
        id: "tempos",
        title: `Um trabalho de ${TOTAL} s em vários núcleos`,
        at: [40, 50],
        columns: ["Núcleos", "Serial", "Paralela", "Total", "Speedup"],
        widths: [80, 90, 100, 90, 90],
        rows: 5,
      },
      { kind: "counter", id: "speedup", title: "Speedup", at: [560, 50] },
      { kind: "counter", id: "eficiencia", title: "Eficiência", at: [760, 50] },
      { kind: "counter", id: "teto", title: "Teto (infinitos núcleos)", at: [560, 150] },
      { kind: "counter", id: "escalado", title: "Speedup escalado", at: [760, 150] },
      {
        kind: "chart",
        id: "curva",
        title: "Speedup por número de núcleos",
        at: [60, 300],
        width: 420,
        height: 200,
        x: { label: "núcleos", max: 64 },
        y: { label: "speedup", max: yMax(f) },
      },
      {
        kind: "table",
        id: "fracoes",
        title: "Quanto pesa a parte serial",
        at: [560, 270],
        columns: ["Paralela", "Com os núcleos", "Teto"],
        widths: [110, 150, 110],
        rows: FRACTIONS.length,
      },
    ],
  };
}

export function build(p: Params) {
  const { pct, f, n } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const serialPct = 100 - pct;
  const one = times(TOTAL, f, 1);
  const tn = times(TOTAL, f, n);
  const s = amdahl(f, n);
  const eff = efficiency(f, n);
  const top = ceiling(f);
  const at64 = amdahl(f, 64);
  const scaled = gustafson(f, n);
  const cores = [...new Set([1, 2, 4, n])].sort((a, z) => a - z);
  const nucleo = (k: number) => (k === 1 ? "1 núcleo" : `${k} núcleos`);

  const timeRow = (k: number, i: number, mark?: "new" | "hit") => {
    const t = times(TOTAL, f, k);
    c.row(
      "tempos",
      i,
      [String(k), `${dec(t.serial)} s`, `${dec(t.parallel)} s`, `${dec(t.total)} s`, `${dec(amdahl(f, k))}×`],
      {
        dt: 1,
        ...(mark ? { mark } : {}),
        log: { who: nucleo(k), what: `${dec(t.total)} s`, detail: `speedup ${dec(amdahl(f, k))}` },
      },
    );
  };

  b.step(
    {
      id: "s1-trabalho",
      title: "Um trabalho, duas partes",
      subtitle: `${dec(one.serial)} s serial + ${dec(one.parallel)} s paralela`,
      text: `Um programa leva ${TOTAL} s num núcleo. Parte dele não se divide: ler a entrada, juntar resultados, escrever o arquivo. Aqui essa parte serial é ${serialPct}%, ou ${dec(one.serial)} s. Os outros ${pct}%, ${dec(one.parallel)} s, são um laço cujas voltas são independentes e podem ser repartidas entre núcleos. Antes de comprar uma CPU com mais núcleos, vale fazer a conta de quanto isso ajuda.`,
      facts: [
        ["Tempo em 1 núcleo", `${TOTAL} s`],
        ["Serial", `${serialPct}%`],
        ["Paralelizável", `${pct}%`],
      ],
      highlight: [],
    },
    () => {
      timeRow(1, 0, "new");
      c.plot("curva", "medido", 1, 1, { role: "a", label: "1 núcleo: 1×" });
      c.plot("curva", "ideal", 1, 1, { role: "muted", label: "ideal: 1×" });
    },
  );

  b.step(
    {
      id: "s2-divide",
      title: "Dividir só o que dá",
      subtitle: nucleo(n),
      text: `${n === 1 ? `Com 1 núcleo nada se divide: são ${dec(tn.serial)} s seriais mais ${dec(tn.parallel)} s do laço, ${dec(tn.total)} s ao todo. No Laboratório, aumente os núcleos e compare com as linhas da tabela.` : `Com ${nucleo(n)}, a parte paralela cai para ${dec(one.parallel)} ÷ ${n} = ${dec(tn.parallel)} s, mas a serial continua com ${dec(tn.serial)} s. O total fica em ${dec(tn.total)} s. A tabela mostra o mesmo cálculo para outras quantidades: cada vez que os núcleos dobram, só o pedaço paralelo encolhe pela metade, e a parte serial passa a ser uma fatia cada vez maior do tempo que sobra.`}`,
      facts: [
        ["Serial", `${dec(tn.serial)} s`],
        ["Paralela", `${dec(tn.parallel)} s`],
        ["Total", `${dec(tn.total)} s`],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Quanto tempo o programa leva com ${nucleo(n)}?`,
        answer: Math.round(tn.total * 100) / 100,
        tolerance: 0.01,
        unit: "s",
        explain: `${dec(tn.serial)} s serial + ${dec(one.parallel)} ÷ ${n} = ${dec(tn.parallel)} s paralela = ${dec(tn.total)} s.`,
      },
    },
    () => {
      cores.slice(1).forEach((k, i) => {
        timeRow(k, i + 1, k === n ? "hit" : undefined);
      });
    },
  );

  b.step(
    {
      id: "s3-lei",
      title: "A lei de Amdahl",
      subtitle: `${dec(s)}× com ${nucleo(n)}`,
      text: `O [[speedup]] é o tempo antigo dividido pelo novo: ${TOTAL} ÷ ${dec(tn.total)} = ${dec(s)}×. A [[lei-de-amdahl]] escreve isso sem tempos: 1 ÷ ((1 − f) + f ÷ n), com f a fração paralela. A eficiência, speedup dividido pelos núcleos, é ${dec(eff * 100, 1)}%: ${n === 1 ? "com um núcleo não há o que dividir" : eff < 0.75 ? "boa parte do tempo dos núcleos se perde esperando a parte serial" : "por enquanto, pouco se perde esperando a parte serial"}. No gráfico, a curva medida já se afasta da reta ideal, em que o speedup seria igual ao número de núcleos.`,
      facts: [
        ["Speedup", `${dec(s)}×`],
        ["Eficiência", `${dec(eff * 100, 1)}%`],
        ["Fórmula", "1 ÷ ((1 − f) + f ÷ n)"],
      ],
      highlight: [],
    },
    () => {
      c.count("speedup", `${dec(s)}×`, { role: "a", label: `speedup ${dec(s)}` });
      c.count("eficiencia", `${dec(eff * 100, 1)}%`, { dt: 0, label: `eficiência ${dec(eff * 100, 1)}%` });
      for (const k of CURVE.slice(1, 4)) {
        c.plot("curva", "medido", k, amdahl(f, k), {
          role: "a",
          dt: 1,
          label: `${k}: ${dec(amdahl(f, k))}×`,
        });
        if (k <= yMax(f)) c.plot("curva", "ideal", k, k, { role: "muted", dt: 0, label: `ideal: ${k}×` });
      }
    },
  );

  b.step(
    {
      id: "s4-teto",
      title: "O teto",
      subtitle: `No máximo ${dec(top)}×`,
      text: `Com infinitos núcleos a parte paralela some, mas a serial, de ${dec(one.serial)} s, fica. O speedup nunca passa de 1 ÷ (1 − f) = ${TOTAL} ÷ ${dec(one.serial)} = ${dec(top)}×. Com 64 núcleos já se chega a ${dec(at64)}×, ${dec((at64 / top) * 100, 0)}% do teto: ${at64 / top >= 0.8 ? "os núcleos seguintes rendem quase nada" : "ainda há espaço, mas cada núcleo extra rende menos que o anterior"}. A curva achata porque cada dobra só corta metade de um pedaço que já é pequeno.`,
      facts: [
        ["Teto", `${dec(top)}×`],
        ["Com 64 núcleos", `${dec(at64)}×`],
        ["O que limita", `${dec(one.serial)} s seriais`],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: `Com ${pct}% do programa paralelizável, qual é o maior speedup possível, com quantos núcleos se quiser?`,
        options: [`${dec(top)}×`, `${pct}×`, "Não há limite: basta pôr mais núcleos"],
        answer: 0,
        explain: `A parte serial, ${serialPct}%, nunca encolhe: ${TOTAL} s ÷ ${dec(one.serial)} s = ${dec(top)}×.`,
      },
    },
    () => {
      for (const k of CURVE.slice(4)) {
        c.plot("curva", "medido", k, amdahl(f, k), {
          role: "a",
          dt: 1,
          label: `${k}: ${dec(amdahl(f, k))}×`,
        });
        if (k <= yMax(f)) c.plot("curva", "ideal", k, k, { role: "muted", dt: 0, label: `ideal: ${k}×` });
      }
      c.row(
        "tempos",
        cores.length,
        ["∞", `${dec(one.serial)} s`, "0 s", `${dec(one.serial)} s`, `${dec(top)}×`],
        {
          dt: 1,
          mark: "new",
          log: { who: "infinitos núcleos", what: `${dec(one.serial)} s`, detail: `teto ${dec(top)}×` },
        },
      );
      c.count("teto", `${dec(top)}×`, { role: "warn", label: `teto ${dec(top)}` });
    },
  );

  const rows = FRACTIONS.map((q) => ({ q, s: amdahl(q / 100, n), top: ceiling(q / 100) }));
  const r50 = rows[0];
  const r99 = rows[rows.length - 1];
  b.step(
    {
      id: "s5-serial",
      title: "Cada ponto serial conta",
      subtitle: `Mesmos ${n} núcleos, frações diferentes`,
      text: `Fixando ${nucleo(n)}, a tabela troca a fração paralela. Com metade serial, o melhor que se tira é ${dec(r50?.s ?? 0)}×; com 99% paralelo, ${dec(r99?.s ?? 0)}×, e o teto vai a ${dec(r99?.top ?? 0)}×. A lição prática: em vez de dobrar os núcleos, costuma render mais encolher a parte serial, por exemplo lendo a entrada em pedaços ou juntando resultados em árvore em vez de um a um.`,
      facts: [
        ["50% paralelo", `${dec(r50?.s ?? 0)}×`],
        ["99% paralelo", `${dec(r99?.s ?? 0)}×`],
        ["Núcleos", String(n)],
      ],
      highlight: [],
    },
    () => {
      rows.forEach((r, i) => {
        c.row("fracoes", i, [`${r.q}%`, `${dec(r.s)}×`, `${dec(r.top)}×`], {
          dt: 1,
          ...(r.q === pct ? { mark: "hit" as const } : {}),
          log: { who: `${r.q}% paralelo`, what: `${dec(r.s)}×`, detail: `teto ${dec(r.top)}×` },
        });
      });
    },
  );

  b.step(
    {
      id: "s6-gustafson",
      title: "Crescer o problema",
      subtitle: `${dec(scaled)}× escalado`,
      text: `Amdahl supõe o problema fixo. Na prática, quem ganha núcleos costuma processar mais dados no mesmo tempo: imagens maiores, simulações mais finas. Pela [[lei-de-gustafson]], se a parte paralela cresce ${n} vezes e a serial não, ${nucleo(n)} fazem num mesmo intervalo o trabalho que um faria em (1 − f) + f × n = ${dec(scaled)} vezes esse tempo. Nenhuma das duas conta a sincronização e a cache disputada, que reduzem ainda mais o ganho real.`,
      facts: [
        ["Amdahl", `${dec(s)}×`],
        ["Gustafson", `${dec(scaled)}×`],
        ["Não contam", "sincronização, memória"],
      ],
      highlight: [],
    },
    () => {
      c.count("escalado", `${dec(scaled)}×`, { role: "b", label: `escalado ${dec(scaled)}` });
    },
  );

  return b.done({
    total: Number(dec(tn.total).replace(",", ".")),
    speedup: dec(s),
    efficiency: dec(eff * 100, 1),
    ceiling: dec(top),
    at64: dec(at64),
    scaled: dec(scaled),
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "amdahl",
    site: "arq",
    title: "Lei de Amdahl: quanto rendem mais núcleos",
    summary:
      "Um trabalho com parte serial e parte paralela em 1 a 64 núcleos: o speedup, a eficiência, o teto 1 ÷ (1 − f) e a visão de Gustafson, que cresce o problema.",
    area: "Paralelismo",
    refs: [
      {
        book: "tanenbaum-sco",
        chapter: 8,
        section: "8.4.7",
        note: "Desempenho e a lei de Amdahl",
        verified: true,
      },
    ],
    simplifications: [
      "A parte paralela divide-se em pedaços iguais, sem custo de criar threads nem de sincronizar.",
      "Os núcleos não disputam cache nem memória.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "paralela", kind: "int", label: "Parte paralelizável (%)", min: 50, max: 99 },
      { key: "nucleos", kind: "int", label: "Núcleos", min: 1, max: 64 },
    ],
  },
  build,
  intro: {
    text: "Dobrar os núcleos não dobra a velocidade de um programa. Você vai dividir um trabalho de 100 segundos entre cada vez mais núcleos e ver o ganho achatar contra um teto que só depende da parte que não se divide.",
    facts: [
      ["Trabalho", `${TOTAL} s em 1 núcleo`],
      ["Paralelizável", `${DEFAULTS.paralela}%`],
      ["Núcleos", String(DEFAULTS.nucleos)],
    ],
  },
  outro: {
    title: "Amdahl em resumo",
    text: "O speedup com n núcleos é 1 ÷ ((1 − f) + f ÷ n). A parte serial não encolhe, então o ganho tem teto 1 ÷ (1 − f) e a eficiência cai a cada núcleo extra. Reduzir a parte serial costuma valer mais que somar núcleos; e quando o problema cresce junto com a máquina, a lei de Gustafson mostra um ganho bem maior.",
    facts: (run) => [
      ["Speedup", `${run.stats.speedup}×`],
      ["Teto", `${run.stats.ceiling}×`],
      ["Escalado", `${run.stats.scaled}×`],
    ],
  },
  next: ["coerencia-mesi", "pipeline"],
  practice,
};

export default lesson;
