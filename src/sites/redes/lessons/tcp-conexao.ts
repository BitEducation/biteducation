import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { ascii, frameOf } from "../../../sim/net/bytes.ts";
import { ipv4, PROTO } from "../../../sim/net/ipv4.ts";
import { payloadLayer, type TcpFlag, tcp } from "../../../sim/net/tcp.ts";
import { type FlowEv, runFlow } from "../../../sim/net/tcp-flow.ts";
import { type LessonBuilder, lessonBuilder } from "../../../sim/shared/builder.ts";
import { prng, randInt } from "../../../sim/shared/prng.ts";
import { DAVI, LIA } from "../plan.ts";
import { tcpConexao as practice } from "../practice.ts";

/**
 * TCP connection, loss and fast retransmit. Lia uploads 5 segments of 1000 bytes
 * to the library server; the 2nd is lost, 3 duplicate ACKs trigger a fast retransmit.
 * The spec sketch says 3 segments, but fast retransmit needs 3 segments *after* the lost one,
 * so the tour sends 5.
 */
const SEED = 9293;
const MSS = 1000;
const WINDOW_BYTES = 64240;
export const DEFAULTS = { perderSegundo: true, perda: 0, janela: 5, rtt: 40, segmentos: 5 };

const MAX_SEGS = 20;
const clamp = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
};

function cfgOf(p: Params) {
  return {
    perderSegundo: p.perderSegundo !== false,
    perda: clamp(p.perda, 0, 30, 0),
    janela: clamp(p.janela, 1, 8, 5),
    rtt: clamp(p.rtt, 10, 200, 40),
    segmentos: clamp(p.segmentos, 1, MAX_SEGS, 5),
  };
}

const isTour = (c: ReturnType<typeof cfgOf>) =>
  c.perderSegundo && c.perda === 0 && c.janela === 5 && c.rtt === 40 && c.segmentos === 5;

function scene(p: Params): SceneSpec {
  const c = cfgOf(p);
  return {
    viewBox: [960, 440],
    nodes: [
      { id: "lia", kind: "laptop", label: "Lia", sub: `${LIA.ip}:${LIA.port}`, at: [130, 110] },
      { id: "net", kind: "cloud", label: "Internet", sub: `RTT ${c.rtt} ms`, at: [480, 110], w: 150 },
      { id: "davi", kind: "server", label: "Biblioteca", sub: `${DAVI.ip}:80`, at: [830, 110] },
    ],
    links: [
      { id: "a", from: "lia", to: "net", style: "bus" },
      { id: "b", from: "net", to: "davi", style: "bus" },
    ],
    widgets: [
      {
        kind: "grid",
        id: "segs",
        title: `Segmentos de ${MSS} bytes (janela de ${c.janela})`,
        at: [60, 240],
        cols: c.segmentos,
        rows: 1,
        cellW: Math.min(64, Math.floor(820 / c.segmentos) - 4),
        indexLabel: "dec",
      },
      { kind: "counter", id: "retx", title: "Retransmissões", at: [60, 360] },
    ],
  };
}

function isns(seed = SEED) {
  const rand = prng(seed);
  return { isnC: randInt(rand, 1, 2 ** 31), isnS: randInt(rand, 1, 2 ** 31) };
}

function segFrame(
  b: LessonBuilder,
  id: string,
  title: string,
  summary: string,
  flags: TcpFlag[],
  seq: number,
  ack: number,
  fromLia: boolean,
  payload: number[] = [],
  mss?: number,
  seqNote?: string,
) {
  const [src, dst, sport, dport] = fromLia
    ? [LIA.ip, DAVI.ip, LIA.port, 80]
    : [DAVI.ip, LIA.ip, 80, LIA.port];
  const t = tcp({
    srcIp: src,
    dstIp: dst,
    sport,
    dport,
    seq,
    ack,
    flags,
    window: WINDOW_BYTES,
    payload,
    ...(mss ? { mss } : {}),
    ...(seqNote ? { seqNote } : {}),
  });
  const layers = [
    ipv4({
      src,
      dst,
      proto: PROTO.tcp,
      payloadLen: t.bytes.length + payload.length,
      id: 0x2a00 + (seq & 0xff),
    }),
    t,
  ];
  if (payload.length)
    layers.push(payloadLayer("dados", "Dados", payload, `${payload.length} bytes do arquivo`));
  return b.frame(
    frameOf(id, title, summary, layers, fromLia ? "Saindo do notebook da Lia" : "Saindo do servidor"),
  );
}

const CHUNK = ascii("Lista de leitura da Lia: redes, sistemas operacionais e arquitetura.\n");
const dataBytes = (n: number) => Array.from({ length: n }, (_, k) => CHUNK[k % CHUNK.length] as number);

export function build(p: Params) {
  const c = cfgOf(p);
  const tour = isTour(c);
  const b = lessonBuilder();
  const { isnC, isnS } = isns();
  const seq0 = (isnC + 1) >>> 0;
  let tick = 0;
  let retx = 0;
  const row = (t: number, who: string, what: string, detail: string) => ({
    cols: { t: `${t} ms`, who, what, detail },
  });
  const rand = prng(SEED + c.perda * 101 + c.segmentos);
  const lossTable = new Map<string, boolean>();
  const lose = (seg: number, attempt: number) => {
    const key = `${seg}:${attempt}`;
    if (!lossTable.has(key)) {
      const scripted = c.perderSegundo && seg === 1 && attempt === 0;
      lossTable.set(key, scripted || (c.perda > 0 && attempt < 4 && rand() * 100 < c.perda));
    }
    return lossTable.get(key) as boolean;
  };
  const flow = runFlow({
    segments: c.segmentos,
    mss: MSS,
    window: c.janela,
    rtt: c.rtt,
    seq0,
    lose,
    t0: c.rtt + 2,
  });
  const half = Math.round(c.rtt / 2);

  // ---- handshake
  b.step(
    {
      id: "s1-handshake",
      title: "Abrindo a conexão",
      subtitle: "SYN, SYN-ACK, ACK",
      text: `Antes de enviar dados, os dois lados combinam os números de sequência. O notebook da Lia manda um **SYN** com um número inicial aleatório (ISN = ${isnC}); o servidor responde **SYN-ACK** com o seu (${isnS}) e confirma ${isnC} + 1; a Lia confirma ${isnS} + 1 com um **ACK**. Cada SYN "gasta" um número de sequência. Os ISNs são aleatórios para que um estranho não consiga adivinhá-los.`,
      facts: [
        ["ISN da Lia", String(isnC)],
        ["ISN do servidor", String(isnS)],
        ["MSS combinado", `${MSS} bytes (nesta lição)`],
      ],
      highlight: ["lia", "davi"],
    },
    () => {
      const fSyn = segFrame(
        b,
        "f-syn",
        "SYN",
        "Pedido de conexão com o ISN da Lia e a opção MSS.",
        ["SYN"],
        isnC,
        0,
        true,
        [],
        1460,
        "ISN aleatório (semeado nesta lição)",
      );
      const fSynAck = segFrame(
        b,
        "f-synack",
        "SYN-ACK",
        "O servidor aceita, manda o próprio ISN e confirma o da Lia.",
        ["SYN", "ACK"],
        isnS,
        isnC + 1,
        false,
        [],
        1460,
        "ISN do servidor",
      );
      b.ev({
        t: ++tick,
        kind: "state",
        target: "davi",
        text: "LISTEN",
        tone: "none",
        role: "muted",
        label: "Servidor escutando na porta 80",
      });
      b.ev({
        t: ++tick,
        kind: "state",
        target: "lia",
        text: "SYN_SENT",
        tone: "active",
        role: "a",
        label: "Lia manda SYN",
      });
      b.ev({
        t: tick,
        kind: "move",
        from: "lia",
        to: "davi",
        via: ["net"],
        role: "a",
        label: "SYN",
        frame: fSyn,
        row: row(0, "Lia", "SYN", `seq ${isnC}, MSS 1460`),
      });
      b.ev({
        t: ++tick,
        kind: "state",
        target: "davi",
        text: "SYN_RCVD",
        tone: "active",
        role: "b",
        label: "Servidor responde",
      });
      b.ev({
        t: tick,
        kind: "move",
        from: "davi",
        to: "lia",
        via: ["net"],
        role: "b",
        label: "SYN-ACK",
        frame: fSynAck,
        row: row(half, "Servidor", "SYN-ACK", `seq ${isnS}, ack ${isnC + 1}`),
      });
      b.ev({
        t: ++tick,
        kind: "move",
        from: "lia",
        to: "davi",
        via: ["net"],
        role: "a",
        label: "ACK",
        row: row(c.rtt, "Lia", "ACK", `ack ${isnS + 1}`),
      });
      b.ev({
        t: tick,
        kind: "state",
        target: "lia",
        text: "ESTABLISHED",
        tone: "good",
        role: "a",
        label: "Lia: conexão aberta",
      });
      b.ev({
        t: ++tick,
        kind: "state",
        target: "davi",
        text: "ESTABLISHED",
        tone: "good",
        role: "b",
        label: "Servidor: conexão aberta",
      });
    },
  );

  // ---- data
  const attempts = new Map<number, number>();
  const segN = (seq: number) => Math.round((seq - seq0) / MSS) + 1;
  let fData = "";
  const emit = (e: FlowEv) => {
    tick++;
    if (e.kind === "send") {
      const attempt = attempts.get(e.seg) ?? 0;
      attempts.set(e.seg, attempt + 1);
      const lost = lose(e.seg, attempt);
      const label = e.retx ? `retransmite ${e.seg + 1}` : `seg ${e.seg + 1}`;
      if (e.seg === 1 && attempt === 0 && !fData)
        fData = segFrame(
          b,
          "f-dados",
          "Segmento 2",
          `Bytes ${seq0 + MSS} a ${seq0 + 2 * MSS - 1} do arquivo.`,
          ["PSH", "ACK"],
          e.seq,
          isnS + 1,
          true,
          dataBytes(MSS),
        );
      if (e.retx) retx++;
      b.ev({
        t: tick,
        kind: "move",
        from: "lia",
        to: "davi",
        via: ["net"],
        role: e.retx ? "warn" : "a",
        label,
        ...(lost ? { lost: true } : {}),
        ...(e.seg === 1 && attempt === 0 && fData ? { frame: fData } : {}),
        row: row(
          e.t,
          "Lia",
          e.retx ? `Retransmissão (${e.retx === "fast" ? "rápida" : "timeout"})` : "Dados",
          `seq ${e.seq}, ${e.len} bytes`,
        ),
      });
      b.ev({
        t: tick,
        kind: "cell",
        grid: "segs",
        index: e.seg,
        value: e.retx ? "↻" : "→",
        mark: "new",
        role: e.retx ? "warn" : "a",
        label: `Segmento ${e.seg + 1} enviado`,
      });
      if (e.retx)
        b.ev({
          t: tick,
          kind: "count",
          counter: "retx",
          value: String(retx),
          role: "warn",
          label: "Retransmissões",
        });
    } else if (e.kind === "lost") {
      b.ev({
        t: tick,
        kind: "cell",
        grid: "segs",
        index: e.seg,
        value: "✗",
        mark: "miss",
        role: "bad",
        label: `Segmento ${e.seg + 1} perdido`,
      });
      b.ev({
        t: tick,
        kind: "note",
        at: "net",
        text: `seg ${e.seg + 1} perdido`,
        tone: "bad",
        role: "bad",
        label: "Perda na rede",
        row: row(e.t, "Rede", "Perda", `seq ${e.seq} some no caminho`),
      });
    } else if (e.kind === "recv") {
      b.ev({
        t: tick,
        kind: "state",
        target: "davi",
        text: e.inOrder ? `até ${e.ack - 1}` : `falta seg ${segN(e.ack)}`,
        tone: e.inOrder ? "active" : "warn",
        role: "b",
        label: e.inOrder ? `Recebe seg ${e.seg + 1}` : `Seg ${e.seg + 1} fora de ordem`,
      });
      b.ev({
        t: tick,
        kind: "move",
        from: "davi",
        to: "lia",
        via: ["net"],
        role: e.inOrder ? "b" : "warn",
        label: `ACK ${e.ack}`,
        row: row(
          e.t,
          "Servidor",
          e.inOrder ? "ACK" : "ACK repetido",
          e.inOrder
            ? `recebeu seg ${e.seg + 1}; pede ${e.ack}`
            : `seg ${e.seg + 1} guardado; ainda pede ${e.ack}`,
        ),
      });
    } else if (e.kind === "ack") {
      if (e.dup === 0) {
        const upto = segN(e.ack) - 1;
        for (let k = upto - e.newlyAcked; k < upto; k++)
          b.ev({
            t: tick,
            kind: "cell",
            grid: "segs",
            index: k,
            value: "✓",
            mark: "hit",
            role: "b",
            label: `Segmento ${k + 1} confirmado`,
          });
        b.ev({
          t: tick,
          kind: "state",
          target: "lia",
          text: `confirmado até ${e.ack - 1}`,
          tone: "good",
          role: "a",
          label: `ACK novo: ${e.ack}`,
        });
      } else
        b.ev({
          t: tick,
          kind: "state",
          target: "lia",
          text: `ACK duplicado ${e.dup}`,
          tone: "warn",
          role: "warn",
          label: `${e.dup}º ACK duplicado`,
          row: row(e.t, "Lia", `${e.dup}º ACK duplicado`, `ack ${e.ack}`),
        });
    } else {
      b.ev({
        t: tick,
        kind: "note",
        at: "lia",
        text: `timeout: seg ${e.seg + 1}`,
        tone: "warn",
        role: "warn",
        label: "Timer de retransmissão estourou",
        row: row(e.t, "Lia", "Timeout", `RTO = ${2 * c.rtt} ms`),
      });
    }
  };

  const evs = flow.events;
  let nextStep = 2;
  if (tour) {
    const firstLost = evs.findIndex((e) => e.kind === "lost");
    const firstDup = evs.findIndex((e) => e.kind === "ack" && e.dup === 1);
    const thirdDup = evs.findIndex((e) => e.kind === "ack" && e.dup === 3);
    b.step(
      {
        id: "s2-envio",
        title: "Cinco segmentos de uma vez",
        subtitle: "A janela permite vários em voo",
        text: `A Lia não espera a confirmação de cada segmento: a janela deixa ${c.janela} segmentos de ${MSS} bytes em voo ao mesmo tempo. O número de sequência de cada um é a posição do seu primeiro byte: ${seq0}, ${seq0 + MSS}, ${seq0 + 2 * MSS} e assim por diante.`,
        facts: [
          ["Segmentos", `${c.segmentos} × ${MSS} bytes`],
          ["Primeiro seq", String(seq0)],
          ["Janela", `${c.janela} segmentos`],
        ],
      },
      () => {
        for (const e of evs.slice(0, firstLost)) emit(e);
      },
    );
    b.step(
      {
        id: "s3-perda",
        quiz: {
          kind: "choice",
          prompt:
            "O segmento 2 se perde, mas o 3, o 4 e o 5 chegam. Que byte o servidor pede nos ACKs seguintes?",
          options: [
            "Continua pedindo o primeiro byte do segmento 2",
            "Pede o byte depois do segmento 5, o último que chegou",
            "Não manda ACK até o segmento 2 chegar",
          ],
          answer: 0,
          explain:
            "O ACK do TCP é cumulativo: confirma tudo até o primeiro buraco. Enquanto o segmento 2 faltar, cada segmento novo gera um ACK repetido pedindo o mesmo byte, e são essas repetições que avisam a Lia.",
        },
        title: "O segundo se perde",
        subtitle: "O receptor guarda o que veio fora de ordem",
        text: `Um roteador no caminho descarta o segmento 2 (seq ${seq0 + MSS}), por exemplo por fila cheia. O servidor recebe o 1 e confirma: "manda a partir de ${seq0 + MSS}". Quando chegam o 3, o 4 e o 5, ele os guarda, mas o ACK é **cumulativo**: continua pedindo ${seq0 + MSS}, porque ainda há um buraco.`,
        facts: [
          ["Perdido", `segmento 2 (seq ${seq0 + MSS})`],
          ["ACK do servidor", `${seq0 + MSS}, repetido`],
        ],
        highlight: ["net"],
      },
      () => {
        for (const e of evs.slice(firstLost, firstDup)) emit(e);
      },
    );
    b.step(
      {
        id: "s4-duplicados",
        title: "ACKs duplicados",
        subtitle: "Três vezes o mesmo pedido",
        text: `Os ACKs repetidos chegam à Lia. Um ACK duplicado pode ser só reordenação; três seguidos são um sinal forte de que um segmento sumiu e os seguintes estão chegando.`,
        facts: [
          ["ACKs duplicados", "3"],
          ["Todos pedem", String(seq0 + MSS)],
        ],
        highlight: ["lia"],
        quiz: {
          kind: "choice",
          prompt: `A Lia recebeu três ACKs duplicados pedindo o byte ${seq0 + MSS}. O que o TCP dela faz agora?`,
          options: [
            "Espera o timer de retransmissão estourar",
            "Retransmite só o segmento 2, imediatamente",
            "Retransmite os segmentos 2, 3, 4 e 5",
            "Fecha a conexão",
          ],
          answer: 1,
          explain:
            "É a **retransmissão rápida** (RFC 5681): no terceiro ACK duplicado, reenvia só o segmento que falta, sem esperar o timeout. Os segmentos 3 a 5 já estão guardados no servidor.",
        },
      },
      () => {
        for (const e of evs.slice(firstDup, thirdDup + 1)) emit(e);
      },
    );
    b.step(
      {
        id: "s5-retransmissao",
        title: "Retransmissão rápida",
        subtitle: "Um segmento tapa o buraco",
        text: `A Lia reenvia o segmento 2. Quando ele chega, o servidor junta com o 3, o 4 e o 5 que já tinha e confirma tudo de uma vez: ACK ${seq0 + c.segmentos * MSS}. Sem a retransmissão rápida, a Lia ficaria parada até o timer (aqui, ${2 * c.rtt} ms).`,
        facts: [
          ["Retransmitido", "segmento 2"],
          ["ACK final", String(seq0 + c.segmentos * MSS)],
          ["Tempo da transferência", `${flow.end - (c.rtt + 2)} ms`],
        ],
      },
      () => {
        for (const e of evs.slice(thirdDup + 1)) emit(e);
      },
    );
  } else {
    const chunk = 14;
    for (let from = 0; from < evs.length; from += chunk) {
      const k = nextStep++;
      const part = evs.slice(from, from + chunk);
      const lost = part.filter((e) => e.kind === "lost").length;
      b.step(
        {
          id: `s${k}-dados-${k - 1}`,
          title: `Transferência, parte ${k - 1}`,
          subtitle: `${part[0]?.t ?? 0} a ${part.at(-1)?.t ?? 0} ms`,
          text: "Segmentos, perdas, ACKs e retransmissões, na ordem em que acontecem.",
          facts: [
            ["Eventos", String(part.length)],
            ["Perdas neste trecho", String(lost)],
          ],
        },
        () => {
          for (const e of part) emit(e);
        },
      );
    }
  }

  const finSeq = seq0 + c.segmentos * MSS;
  b.step(
    {
      id: `s${tour ? 6 : nextStep}-fim`,
      title: "Fechando",
      subtitle: "FIN em cada sentido",
      text: "Cada lado fecha a sua metade da conexão com um **FIN**, que o outro confirma. A Lia fica em TIME_WAIT por um tempo (2 × MSL) para o caso de o último ACK se perder e o FIN do servidor chegar de novo.",
      facts: [
        ["FIN da Lia", `seq ${finSeq}`],
        ["Estado final da Lia", "TIME_WAIT → CLOSED"],
      ],
    },
    () => {
      const t0 = flow.end + 5;
      b.ev({
        t: ++tick,
        kind: "move",
        from: "lia",
        to: "davi",
        via: ["net"],
        role: "a",
        label: "FIN",
        row: row(t0, "Lia", "FIN", `seq ${finSeq}`),
      });
      b.ev({
        t: tick,
        kind: "state",
        target: "lia",
        text: "FIN_WAIT_1",
        tone: "active",
        role: "a",
        label: "Lia fecha o envio",
      });
      b.ev({
        t: ++tick,
        kind: "move",
        from: "davi",
        to: "lia",
        via: ["net"],
        role: "b",
        label: "ACK",
        row: row(t0 + half, "Servidor", "ACK", `ack ${finSeq + 1}`),
      });
      b.ev({
        t: tick,
        kind: "state",
        target: "davi",
        text: "CLOSE_WAIT",
        tone: "active",
        role: "b",
        label: "Servidor confirma",
      });
      b.ev({
        t: ++tick,
        kind: "move",
        from: "davi",
        to: "lia",
        via: ["net"],
        role: "b",
        label: "FIN",
        row: row(t0 + half + 1, "Servidor", "FIN", `seq ${isnS + 1}`),
      });
      b.ev({
        t: tick,
        kind: "state",
        target: "davi",
        text: "LAST_ACK",
        tone: "active",
        role: "b",
        label: "Servidor fecha também",
      });
      b.ev({
        t: ++tick,
        kind: "move",
        from: "lia",
        to: "davi",
        via: ["net"],
        role: "a",
        label: "ACK",
        row: row(t0 + c.rtt + 1, "Lia", "ACK", `ack ${isnS + 2}`),
      });
      b.ev({
        t: tick,
        kind: "state",
        target: "lia",
        text: "TIME_WAIT",
        tone: "warn",
        role: "a",
        label: "Lia espera 2 × MSL",
      });
      b.ev({
        t: ++tick,
        kind: "state",
        target: "davi",
        text: "CLOSED",
        tone: "none",
        role: "muted",
        label: "Servidor fechado",
      });
    },
  );
  const notes = tour
    ? undefined
    : [
        `${c.segmentos} segmentos em ${flow.end - (c.rtt + 2)} ms, ${flow.lost} perdas.`,
        `${flow.fast} retransmissões rápidas e ${flow.timeouts} por timeout.`,
        ...(flow.timeouts > 0
          ? [
              "Perdas perto do fim, ou com janela pequena, não geram 3 ACKs duplicados: aí só o timeout resolve.",
            ]
          : []),
      ];
  return b.done(
    {
      isnC,
      isnS,
      retransmits: flow.retransmits,
      fast: flow.fast,
      timeouts: flow.timeouts,
      lost: flow.lost,
      ms: flow.end - (c.rtt + 2),
    },
    notes,
  );
}

const lesson: LessonModule = {
  meta: {
    slug: "tcp-conexao",
    site: "redes",
    title: "TCP: abrir, perder e retransmitir",
    summary:
      "O handshake de três vias, uma janela de segmentos em voo, uma perda, três ACKs duplicados e a retransmissão rápida.",
    area: "Transporte",
    refs: [
      { book: "tanenbaum-cn", chapter: 6, section: "6.5", note: "TCP", verified: true },
      { rfc: 9293, note: "TCP" },
      { rfc: 5681, section: "3.2", note: "Retransmissão rápida" },
    ],
    simplifications: [
      "Janela fixa, sem controle de congestionamento (tem lição própria).",
      "O servidor confirma cada segmento na hora, sem ACK atrasado.",
      "ACKs nunca se perdem; o RTO é fixo em 2 × RTT.",
      "Segmentos de 1000 bytes para as contas ficarem redondas.",
    ],
  },
  scene,
  params: {
    defaults: { ...DEFAULTS },
    fields: [
      { key: "perderSegundo", kind: "bool", label: "Perder o 2º segmento" },
      {
        key: "perda",
        kind: "int",
        label: "Perda aleatória (%)",
        min: 0,
        max: 30,
        help: "Sorteio semeado: os mesmos valores dão o mesmo resultado.",
      },
      { key: "janela", kind: "int", label: "Janela (segmentos)", min: 1, max: 8 },
      { key: "rtt", kind: "int", label: "RTT (ms)", min: 10, max: 200, step: 10 },
      { key: "segmentos", kind: "int", label: "Segmentos a enviar", min: 1, max: MAX_SEGS },
    ],
  },
  build,
  intro: {
    text: "O IP entrega pacotes no melhor esforço: alguns se perdem, outros chegam fora de ordem. O [[tcp]] transforma isso num fluxo confiável. A Lia vai enviar um arquivo de 5000 bytes para a biblioteca, e um dos segmentos vai sumir no caminho.",
    facts: [
      ["De", `${LIA.ip}:${LIA.port}`],
      ["Para", `${DAVI.ip}:80`],
      ["RTT", "40 ms"],
    ],
  },
  outro: {
    title: "TCP em resumo",
    text: "Números de sequência contam bytes, ACKs cumulativos dizem o próximo byte esperado e três ACKs duplicados disparam a retransmissão sem esperar o timer.",
    facts: (run) => [
      ["Retransmissões", String(run.stats.retransmits)],
      ["Rápidas / por timeout", `${run.stats.fast} / ${run.stats.timeouts}`],
      ["Duração dos dados", `${run.stats.ms} ms`],
    ],
  },
  next: ["tls13"],
  counter: {
    test: (ev) => ev.kind === "move" && ev.role === "warn" && ev.from === "lia",
    label: (n) => (n === 1 ? "1 retransmissão" : `${n} retransmissões`),
  },
  practice,
};

export default lesson;
