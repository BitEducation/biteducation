import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { jitter, late, ticks } from "../../../sim/net/rtp.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { rtp as practice } from "../practice.ts";

/**
 * RTP and RTCP on a voice call between Lia and Malu: header fields, varying transit time, the
 * RFC 3550 jitter estimator, and the playout buffer.
 */
const INTERVAL = 20;
const HZ = 8000;
const SEQ0 = 1000;
const TRANSIT = [40, 48, 42, 61, 45, 44, 70, 47, 43, 52];
const DEFAULTS = { espera: 50 };
const shortOf = (p: Params) => Math.min(70, Math.max(40, Math.round(Number(p.espera ?? DEFAULTS.espera))));
const LONG = 75;

const scene: SceneSpec = {
  viewBox: [960, 600],
  nodes: [],
  links: [],
  widgets: [
    {
      kind: "table",
      id: "cab",
      title: "Cabeçalho RTP dos três primeiros pacotes",
      at: [40, 40],
      columns: ["Pacote", "Sequência", "Timestamp", "SSRC", "Tipo"],
      widths: [90, 110, 120, 130, 120],
      rows: 3,
    },
    {
      kind: "chart",
      id: "atraso",
      title: "Tempo de trânsito de cada pacote e o jitter estimado (ms)",
      at: [40, 220],
      width: 500,
      height: 220,
      x: { label: "pacote", max: TRANSIT.length },
      y: { label: "ms", max: 80 },
    },
    {
      kind: "table",
      id: "buffer",
      title: "Atraso de reprodução",
      at: [640, 220],
      columns: ["Espera", "Atrasados"],
      widths: [120, 160],
      rows: 2,
    },
  ],
};

const dec = (x: number) => String(Math.round(x * 100) / 100).replace(".", ",");

export function build(p: Params = DEFAULTS) {
  const SHORT = shortOf(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const j = jitter(TRANSIT);
  const lateShort = late(TRANSIT, SHORT);
  const lateLong = late(TRANSIT, LONG);
  const step = ticks(INTERVAL, HZ);
  const jEnd = j[j.length - 1] as number;
  const j1 = j[1] as number;
  const min = Math.min(...TRANSIT);
  const max = Math.max(...TRANSIT);
  const lateList = lateShort.map((i) => i + 1);
  const lateText = !lateList.length
    ? "nenhum pacote chega depois da hora"
    : lateList.length === 1
      ? `o pacote ${lateList[0]} chega depois da hora e é descartado, um ruído na fala`
      : `os pacotes ${lateList.join(", ")} chegam depois da hora e são descartados, um ruído a cada pouco`;

  b.step(
    {
      id: "s1-cabecalho",
      title: "Número e relógio",
      subtitle: `Timestamp avança ${step} por pacote`,
      text: `Lia liga para Malu. O áudio sai em pacotes de ${INTERVAL} ms sobre UDP, cada um com um cabeçalho [[rtp]]. O número de sequência sobe 1 por pacote e revela perdas e trocas de ordem. O timestamp conta amostras do áudio: a ${HZ} amostras por segundo, ${INTERVAL} ms são ${step}. O [[ssrc]] identifica a fonte, e o tipo diz o codificador. O RTP não garante entrega: só dá ao receptor o que precisa para remontar o tempo.`,
      facts: [
        ["Pacote", `${INTERVAL} ms de áudio`],
        ["Timestamp", `+${step} por pacote`],
        ["Transporte", "UDP"],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `O primeiro pacote tem timestamp 0. Qual é o timestamp do terceiro, com áudio a ${HZ} amostras por segundo em pacotes de ${INTERVAL} ms?`,
        answer: 2 * step,
        tolerance: 0,
        explain: `Cada pacote leva ${HZ} × ${INTERVAL} / 1000 = ${step} amostras; o terceiro começa depois de dois pacotes: 2 × ${step} = ${2 * step}.`,
      },
    },
    () => {
      for (let i = 0; i < 3; i++)
        c.row("cab", i, [String(i + 1), String(SEQ0 + i), String(i * step), "0x5eed1a00", "0, áudio G.711"], {
          dt: i === 0 ? 1 : 0,
          mark: "new",
        });
    },
  );

  b.step(
    {
      id: "s2-transito",
      title: "Cada pacote demora diferente",
      subtitle: `De ${min} a ${max} ms`,
      text: `Os pacotes saem a cada ${INTERVAL} ms exatos, mas atravessam filas diferentes em cada roteador. O tempo de trânsito varia de ${min} a ${max} ms. Se Malu tocasse cada pacote assim que chega, o áudio teria pausas e atropelos. Essa variação do atraso é o [[jitter]], e ela importa mais do que o atraso médio, porque é ela que obriga o receptor a esperar.`,
      facts: [
        ["Menor trânsito", `${min} ms`],
        ["Maior trânsito", `${max} ms`],
        ["Envio", `a cada ${INTERVAL} ms`],
      ],
      highlight: [],
    },
    () => {
      TRANSIT.forEach((t, i) => {
        c.plot("atraso", "trânsito", i + 1, t, {
          role: "a",
          dt: i === 0 ? 1 : 0,
          label: `pacote ${i + 1}: ${t} ms`,
        });
      });
    },
  );

  b.step(
    {
      id: "s3-jitter",
      title: "Medir a variação",
      subtitle: `Jitter estimado: ${dec(jEnd)} ms`,
      text: `Malu não sabe o trânsito absoluto, porque os relógios não estão sincronizados, mas sabe a diferença entre dois pacotes seguidos: chegada menos envio, comparada à do anterior. O RTP manda acumular assim: J aumenta 1/16 da diferença entre essa variação e o J atual. Do pacote 1 ao 2, a variação é ${TRANSIT[1] as number} − ${TRANSIT[0] as number} = 8 ms e J vai a ${dec(j1)}. Depois de ${TRANSIT.length} pacotes, J está em ${dec(jEnd)} ms.`,
      facts: [
        ["Fórmula", "J += (|D| − J) / 16"],
        ["Depois do 2º", `${dec(j1)} ms`],
        [`Depois do ${TRANSIT.length}º`, `${dec(jEnd)} ms`],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: `J começa em 0. O pacote 2 chega com variação de 8 ms em relação ao 1. Qual é o novo J?`,
        options: [`${dec(j1)} ms`, "8 ms", "4 ms"],
        answer: 0,
        explain: `J = 0 + (8 − 0) / 16 = ${dec(j1)} ms. O fator 1/16 suaviza: um pacote isolado mexe pouco na estimativa.`,
      },
    },
    () => {
      j.forEach((x, i) => {
        c.plot("atraso", "jitter", i + 1, Math.round(x * 100) / 100, {
          role: "b",
          dt: i === 0 ? 1 : 0,
          label: `J = ${dec(x)} ms`,
        });
      });
    },
  );

  b.step(
    {
      id: "s4-buffer",
      title: "Esperar um pouco para tocar",
      subtitle: `${lateShort.length} atrasados com ${SHORT} ms`,
      text: `Malu guarda os pacotes num [[buffer-de-reproducao]] e toca cada um a um atraso fixo depois do envio, usando o timestamp. Com ${SHORT} ms de espera, ${lateText}. Com ${LONG} ms, todos chegam a tempo, ${lateLong.length} atrasados, mas a conversa fica ${LONG - SHORT} ms mais lenta. O receptor ajusta essa espera pelo jitter medido.`,
      facts: [
        [`Espera de ${SHORT} ms`, `${lateShort.length} atrasados`],
        [`Espera de ${LONG} ms`, `${lateLong.length} atrasados`],
        ["Troca", "atraso por perdas"],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Com espera de ${SHORT} ms, quantos dos ${TRANSIT.length} pacotes chegam tarde demais para tocar?`,
        answer: lateShort.length,
        tolerance: 0,
        explain: `Conta quem tem trânsito acima de ${SHORT} ms: ${lateList.length ? lateList.map((i) => `o ${i}º, com ${TRANSIT[i - 1]} ms`).join("; ") : "nenhum"}.`,
      },
    },
    () => {
      c.row(
        "buffer",
        0,
        [`${SHORT} ms`, lateList.length ? `${lateList.length}: ${lateList.join(", ")}` : "0"],
        {
          dt: 1,
          mark: lateList.length ? "bad" : "hit",
        },
      );
      c.row("buffer", 1, [`${LONG} ms`, String(lateLong.length)], { dt: 1, mark: "hit" });
    },
  );

  b.step(
    {
      id: "s5-rtcp",
      title: "O retorno pelo RTCP",
      subtitle: "Relatórios de quem recebe",
      text: `Em paralelo ao RTP corre o [[rtcp]]. De tempos em tempos, Malu envia a Lia um relatório com a fração de pacotes perdidos, o maior número de sequência recebido e o jitter, aqui ${dec(jEnd)} ms. Com isso, o aplicativo de Lia pode trocar para um codificador de taxa menor quando a rede piora. O RTCP limita os próprios relatórios a cerca de 5% da banda da sessão, para não piorar o que mede.`,
      facts: [
        ["Relata", "perdas, sequência, jitter"],
        ["Jitter relatado", `${dec(jEnd)} ms`],
        ["Banda do RTCP", "cerca de 5%"],
      ],
      highlight: [],
    },
    () => {
      c.note("atraso", `Relatório RTCP: jitter ${dec(jEnd)} ms, sem perdas`, "info", { dt: 1 });
    },
  );

  return b.done(
    {
      j1: dec(j1),
      jEnd: dec(jEnd),
      lateShort: lateList.join(",") || "nenhum",
      lateLong: lateLong.length,
    },
    SHORT === DEFAULTS.espera
      ? []
      : [`Com espera de ${SHORT} ms, ${lateList.length} dos ${TRANSIT.length} pacotes chegam tarde.`],
  );
}

const lesson: LessonModule = {
  meta: {
    slug: "rtp",
    site: "redes",
    title: "RTP e RTCP: voz e vídeo em tempo real",
    summary:
      "Número de sequência e timestamp, o jitter estimado pela fórmula do RFC 3550 e o buffer que troca atraso por perdas.",
    area: "Aplicação",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 6,
        section: "6.4.3",
        note: "Protocolos de transporte em tempo real: RTP e RTCP",
        verified: true,
      },
      { rfc: 3550, section: "6.4.1", note: "Cálculo do jitter entre chegadas" },
    ],
    simplifications: [
      "Os tempos de trânsito são dados; numa rede real eles vêm das filas dos roteadores.",
      "O buffer tem espera fixa; aplicativos reais a ajustam durante a chamada.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [{ key: "espera", kind: "int", label: "Espera do buffer (ms)", min: 40, max: 70, step: 5 }],
  },
  build,
  intro: {
    text: "Numa chamada de voz, um pacote que chega tarde é tão ruim quanto um perdido. Você vai acompanhar dez pacotes de Lia para Malu, ver o que o cabeçalho RTP informa e como Malu decide quanto esperar antes de tocar.",
    facts: [
      ["Pacotes", String(TRANSIT.length)],
      ["Intervalo", `${INTERVAL} ms`],
      ["Áudio", `${HZ / 1000} kHz`],
    ],
  },
  outro: {
    title: "RTP em resumo",
    text: "O RTP numera os pacotes e marca o tempo do áudio; o receptor estima o jitter e escolhe um atraso de reprodução que equilibra pacotes atrasados e demora na conversa. O RTCP devolve essas medidas a quem envia.",
    facts: (run) => [
      ["Jitter final", `${run.stats.jEnd} ms`],
      ["Atrasados com a espera curta", String(run.stats.lateShort)],
      [`Atrasados com ${LONG} ms`, String(run.stats.lateLong)],
    ],
  },
  next: ["webrtc", "streaming-cdn"],
  practice,
};

export default lesson;
