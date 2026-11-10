import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { aimdPair, type CcResult, type Round, runCc } from "../../../sim/net/congestion.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { congestionamento as practice } from "../practice.ts";

/**
 * TCP congestion control round by round: slow start, additive increase, halving on loss (Reno)
 * against restarting from one (Tahoe), and why AIMD converges to a fair share.
 */
export const DEFAULTS = { capacidade: 24, ssthresh: 16 };
const ROUNDS = 40;

function clamp(p: Params) {
  const capacity = Math.min(32, Math.max(12, Math.round(Number(p.capacidade ?? DEFAULTS.capacidade))));
  const ssthresh = Math.min(32, Math.max(4, Math.round(Number(p.ssthresh ?? DEFAULTS.ssthresh))));
  return { capacity, ssthresh };
}

function runAll(p: Params) {
  const o = { ...clamp(p), rounds: ROUNDS };
  const reno = runCc("reno", o);
  const tahoe = runCc("tahoe", o);
  const pair = aimdPair(o.capacity - 4, 2, o.capacity, ROUNDS);
  const top = Math.max(...reno.rounds.map((r) => r.cwnd), ...tahoe.rounds.map((r) => r.cwnd), o.capacity);
  return { ...o, reno, tahoe, pair, ymax: Math.ceil((top + 1) / 4) * 4 };
}

function scene(p: Params): SceneSpec {
  const { ymax, capacity } = runAll(p);
  return {
    viewBox: [960, 600],
    nodes: [],
    links: [],
    widgets: [
      {
        kind: "chart",
        id: "cwnd",
        title: `Janela de congestionamento por RTT · o caminho comporta ${capacity} segmentos`,
        at: [70, 60],
        width: 820,
        height: 230,
        x: { label: "RTT", max: ROUNDS },
        y: { label: "cwnd (segmentos)", max: ymax },
      },
      { kind: "counter", id: "janela", title: "cwnd", at: [40, 350] },
      { kind: "counter", id: "limiar", title: "ssthresh", at: [200, 350] },
      {
        kind: "table",
        id: "comp",
        title: `Em ${ROUNDS} RTTs`,
        at: [40, 450],
        columns: ["Variante", "Perdas", "Entregues", "Por RTT"],
        widths: [100, 70, 100, 80],
        rows: 2,
      },
      {
        kind: "chart",
        id: "justica",
        title: "Dois fluxos no mesmo gargalo",
        at: [520, 370],
        width: 380,
        height: 170,
        x: { label: "RTT", max: ROUNDS },
        y: { label: "cwnd", max: Math.ceil((capacity + 1) / 4) * 4 },
      },
    ],
  };
}

const rtts = (n: number) => (n === 1 ? "1 RTT" : `${n} RTTs`);
const avg = (r: CcResult) => (r.delivered / ROUNDS).toFixed(1).replace(".", ",");

export function build(p: Params) {
  const { capacity, ssthresh, reno, tahoe, pair } = runAll(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));

  const plot = (series: string, rs: Round[], role: "a" | "b") => {
    for (const r of rs) {
      c.plot("cwnd", series, r.rtt, r.cwnd, {
        role,
        dt: 1,
        label: `${series}, RTT ${r.rtt}: cwnd ${r.cwnd}${r.loss ? ", perda" : ""}`,
      });
      if (series === "Reno") {
        c.count("janela", String(r.cwnd), { label: `cwnd = ${r.cwnd}` });
        c.count("limiar", String(r.ssthresh), { label: `ssthresh = ${r.ssthresh}` });
      }
      if (r.loss)
        b.ev({
          t: c.t,
          kind: "count",
          counter: "janela",
          value: `${r.cwnd} ✕`,
          role: "bad",
          label: `${series}: ${r.cwnd} segmentos não cabem em ${capacity}; três ACKs duplicados`,
          row: {
            cols: {
              t: `RTT ${r.rtt}`,
              who: series,
              what: "perda",
              detail: `cwnd ${r.cwnd} > ${capacity}`,
            },
          },
        });
    }
  };

  const firstLoss = reno.rounds.findIndex((r) => r.loss);
  const lossRound = reno.rounds[firstLoss] as Round;
  const after = reno.rounds[firstLoss + 1] as Round | undefined;
  // the loss came from doubling when the round before it was still in slow start
  const lossInSlow = firstLoss === 0 || reno.rounds[firstLoss - 1]?.phase === "partida lenta";
  const reached = reno.reachedSsthresh;
  const ssEnd = reached === null ? firstLoss : Math.min(reached, firstLoss);

  b.step(
    {
      id: "s1-janela",
      title: "Quanto mandar de uma vez?",
      subtitle: `O caminho comporta ${capacity} segmentos`,
      text: `O receptor anuncia quanto cabe no buffer dele, mas ninguém anuncia quanto cabe na rede. Se todos mandam demais, os roteadores descartam, todos retransmitem e a rede entra em colapso. Por isso o TCP mantém uma segunda janela, a [[janela-de-congestionamento]] (cwnd), e envia o menor dos dois limites a cada [[rtt]]. Aqui o caminho comporta ${capacity} segmentos por RTT, e o emissor não sabe disso.`,
      facts: [
        ["Capacidade", `${capacity} segmentos por RTT`],
        ["cwnd inicial", "1"],
        ["ssthresh inicial", String(ssthresh)],
      ],
      highlight: [],
    },
    () => {
      // drawn right to left so the series label sits at the left end, away from the curves' labels
      c.plot("cwnd", "capacidade", ROUNDS, capacity, {
        role: "muted",
        dt: 1,
        label: "capacidade do caminho",
      });
      c.plot("cwnd", "capacidade", 0, capacity, { role: "muted", label: "capacidade do caminho" });
      c.count("janela", "1", { label: "cwnd começa em 1" });
      c.count("limiar", String(ssthresh), { label: `ssthresh começa em ${ssthresh}` });
    },
  );

  b.step(
    {
      id: "s2-partida-lenta",
      title: "Partida lenta",
      subtitle:
        reached === null
          ? `Perda antes do limiar ${ssthresh}`
          : `1 → ${reno.rounds[reached]?.cwnd ?? ssthresh} em ${rtts(reached)}`,
      text: `Apesar do nome, a [[partida-lenta]] cresce rápido: cada ACK aumenta a janela em um segmento, então ela dobra a cada RTT, 1, 2, 4, 8. O crescimento exponencial vai até o limiar ssthresh, ${ssthresh} aqui${reached === null ? `, mas a janela não chega lá: no RTT ${lossRound.rtt} ela pula para ${lossRound.cwnd}, acima dos ${capacity} que o caminho comporta, e perde.` : `, alcançado em ${rtts(reached)}.${lossInSlow ? ` Como o limiar está acima da capacidade, a perda chega ainda nessa fase, com cwnd = ${lossRound.cwnd}.` : " Daí em diante o TCP passa a sondar com cuidado."}`}`,
      facts: [
        ["Crescimento", "dobra por RTT"],
        ["Limiar", String(ssthresh)],
        reached === null ? ["Perda no RTT", String(lossRound.rtt)] : ["RTTs até o limiar", String(reached)],
      ],
      highlight: [],
      quiz:
        reached === null
          ? {
              kind: "number",
              prompt: `Começando em 1 e dobrando a cada RTT, em que RTT a janela passa de ${capacity}?`,
              answer: lossRound.rtt,
              explain: `1, 2, 4, 8… No RTT ${lossRound.rtt} a janela vale ${lossRound.cwnd}, a primeira potência de 2 acima de ${capacity}.`,
            }
          : {
              kind: "number",
              prompt: `Começando em 1 e dobrando a cada RTT, em quantos RTTs a janela chega a ${ssthresh}?`,
              answer: reached,
              explain: `1, 2, 4, 8… A janela alcança ${ssthresh} no RTT ${reached}${2 ** reached !== ssthresh ? `, já limitada a ${ssthresh} no último passo` : ""}.`,
            },
    },
    () => plot("Reno", reno.rounds.slice(0, ssEnd + 1), "a"),
  );

  b.step(
    {
      id: "s3-prevencao",
      title: "Um segmento por RTT",
      subtitle: `Perda no RTT ${lossRound.rtt}`,
      text: !lossInSlow
        ? `Acima do limiar, a fase de prevenção de congestionamento soma só um segmento por RTT: ${ssthresh}, ${ssthresh + 1}, ${ssthresh + 2}… A janela chega a ${capacity}, o máximo que o caminho comporta, e no RTT ${lossRound.rtt} tenta ${lossRound.cwnd}. Um segmento não cabe na fila do roteador e é descartado. O emissor percebe por três [[ack-duplicado|ACKs duplicados]], antes mesmo do temporizador estourar.`
        : `A perda veio antes da fase de prevenção: no RTT ${lossRound.rtt}, ainda dobrando, a janela pulou para ${lossRound.cwnd}, acima dos ${capacity} que o caminho comporta. Com um limiar mais baixo, a janela passaria a somar só um segmento por RTT e se aproximaria da capacidade devagar. O emissor percebe a perda por três [[ack-duplicado|ACKs duplicados]].`,
      facts: [
        ["Prevenção", "+1 por RTT"],
        ["Perda no RTT", String(lossRound.rtt)],
        ["cwnd na perda", String(lossRound.cwnd)],
      ],
      highlight: [],
    },
    () => {
      const rest = reno.rounds.slice(ssEnd + 1, firstLoss + 1);
      if (rest.length > 0) plot("Reno", rest, "a");
      else
        c.count("janela", `${lossRound.cwnd} ✕`, {
          dt: 1,
          role: "bad",
          label: "a perda já aconteceu na partida lenta",
        });
    },
  );

  b.step(
    {
      id: "s4-reno",
      title: "Reno corta pela metade",
      subtitle: "O dente de serra",
      text: `Depois de três ACKs duplicados, o TCP Reno retransmite o segmento perdido e corta: ssthresh e cwnd vão para a metade, ${lossRound.cwnd} / 2 = ${after?.cwnd ?? Math.floor(lossRound.cwnd / 2)}, e a soma de um por RTT recomeça dali. O desenho vira um dente de serra em torno da capacidade: é o [[aimd]], aumento aditivo e diminuição multiplicativa. Num estouro de temporizador, sinal de algo pior, até o Reno volta a 1.`,
      facts: [
        ["Perdas em 40 RTTs", String(reno.losses)],
        ["Após a perda", `cwnd = ${after?.cwnd ?? "—"}`],
        ["Entregues", String(reno.delivered)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `A janela estava em ${lossRound.cwnd} quando a perda foi detectada por ACKs duplicados. Com que cwnd o Reno continua?`,
        answer: Math.max(2, Math.floor(lossRound.cwnd / 2)),
        explain: `Metade de ${lossRound.cwnd}, arredondada para baixo: ${Math.max(2, Math.floor(lossRound.cwnd / 2))}.`,
      },
    },
    () => {
      plot("Reno", reno.rounds.slice(firstLoss + 1), "a");
      c.row("comp", 0, ["Reno", String(reno.losses), String(reno.delivered), avg(reno)], {
        dt: 1,
        mark: "new",
      });
    },
  );

  const diff = reno.delivered - tahoe.delivered;
  b.step(
    {
      id: "s5-tahoe",
      title: "Tahoe recomeça do zero",
      subtitle: `${diff} segmentos a menos`,
      text: `O TCP Tahoe, mais antigo, trata toda perda como grave: ssthresh vai para a metade, mas cwnd volta a 1 e refaz a partida lenta até o novo limiar. Com as mesmas perdas, ele passa vários RTTs mandando pouco. Em ${ROUNDS} RTTs entrega ${tahoe.delivered} segmentos, contra ${reno.delivered} do Reno: ${diff} a menos. A recuperação rápida do Reno existe porque ACKs duplicados provam que os pacotes seguintes estão chegando.`,
      facts: [
        ["Reno", `${reno.delivered} segmentos`],
        ["Tahoe", `${tahoe.delivered} segmentos`],
        ["Diferença", String(diff)],
      ],
      highlight: [],
    },
    () => {
      for (const r of tahoe.rounds)
        c.plot("cwnd", "Tahoe", r.rtt, r.cwnd, {
          role: "b",
          dt: r.rtt % 2 === 0 ? 1 : 0,
          label: `Tahoe, RTT ${r.rtt}: cwnd ${r.cwnd}${r.loss ? ", perda" : ""}`,
        });
      c.row("comp", 1, ["Tahoe", String(tahoe.losses), String(tahoe.delivered), avg(tahoe)], {
        dt: 1,
        mark: "new",
      });
    },
  );

  const p0 = pair[0] as (typeof pair)[number];
  const pend = pair[pair.length - 1] as (typeof pair)[number];
  b.step(
    {
      id: "s6-justica",
      title: "Por que dividir por dois",
      subtitle: `Diferença ${p0.a - p0.b} → ${Math.abs(pend.a - pend.b)}`,
      text: `Dois fluxos dividem o mesmo gargalo, um começando com ${p0.a} e outro com ${p0.b}. Somar um por RTT mantém a diferença entre eles; cortar os dois pela metade a cada perda também corta a diferença pela metade. Depois de algumas perdas, a diferença cai de ${p0.a - p0.b} para ${Math.abs(pend.a - pend.b)} e os dois dividem a capacidade de forma quase igual. Variantes modernas, como CUBIC e BBR, mudam a curva, mas o objetivo de convergir continua.`,
      facts: [
        ["Início", `${p0.a} e ${p0.b}`],
        ["Fim", `${pend.a} e ${pend.b}`],
        ["Perdas comuns", String(pair.filter((x) => x.loss).length)],
      ],
      highlight: [],
    },
    () => {
      for (const x of pair) {
        c.plot("justica", "A", x.rtt, x.a, { role: "a", dt: x.rtt % 2 === 0 ? 1 : 0, label: `A: ${x.a}` });
        c.plot("justica", "B", x.rtt, x.b, { role: "b", label: `B: ${x.b}` });
      }
    },
  );

  return b.done({
    reached: reached ?? -1,
    firstLoss: lossRound.rtt,
    afterLoss: after?.cwnd ?? 0,
    reno: reno.delivered,
    tahoe: tahoe.delivered,
    finalDiff: Math.abs(pend.a - pend.b),
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "congestionamento",
    site: "redes",
    title: "Controle de congestionamento do TCP",
    summary:
      "Como o TCP descobre quanto a rede aguenta: partida lenta, um segmento a mais por RTT, metade da janela a cada perda e por que esse dente de serra divide o gargalo de forma justa.",
    area: "Transporte",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 6,
        section: "6.5.10",
        note: "Controle de congestionamento do TCP",
        verified: true,
      },
      {
        book: "tanenbaum-cn",
        chapter: 6,
        section: "6.3.2",
        note: "Regulando a velocidade de envio: AIMD",
        verified: true,
      },
    ],
    simplifications: [
      "O tempo anda em RTTs inteiros e a janela é contada em segmentos.",
      "Na partida lenta, a janela para exatamente no limiar em vez de cruzá-lo no meio de um RTT.",
      "A capacidade do caminho é fixa e só há perda quando a janela passa dela; na prática há tráfego concorrente e ruído.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "capacidade",
        kind: "int",
        label: "Capacidade do caminho (segmentos por RTT)",
        min: 12,
        max: 32,
      },
      {
        key: "ssthresh",
        kind: "int",
        label: "ssthresh inicial",
        min: 4,
        max: 32,
        help: "Acima da capacidade, a primeira perda acontece ainda na partida lenta.",
      },
    ],
  },
  build,
  intro: {
    text: "Nenhum roteador avisa o TCP de quanto a rede aguenta. O emissor descobre testando: aumenta a janela até perder um segmento e então recua. Você vai acompanhar essa sondagem RTT a RTT e comparar duas formas de reagir à perda.",
    facts: [
      ["Capacidade", `${DEFAULTS.capacidade} segmentos`],
      ["ssthresh inicial", String(DEFAULTS.ssthresh)],
      ["Duração", `${ROUNDS} RTTs`],
    ],
  },
  outro: {
    title: "Congestionamento em resumo",
    text: "A janela de congestionamento limita o que está em voo. Partida lenta dobra até o limiar, a prevenção soma um por RTT, e uma perda por ACKs duplicados corta pela metade no Reno. Esse aumento aditivo com diminuição multiplicativa usa bem o caminho e faz fluxos que dividem um gargalo convergirem para partes iguais.",
    facts: (run) => [
      ["Primeira perda", `RTT ${run.stats.firstLoss}`],
      ["Reno", `${run.stats.reno} segmentos`],
      ["Tahoe", `${run.stats.tahoe} segmentos`],
    ],
  },
  next: ["tcp-conexao", "quic"],
  practice,
};

export default lesson;
