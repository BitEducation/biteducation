import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { burstTicks, type Mode, maxDelay, simulate, type Tick } from "../../../sim/net/bucket.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Traffic shaping on a bursty sender: without control a burst floods the network, a leaky bucket
 * flattens it into a constant rate, a token bucket lets short bursts through and then holds the
 * average, and policing drops instead of queuing. Cumulative arrival and departure curves show the
 * queue as the vertical gap and the delay as the horizontal one.
 */
export const DEFAULTS = { taxa: 2, balde: 8 };
const TICKS = 30;
const LINE = 10;
const ARRIVALS: number[] = Array.from({ length: TICKS }, (_, t) =>
  t === 0 ? 20 : t === 10 ? 10 : t === 20 ? 6 : 0,
);
const TOTAL = ARRIVALS.reduce((s, x) => s + x, 0);

function clamp(p: Params) {
  const rate = Math.min(LINE, Math.max(1, Math.round(Number(p.taxa ?? DEFAULTS.taxa))));
  const bucket = Math.min(TOTAL, Math.max(1, Math.round(Number(p.balde ?? DEFAULTS.balde))));
  return { rate, bucket };
}

const dec = (x: number, d = 1) => String(Math.round(x * 10 ** d) / 10 ** d).replace(".", ",");
const pac = (n: number) => (n === 1 ? "1 pacote" : `${n} pacotes`);
const ms = (n: number) => `${n} ms`;

const scene: SceneSpec = {
  viewBox: [960, 640],
  nodes: [],
  links: [],
  widgets: [
    {
      kind: "chart",
      id: "acumulado",
      title: "Pacotes acumulados: o que chegou ao roteador e o que ele soltou",
      at: [60, 60],
      width: 540,
      height: 240,
      x: { label: "ms", max: TICKS - 1 },
      y: { label: "pacotes", max: Math.ceil(TOTAL / 10) * 10 },
    },
    { kind: "counter", id: "fichas", title: "Fichas no balde", at: [670, 60] },
    { kind: "counter", id: "fila", title: "Na fila", at: [840, 60] },
    { kind: "counter", id: "atraso", title: "Maior atraso", at: [670, 160] },
    { kind: "counter", id: "descartes", title: "Descartados", at: [840, 160] },
    {
      kind: "table",
      id: "comparar",
      title: `${TOTAL} pacotes em três rajadas, linha de ${LINE} por ms`,
      at: [40, 390],
      columns: ["Controle", "Maior atraso", "Descartados", "Pico por ms"],
      widths: [230, 150, 140, 140],
      rows: 4,
    },
  ],
};

export function build(p: Params) {
  const { rate, bucket } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => `${t}`);
  const runs = Object.fromEntries(
    (["sem", "furado", "fichas", "policia"] as Mode[]).map((m) => [
      m,
      simulate(ARRIVALS, m, rate, bucket, LINE),
    ]),
  ) as Record<Mode, Tick[]>;
  const delay = (m: Mode) => maxDelay(runs[m]);
  const peak = (m: Mode) => Math.max(...runs[m].map((x) => x.sent));
  const drops = (m: Mode) => runs[m].reduce((s, x) => s + x.dropped, 0);
  const tb = runs.fichas;
  const first = tb[0] as Tick;
  const burst = burstTicks(rate, bucket, LINE);
  const maxQ = Math.max(...tb.map((x) => x.queued));
  const label: Record<Mode, string> = {
    sem: "Sem controle",
    furado: `Balde furado (${rate} por ms)`,
    fichas: `Balde de fichas (${rate}/ms, ${bucket})`,
    policia: "Policiamento (descarta)",
  };
  const row = (m: Mode, i: number, mark?: "hit" | "warn" | "bad") =>
    c.row(
      "comparar",
      i,
      [label[m], m === "policia" ? "0 ms" : ms(delay(m)), String(drops(m)), String(peak(m))],
      {
        dt: 1,
        ...(mark ? { mark } : {}),
        log: {
          who: label[m],
          what: `atraso ${delay(m)} ms`,
          detail: `pico ${peak(m)}, descartes ${drops(m)}`,
        },
      },
    );
  const plot = (m: Mode, series: string, role: "a" | "b" | "warn" | "bad" | "muted") =>
    runs[m].forEach((x) => {
      c.plot("acumulado", series, x.t, x.outTotal, {
        role,
        dt: x.t === 0 ? 1 : 0,
        label: `${series}, ${x.t} ms: ${x.outTotal}`,
      });
    });

  b.step(
    {
      id: "s1-rajada",
      title: "Tráfego em rajadas",
      subtitle: `${pac(ARRIVALS[0] ?? 0)} de uma vez`,
      text: `Um computador quase nunca manda dados em ritmo constante: abre uma página e despeja ${ARRIVALS[0]} pacotes de uma vez, depois fica quieto, depois manda mais ${ARRIVALS[10]} e ${ARRIVALS[20]}. A linha de saída aguenta ${LINE} por ms, então sem controle a primeira rajada sai em ${Math.ceil((ARRIVALS[0] ?? 0) / LINE)} ms, a ${LINE} por ms. Para a rede do provedor, que combinou com o cliente uma média bem menor, uma rajada assim enche filas e atrasa todo mundo. A linha cinza do gráfico é tudo que chegou ao roteador do cliente.`,
      facts: [
        ["Rajadas", ARRIVALS.filter((x) => x).join(", ")],
        ["Linha", `${LINE} por ms`],
        ["Pico sem controle", `${peak("sem")} por ms`],
      ],
      highlight: [],
    },
    () => {
      runs.sem.forEach((x) => {
        c.plot("acumulado", "chegou", x.t, x.inTotal, {
          role: "muted",
          dt: x.t === 0 ? 1 : 0,
          label: `chegou até ${x.t} ms: ${x.inTotal}`,
        });
      });
      row("sem", 0, "bad");
    },
  );

  b.step(
    {
      id: "s2-furado",
      title: "Um balde furado",
      subtitle: `${rate} por ms, sempre`,
      text: `A primeira ideia é um balde com um furo: os pacotes entram por cima, em qualquer ritmo, e saem pelo furo a ${rate} por ms, nem mais nem menos. Quem chega com o balde cheio espera. A saída fica lisa, exatamente na média combinada, mas a rajada de ${ARRIVALS[0]} leva ${Math.ceil((ARRIVALS[0] ?? 0) / rate)} ms para passar, e o último pacote espera ${ms(delay("furado"))}, mesmo com a linha ociosa a maior parte do tempo. Ser rígido assim desperdiça a linha.`,
      facts: [
        ["Saída", `${rate} por ms`],
        ["Maior atraso", ms(delay("furado"))],
        ["Pico", `${peak("furado")} por ms`],
      ],
      highlight: [],
    },
    () => {
      plot("furado", "furado", "warn");
      row("furado", 1, "warn");
      c.count("atraso", ms(delay("furado")), { dt: 0, role: "warn" });
    },
  );

  b.step(
    {
      id: "s3-fichas",
      title: "Fichas guardadas",
      subtitle: `${rate} fichas por ms, cabem ${bucket}`,
      text: `O [[balde-de-fichas]] inverte a ideia: o balde guarda fichas, não pacotes. Entra uma ficha a cada ${dec(1 / rate, 2)} ms, ${rate} por ms, e cabem no máximo ${bucket}; cada pacote só sai gastando uma. Quem ficou quieto juntou fichas e pode mandar uma rajada curta de até ${bucket} na velocidade da linha. Assim, no ms 0, saem ${first.sent} dos ${first.arrived} pacotes; os outros ${first.queued} esperam fichas novas. Na média, ninguém passa de ${rate} por ms.`,
      facts: [
        ["Fichas por ms", String(rate)],
        ["Balde", String(bucket)],
        ["Saem no ms 0", String(first.sent)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `O balde começa cheio, com ${bucket} fichas, e chegam ${first.arrived} pacotes no ms 0. A linha aguenta ${LINE} por ms. Quantos saem no ms 0?`,
        answer: first.sent,
        explain: `O menor entre os pacotes que chegaram (${first.arrived}), as fichas (${bucket}) e a linha (${LINE}): ${first.sent}.`,
      },
    },
    () => {
      plot("fichas", "fichas", "a");
      c.count("fichas", String(first.tokens), {
        dt: 0,
        role: "a",
        label: `no ms 0 sobram ${first.tokens} fichas`,
      });
      c.count("fila", String(first.queued), {
        dt: 0,
        role: "warn",
        label: `${first.queued} na fila no ms 0`,
      });
      row("fichas", 2, "hit");
    },
  );

  b.step(
    {
      id: "s4-curvas",
      title: "Ler as duas curvas",
      subtitle: `Fila de até ${pac(maxQ)}`,
      text: `No gráfico, a distância vertical entre a curva cinza, o que chegou, e a azul, o que saiu, é a fila naquele instante: no máximo ${pac(maxQ)}. A distância horizontal é o atraso: o último pacote da primeira rajada sai ${ms(delay("fichas"))} depois de chegar, contra ${ms(delay("furado"))} no balde furado. ${Number.isFinite(burst) ? `Com o balde cheio, a linha pode correr a ${LINE} por ms durante ${bucket} ÷ (${LINE} − ${rate}) = ${dec(burst)} ms.` : "Com fichas tão rápidas quanto a linha, não há limite de rajada."}`,
      facts: [
        ["Fila máxima", pac(maxQ)],
        ["Maior atraso", ms(delay("fichas"))],
        ["Rajada a toda", Number.isFinite(burst) ? `${dec(burst)} ms` : "sem limite"],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: "No gráfico de pacotes acumulados, onde se lê o atraso de um pacote?",
        options: [
          "Na distância horizontal entre a curva de chegada e a de saída",
          "Na distância vertical entre as curvas",
          "Na inclinação da curva de chegada",
        ],
        answer: 0,
        explain:
          "A vertical mostra quantos pacotes estão esperando; a horizontal, quanto tempo separa a chegada da saída do mesmo pacote.",
      },
    },
    () => {
      c.count("fila", String(maxQ), { role: "warn", label: `fila máxima ${maxQ}` });
      c.count("atraso", ms(delay("fichas")), { dt: 0, role: "a" });
    },
  );

  b.step(
    {
      id: "s5-policia",
      title: "Descartar em vez de esperar",
      subtitle: `${pac(drops("policia"))} descartados`,
      text: `O provedor, do lado dele, nem sempre tem fila para segurar o excesso do cliente. Ele aplica o mesmo balde de fichas como policiamento: pacote sem ficha é descartado na hora, ou marcado como descartável se a rede apertar. Com ${rate} fichas por ms e balde de ${bucket}, ${pac(drops("policia"))} dos ${TOTAL} se perdem, e o TCP do cliente percebe as perdas e diminui o ritmo. Por isso vale moldar o tráfego antes de sair: esperar um pouco custa menos que perder e retransmitir.`,
      facts: [
        ["Descartados", `${drops("policia")} de ${TOTAL}`],
        ["Atraso", "nenhum"],
        ["Quem sente", "o TCP do cliente"],
      ],
      highlight: [],
    },
    () => {
      plot("policia", "policiado", "bad");
      row("policia", 3, "bad");
      c.count("descartes", String(drops("policia")), { dt: 0, role: "bad" });
    },
  );

  b.step(
    {
      id: "s6-pratica",
      title: "Onde isso aparece",
      subtitle: "Provedores, roteadores e o Linux",
      text: `Planos de internet são vendidos como uma taxa, mas o equipamento do provedor quase sempre aplica um balde de fichas: uma taxa média e um tamanho de rajada, que explica por que um teste de velocidade curto às vezes mostra mais que o contratado. Roteadores de empresa moldam o tráfego de saída para o que o enlace aguenta, e o Linux tem um filtro de balde de fichas pronto para isso. Em QoS, os dois números, taxa e balde, são o contrato.`,
      facts: [
        ["Contrato", "taxa média + rajada"],
        ["Moldar", "fila, atraso"],
        ["Policiar", "descarte, sem atraso"],
      ],
      highlight: [],
    },
    () => {
      c.note("comparar", "Taxa e balde são o contrato", "good", { dt: 1 });
    },
  );

  return b.done({
    first: first.sent,
    queue: maxQ,
    delayTb: delay("fichas"),
    delayLeaky: delay("furado"),
    drops: drops("policia"),
    burst: Number.isFinite(burst) ? dec(burst) : "sem limite",
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "balde-de-fichas",
    site: "redes",
    title: "Balde de fichas: moldar rajadas",
    summary:
      "Tráfego em rajadas, o balde furado que alisa tudo, o balde de fichas que permite rajadas curtas e segura a média, o policiamento que descarta e como ler fila e atraso nas curvas acumuladas.",
    area: "Rede",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 5,
        section: "5.3.2",
        note: "Modelagem de tráfego: leaky bucket e token bucket",
        verified: true,
      },
    ],
    simplifications: [
      "Tempo em passos de 1 ms e pacotes todos do mesmo tamanho.",
      "O balde começa cheio e as fichas entram de uma vez no início de cada ms.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "taxa", kind: "int", label: "Fichas por ms", min: 1, max: LINE },
      { key: "balde", kind: "int", label: "Tamanho do balde", min: 1, max: TOTAL },
    ],
  },
  build,
  intro: {
    text: "Um provedor vende uma taxa média, mas os clientes mandam dados em rajadas. Você vai passar as mesmas rajadas por um balde furado, por um balde de fichas e por um policial que descarta, e ler fila e atraso direto no gráfico.",
    facts: [
      ["Pacotes", String(TOTAL)],
      ["Fichas", `${DEFAULTS.taxa} por ms`],
      ["Balde", String(DEFAULTS.balde)],
    ],
  },
  outro: {
    title: "Balde de fichas em resumo",
    text: "O balde furado entrega uma taxa constante e atrasa as rajadas. O balde de fichas guarda até b fichas, que entram a uma taxa r: rajadas curtas passam na velocidade da linha e, na média, ninguém passa de r. Aplicado como policiamento, descarta o que não tem ficha. Nas curvas acumuladas, a fila é a distância vertical e o atraso, a horizontal.",
    facts: (run) => [
      ["Saem no ms 0", String(run.stats.first)],
      ["Maior atraso", `${run.stats.delayTb} ms`],
      ["Descartados", String(run.stats.drops)],
    ],
  },
  next: ["congestionamento", "roteamento"],
};

export default lesson;
