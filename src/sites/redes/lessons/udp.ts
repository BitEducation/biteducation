import type { LessonModule, Params } from "../../../contracts/types.ts";
import { frameOf, hexN, known, type Layer, layerBuilder, u16, u32 } from "../../../sim/net/bytes.ts";
import { icmpError } from "../../../sim/net/icmp.ts";
import { ipv4, PROTO } from "../../../sim/net/ipv4.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { prng, randInt } from "../../../sim/shared/prng.ts";
import { seqScene, talk } from "../../../sim/shared/seq.ts";
import { LIA } from "../plan.ts";
import { udpFrame } from "../wire.ts";

/**
 * UDP under a voice call: 20 ms packets with an RTP header, one lost and one late, no
 * retransmission; and a datagram to a closed port answered by ICMP.
 */
const SEED = 768;
export const ANA_IP = "203.0.113.77";
const PORT_LIA = 50004;
const PORT_ANA = 50006;
export const DEFAULTS = { pacotes: 8, perdido: 3, atrasado: 6 };
const INTERVAL = 20;
const ONE_WAY = 30;
const BUFFER = 60;
const AUDIO = 80;

const clamp = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
};

/** RTP header (RFC 3550): 12 bytes in front of each audio chunk. */
function rtp(seq: number, ts: number, ssrc: number): Layer {
  const b = layerBuilder("rtp", "RTP", "s4");
  b.field("Versão, flags, tipo de carga", "v2, Opus (111)", [0x80, 111]);
  b.field("Número de sequência", String(seq), u16(seq), {
    note: "É por ele que o receptor percebe perdas e desordem",
  });
  b.field("Carimbo de tempo", String(ts), u32(ts), {
    note: "Em amostras de 48 kHz: 960 por pacote de 20 ms",
  });
  b.field("SSRC", hexN(ssrc, 8), u32(ssrc), { note: "Identifica este fluxo de áudio" });
  b.field("Áudio", `${AUDIO} bytes (Opus)`, Array(AUDIO).fill(null));
  return b.done();
}

const scene = seqScene(
  [
    { id: "lia", kind: "laptop", label: "Lia na chamada", sub: `${LIA.ip}:${PORT_LIA}` },
    { id: "net", kind: "cloud", label: "Internet", sub: `${ONE_WAY} ms de ida`, w: 150 },
    { id: "ana", kind: "laptop", label: "Ana", sub: `${ANA_IP}:${PORT_ANA}` },
  ],
  {
    height: 470,
    widgets: [
      {
        kind: "grid",
        id: "play",
        title: "O que o fone da Ana toca, a cada 20 ms",
        at: [60, 250],
        cols: 8,
        rows: 1,
        cellW: 70,
        indexLabel: "dec",
      },
      { kind: "counter", id: "lost", title: "Pacotes perdidos ou tarde demais", at: [60, 360] },
    ],
  },
);

export function build(p: Params) {
  const total = clamp(p.pacotes, 4, 8, DEFAULTS.pacotes);
  // Packet 1 always plays (it is the first step); 0 means "none".
  const pick = (v: unknown, d: number) => {
    const k = clamp(v, 0, total, d);
    return k === 0 ? 0 : Math.max(2, k);
  };
  const lost = pick(p.perdido, DEFAULTS.perdido);
  const late = pick(p.atrasado, DEFAULTS.atrasado) === lost ? 0 : pick(p.atrasado, DEFAULTS.atrasado);
  const b = lessonBuilder();
  const c = talk(b, { lia: "Lia", net: "Internet", ana: "Ana" });
  const rand = prng(SEED);
  const ssrc = randInt(rand, 1, 0xffffffff);
  const seq0 = randInt(rand, 1000, 30000);
  const ts0 = randInt(rand, 1, 2 ** 30);
  const frame = (k: number) =>
    udpFrame(
      { src: LIA.ip, dst: ANA_IP, sport: PORT_LIA, dport: PORT_ANA, ipId: 0x500 + k },
      rtp(seq0 + k - 1, ts0 + (k - 1) * 960, ssrc),
      {
        id: `f-p${k}`,
        title: `Pacote de voz ${k}`,
        summary: `20 ms de áudio, sequência ${seq0 + k - 1}.`,
        where: "Saindo do notebook da Lia, rumo à Ana",
      },
    );
  let bad = 0;
  const play = (k: number, ok: boolean, why: string) => {
    if (!ok) bad++;
    c.cell("play", k - 1, ok ? `♪${k}` : "—", {
      mark: ok ? "hit" : "miss",
      label: ok ? `Toca o pacote ${k}` : `Falha no ${k}: ${why}`,
    });
    if (!ok) c.count("lost", String(bad), { label: `${bad} com problema` });
  };

  b.step(
    {
      id: "s1-cabecalho",
      title: "Oito bytes e mais nada",
      subtitle: "O cabeçalho UDP",
      text: `Numa chamada de voz, o programa da Lia manda um pacote a cada ${INTERVAL} ms. Cada um vai por [[udp]]: sem handshake, sem confirmação, sem janela. O cabeçalho UDP tem só **8 bytes**: duas portas, o tamanho e um checksum. Dentro vai um cabeçalho RTP, com número de sequência e carimbo de tempo, e o áudio. Abra o inspetor (I).`,
      facts: [
        ["Cabeçalho UDP", "8 bytes"],
        ["Cabeçalho TCP", "20 bytes ou mais"],
        ["Um pacote a cada", `${INTERVAL} ms`],
      ],
      highlight: ["lia"],
    },
    () => {
      c.send("lia", "ana", "voz 1", {
        dt: ONE_WAY,
        via: ["net"],
        frame: frame(1),
        detail: `${AUDIO} bytes de áudio`,
      });
      c.at(ONE_WAY + BUFFER);
      play(1, true, "");
    },
  );

  b.step(
    {
      id: "s2-fluxo",
      title: "Um fluxo contínuo",
      subtitle: `Um pacote a cada ${INTERVAL} ms`,
      text: `Os pacotes seguintes saem no mesmo ritmo, cada um independente dos outros. O programa da Ana guarda cada pacote por ${BUFFER} ms num **buffer de jitter** antes de tocar: assim, pequenas variações no atraso da rede não viram cortes. Cada pacote tem a sua hora marcada para tocar, e quem chegar depois dela já não serve.`,
      facts: [
        ["Atraso da rede", `${ONE_WAY} ms`],
        ["Buffer", `${BUFFER} ms`],
        ["Toca o pacote k em", `${ONE_WAY + BUFFER} + 20 × (k − 1) ms`],
      ],
      highlight: ["ana"],
    },
    () => {
      const before = b.length;
      for (let k = 2; k < Math.min(lost || total + 1, late || total + 1, total + 1); k++) {
        c.at((k - 1) * INTERVAL);
        c.send("lia", "ana", `voz ${k}`, { dt: ONE_WAY, via: ["net"], frame: frame(k) });
        c.at(ONE_WAY + BUFFER + (k - 1) * INTERVAL);
        play(k, true, "");
      }
      if (b.length === before) c.note("ana", "o próximo pacote já tem problema", "warn", { dt: 1 });
    },
  );

  const firstBad = Math.min(lost || total + 1, late || total + 1);
  b.step(
    {
      id: "s3-perda",
      title: "Um pacote some",
      subtitle: "Ninguém retransmite",
      text: lost
        ? `O pacote ${lost} é descartado num roteador congestionado. O UDP não percebe nada: não há confirmação para faltar. Quem nota é o programa da Ana, que vê um buraco nos números de sequência do RTP. Ele não pede de novo; disfarça o buraco repetindo ou suavizando o som anterior. Uma falha de ${INTERVAL} ms quase não se ouve.`
        : "No Laboratório nenhum pacote foi perdido. Se um se perdesse, o UDP não perceberia nada, porque não há confirmação. Quem notaria seria o programa da Ana, pelo buraco nos números de sequência do RTP, e ele disfarçaria a falha em vez de pedir de novo.",
      facts: [
        ["Perdido", lost ? `pacote ${lost}` : "nenhum"],
        ["Retransmissão", "nenhuma"],
        ["Quem percebe", "a aplicação, pela sequência"],
      ],
      highlight: ["net"],
      quiz: {
        kind: "choice",
        prompt: "Por que o programa de chamada não pede o pacote perdido de novo, como o TCP faria?",
        options: [
          "Porque o UDP proíbe pedir de novo",
          "Porque a cópia chegaria depois da hora de tocar e não serviria mais",
          "Porque o pacote está cifrado",
          "Porque a Ana não sabe que ele se perdeu",
        ],
        answer: 1,
        explain: `Pedir de novo custa pelo menos uma ida e volta (${2 * ONE_WAY} ms aqui). A cópia chegaria depois da hora marcada para tocar. Em tempo real, um pedaço faltando é melhor que um atraso que trava tudo.`,
      },
    },
    () => {
      const before = b.length;
      for (let k = firstBad; k <= total; k++) {
        if (k === late) continue;
        c.at((k - 1) * INTERVAL);
        if (k === lost) {
          c.send("lia", "net", `voz ${k}`, {
            dt: ONE_WAY / 2,
            lost: true,
            frame: frame(k),
            detail: "descartado",
          });
          c.at(ONE_WAY + BUFFER + (k - 1) * INTERVAL);
          play(k, false, "perdido");
        } else {
          c.send("lia", "ana", `voz ${k}`, { dt: ONE_WAY, via: ["net"], frame: frame(k) });
          c.at(ONE_WAY + BUFFER + (k - 1) * INTERVAL);
          play(k, true, "");
        }
      }
      if (b.length === before) c.note("ana", "sem perdas", "good", { dt: 1 });
    },
  );

  const lateBy = BUFFER + 40;
  b.step(
    {
      id: "s4-atraso",
      quiz: {
        kind: "choice",
        prompt:
          "Um pacote de voz chega inteiro, mas depois da hora em que devia tocar. O que o programa da Ana faz com ele?",
        options: [
          "Descarta, como se tivesse se perdido",
          "Toca assim mesmo, um pouco atrasado",
          "Pede ao UDP que reordene a fila",
        ],
        answer: 0,
        explain:
          "Numa chamada, áudio atrasado não tem mais uso: tocá-lo empurraria tudo o que vem depois. O buffer de jitter absorve variações pequenas; o que passa do limite vira perda.",
      },
      title: "Chegar tarde é perder",
      subtitle: "O buffer de jitter tem limite",
      text: late
        ? `O pacote ${late} pega uma fila longa e leva ${ONE_WAY + lateBy} ms em vez de ${ONE_WAY}. Quando chega, a hora de tocá-lo já passou e ele vai para o lixo, como se tivesse se perdido. É por isso que a chamada não usa TCP: uma perda faria o TCP segurar todos os pacotes seguintes até a retransmissão, e a voz travaria.`
        : `No Laboratório nenhum pacote atrasou. Um pacote que chegasse depois da hora de tocar seria jogado fora, como se tivesse se perdido. É por isso que a chamada não usa TCP: uma perda faria o TCP segurar todos os pacotes seguintes até a retransmissão, e a voz travaria.`,
      facts: [
        ["Atrasado", late ? `pacote ${late}, +${lateBy} ms` : "nenhum"],
        ["Com TCP", "os seguintes esperariam o perdido"],
      ],
      highlight: ["ana"],
    },
    () => {
      if (late) {
        c.at((late - 1) * INTERVAL);
        c.send("lia", "ana", `voz ${late}`, {
          dt: ONE_WAY + lateBy,
          via: ["net"],
          role: "warn",
          frame: frame(late),
          detail: `+${lateBy} ms`,
        });
        play(late, false, "chegou tarde");
      } else c.note("ana", "nenhum atraso", "good", { dt: 1 });
    },
  );

  b.step(
    {
      id: "s5-fechada",
      title: "Porta sem ninguém",
      subtitle: "O ICMP avisa, o UDP não",
      text: "Quando a Ana desliga, o programa dela fecha a porta. O próximo pacote da Lia chega a um computador que não tem ninguém escutando ali, e o sistema da Ana responde com ICMP **porta inalcançável**. É o único aviso que existe no mundo UDP, e nem sempre chega: muitos firewalls descartam em silêncio.",
      facts: [
        ["Resposta", "ICMP 3/3"],
        ["Garantia de aviso", "nenhuma"],
      ],
      highlight: ["ana"],
    },
    () => {
      c.at(total * INTERVAL + 2000);
      const last = frame(total + 1);
      c.send("lia", "ana", "voz", {
        dt: ONE_WAY,
        via: ["net"],
        frame: { ...last, id: "f-closed", title: "Pacote para a porta fechada" },
      });
      const ipLayer = last.layers.find((l) => l.id === "ip");
      const quoted = known(last.data.slice(ipLayer?.from, (ipLayer?.to ?? 0) + 8));
      const ic = icmpError({ type: 3, code: 3, quoted });
      const ip = ipv4({
        src: ANA_IP,
        dst: LIA.ip,
        proto: PROTO.icmp,
        payloadLen: ic.bytes.length,
        ttl: 64,
        df: false,
      });
      c.send("ana", "lia", "porta inalcançável", {
        dt: ONE_WAY,
        via: ["net"],
        role: "warn",
        frame: frameOf(
          "f-unreach",
          "ICMP porta inalcançável",
          "O único aviso que o UDP recebe.",
          [ip, ic],
          "Saindo do computador da Ana, de volta para a Lia",
        ),
      });
    },
  );

  b.step(
    {
      id: "s6-quando",
      title: "Quando escolher UDP",
      subtitle: "Simples, rápido e sem garantia",
      text: "O UDP serve quando chegar rápido importa mais que chegar tudo (voz, vídeo, jogos), quando a troca é uma pergunta e uma resposta (DNS, NTP) ou quando a aplicação quer controlar a confiabilidade do seu jeito, como o QUIC. Em troca, ela assume o que o TCP faria: detectar perdas, ordenar e não congestionar a rede.",
      facts: [
        ["Usam UDP", "DNS, NTP, voz, jogos, QUIC"],
        ["Responsabilidade da aplicação", "perdas, ordem, congestionamento"],
      ],
      highlight: ["lia", "ana"],
    },
    () => {
      c.note("lia", "confiabilidade fica com a aplicação", "info", { dt: 1 });
    },
  );

  return b.done({ total, bad, lost, late });
}

const lesson: LessonModule = {
  meta: {
    slug: "udp",
    site: "redes",
    title: "UDP: rápido e sem garantia",
    summary:
      "Uma chamada de voz pacote a pacote: o cabeçalho de 8 bytes, a perda que ninguém retransmite e o pacote que chega tarde demais.",
    area: "Transporte",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 6,
        section: "6.4",
        note: "Os protocolos de transporte da Internet: UDP",
        verified: true,
      },
      { rfc: 768, note: "UDP" },
      { rfc: 3550, note: "RTP" },
      { rfc: 8085, note: "Boas práticas para quem usa UDP" },
    ],
    simplifications: [
      "Um pacote de áudio a cada 20 ms sem cifra; chamadas reais usam SRTP.",
      "Atraso fixo, menos no pacote atrasado de propósito.",
      "O buffer de jitter tem tamanho fixo; programas reais o ajustam conforme a rede.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "pacotes", kind: "int", label: "Pacotes de voz", min: 4, max: 8 },
      { key: "perdido", kind: "int", label: "Pacote perdido (0 = nenhum)", min: 0, max: 8 },
      { key: "atrasado", kind: "int", label: "Pacote atrasado (0 = nenhum)", min: 0, max: 8 },
    ],
  },
  build,
  intro: {
    text: "O TCP garante que tudo chega e em ordem, mas às vezes essa garantia atrapalha. Numa chamada de voz, um pedaço que chega tarde é inútil. Você vai seguir os pacotes de uma chamada da Lia por UDP, ver uma perda e um atraso, e entender por que a aplicação prefere não esperar.",
    facts: [
      ["Fluxo", "voz, um pacote a cada 20 ms"],
      ["Transporte", "UDP + RTP"],
      ["Atraso da rede", `${ONE_WAY} ms`],
    ],
  },
  outro: {
    title: "UDP em resumo",
    text: "O UDP entrega datagramas independentes, com 8 bytes de cabeçalho e nenhuma garantia. Em tempo real isso é uma vantagem: perdas e atrasos viram pequenas falhas em vez de travamentos.",
    facts: (run) => [
      ["Pacotes enviados", String(run.stats.total)],
      ["Perdidos ou tarde demais", String(run.stats.bad)],
    ],
  },
  next: ["quic", "tcp-conexao"],
};

export default lesson;
