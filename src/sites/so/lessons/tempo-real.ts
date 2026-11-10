import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import { type RtPolicy, type RtSlice, rmsBound, rtRun, utilization } from "../../../sim/os/realtime.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { num } from "../../shared/practice-kit.ts";
import { tempoReal as practice } from "../practice.ts";

/**
 * Real-time scheduling with two periodic tasks: rate monotonic (fixed priority, shorter period
 * first) misses a deadline at 97% utilization, EDF (earliest deadline first) does not. The
 * Liu & Layland bound explains when RMS is guaranteed and when it is only maybe.
 */
export const DEFAULTS = { custo2: 4 };
const T1 = { name: "T1", c: 2, p: 5 };
const P2 = 7;
const HORIZON = 35;
const ROLE: Record<string, Role> = { T1: "a", T2: "b" };

function clamp(p: Params) {
  return Math.min(5, Math.max(1, Math.round(Number(p.custo2 ?? DEFAULTS.custo2))));
}

function scene(): SceneSpec {
  return {
    viewBox: [960, 560],
    nodes: [],
    links: [],
    widgets: [
      {
        kind: "table",
        id: "tarefas",
        title: "Tarefas periódicas (prazo = período)",
        at: [40, 40],
        columns: ["Tarefa", "Custo C", "Período P", "C ÷ P"],
        widths: [120, 120, 120, 120],
        rows: 3,
      },
      { kind: "counter", id: "perdas", title: "Prazos perdidos", at: [620, 50] },
      {
        kind: "gantt",
        id: "cpu",
        title: `Uma CPU, ${HORIZON} ticks (o ciclo completo das duas tarefas)`,
        at: [40, 220],
        lanes: ["RMS", "EDF"],
        span: HORIZON,
        width: 860,
      },
      {
        kind: "table",
        id: "cmp",
        title: "Duas políticas",
        at: [40, 400],
        columns: ["Política", "Prioridade", "Garante se U ≤", "Prazos perdidos"],
        widths: [120, 300, 200, 200],
        rows: 2,
      },
    ],
  };
}

export function build(p: Params) {
  const c2 = clamp(p);
  const ts = [T1, { name: "T2", c: c2, p: P2 }];
  const u = utilization(ts);
  const bound = rmsBound(2);
  const rms = rtRun(ts, "rms", HORIZON);
  const edf = rtRun(ts, "edf", HORIZON);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => `t${t}`);
  const pct = (x: number) => `${num(x * 100, 1)}%`;
  const firstMiss = rms.misses[0];
  // T2 is still running when T1's second job arrives: where RMS and EDF disagree.
  const busy = T1.c + c2 > T1.p;
  const cut = firstMiss ? firstMiss.at : 14;
  const draw = (lane: RtPolicy, slices: RtSlice[]) => {
    for (const s of slices) {
      const t = c.t + 1;
      c.at(t);
      b.ev({
        t,
        kind: "gantt",
        gantt: "cpu",
        lane: lane.toUpperCase(),
        from: s.from,
        to: s.to,
        item: s.task,
        itemRole: ROLE[s.task] ?? "a",
        role: ROLE[s.task] ?? "a",
        label: `${lane.toUpperCase()}: ${s.task} executa, ticks ${s.from} a ${s.to}`,
        row: { cols: { t: `${s.from}–${s.to}`, who: s.task, what: "executa", detail: lane.toUpperCase() } },
      });
    }
  };
  const pl = (k: number, one: string, many: string) => (k === 1 ? one : many);
  const misses = (r: typeof rms) =>
    r.misses.length ? r.misses.map((m) => `${m.task} em ${m.at}`).join(", ") : "nenhum";

  b.step(
    {
      id: "s1-tarefas",
      title: "Tarefas com prazo",
      subtitle: `Utilização ${pct(u)}`,
      text: `Num sistema de [[tempo-real|tempo real]], terminar atrasado é errar. Duas tarefas se repetem: T1 precisa de ${T1.c} ticks de CPU a cada ${T1.p}, e T2 de ${c2} a cada ${P2}. Cada execução tem de acabar antes da próxima chegar. Somando as frações de CPU, ${T1.c}/${T1.p} + ${c2}/${P2}, a [[utilizacao|utilização]] é ${pct(u)}.`,
      facts: [
        ["T1", `${T1.c} a cada ${T1.p}`],
        ["T2", `${c2} a cada ${P2}`],
        ["Utilização", pct(u)],
      ],
      highlight: ["tarefas"],
      quiz: {
        kind: "number",
        prompt: `T1 usa ${T1.c} ticks a cada ${T1.p} e T2 usa ${c2} a cada ${P2}. Qual a utilização da CPU, em %?`,
        answer: Math.round(u * 1000) / 10,
        tolerance: 0.5,
        unit: "%",
        explain: `${T1.c} ÷ ${T1.p} = ${num(T1.c / T1.p)} e ${c2} ÷ ${P2} = ${num(c2 / P2)}; a soma é ${num(u)}, ou ${pct(u)}.`,
      },
    },
    () => {
      c.row("tarefas", 0, ["T1", String(T1.c), String(T1.p), num(T1.c / T1.p)], { dt: 1, mark: "new" });
      c.row("tarefas", 1, ["T2", String(c2), String(P2), num(c2 / P2)], { dt: 1, mark: "new" });
      c.row("tarefas", 2, ["Total", "", "", num(u)], { dt: 1, mark: u > 1 ? "bad" : "hit" });
      c.count("perdas", "0", { label: "nenhum" });
    },
  );

  b.step(
    {
      id: "s2-rms",
      title: "Taxa monotônica",
      subtitle: "Prioridade fixa: período menor",
      text: `A política [[rms|taxa monotônica]] dá prioridade fixa à tarefa de período menor: T1, que chega a cada ${T1.p}, sempre interrompe T2. É simples e previsível, e é a mais usada em sistemas embarcados. Veja até o tick ${cut}: T1 roda de 0 a ${T1.c} e T2 começa. ${busy ? `No tick ${T1.p} chega um novo T1, que toma a CPU de T2 antes de ela terminar.` : `T2 termina no tick ${T1.c + c2}, antes do novo T1 chegar no ${T1.p}.`}`,
      facts: [
        ["Prioridade alta", "T1"],
        ["Preempção", busy ? `no tick ${T1.p}` : "não houve"],
        ["Até o tick", String(cut)],
      ],
      highlight: ["cpu"],
      quiz: {
        kind: "choice",
        prompt: "Pela taxa monotônica, por que T1 tem prioridade sobre T2?",
        options: [
          `Porque o período dela, ${T1.p}, é menor que o de T2, ${P2}`,
          "Porque ela chegou primeiro",
          "Porque o custo dela é menor",
        ],
        answer: 0,
        explain:
          "A prioridade vem só do período, e não muda nunca: quem se repete mais vezes tem prioridade maior.",
      },
    },
    () =>
      draw(
        "rms",
        rms.slices.filter((s) => s.from < cut),
      ),
  );

  b.step(
    {
      id: "s3-perda",
      title: firstMiss ? "Um prazo perdido" : "Todos os prazos cumpridos",
      subtitle: `Limite: ${pct(bound)}`,
      text: firstMiss
        ? `No tick ${firstMiss.at}, T2 ainda devia ${firstMiss.left} ${pl(firstMiss.left, "tick", "ticks")} e perdeu o prazo, com a CPU ocupada só ${pct(u)} do tempo. Liu e Layland provaram que, para duas tarefas, a taxa monotônica garante os prazos se a utilização não passar de ${pct(bound)}. Acima disso, pode dar certo ou não; aqui não deu.`
        : `Com utilização de ${pct(u)}, nenhum prazo foi perdido no ciclo inteiro. Liu e Layland provaram que, para duas tarefas, a taxa monotônica garante os prazos se a utilização não passar de ${pct(bound)}. ${u <= bound ? "Aqui está abaixo do limite, então o resultado era garantido." : "Aqui passou do limite, mas o limite é só suficiente: deu certo mesmo assim."}`,
      facts: [
        ["Utilização", pct(u)],
        ["Limite da RMS", pct(bound)],
        ["Perdas na RMS", String(rms.misses.length)],
      ],
      highlight: ["cpu", "perdas"],
    },
    () => {
      draw(
        "rms",
        rms.slices.filter((s) => s.from >= cut),
      );
      for (const m of rms.misses)
        c.note("cpu", `RMS: ${m.task} perde o prazo no tick ${m.at}`, "bad", { dt: 1 });
      c.count("perdas", String(rms.misses.length), { label: `RMS: ${rms.misses.length}` });
    },
  );

  b.step(
    {
      id: "s4-edf",
      title: "Prazo mais próximo primeiro",
      subtitle: "Prioridade dinâmica",
      text: `A política [[edf|EDF]] escolhe, a cada instante, a tarefa cujo prazo vence antes. ${busy ? `No tick ${T1.p}, o novo T1 vence em ${2 * T1.p}, e T2 vence em ${P2}: T2 continua.` : `Aqui T2 termina antes do tick ${T1.p}, então as duas políticas fazem o mesmo; com custo maior que ${T1.p - T1.c}, elas divergem.`} A prioridade muda a cada execução, conforme os prazos. ${edf.misses.length ? `Mesmo assim houve ${edf.misses.length} ${pl(edf.misses.length, "perda", "perdas")}: com utilização acima de 100%, nenhuma política dá conta.` : "No ciclo inteiro, nenhum prazo foi perdido."}`,
      facts: [
        ["No tick 5", busy ? "T2 continua" : "T2 já terminou"],
        ["Perdas na EDF", String(edf.misses.length)],
        ["Perdas na RMS", String(rms.misses.length)],
      ],
      highlight: ["cpu"],
      quiz: {
        kind: "choice",
        prompt: `Suponha que, no tick ${T1.p}, chegue um novo T1 (prazo ${2 * T1.p}) e T2 ainda não tenha terminado (prazo ${P2}). Quem a EDF executa?`,
        options: [`T2, porque vence em ${P2}`, "T1, porque tem período menor", "Quem chegou por último"],
        answer: 0,
        explain: `A EDF só olha o prazo absoluto: ${P2} vem antes de ${2 * T1.p}. É isso que salva T2.`,
      },
    },
    () => {
      draw("edf", edf.slices);
      for (const m of edf.misses)
        c.note("cpu", `EDF: ${m.task} perde o prazo no tick ${m.at}`, "bad", { dt: 1 });
    },
  );

  b.step(
    {
      id: "s5-limites",
      title: "Até onde cada uma vai",
      subtitle: "100% contra ~83%",
      text: `Com prazos iguais aos períodos, a EDF cumpre tudo sempre que a utilização for no máximo 100%. A taxa monotônica só garante até ${pct(bound)} com duas tarefas, e o limite cai para cerca de 69% com muitas. Em troca, ela é previsível na sobrecarga: quem falha é sempre a de menor prioridade. Na EDF, a sobrecarga pode derrubar qualquer tarefa, em cascata.`,
      facts: [
        ["EDF garante", "U ≤ 100%"],
        ["RMS garante", `U ≤ ${pct(bound)}`],
        ["Muitas tarefas", "RMS ≈ 69%"],
      ],
      highlight: ["cmp"],
    },
    () => {
      c.row("cmp", 0, ["RMS", "fixa: período menor primeiro", pct(bound), misses(rms)], {
        dt: 1,
        mark: rms.misses.length ? "bad" : "hit",
      });
      c.row("cmp", 1, ["EDF", "dinâmica: prazo mais próximo", "100%", misses(edf)], {
        dt: 1,
        mark: edf.misses.length ? "bad" : "hit",
      });
    },
  );

  b.step(
    {
      id: "s6-sistemas",
      title: "Duro, brando e Linux",
      subtitle: "Onde isso aparece",
      text: `Em tempo real duro, como freio ABS ou marca-passo, perder um prazo é falha do sistema, e por isso se calcula o pior caso antes de ligar. Em tempo real brando, como áudio e vídeo, um atraso estraga um quadro, mas o sistema segue. O Linux oferece prioridades fixas em SCHED_FIFO e uma política baseada em EDF, a SCHED_DEADLINE.`,
      facts: [
        ["Duro", "ABS, marca-passo"],
        ["Brando", "áudio, vídeo"],
        ["Linux", "SCHED_FIFO, SCHED_DEADLINE"],
      ],
      highlight: ["cpu"],
    },
    () => {
      c.note("cpu", "custo de pior caso medido antes", "info", { dt: 1 });
    },
  );

  return b.done({
    u: Math.round(u * 1000) / 1000,
    rmsMisses: rms.misses.length,
    edfMisses: edf.misses.length,
    firstMiss: firstMiss ? firstMiss.at : -1,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "tempo-real",
    site: "so",
    title: "Escalonamento de tempo real",
    summary:
      "Duas tarefas periódicas com 97% de utilização: a taxa monotônica, de prioridade fixa, perde um prazo, e a EDF, que escolhe pelo prazo mais próximo, cumpre todos. O limite de Liu e Layland diz quando a primeira é garantida.",
    area: "Escalonamento",
    refs: [
      {
        book: "tanenbaum-mos",
        chapter: 2,
        section: "2.4.4",
        note: "Escalonamento em sistemas de tempo real",
        verified: true,
      },
      { book: "maziero-so", chapter: 6, section: "6.5", note: "Escalonadores reais", verified: true },
    ],
    simplifications: [
      "O prazo de cada execução é o início do período seguinte.",
      "Uma execução que perde o prazo é descartada; na prática, depende do sistema.",
      "Trocar de tarefa não custa tempo.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [{ key: "custo2", kind: "int", label: `Custo de T2 (ticks a cada ${P2})`, min: 1, max: 5 }],
  },
  build,
  practice,
  intro: {
    text: "Há sistemas em que a resposta certa entregue tarde está errada: freios, marca-passos, áudio. Você vai escalonar duas tarefas periódicas com duas políticas clássicas e ver uma delas perder um prazo com a CPU longe de estar cheia.",
    facts: [
      ["Tarefas", "T1 e T2"],
      ["Políticas", "RMS e EDF"],
      ["Ciclo", `${HORIZON} ticks`],
    ],
  },
  outro: {
    title: "Tempo real em resumo",
    text: "A taxa monotônica fixa prioridades pelo período e garante os prazos até o limite de Liu e Layland, cerca de 83% com duas tarefas. A EDF escolhe sempre o prazo mais próximo e chega a 100%. Abaixo do limite, as duas servem; acima, só a análise de cada caso diz.",
    facts: (r) => [
      ["Utilização", `${num(Number(r.stats.u) * 100, 1)}%`],
      ["Perdas RMS", String(r.stats.rmsMisses)],
      ["Perdas EDF", String(r.stats.edfMisses)],
    ],
  },
  next: ["escalonamento", "inversao-prioridade", "escalonamento-multiprocessador"],
};

export default lesson;
