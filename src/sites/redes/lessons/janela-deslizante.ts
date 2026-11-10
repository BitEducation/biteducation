import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import {
  fillWindow,
  goBackN,
  maxWindow,
  selectiveRepeat,
  type Tx,
  utilization,
} from "../../../sim/net/window.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { janelaDeslizante as practice } from "../practice.ts";

/**
 * Sliding windows on a link: stop-and-wait idles for a round trip per frame, a window keeps the
 * line busy, and after one lost frame Go-Back-N resends the whole window while Selective Repeat
 * resends one frame and buffers the rest; the sequence space limits each window.
 */
export const DEFAULTS = { janela: 4, perdido: 2 };
const FRAMES = 8;
const RATE_MBPS = 1;
const FRAME_BITS = 8000;
const FRAME_MS = FRAME_BITS / (RATE_MBPS * 1000);
const RTT_MS = 40;
const BITS = [2, 3, 4];
const SEQ_BITS = 3;

function clamp(p: Params) {
  const w = Math.min(FRAMES, Math.max(1, Math.round(Number(p.janela ?? DEFAULTS.janela))));
  const lost = Math.min(FRAMES - 1, Math.max(0, Math.round(Number(p.perdido ?? DEFAULTS.perdido))));
  return { w, lost };
}

const pct = (x: number) => `${String(Math.round(x * 1000) / 10).replace(".", ",")}%`;
const CELLS = 2 * FRAMES;

const scene: SceneSpec = {
  viewBox: [960, 660],
  nodes: [
    { id: "a", kind: "laptop", label: "Emissor", sub: "manda quadros", at: [130, 110] },
    { id: "b", kind: "server", label: "Receptor", sub: "devolve ACKs", at: [820, 110] },
  ],
  links: [{ id: "l-ab", from: "a", to: "b" }],
  widgets: [
    {
      kind: "grid",
      id: "gbn",
      title: "Go-Back-N: cada transmissão, em ordem",
      at: [40, 220],
      cols: CELLS,
      rows: 1,
      cellW: 52,
      indexLabel: "none",
    },
    {
      kind: "grid",
      id: "sr",
      title: "Repetição seletiva: cada transmissão, em ordem",
      at: [40, 320],
      cols: CELLS,
      rows: 1,
      cellW: 52,
      indexLabel: "none",
    },
    { kind: "counter", id: "uso", title: "Uso da linha", at: [40, 420] },
    { kind: "counter", id: "encher", title: "Janela que enche", at: [260, 420] },
    { kind: "counter", id: "gbnTotal", title: "Go-Back-N: envios", at: [480, 420] },
    { kind: "counter", id: "srTotal", title: "Seletiva: envios", at: [700, 420] },
    {
      kind: "table",
      id: "numeros",
      title: "Números de sequência e janela máxima",
      at: [40, 520],
      columns: ["Bits", "Números", "Janela Go-Back-N", "Janela seletiva"],
      widths: [80, 120, 170, 170],
      rows: BITS.length,
    },
  ],
};

const mark = (t: Tx) =>
  t.fate === "perdido"
    ? "miss"
    : t.fate === "descartado"
      ? "evict"
      : t.retry
        ? "new"
        : t.fate === "guardado"
          ? "dirty"
          : "hit";
const fateText: Record<Tx["fate"], string> = {
  entregue: "entregue",
  perdido: "perdido",
  descartado: "descartado",
  guardado: "guardado",
};

export function build(p: Params) {
  const { w, lost } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, { a: "emissor", b: "receptor" }, (t) => String(t));
  const stopWait = utilization(1, FRAME_MS, RTT_MS);
  const withW = utilization(w, FRAME_MS, RTT_MS);
  const fill = fillWindow(FRAME_MS, RTT_MS);
  const gbn = goBackN(FRAMES, w, lost);
  const sr = selectiveRepeat(FRAMES, w, lost);
  const gbnExtra = gbn.length - FRAMES;
  const srExtra = sr.length - FRAMES;
  const drawTx = (grid: string, list: Tx[]) =>
    list.forEach((t, i) => {
      c.cell(grid, i, `#${t.frame}`, {
        dt: 1,
        mark: mark(t),
        role: t.retry ? "warn" : t.fate === "perdido" ? "bad" : "a",
        label: `quadro ${t.frame}${t.retry ? " (de novo)" : ""}: ${fateText[t.fate]}`,
        log: {
          who: `envio ${i + 1}`,
          what: `quadro ${t.frame}${t.retry ? ", de novo" : ""}`,
          detail: fateText[t.fate],
        },
      });
    });
  const inFlight = gbn.filter((t) => t.fate === "descartado").map((t) => t.frame);
  const held = sr.filter((t) => t.fate === "guardado").map((t) => t.frame);

  b.step(
    {
      id: "s1-espera",
      title: "Mandar e esperar",
      subtitle: `${pct(stopWait)} da linha em uso`,
      text: `O jeito mais simples de garantir entrega é mandar um [[quadro]] e esperar o [[ack]] antes do próximo. Numa linha de ${RATE_MBPS} Mbit/s, um quadro de ${FRAME_BITS} bits leva ${FRAME_MS} ms para sair, e a confirmação volta depois de um [[rtt]] de ${RTT_MS} ms. A cada ${FRAME_MS + RTT_MS} ms, a linha só trabalha ${FRAME_MS}: ${pct(stopWait)} de uso. Quanto mais longo o caminho, pior fica.`,
      facts: [
        ["Quadro", `${FRAME_BITS} bits, ${FRAME_MS} ms`],
        ["RTT", `${RTT_MS} ms`],
        ["Uso", pct(stopWait)],
      ],
      highlight: ["a", "b"],
      quiz: {
        kind: "number",
        prompt: `Mandando um quadro de ${FRAME_MS} ms e esperando o ACK, que volta ${RTT_MS} ms depois, que porcentagem do tempo a linha fica ocupada?`,
        answer: Math.round(stopWait * 1000) / 10,
        tolerance: 0.2,
        unit: "%",
        explain: `${FRAME_MS} ÷ (${FRAME_MS} + ${RTT_MS}) = ${FRAME_MS} ÷ ${FRAME_MS + RTT_MS} = ${pct(stopWait)}.`,
      },
    },
    () => {
      c.send("a", "b", "#0", { what: "quadro 0", detail: `${FRAME_MS} ms` });
      c.send("b", "a", "ACK 0", { role: "b", what: "confirmação", detail: `${RTT_MS} ms de ida e volta` });
      c.count("uso", pct(stopWait), { dt: 0, role: "bad", label: `uso ${pct(stopWait)}` });
    },
  );

  b.step(
    {
      id: "s2-janela",
      title: "Vários no caminho",
      subtitle: `Janela de ${w}`,
      text: `Com uma [[janela-deslizante]], o emissor pode ter até ${w === 1 ? "1 quadro enviado" : `${w} quadros enviados`} e ainda sem confirmação. Cada ACK que chega libera uma vaga, e a janela desliza para a frente. Com ${w}, o uso ${w === 1 ? "fica em" : "sobe para"} ${pct(withW)}. Para a linha nunca parar, a janela precisa cobrir o quadro e a ida e volta inteira: 1 + ${RTT_MS} ÷ ${FRAME_MS} = ${fill} quadros. ${w >= fill ? "Esta janela já basta." : `Esta ainda fica ${w === 1 ? "no modo de esperar" : "abaixo"}.`}`,
      facts: [
        ["Janela", String(w)],
        ["Uso", pct(withW)],
        ["Janela que enche", String(fill)],
      ],
      highlight: ["a"],
    },
    () => {
      for (let i = 0; i < Math.min(w, FRAMES); i++)
        c.send("a", "b", `#${i}`, { dt: i === 0 ? 1 : 0, what: `quadro ${i}`, detail: "sem esperar" });
      c.count("uso", pct(withW), { dt: 0, role: withW >= 1 ? "a" : "warn", label: `uso ${pct(withW)}` });
      c.count("encher", String(fill), { dt: 0, role: "b", label: `janela que enche: ${fill}` });
    },
  );

  b.step(
    {
      id: "s3-volta",
      title: "Voltar N",
      subtitle: `Quadro ${lost} se perde`,
      text: `Agora o quadro ${lost} se perde. No [[go-back-n]], o receptor só aceita quadros em ordem: ${inFlight.length ? `os que chegam depois, ${inFlight.join(", ")}, são descartados, mesmo íntegros` : "nenhum outro estava no caminho"}. ${lost === 0 ? "Sem o 0, ele não tem nada a confirmar." : `Ele continua confirmando até o ${lost - 1}.`} Quando o temporizador do ${lost} vence, o emissor volta e manda de novo a partir dele. No fim, saíram ${gbn.length} envios para ${FRAMES} quadros: ${gbnExtra === 1 ? "1 repetido" : `${gbnExtra} repetidos`}. O receptor fica simples, sem guardar nada.`,
      facts: [
        ["Perdido", `quadro ${lost}`],
        ["Descartados", inFlight.length ? inFlight.join(", ") : "nenhum"],
        ["Envios", `${gbn.length} (${gbnExtra} a mais)`],
      ],
      highlight: ["b"],
      quiz: {
        kind: "number",
        prompt: `Com janela ${w}, ${FRAMES} quadros e o ${lost} perdido uma vez, quantas transmissões o Go-Back-N faz no total?`,
        answer: gbn.length,
        explain: `Na primeira leva vão os quadros 0 a ${Math.min(lost + w, FRAMES) - 1}; depois do tempo esgotado, de ${lost} a ${FRAMES - 1} de novo: ${Math.min(lost + w, FRAMES)} + ${FRAMES - lost} = ${gbn.length}.`,
      },
    },
    () => {
      c.send("a", "b", `#${lost}`, { lost: true, role: "bad", what: `quadro ${lost}`, detail: "perdido" });
      drawTx("gbn", gbn);
      c.count("gbnTotal", String(gbn.length), { dt: 0, role: "warn", label: `${gbn.length} envios` });
    },
  );

  b.step(
    {
      id: "s4-seletiva",
      title: "Só o que faltou",
      subtitle: `${srExtra} repetido`,
      text: `Na [[repeticao-seletiva]], o receptor guarda os quadros que chegam fora de ordem${held.length ? `, aqui ${held.join(", ")},` : ""} e confirma cada um. O emissor repete só o ${lost}. Quando ele chega, o receptor entrega tudo em ordem de uma vez. São ${sr.length} envios, ${srExtra} a mais, contra ${gbn.length} do Go-Back-N. O preço é um receptor com memória para a janela inteira e um temporizador por quadro no emissor.`,
      facts: [
        ["Guardados", held.length ? held.join(", ") : "nenhum"],
        ["Envios", `${sr.length} (${srExtra} a mais)`],
        ["Economia", `${gbn.length - sr.length} envios`],
      ],
      highlight: ["b"],
    },
    () => {
      drawTx("sr", sr);
      c.send("a", "b", `#${lost}`, { role: "warn", what: `quadro ${lost}, de novo`, detail: "só ele" });
      c.count("srTotal", String(sr.length), { dt: 0, role: "a", label: `${sr.length} envios` });
    },
  );

  const mw = maxWindow(SEQ_BITS);
  b.step(
    {
      id: "s5-numeros",
      title: "Números que se repetem",
      subtitle: `${SEQ_BITS} bits: 0 a ${2 ** SEQ_BITS - 1}`,
      text: `O número de sequência ocupa poucos bits no cabeçalho e dá a volta. Com ${SEQ_BITS} bits, vai de 0 a ${2 ** SEQ_BITS - 1}. No Go-Back-N a janela pode ter ${mw.gbn}, um a menos que os números. Na repetição seletiva só ${mw.sr}, metade: se todos os ACKs se perdessem, o receptor estaria esperando números que o emissor está repetindo da leva antiga, e aceitaria um quadro velho como novo.`,
      facts: [
        ["Números", `0 a ${2 ** SEQ_BITS - 1}`],
        ["Go-Back-N", `até ${mw.gbn}`],
        ["Seletiva", `até ${mw.sr}`],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: `Por que, com ${SEQ_BITS} bits, a repetição seletiva não pode usar janela de ${mw.gbn}?`,
        options: [
          "A janela nova do receptor se sobreporia aos números da leva antiga",
          "Porque o cabeçalho não comporta janelas maiores que 4",
          "Porque o receptor não teria memória",
        ],
        answer: 0,
        explain: `Com janela ${mw.gbn}, depois de receber 0 a ${mw.gbn - 1} o receptor passa a aceitar ${mw.gbn}, 0, 1, ...; se os ACKs se perdem, o emissor repete o 0 antigo e ele seria aceito como novo. Com ${mw.sr}, as duas janelas nunca se cruzam.`,
      },
    },
    () => {
      BITS.forEach((k, i) => {
        const m = maxWindow(k);
        c.row("numeros", i, [String(k), `0 a ${2 ** k - 1}`, String(m.gbn), String(m.sr)], {
          dt: 1,
          ...(k === SEQ_BITS ? { mark: "hit" as const } : {}),
          log: { who: `${k} bits`, what: `GBN ${m.gbn}, seletiva ${m.sr}` },
        });
      });
    },
  );

  b.step(
    {
      id: "s6-tcp",
      title: "E o TCP?",
      subtitle: "Um pouco de cada",
      text: `Enlaces Wi-Fi e protocolos de satélite usam essas janelas quadro a quadro. O [[tcp]] faz o mesmo de ponta a ponta, só que contando bytes, não quadros. Seu ACK é cumulativo como no Go-Back-N, mas o receptor guarda o que chega fora de ordem, e a opção SACK conta ao emissor quais trechos já chegaram, para repetir só o que falta, como na repetição seletiva. O número de sequência tem 32 bits, para a volta demorar.`,
      facts: [
        ["ACK do TCP", "cumulativo"],
        ["SACK", "trechos recebidos"],
        ["Sequência", "32 bits, por byte"],
      ],
      highlight: ["a", "b"],
    },
    () => {
      c.send("b", "a", "SACK", { role: "b", what: "ACK + trechos recebidos" });
    },
  );

  return b.done({
    stopWait: pct(stopWait),
    withWindow: pct(withW),
    fill,
    gbn: gbn.length,
    sr: sr.length,
    gbnMax: mw.gbn,
    srMax: mw.sr,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "janela-deslizante",
    site: "redes",
    title: "Janela deslizante: Go-Back-N e repetição seletiva",
    summary:
      "Por que esperar cada confirmação desperdiça a linha, o tamanho de janela que a enche, o que cada protocolo repete depois de uma perda e o limite que os números de sequência impõem.",
    area: "Enlace",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 3,
        section: "3.4",
        note: "Protocolos de janela deslizante",
        verified: true,
      },
    ],
    simplifications: [
      "Só um quadro se perde, e só na primeira tentativa; os ACKs nunca se perdem.",
      "No Go-Back-N, o emissor manda a janela inteira antes de perceber a perda.",
      "Tempo de processamento e cabeçalhos ficam fora da conta de uso da linha.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "janela", kind: "int", label: "Janela (quadros)", min: 1, max: FRAMES },
      { key: "perdido", kind: "int", label: "Quadro que se perde", min: 0, max: FRAMES - 1 },
    ],
  },
  build,
  intro: {
    text: "Garantir que cada quadro chegou parece exigir esperar a confirmação de cada um, mas isso deixa a linha parada quase o tempo todo. Você vai abrir uma janela de quadros em voo, perder um deles e comparar o que o Go-Back-N e a repetição seletiva fazem para recuperá-lo.",
    facts: [
      ["Quadros", String(FRAMES)],
      ["Janela", String(DEFAULTS.janela)],
      ["Perdido", `quadro ${DEFAULTS.perdido}`],
    ],
  },
  outro: {
    title: "Janela deslizante em resumo",
    text: "Esperar cada ACK usa a linha só uma fração do tempo; uma janela que cobre a ida e volta a mantém ocupada. Depois de uma perda, o Go-Back-N repete tudo a partir do quadro perdido e mantém o receptor simples; a repetição seletiva repete só o que faltou, mas exige memória no receptor e janela de no máximo metade dos números de sequência.",
    facts: (run) => [
      ["Esperar cada ACK", String(run.stats.stopWait)],
      ["Go-Back-N", `${run.stats.gbn} envios`],
      ["Seletiva", `${run.stats.sr} envios`],
    ],
  },
  next: ["tcp-conexao", "congestionamento"],
  practice,
};

export default lesson;
