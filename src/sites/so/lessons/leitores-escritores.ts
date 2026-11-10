import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import { type RwPolicy, type RwResult, runRw, scenario } from "../../../sim/os/rw.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Readers-writers: one mutex serializes everything; letting readers share speeds up but can starve
 * writers; giving writers priority (or a fair queue) bounds their wait.
 */
export const DEFAULTS = { leitores: 5, leitura: 4 };
const GANTT_W = 880;
const POLICIES: { p: RwPolicy; name: string; short: string }[] = [
  { p: "mutex", name: "Mutex único", short: "Mutex" },
  { p: "leitores", name: "Leitores primeiro", short: "L. 1º" },
  { p: "escritores", name: "Escritores primeiro", short: "E. 1º" },
  { p: "justo", name: "Fila justa", short: "Fila justa" },
];
const lanes = (short: string) => [`${short} lê`, `${short} escreve`];

function clamp(p: Params) {
  const n = Math.min(6, Math.max(2, Math.round(Number(p.leitores ?? DEFAULTS.leitores))));
  const dur = Math.min(6, Math.max(2, Math.round(Number(p.leitura ?? DEFAULTS.leitura))));
  return { n, dur };
}

function runAll(p: Params) {
  const { n, dur } = clamp(p);
  const reqs = scenario(n, dur);
  const runs = POLICIES.map((x) => ({ ...x, r: runRw(reqs, x.p) }));
  return { n, dur, reqs, runs, span: Math.max(...runs.map((x) => x.r.total)) };
}

function sceneFor(p: Params): SceneSpec {
  const { reqs, span } = runAll(p);
  return {
    viewBox: [960, 540],
    nodes: [],
    links: [],
    widgets: [
      {
        kind: "gantt",
        id: "tempo",
        title: "Quem usa a tabela a cada tick · L. 1º = leitores primeiro · E. 1º = escritores primeiro",
        at: [40, 40],
        lanes: POLICIES.slice(0, 3).flatMap((x) => lanes(x.short)),
        span,
        width: GANTT_W,
      },
      {
        kind: "table",
        id: "pedidos",
        title: "Pedidos",
        at: [40, 290],
        columns: ["Pedido", "Tipo", "Chega", "Dura"],
        widths: [70, 90, 60, 60],
        rows: reqs.length,
      },
      {
        kind: "table",
        id: "res",
        title: "Resultado por política",
        at: [380, 290],
        columns: ["Política", "Total", "Lendo juntos", "Espera E1", "Maior espera"],
        widths: [140, 60, 100, 80, 100],
        rows: POLICIES.length,
      },
    ],
  };
}

const worst = (r: RwResult) => r.done.reduce((m, d) => (d.wait > m.wait ? d : m));
const waitOf = (r: RwResult, id: string) => r.done.find((d) => d.id === id)?.wait ?? 0;
const ticks = (k: number) => (k === 1 ? "1 tick" : `${k} ticks`);

export function build(p: Params) {
  const { n, dur, reqs, runs, span } = runAll(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const scale = (GANTT_W - 92) / span;
  const [mutex, readers, writers, fair] = runs as [
    (typeof runs)[number],
    (typeof runs)[number],
    (typeof runs)[number],
    (typeof runs)[number],
  ];

  // Consecutive ticks with the same set of readers (or the same writer) become one bar.
  const draw = (i: number) => {
    const x = runs[i] as (typeof runs)[number];
    const [readLane, writeLane] = lanes(x.short);
    type Seg = { lane: string; from: number; to: number; ids: string[]; role: Role };
    const segs: Seg[] = [];
    for (const k of x.r.ticks) {
      const ids = x.r.done.filter((d) => d.kind === "R" && d.start <= k.t && k.t < d.end).map((d) => d.id);
      const cur: [string, string[], Role][] = [];
      if (ids.length) cur.push([readLane as string, ids, "a"]);
      if (k.writer) cur.push([writeLane as string, [k.writer], "b"]);
      for (const [lane, who, role] of cur) {
        const last = segs.findLast((s) => s.lane === lane);
        if (last && last.to === k.t && last.ids.join() === who.join()) last.to = k.t + 1;
        else segs.push({ lane, from: k.t, to: k.t + 1, ids: who, role });
      }
    }
    segs.sort((a, b) => a.from - b.from);
    for (const s of segs) {
      const full = s.ids.join(" ");
      const fits = (s.to - s.from) * scale - 8 >= full.length * 7;
      const t = c.t + 1;
      c.at(t);
      b.ev({
        t,
        kind: "gantt",
        lane: s.lane,
        from: s.from,
        to: s.to,
        item: fits ? full : String(s.ids.length),
        itemRole: s.role,
        role: s.role,
        label: `${x.name}, ticks ${s.from} a ${s.to}: ${s.role === "a" ? `${full} lendo` : `${full} escrevendo`}`,
        row: {
          cols: {
            t: `${s.from}–${s.to}`,
            who: x.name,
            what: s.role === "a" ? "lê" : "escreve",
            detail: full,
          },
        },
      });
    }
    const w = worst(x.r);
    c.row(
      "res",
      i,
      [x.name, ticks(x.r.total), String(x.r.maxReaders), ticks(waitOf(x.r, "E1")), `${w.id}: ${w.wait}`],
      {
        dt: 1,
        mark: "new",
      },
    );
  };

  b.step(
    {
      id: "s1-problema",
      title: "Ler junto, escrever sozinho",
      subtitle: `${n} leitores e 2 escritores`,
      text: `Uma tabela compartilhada recebe dois tipos de acesso. Leitores só consultam, então vários podem ler ao mesmo tempo sem estragar nada. Um escritor altera os dados e precisa da tabela sozinho: nem outro escritor, nem leitores lendo um estado pela metade. Os pedidos chegam ao longo do tempo: leitores a cada 2 ticks, cada um lendo por ${ticks(dur)}, e dois escritores, E1 e E2, de 2 ticks cada.`,
      facts: [
        ["Leitores", String(n)],
        ["Leitura", ticks(dur)],
        ["Escrita", "2 ticks"],
      ],
      highlight: [],
    },
    () => {
      reqs.forEach((r, i) => {
        c.row("pedidos", i, [r.id, r.kind === "R" ? "leitor" : "escritor", String(r.arrive), String(r.dur)], {
          dt: i === 0 ? 1 : 0,
          mark: "new",
        });
      });
    },
  );

  b.step(
    {
      id: "s2-mutex",
      title: "Um mutex para tudo",
      subtitle: `${ticks(mutex.r.total)} no total`,
      text: `A solução mais segura protege a tabela com um único [[mutex]], na ordem de chegada. Ninguém lê dado pela metade, mas também nenhum leitor lê junto com outro: cada um espera o anterior terminar, e o último pedido só acaba no tick ${mutex.r.total}. O mutex trata todo acesso como escrita e desperdiça o fato de que leituras não conflitam entre si.`,
      facts: [
        ["Tempo total", ticks(mutex.r.total)],
        ["Leitores juntos", String(mutex.r.maxReaders)],
        ["Maior espera", `${worst(mutex.r).id}, ${ticks(worst(mutex.r).wait)}`],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: "Com um único mutex, em que tick termina o último pedido?",
        answer: mutex.r.total,
        explain:
          mutex.r.total === n * dur + 4
            ? `Tudo em fila, sem pausa: ${n} leituras de ${dur} mais 2 escritas de 2 dão ${n * dur + 4} ticks.`
            : `As ${n} leituras de ${dur} e as 2 escritas de 2 somam ${n * dur + 4} ticks; o resto é tempo ocioso esperando o próximo pedido chegar.`,
      },
    },
    () => draw(0),
  );

  b.step(
    {
      id: "s3-leitores",
      title: "Leitores entram juntos",
      subtitle: `${ticks(readers.r.total)} no total`,
      text: `A solução clássica é uma [[trava-leitura-escrita]] que conta os leitores ativos. O primeiro a chegar trava a tabela contra escritores e o último a sair a libera, com o contador protegido por um mutex próprio. Enquanto houver leitura, um novo leitor entra direto. ${readers.r.maxReaders > 1 ? `Até ${readers.r.maxReaders} leitores dividem a tabela` : "Com leituras curtas, nenhum leitor chega a encontrar outro lendo"} e tudo termina no tick ${readers.r.total}${readers.r.total < mutex.r.total ? `, ${ticks(mutex.r.total - readers.r.total)} antes do mutex único` : ""}.`,
      facts: [
        ["Tempo total", ticks(readers.r.total)],
        ["Leitores juntos", String(readers.r.maxReaders)],
        ["Contador", "primeiro trava, último libera"],
      ],
      highlight: [],
    },
    () => draw(1),
  );

  const e1 = waitOf(readers.r, "E1");
  const e1Start = readers.r.done.find((d) => d.id === "E1")?.start ?? 0;
  // starved: E1 only got in after every reader had finished
  const starved = readers.r.done.every((d) => d.kind === "W" || d.end <= e1Start);
  b.step(
    {
      id: "s4-inanicao",
      title: "O escritor que não entra",
      subtitle: `E1 espera ${ticks(e1)}`,
      text: starved
        ? `Veja a faixa de escrita: E1 chegou no tick 1, mas sempre havia um leitor lendo quando outro chegava, e a leitura nunca parou. E1 só entra no tick ${e1Start}, depois de ${ticks(e1)} de espera. Com leitores chegando sem parar, a espera não tem limite: é [[inanicao]] do escritor, causada pela própria regra que acelerou a leitura.`
        : `Veja a faixa de escrita: E1 chegou no tick 1 e entrou no tick ${e1Start}, depois de ${ticks(e1)}. Aqui as leituras são curtas e houve um instante sem leitor. Com leituras longas que se sobrepõem, a fila de leitores nunca esvazia e o escritor espera sem limite: é [[inanicao]], causada pela própria regra que acelera a leitura.`,
      facts: [
        ["E1 chega", "tick 1"],
        ["E1 entra", `tick ${e1Start}`],
        ["Espera de E1", ticks(e1)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: "Com leitores primeiro, quantos ticks E1 espera para entrar?",
        answer: e1,
        explain: `E1 chega no tick 1 e só encontra a tabela livre no tick ${e1Start}: ${e1Start} − 1 = ${e1}.`,
      },
    },
    () => {
      c.row(
        "res",
        1,
        [
          readers.name,
          ticks(readers.r.total),
          String(readers.r.maxReaders),
          ticks(e1),
          `${worst(readers.r).id}: ${worst(readers.r).wait}`,
        ],
        { dt: 1, mark: starved ? "bad" : "warn" },
      );
    },
  );

  const w1 = waitOf(writers.r, "E1");
  const wr = worst(writers.r);
  b.step(
    {
      id: "s5-escritores",
      title: "Escritores furam a fila",
      subtitle: `E1 espera ${ticks(w1)}`,
      text: `A variante oposta: se há escritor esperando, um leitor novo não entra, mesmo com outros lendo. Os leitores que já estão dentro terminam e o escritor passa. E1 espera ${w1 < e1 ? "só " : ""}${ticks(w1)}, e os leitores barrados entram depois. O custo muda de lado: agora a maior espera é de ${wr.id}, ${ticks(wr.wait)}, e uma sequência contínua de escritores deixaria os leitores sem vez.`,
      facts: [
        ["Espera de E1", ticks(w1)],
        ["Leitores juntos", String(writers.r.maxReaders)],
        ["Maior espera", `${wr.id}, ${ticks(wr.wait)}`],
      ],
      highlight: [],
    },
    () => draw(2),
  );

  const same = fair.r.done.every((d) => {
    const o = writers.r.done.find((x) => x.id === d.id);
    return o?.start === d.start;
  });
  b.step(
    {
      id: "s6-justo",
      title: "Uma fila justa",
      subtitle: "Ordem de chegada, leitores em grupo",
      text: `Para que ninguém espere sem limite, a trava atende pela ordem de chegada e só deixa entrar juntos os leitores que estão em sequência no início da fila. ${same ? "Neste cenário o resultado coincide com escritores primeiro, mas a garantia é outra" : `Ela termina em ${ticks(fair.r.total)}, contra ${ticks(writers.r.total)} de escritores primeiro. Perde um pouco de paralelismo, mas ganha uma garantia`}: um escritor espera só quem chegou antes dele, e um leitor também. As travas de leitura e escrita dos sistemas reais seguem alguma dessas regras.`,
      facts: [
        ["Tempo total", ticks(fair.r.total)],
        ["Espera de E1", ticks(waitOf(fair.r, "E1"))],
        ["Maior espera", `${worst(fair.r).id}, ${ticks(worst(fair.r).wait)}`],
      ],
      highlight: [],
    },
    () => {
      const w = worst(fair.r);
      c.row(
        "res",
        3,
        [
          fair.name,
          ticks(fair.r.total),
          String(fair.r.maxReaders),
          ticks(waitOf(fair.r, "E1")),
          `${w.id}: ${w.wait}`,
        ],
        { dt: 1, mark: "hit" },
      );
    },
  );

  return b.done({
    mutex: mutex.r.total,
    readers: readers.r.total,
    maxReaders: readers.r.maxReaders,
    e1Starved: e1,
    e1Writers: w1,
    worstWriters: `${wr.id}:${wr.wait}`,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "leitores-escritores",
    site: "so",
    title: "Leitores e escritores",
    summary:
      "Leituras podem dividir um recurso, escritas não. Um mutex único é lento, deixar leitores entrarem juntos acelera mas pode deixar o escritor esperando para sempre, e a prioridade decide quem paga.",
    area: "Concorrência",
    refs: [
      {
        book: "tanenbaum-mos",
        chapter: 2,
        section: "2.5.2",
        note: "O problema dos leitores e escritores",
        verified: true,
      },
      {
        book: "maziero-so",
        chapter: 12,
        section: "12.2",
        note: "Leitores/escritores, solução simplista e com priorização dos leitores",
        verified: true,
      },
    ],
    simplifications: [
      "O tempo é contado em ticks inteiros e cada pedido dura um número fixo deles.",
      "Quem termina num tick libera a tabela antes de o próximo entrar no mesmo tick.",
      "Os pedidos chegam num padrão fixo; no laboratório você muda a quantidade e a duração das leituras.",
    ],
  },
  scene: sceneFor,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "leitores", kind: "int", label: "Leitores", min: 2, max: 6 },
      {
        key: "leitura",
        kind: "int",
        label: "Duração de cada leitura (ticks)",
        min: 2,
        max: 6,
        help: "Leitores chegam a cada 2 ticks; com leituras de mais de 2 ticks, elas se sobrepõem.",
      },
    ],
  },
  build,
  intro: {
    text: "Várias threads consultam uma tabela e algumas a alteram. Ler junto é seguro, escrever não. Você vai comparar um mutex único com duas formas de deixar leitores entrarem juntos e ver quem fica esperando em cada uma.",
    facts: [
      ["Leitores", String(DEFAULTS.leitores)],
      ["Escritores", "2"],
      ["Políticas", String(POLICIES.length)],
    ],
  },
  outro: {
    title: "Leitores e escritores em resumo",
    text: "Leituras não conflitam entre si, então uma trava de leitura e escrita deixa vários leitores entrarem juntos. A prioridade decide quem pode esperar sem limite: com leitores primeiro, o escritor; com escritores primeiro, os leitores. Uma fila por ordem de chegada limita a espera dos dois.",
    facts: (run) => [
      ["Mutex único", `${run.stats.mutex} ticks`],
      ["Leitores primeiro", `${run.stats.readers} ticks`],
      ["E1 com leitores primeiro", `espera ${run.stats.e1Starved}`],
    ],
  },
  next: ["filosofos", "condicao-de-corrida"],
};

export default lesson;
