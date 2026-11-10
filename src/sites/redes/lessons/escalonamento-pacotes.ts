import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import { type Packet, type Policy, type Sent, schedule } from "../../../sim/net/pktsched.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Packet scheduling at the library's uplink: a backup burst (six 1500-byte packets) and a call
 * (200-byte packets every 2 ms) share one link of 1 byte/µs under FIFO, fair queueing and
 * DiffServ strict priority.
 */
const BULK = 6;
const VOICE = 4;
const HEADER = 40;
const DEFAULTS = { pacote: 1500 };

const sizeOf = (p: Params) =>
  Math.min(1500, Math.max(600, Math.round(Number(p.pacote ?? DEFAULTS.pacote) / 300) * 300));

/** The backup is the same bytes either way: `count` packets of `size` bytes. */
function packets(size: number, count: number): Packet[] {
  return [
    ...Array.from({ length: count }, (_, i) => ({ id: `B${i + 1}`, flow: "backup", size, arrival: 0 })),
    ...Array.from({ length: VOICE }, (_, i) => ({
      id: `V${i + 1}`,
      flow: "voz",
      size: 200,
      arrival: i * 2000 + 100,
    })),
  ];
}

const PRIO: Policy = { kind: "prio", rank: { voz: 0, backup: 1 } };
const POLICIES: { lane: string; pol: Policy; split?: boolean }[] = [
  { lane: "FIFO", pol: { kind: "fifo" } },
  { lane: "Fila justa", pol: { kind: "fq", weight: {} } },
  { lane: "Prioridade (EF)", pol: PRIO },
  { lane: "EF em pedaços", pol: PRIO, split: true },
];

function runsFor(size: number) {
  return POLICIES.map((p) => schedule(p.split ? packets(size / 3, BULK * 3) : packets(size, BULK), p.pol));
}

function scene(p: Params): SceneSpec {
  const span = Math.max(...runsFor(sizeOf(p)).map((r) => Math.max(...r.map((s) => s.end)))) / 1000;
  return {
    viewBox: [960, 560],
    nodes: [],
    links: [],
    widgets: [
      {
        kind: "gantt",
        id: "enlace",
        title: "O que sai pelo enlace (ms)",
        at: [40, 40],
        lanes: POLICIES.map((p) => p.lane),
        span,
        width: 880,
      },
      {
        kind: "table",
        id: "atraso",
        title: "Atraso da voz (chegada até sair)",
        at: [40, 250],
        columns: ["Política", "Pior atraso", "Atraso do backup no fim"],
        widths: [260, 160, 240],
        rows: 4,
      },
    ],
  };
}

const ms = (us: number) => `${String(us / 1000).replace(".", ",")} ms`;

export function build(p: Params = DEFAULTS) {
  const size = sizeOf(p);
  const small = size / 3;
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const runs = runsFor(size);
  const worst = (r: Sent[], flow: string) =>
    Math.max(...r.filter((s) => s.flow === flow).map((s) => s.delay));
  let seq = 0;
  const draw = (k: number) => {
    const lane = (POLICIES[k] as { lane: string }).lane;
    for (const s of runs[k] as Sent[]) {
      seq += 1;
      const role: Role = s.flow === "voz" ? "b" : "a";
      b.ev({
        t: seq,
        kind: "gantt",
        gantt: "enlace",
        lane,
        from: s.start / 1000,
        to: s.end / 1000,
        item: s.id,
        itemRole: role,
        role,
        label: `${s.id} de ${ms(s.start)} a ${ms(s.end)}`,
        row: { cols: { t: ms(s.start), who: lane, what: s.id, detail: `espera total ${ms(s.delay)}` } },
      });
    }
    c.at(seq);
    const r = runs[k] as Sent[];
    c.row("atraso", k, [lane, ms(worst(r, "voz")), ms(worst(r, "backup"))], {
      dt: 1,
      mark: worst(r, "voz") > 5000 ? "bad" : "hit",
      log: { who: lane, what: `voz até ${ms(worst(r, "voz"))}`, detail: "" },
    });
    seq = c.t;
  };
  const fifo = worst(runs[0] as Sent[], "voz");
  const fq = worst(runs[1] as Sent[], "voz");
  const prio = worst(runs[2] as Sent[], "voz");
  const bulkEnd = Math.max(...(runs[1] as Sent[]).filter((s) => s.flow === "backup").map((s) => s.end));
  const firstV = (runs[1] as Sent[]).find((s) => s.id === "V1") as Sent;
  const split = worst(runs[3] as Sent[], "voz");

  b.step(
    {
      id: "s1-fifo",
      title: "Uma fila só",
      subtitle: `Voz espera até ${ms(fifo)}`,
      text: `Na saída da biblioteca, um backup despeja ${BULK} pacotes de ${size} bytes de uma vez, e uma chamada de voz manda 200 bytes a cada 2 ms. O enlace transmite 1 byte por µs, então cada pacote do backup ocupa ${ms(size)}. Numa fila FIFO, a voz entra atrás do backup inteiro: o primeiro pacote de voz espera ${ms(fifo)}. Para uma conversa, atrasos acima de algumas dezenas de ms já atrapalham, e eles se somam a cada roteador.`,
      facts: [
        ["Backup", `${BULK} × ${size} bytes`],
        ["Voz", "200 bytes a cada 2 ms"],
        ["Pior atraso da voz", ms(fifo)],
      ],
      highlight: [],
    },
    () => draw(0),
  );

  b.step(
    {
      id: "s2-justo",
      title: "Uma fila por fluxo",
      subtitle: `Voz espera até ${ms(fq)}`,
      text: `O [[enfileiramento-justo]] dá a cada fluxo a sua fila e alterna entre elas por bytes, não por pacotes: cada pacote recebe uma etiqueta de término, a do pacote anterior do fluxo mais o tamanho, e sai o de menor etiqueta. A voz usa pouco e tem etiquetas pequenas, então passa à frente do backup. O pior atraso cai para ${ms(fq)}; o backup termina no mesmo ${ms(bulkEnd)}, porque o enlace nunca ficou parado.`,
      facts: [
        ["Pior atraso da voz", ms(fq)],
        ["Backup termina", ms(bulkEnd)],
        ["Critério", "menor etiqueta"],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: `V1 chega em 0,1 ms e tem a menor etiqueta. Por que só sai em ${ms(firstV.start)}?`,
        options: [
          "B1 já estava sendo transmitido e não é interrompido",
          "A fila justa sempre começa pelo fluxo maior",
          "A voz precisa esperar o próprio intervalo de 2 ms",
        ],
        answer: 0,
        explain: `Nenhum escalonador corta um pacote no meio: V1 espera B1 terminar em ${ms(firstV.start)}. Por isso pacotes grandes limitam o atraso mínimo.`,
      },
    },
    () => draw(1),
  );

  b.step(
    {
      id: "s3-diffserv",
      title: "Classes em vez de fluxos",
      subtitle: `Voz espera até ${ms(prio)}`,
      text: `Um roteador de núcleo vê milhões de fluxos, e manter uma fila por fluxo custa caro. O [[diffserv]] troca fluxos por poucas classes: o telefone marca os pacotes com o código EF, 46, no campo [[dscp]] do cabeçalho IP, e o roteador dá prioridade estrita a essa classe. O pior atraso fica em ${ms(prio)}, como na fila justa, com só duas filas. O risco é a classe prioritária abafar as outras, então a rede limita a taxa que entra marcada como EF.`,
      facts: [
        ["Marca", "DSCP EF = 46"],
        ["Filas", "2 classes"],
        ["Pior atraso da voz", ms(prio)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt:
          "Com prioridade estrita, V1 chega em 0,1 ms, logo depois de B1 começar a sair. Qual é o atraso de V1, da chegada até o fim do envio, em ms?",
        answer: prio / 1000,
        tolerance: 0.05,
        unit: "ms",
        explain: `V1 espera B1 terminar em ${ms(size)} e leva 0,2 ms para sair: ${ms(size)} − 0,1 ms + 0,2 ms = ${ms(prio)}. A prioridade não interrompe o pacote em curso.`,
      },
    },
    () => draw(2),
  );

  b.step(
    {
      id: "s4-pedacos",
      title: "Pacotes menores, espera menor",
      subtitle: `Voz espera até ${ms(split)}`,
      text: `Mesmo com prioridade, a voz espera o pacote do backup que já está saindo. Se o backup mandar os mesmos bytes em ${BULK * 3} pacotes de ${small} bytes, cada um ocupa só ${ms(small)}, e o pior atraso da voz cai de ${ms(prio)} para ${ms(split)}. O preço é o cabeçalho: ${BULK * 2} pacotes a mais, com ${HEADER} bytes cada, são ${BULK * 2 * HEADER} bytes extras. Enlaces lentos cortam pacotes grandes por isso.`,
      facts: [
        ["Pedaços do backup", `${BULK * 3} × ${small} bytes`],
        ["Pior atraso da voz", ms(split)],
        ["Cabeçalhos extras", `${BULK * 2 * HEADER} bytes`],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: "Por que pacotes menores do backup ajudam a voz mesmo com prioridade estrita?",
        options: [
          "A voz espera no máximo um pacote do backup, e ele fica mais curto",
          "Pacotes menores dão ao backup uma prioridade menor",
          "O roteador passa a interromper pacotes pequenos",
        ],
        answer: 0,
        explain: `O pacote em curso nunca é cortado; o que limita a espera é o tamanho dele. Com ${small} bytes, a espera máxima cai para ${ms(split)}.`,
      },
    },
    () => draw(3),
  );

  return b.done(
    { fifo, fq, prio, split, bulkEnd },
    size === DEFAULTS.pacote
      ? []
      : [
          `Com pacotes de backup de ${size} bytes, a voz espera até ${ms(fifo)} com FIFO e ${ms(prio)} com prioridade.`,
        ],
  );
}

const lesson: LessonModule = {
  meta: {
    slug: "escalonamento-pacotes",
    site: "redes",
    title: "Escalonamento de pacotes: FIFO, fila justa e DiffServ",
    summary:
      "Uma chamada de voz atrás de um backup: quanto ela espera numa fila só, com fila justa e com prioridade.",
    area: "Rede",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 5,
        section: "5.4.3",
        note: "Escalonamento de pacotes",
        verified: true,
      },
      {
        book: "tanenbaum-cn",
        chapter: 5,
        section: "5.4.5",
        note: "Serviços diferenciados",
        verified: true,
      },
      { rfc: 3246, note: "Expedited Forwarding (EF)" },
    ],
    simplifications: [
      "A fila justa é a variante com relógio próprio (SCFQ), mais simples que o WFQ completo.",
      "O enlace transmite 1 byte por µs (8 Mbit/s) e não há perdas nem limite de fila.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "pacote", kind: "int", label: "Pacote do backup (bytes)", min: 600, max: 1500, step: 300 },
    ],
  },
  build,
  intro: {
    text: "Quando dois fluxos disputam o mesmo enlace, a ordem em que o roteador manda os pacotes decide quem espera. Você vai comparar três políticas com o mesmo tráfego: um backup grande e uma chamada de voz.",
    facts: [
      ["Enlace", "1 byte por µs"],
      ["Backup", `${BULK} pacotes de ${DEFAULTS.pacote} B`],
      ["Voz", `${VOICE} pacotes de 200 B`],
    ],
  },
  outro: {
    title: "Escalonamento em resumo",
    text: "FIFO faz quem chega depois esperar por tudo o que já está na fila. A fila justa reparte o enlace por bytes e protege fluxos pequenos; o DiffServ obtém o mesmo para a voz com poucas classes marcadas no cabeçalho, e pacotes menores encurtam a espera que nenhuma política evita.",
    facts: (run) => [
      ["Voz com FIFO", ms(Number(run.stats.fifo))],
      ["Voz com fila justa", ms(Number(run.stats.fq))],
      ["Voz com EF", ms(Number(run.stats.prio))],
      ["Voz com EF e backup em pedaços", ms(Number(run.stats.split))],
    ],
  },
  next: ["balde-de-fichas", "red-ecn"],
};

export default lesson;
