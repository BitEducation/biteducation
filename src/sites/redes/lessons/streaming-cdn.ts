import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import {
  LADDER,
  originGbps,
  pick,
  play,
  SEGMENT_S,
  SETUP_RTTS,
  startup,
} from "../../../sim/net/streaming.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Watching a video: segments of a few seconds, the start-up cost of a far origin versus a nearby
 * CDN edge, how much traffic the edge keeps off the origin, and a player whose bandwidth drops
 * mid-film, with a fixed quality stalling while adaptive bitrate steps down.
 */
export const DEFAULTS = { banda: 8, queda: 75 };
const SEGMENTS = 12;
const DROP_AT = 5;
const RTT_ORIGIN = 120;
const RTT_EDGE = 10;
const VIEWERS = 10_000;
const HIT = 0.95;
/** VIEWERS written with a Brazilian thousands dot, without relying on runtime locale data. */
const PEOPLE = String(VIEWERS).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

function clamp(p: Params) {
  const mbps = Math.min(50, Math.max(1, Math.round(Number(p.banda ?? DEFAULTS.banda))));
  const drop = Math.min(90, Math.max(0, Math.round(Number(p.queda ?? DEFAULTS.queda))));
  return { mbps, drop, after: (mbps * (100 - drop)) / 100 };
}

const dec = (x: number, d = 2) => String(Math.round(x * 10 ** d) / 10 ** d).replace(".", ",");
const mb = (x: number) => `${dec(x, 1)} Mbit/s`;
const sec = (x: number) => `${dec(x)} s`;

function scene(p: Params): SceneSpec {
  const { mbps, after } = clamp(p);
  const ends = [
    play(SEGMENTS, mbps, after, DROP_AT, false).end,
    play(SEGMENTS, mbps, after, DROP_AT, true).end,
  ];
  return {
    viewBox: [960, 640],
    nodes: [
      { id: "tv", kind: "laptop", label: "Você", sub: "São Paulo", at: [120, 90] },
      { id: "borda", kind: "server", label: "Servidor de borda", sub: `CDN, ${RTT_EDGE} ms`, at: [430, 90] },
      {
        id: "origem",
        kind: "server",
        label: "Origem",
        sub: `outro continente, ${RTT_ORIGIN} ms`,
        at: [800, 90],
      },
    ],
    links: [
      { id: "l-tv-borda", from: "tv", to: "borda" },
      { id: "l-borda-origem", from: "borda", to: "origem", style: "dashed" },
    ],
    widgets: [
      {
        kind: "table",
        id: "inicio",
        title: "Até o primeiro quadro",
        at: [40, 200],
        columns: ["Servidor", "RTT", "Conexão", "1º segmento", "Total"],
        widths: [150, 70, 100, 120, 90],
        rows: 2,
      },
      { kind: "counter", id: "qualidade", title: "Qualidade agora", at: [640, 200] },
      { kind: "counter", id: "travadas", title: "Travadas", at: [810, 200] },
      {
        kind: "chart",
        id: "buffer",
        title: "Segundos de vídeo no buffer",
        at: [60, 360],
        width: 560,
        height: 200,
        x: { label: "tempo (s)", max: Math.ceil(Math.max(...ends) / 10) * 10 },
        y: { label: "buffer (s)", max: 24 },
      },
      {
        kind: "table",
        id: "carga",
        title: `${PEOPLE} pessoas assistindo`,
        at: [660, 330],
        columns: ["Quem serve", "Saída da origem"],
        widths: [140, 140],
        rows: 2,
      },
    ],
  };
}

export function build(p: Params) {
  const { mbps, drop, after } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, { tv: "você", borda: "borda", origem: "origem" }, (t) => String(t));
  const first = Math.min(LADDER[1] as number, pick(mbps));
  const far = startup(RTT_ORIGIN, mbps, first);
  const near = startup(RTT_EDGE, mbps, first);
  const top = pick(mbps);
  const fixed = play(SEGMENTS, mbps, after, DROP_AT, false);
  const abr = play(SEGMENTS, mbps, after, DROP_AT, true);
  const segMbit = top * SEGMENT_S;
  const noCdn = originGbps(VIEWERS, top, 0);
  const withCdn = originGbps(VIEWERS, top, HIT);
  const travada = (n: number) => (n === 1 ? "1 travada" : `${n} travadas`);
  const afterRate = pick(after);

  const curve = (r: ReturnType<typeof play>, series: string, role: "a" | "bad") =>
    r.points.forEach((x, i) => {
      c.plot("buffer", series, x.t, x.buffer, {
        role,
        dt: i === 0 ? 1 : 0,
        label: `${series}, ${dec(x.t, 1)} s: ${dec(x.buffer, 1)} s no buffer${x.stall ? " (travou)" : ""}`,
      });
    });

  b.step(
    {
      id: "s1-segmentos",
      title: "Vídeo em pedaços",
      subtitle: `${SEGMENT_S} s por segmento`,
      text: `Um serviço de vídeo não manda o filme como um arquivo só. Ele o corta em [[segmento-de-video|segmentos]] de ${SEGMENT_S} segundos e guarda cada um em várias qualidades: ${LADDER.map((x) => dec(x, 1)).join(", ")} Mbit/s. Um segmento de ${SEGMENT_S} s a ${dec(top, 1)} Mbit/s pesa ${dec(segMbit, 0)} Mbit. O player baixa um por vez, por HTTP comum, e começa a tocar assim que o primeiro chega, enquanto busca o próximo. Os segmentos já baixados e ainda não vistos formam o buffer.`,
      facts: [
        ["Segmento", `${SEGMENT_S} s`],
        ["Qualidades", LADDER.map((x) => dec(x, 1)).join(" · ")],
        ["Transporte", "HTTP"],
      ],
      highlight: ["tv"],
    },
    () => {
      c.send("tv", "origem", "GET seg 1", { via: ["borda"], what: "pede o primeiro segmento" });
      LADDER.forEach((r) => {
        c.state("origem", `${dec(r, 1)} Mbit/s`, {
          dt: 0,
          role: "b",
          label: `guarda o segmento em ${dec(r, 1)} Mbit/s`,
        });
      });
    },
  );

  b.step(
    {
      id: "s2-distancia",
      title: "Longe custa idas e voltas",
      subtitle: `${sec(far.total)} contra ${sec(near.total)}`,
      text: `Antes do primeiro byte de vídeo, o player abre a conexão: TCP, TLS e o pedido, ${SETUP_RTTS} idas e voltas. Com a origem em outro continente, a ${RTT_ORIGIN} ms, são ${sec(far.setup)} só nisso; o primeiro segmento, em qualidade baixa para começar logo, leva mais ${sec(far.download)} a ${mb(mbps)}. Total: ${sec(far.total)}. Um servidor a ${RTT_EDGE} ms gasta ${sec(near.setup)} na conexão e começa em ${sec(near.total)}. Cada clique em outro vídeo repete essa conta.`,
      facts: [
        ["Origem", `${RTT_ORIGIN} ms → ${sec(far.total)}`],
        ["Perto", `${RTT_EDGE} ms → ${sec(near.total)}`],
        ["Idas e voltas", String(SETUP_RTTS)],
      ],
      highlight: ["origem", "borda"],
      quiz: {
        kind: "number",
        prompt: `Com RTT de ${RTT_ORIGIN} ms e ${SETUP_RTTS} idas e voltas para abrir a conexão, quantos segundos passam antes do primeiro byte de vídeo?`,
        answer: Math.round(far.setup * 100) / 100,
        tolerance: 0.01,
        unit: "s",
        explain: `${SETUP_RTTS} × ${RTT_ORIGIN} ms = ${SETUP_RTTS * RTT_ORIGIN} ms = ${sec(far.setup)}.`,
      },
    },
    () => {
      c.row(
        "inicio",
        0,
        ["Origem distante", `${RTT_ORIGIN} ms`, sec(far.setup), sec(far.download), sec(far.total)],
        {
          dt: 1,
          mark: "warn",
          log: { who: "origem", what: sec(far.total) },
        },
      );
      c.row(
        "inicio",
        1,
        ["Borda da CDN", `${RTT_EDGE} ms`, sec(near.setup), sec(near.download), sec(near.total)],
        {
          dt: 1,
          mark: "hit",
          log: { who: "borda", what: sec(near.total) },
        },
      );
    },
  );

  b.step(
    {
      id: "s3-cdn",
      title: "Uma cópia perto de você",
      subtitle: `${dec(HIT * 100, 0)}% servido na borda`,
      text: `Uma [[cdn]] espalha servidores de borda por muitas cidades, às vezes dentro do próprio provedor de internet. O DNS do serviço responde com o endereço da borda mais próxima de quem pergunta. Ela guarda os segmentos populares e só pede à origem o que não tem. Com ${PEOPLE} pessoas assistindo a ${mb(top)}, a origem teria de mandar ${dec(noCdn, 0)} Gbit/s; se a borda atende ${dec(HIT * 100, 0)}% dos pedidos, a origem manda só ${dec(withCdn, 0)} Gbit/s.`,
      facts: [
        ["Sem CDN", `${dec(noCdn, 0)} Gbit/s na origem`],
        ["Com CDN", `${dec(withCdn, 0)} Gbit/s na origem`],
        ["Quem escolhe a borda", "o DNS"],
      ],
      highlight: ["borda"],
    },
    () => {
      c.send("borda", "origem", "falta", { role: "muted", what: "só o que a borda não tem" });
      c.send("borda", "tv", "seg 1", { role: "a", what: "a borda serve" });
      c.row("carga", 0, ["Só a origem", `${dec(noCdn, 0)} Gbit/s`], { dt: 1, mark: "bad" });
      c.row("carga", 1, [`Borda (${dec(HIT * 100, 0)}%)`, `${dec(withCdn, 0)} Gbit/s`], {
        dt: 1,
        mark: "hit",
      });
    },
  );

  b.step(
    {
      id: "s4-fixa",
      title: "A internet piora",
      subtitle: `${mb(mbps)} → ${mb(after)}`,
      text: `${drop === 0 ? `Desta vez a conexão se mantém em ${mb(mbps)}; no Laboratório, aumente a queda.` : `No segmento ${DROP_AT + 1}, a conexão cai ${drop}%, de ${mb(mbps)} para ${mb(after)}, como quando alguém da casa começa um download.`} Um player de qualidade fixa continua pedindo ${mb(top)}: cada segmento de ${SEGMENT_S} s passa a levar ${sec((top * SEGMENT_S) / after)} para chegar. ${fixed.stalls ? `O buffer esvazia e a imagem trava: ${travada(fixed.stalls)}, ${sec(fixed.stallTime)} parado no total.` : "O buffer ainda dá conta: nenhuma travada."} No gráfico, a curva vermelha é o buffer encostando no zero.`,
      facts: [
        ["Antes", mb(mbps)],
        ["Depois", mb(after)],
        ["Qualidade fixa", `${travada(fixed.stalls)}, ${sec(fixed.stallTime)}`],
      ],
      highlight: ["tv"],
    },
    () => {
      curve(fixed, "fixa", "bad");
      c.count("qualidade", mb(top), { dt: 0, role: "bad", label: `fixa em ${mb(top)}` });
      c.count("travadas", String(fixed.stalls), { dt: 0, role: "bad", label: travada(fixed.stalls) });
    },
  );

  b.step(
    {
      id: "s5-adaptativo",
      title: "Baixar a qualidade",
      subtitle: `${travada(abr.stalls)} com adaptação`,
      text: `Com [[taxa-adaptativa]], o player mede quanto tempo cada segmento levou e escolhe o próximo na maior qualidade abaixo de 80% da velocidade medida. ${afterRate === top ? `Aqui a velocidade depois da queda ainda comporta ${mb(top)}, e ele não precisa mudar.` : `Ele só percebe a queda depois do segmento ${DROP_AT + 1}, ${abr.stalls ? `e paga ${travada(abr.stalls)}` : "e o buffer segura essa demora"}; em seguida desce para ${mb(afterRate)}, e cada segmento volta a chegar antes de acabar o anterior.`} Pior imagem por um tempo, mas sem parar. A curva azul mostra o buffer se recuperando.`,
      facts: [
        ["Escolhe", "≤ 80% do medido"],
        ["Depois da queda", mb(afterRate)],
        ["Travadas", `${abr.stalls} contra ${fixed.stalls}`],
      ],
      highlight: ["tv"],
      quiz: {
        kind: "choice",
        prompt: `A velocidade medida caiu para ${mb(after)}. Pela regra dos 80%, que qualidade o player pede em seguida?`,
        options: [afterRate, ...LADDER.filter((x) => x !== afterRate).reverse()].slice(0, 3).map(mb),
        answer: 0,
        explain: `80% de ${mb(after)} é ${mb(0.8 * after)}; a maior qualidade da escada abaixo disso é ${mb(afterRate)}.`,
      },
    },
    () => {
      curve(abr, "adaptativa", "a");
      c.count("qualidade", mb(afterRate), { dt: 0, role: "a", label: `adaptativa em ${mb(afterRate)}` });
      c.count("travadas", `${abr.stalls} × ${fixed.stalls}`, {
        dt: 0,
        role: "a",
        label: `${abr.stalls} contra ${fixed.stalls}`,
      });
    },
  );

  b.step(
    {
      id: "s6-juntos",
      title: "As duas ideias juntas",
      subtitle: "Perto e flexível",
      text: `Os grandes serviços juntam tudo: a CDN encurta a distância e alivia a origem, e a taxa adaptativa, nos padrões DASH e HLS, ajusta a qualidade ao que a conexão aguenta naquele momento. A origem guarda todas as qualidades de cada segmento uma vez; as bordas guardam só o que é assistido perto delas. Transmissões ao vivo usam os mesmos segmentos, só que mais curtos, para reduzir o atraso em relação ao que acontece de verdade.`,
      facts: [
        ["Distância", "CDN"],
        ["Banda variável", "taxa adaptativa"],
        ["Padrões", "DASH, HLS"],
      ],
      highlight: ["tv", "borda"],
    },
    () => {
      c.state("borda", "segmentos populares", {
        role: "a",
        tone: "good",
        label: "a borda guarda o que é assistido ali",
      });
    },
  );

  return b.done({
    far: dec(far.total),
    near: dec(near.total),
    top,
    fixedStalls: fixed.stalls,
    abrStalls: abr.stalls,
    afterRate,
    origin: `${dec(noCdn, 0)}/${dec(withCdn, 0)}`,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "streaming-cdn",
    site: "redes",
    title: "Streaming e CDN: vídeo sem travar",
    summary:
      "O vídeo cortado em segmentos, o custo de começar a tocar de um servidor distante, a borda da CDN que fica perto de você e alivia a origem, e o player que baixa a qualidade quando a conexão piora.",
    area: "Aplicação",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 7,
        section: "7.4.3",
        note: "Streaming de mídia armazenada",
        verified: true,
      },
      {
        book: "tanenbaum-cn",
        chapter: 7,
        section: "7.5.3",
        note: "Redes de entrega de conteúdo",
        verified: true,
      },
    ],
    simplifications: [
      "A velocidade é constante dentro de cada trecho e cai de uma vez.",
      "Conexão aberta em três idas e voltas e reaproveitada nos segmentos seguintes.",
      "O player segura no máximo 20 s de buffer e decide só pelo último segmento.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "banda", kind: "int", label: "Sua velocidade (Mbit/s)", min: 1, max: 50 },
      { key: "queda", kind: "int", label: "Queda no meio do vídeo (%)", min: 0, max: 90 },
    ],
  },
  build,
  intro: {
    text: "Um vídeo começa em menos de um segundo e quase nunca trava, mesmo quando a internet de casa oscila. Você vai ver o filme ser cortado em pedaços, comparar um servidor distante com uma borda da CDN e acompanhar o buffer de dois players quando a conexão cai.",
    facts: [
      ["Velocidade", `${DEFAULTS.banda} Mbit/s`],
      ["Queda", `${DEFAULTS.queda}%`],
      ["Segmentos", String(SEGMENTS)],
    ],
  },
  outro: {
    title: "Streaming em resumo",
    text: "O vídeo vai em segmentos curtos, em várias qualidades, por HTTP. Uma CDN deixa cópias perto de quem assiste, o que encurta a partida e tira quase todo o tráfego da origem. O player adaptativo mede a velocidade a cada segmento e escolhe uma qualidade que caiba nela, trocando nitidez por continuidade.",
    facts: (run) => [
      ["Origem × borda", `${run.stats.far} s × ${run.stats.near} s`],
      ["Travadas fixa", String(run.stats.fixedStalls)],
      ["Travadas adaptativa", String(run.stats.abrStalls)],
    ],
  },
  next: ["http", "dns"],
};

export default lesson;
