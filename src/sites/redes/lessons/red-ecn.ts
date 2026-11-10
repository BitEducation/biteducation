import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { prob, type RedOpts, red } from "../../../sim/net/red.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { redEcn as practice } from "../practice.ts";

/**
 * Active queue management: the same queue under drop-tail and under RED, then ECN marks instead
 * of drops. The instantaneous queue is given; marking does not feed back into it here.
 */
const Q = [2, 4, 6, 8, 10, 12, 14, 15, 15, 15, 15, 14, 12, 10, 8, 6, 4, 3, 3, 3];
const CAP = 15;
const DEFAULTS = { peso: 25 };
const BASE: RedOpts = { w: 0.25, minTh: 5, maxTh: 15, maxP: 0.4 };
const weightOf = (p: Params) =>
  Math.min(50, Math.max(5, Math.round(Number(p.peso ?? DEFAULTS.peso) / 5) * 5)) / 100;
const MID = 10;

const scene: SceneSpec = {
  viewBox: [960, 600],
  nodes: [],
  links: [],
  widgets: [
    {
      kind: "chart",
      id: "fila",
      title: "Pacotes na fila a cada chegada",
      at: [40, 40],
      width: 520,
      height: 220,
      x: { label: "chegada", max: Q.length - 1 },
      y: { label: "pacotes", max: 16 },
    },
    {
      kind: "table",
      id: "acoes",
      title: "Pacotes atingidos",
      at: [600, 40],
      columns: ["Chegada", "Política", "Ação"],
      widths: [90, 120, 120],
      rows: 7,
    },
    {
      kind: "table",
      id: "ecn",
      title: "Os bits do ECN",
      at: [40, 330],
      columns: ["Campo", "Quem liga", "Significa"],
      widths: [190, 170, 360],
      rows: 4,
    },
  ],
};

const dec = (x: number, d = 2) => String(Math.round(x * 10 ** d) / 10 ** d).replace(".", ",");

export function build(p: Params = DEFAULTS) {
  const OPTS: RedOpts = { ...BASE, w: weightOf(p) };
  // The comparison weight sits on the other side of the chosen one.
  const ALT: RedOpts = { ...BASE, w: OPTS.w >= 0.4 ? 0.1 : 0.5 };
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => `chegada ${t}`);
  const r = red(Q, OPTS);
  const tailDrops = Q.map((q, i) => (q >= CAP ? i : -1)).filter((i) => i >= 0);
  const marks = r.map((s, i) => (s.marked ? i : -1)).filter((i) => i >= 0);
  const pMid = prob(MID, OPTS);
  const alt = red(Q, ALT);
  const altMarks = alt.map((s, i) => (s.marked ? i : -1)).filter((i) => i >= 0);
  const list = (xs: number[]) =>
    xs.length <= 1 ? String(xs[0] ?? "nenhuma") : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`;
  const peak = (rs: { avg: number }[]) => Math.max(...rs.map((s) => s.avg));
  const hitText = !marks.length
    ? `Com este peso, a média não sai de ${dec(peak(r))} e nenhum pacote é atingido.`
    : `Assim, só ${marks.length} ${marks.length === 1 ? "pacote é atingido, na chegada" : "pacotes são atingidos, nas chegadas"} ${list(marks)}, separados no tempo.`;
  let row = 0;

  b.step(
    {
      id: "s1-cauda",
      title: "Descartar quando enche",
      subtitle: `${tailDrops.length} perdas seguidas`,
      text: `Um roteador comum descarta só quando a fila enche, o descarte na cauda. Com espaço para ${CAP} pacotes, as chegadas ${tailDrops.join(", ")} encontram a fila cheia e são perdidas uma atrás da outra. Muitos fluxos TCP perdem ao mesmo tempo, todos reduzem a janela juntos e depois voltam a crescer juntos: a fila oscila entre cheia e vazia, e enquanto está cheia todo pacote leva o atraso máximo.`,
      facts: [
        ["Capacidade", `${CAP} pacotes`],
        ["Perdas", String(tailDrops.length)],
        ["Chegadas", tailDrops.join(", ")],
      ],
      highlight: [],
    },
    () => {
      Q.forEach((q, i) => {
        c.plot("fila", "fila", i, q, { role: "a", dt: i === 0 ? 1 : 0, label: `chegada ${i}: ${q} na fila` });
      });
      for (const i of tailDrops) {
        c.row("acoes", row++, [String(i), "cauda", "descarta"], { dt: 0, mark: "bad" });
      }
    },
  );

  b.step(
    {
      id: "s2-media",
      title: "A média, não o pico",
      subtitle: `A média chega a ${dec(peak(r))}`,
      text: `O [[red]] decide pela fila média, não pela atual. A cada chegada, a média anda ${dec(OPTS.w * 100, 0)}% do caminho até o tamanho atual: média = ${dec(1 - OPTS.w)} × média + ${dec(OPTS.w)} × fila. Uma rajada curta mal mexe na média e passa sem punição, mas uma fila que fica cheia por muito tempo puxa a média para cima. Aqui a média sobe devagar e nunca passa de ${dec(peak(r))}, embora a fila fique em ${CAP} por quatro chegadas.`,
      facts: [
        ["Peso", dec(OPTS.w)],
        ["Primeira média", dec((r[0] as { avg: number }).avg)],
        ["Maior média", dec(peak(r))],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: `A média começa em 0 e chega um pacote com a fila em ${Q[0]}. Qual é a nova média?`,
        options: [dec((r[0] as { avg: number }).avg), String(Q[0]), "0"],
        answer: 0,
        explain: `${dec(1 - OPTS.w)} × 0 + ${dec(OPTS.w)} × ${Q[0]} = ${dec((r[0] as { avg: number }).avg)}. A média reage a uma fração da mudança, não a ela inteira.`,
      },
    },
    () => {
      r.forEach((s, i) => {
        c.plot("fila", "média", i, Math.round(s.avg * 100) / 100, {
          role: "b",
          dt: i === 0 ? 1 : 0,
          label: `chegada ${i}: média ${dec(s.avg)}`,
        });
      });
    },
  );

  b.step(
    {
      id: "s3-probabilidade",
      title: "Uma chance que cresce",
      subtitle: marks.length
        ? `${marks.length} ${marks.length === 1 ? "pacote" : "pacotes, espalhados"}`
        : "Nenhum pacote atingido",
      text: `Abaixo de ${OPTS.minTh} na média, o RED não faz nada; acima de ${OPTS.maxTh}, atinge todo pacote. Entre os dois, a chance cresce em linha reta até ${dec(OPTS.maxP * 100, 0)}%: com média ${MID}, ela é ${dec(pMid * 100, 0)}%. ${hitText} Cada aviso vai a um fluxo diferente, e os fluxos reduzem a janela um de cada vez, em vez de todos juntos.`,
      facts: [
        ["Limiar mínimo", String(OPTS.minTh)],
        ["Limiar máximo", String(OPTS.maxTh)],
        [`Chance com média ${MID}`, `${dec(pMid * 100, 0)}%`],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Com limiares ${OPTS.minTh} e ${OPTS.maxTh} e chance máxima de ${dec(OPTS.maxP * 100, 0)}%, qual é a chance de atingir um pacote quando a média vale ${MID}?`,
        answer: Math.round(pMid * 100),
        tolerance: 0.5,
        unit: "%",
        explain: `A média está a ${MID - OPTS.minTh} de ${OPTS.maxTh - OPTS.minTh} do caminho entre os limiares: ${dec(OPTS.maxP * 100, 0)}% × ${MID - OPTS.minTh} / ${OPTS.maxTh - OPTS.minTh} = ${dec(pMid * 100, 0)}%.`,
      },
    },
    () => {
      for (const i of marks) {
        const s = r[i] as { avg: number };
        c.row("acoes", row++, [String(i), "RED", `marca (média ${dec(s.avg, 1)})`], { dt: 1, mark: "warn" });
      }
      if (!marks.length) c.row("acoes", row++, ["—", "RED", "nenhuma marca"], { dt: 1, mark: "new" });
    },
  );

  b.step(
    {
      id: "s4-peso",
      title: "O peso da média",
      subtitle: `Peso ${dec(ALT.w)}: marcas em ${list(altMarks)}`,
      text: `O peso decide quão depressa a média segue a fila. Com peso ${dec(ALT.w)} em vez de ${dec(OPTS.w)}, a média chega a ${dec(peak(alt))} e o RED atinge as chegadas ${list(altMarks)}. Peso alto quase copia a fila e volta a punir rajadas curtas, como o descarte na cauda. Peso baixo é paciente demais: a média sobe tão devagar que o aviso pode sair quando a rajada já passou. A RFC 7567 recomenda ajustar isso sozinho.`,
      facts: [
        ["Peso da lição", dec(OPTS.w)],
        ["Peso comparado", dec(ALT.w)],
        ["Marcas com ele", list(altMarks)],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: "O que acontece com a média do RED quando o peso fica muito alto?",
        options: [
          "Ela segue a fila atual e pune até rajadas curtas",
          "Ela para de mudar e o RED nunca marca",
          "Ela passa a contar só pacotes de voz",
        ],
        answer: 0,
        explain: `Com peso ${dec(Math.max(ALT.w, OPTS.w))}, cada chegada move a média boa parte do caminho até a fila; o RED perde o filtro que distinguia rajada de congestionamento.`,
      },
    },
    () => {
      alt.forEach((x, i) => {
        c.plot("fila", `média, peso ${dec(ALT.w)}`, i, Math.round(x.avg * 100) / 100, {
          role: "warn",
          dt: i === 0 ? 1 : 0,
          label: `chegada ${i}: média ${dec(x.avg)} com peso ${dec(ALT.w)}`,
        });
      });
    },
  );

  b.step(
    {
      id: "s5-ecn",
      title: "Avisar sem perder",
      subtitle: "Marcar em vez de descartar",
      text: "Descartar ainda custa um pacote e uma retransmissão. Com o [[ecn]], o roteador liga os bits CE, congestionamento visto, no cabeçalho IP do pacote que o RED escolheu, e o deixa seguir. O receptor devolve o aviso ligando ECE nos ACKs do TCP; o transmissor reduz a janela como se tivesse perdido um pacote e responde com CWR. O aviso chega e nenhum dado se perde, mas os dois lados precisam ter anunciado suporte a ECN.",
      facts: [
        ["IP", "ECT e CE"],
        ["TCP", "ECE e CWR"],
        ["Perdas", "nenhuma"],
      ],
      highlight: [],
    },
    () => {
      const rows: [string, string, string][] = [
        ["IP: ECT", "transmissor", "este fluxo entende ECN"],
        ["IP: CE", "roteador", "congestionamento visto"],
        ["TCP: ECE", "receptor", "um pacote veio marcado"],
        ["TCP: CWR", "transmissor", "já reduzi a janela"],
      ];
      rows.forEach((x, i) => {
        c.row("ecn", i, x, { dt: i === 0 ? 1 : 0, mark: "new" });
      });
    },
  );

  return b.done(
    {
      tailDrops: tailDrops.length,
      marks: marks.join(","),
      pMid: dec(pMid * 100, 0),
      altMarks: altMarks.join(","),
    },
    OPTS.w === BASE.w
      ? []
      : [
          `Com peso ${dec(OPTS.w)}, a média chega a ${dec(peak(r))} e o RED atinge as chegadas ${list(marks)}.`,
        ],
  );
}

const lesson: LessonModule = {
  meta: {
    slug: "red-ecn",
    site: "redes",
    title: "RED e ECN: avisar antes de a fila encher",
    summary:
      "Descarte na cauda contra descarte precoce pela média da fila, e a marcação ECN que avisa sem perder pacotes.",
    area: "Rede",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 5,
        section: "5.3.2",
        note: "Controle de congestionamento: RED e notificação explícita",
        verified: true,
      },
      { rfc: 3168, note: "Explicit Congestion Notification" },
      { rfc: 7567, note: "Recomendações de gerência ativa de fila" },
    ],
    simplifications: [
      "A fila é dada; aqui as marcas não mudam o tráfego que chega depois.",
      "A chance é acumulada em vez de sorteada, para que a lição dê sempre o mesmo resultado.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [{ key: "peso", kind: "int", label: "Peso da média (%)", min: 5, max: 50, step: 5 }],
  },
  build,
  intro: {
    text: "Uma fila cheia num roteador avisa os transmissores tarde demais e todos de uma vez. Você vai ver a mesma fila tratada pelo descarte na cauda e pelo RED, e como o ECN troca a perda por um bit no cabeçalho.",
    facts: [
      ["Chegadas", String(Q.length)],
      ["Capacidade", `${CAP} pacotes`],
      ["Limiar do RED", `${BASE.minTh} a ${BASE.maxTh}`],
    ],
  },
  outro: {
    title: "RED e ECN em resumo",
    text: "O RED olha a média da fila e atinge pacotes com uma chance que cresce entre dois limiares, espalhando os avisos no tempo. Com ECN, o aviso é um bit marcado, e o transmissor reduz a janela sem perder dados.",
    facts: (run) => [
      ["Perdas na cauda", String(run.stats.tailDrops)],
      ["Marcas do RED", String(run.stats.marks)],
      [`Chance com média ${MID}`, `${run.stats.pMid}%`],
    ],
  },
  next: ["congestionamento", "escalonamento-pacotes"],
  practice,
};

export default lesson;
