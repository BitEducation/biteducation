import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import {
  bestCount,
  circuitTime,
  messageTime,
  overload,
  type Path,
  packetSlots,
  packetTime,
  packetTimeWithHeader,
} from "../../../sim/net/circuit.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { comutacao as practice } from "../practice.ts";

/**
 * Circuit vs message vs packet switching: Lia sends a 1 Mbit file across three 10 Mbit/s links.
 * Then the sharing argument (bursty users) and the cost of headers (best packet count).
 */
const PATH: Path = { links: 3, message: 1000, rate: 10, setup: 30 };
export const DEFAULTS = { pacotes: 4, cabecalho: 10 };
const MANY = 100;
const USERS = 35;
const ACTIVE = 0.1;
const FITS = 10;
const LANES = ["Circuito", "Mensagem 1", "Mensagem 2", "Mensagem 3", "Pacotes 1", "Pacotes 2", "Pacotes 3"];
const ROLES: Role[] = ["a", "b", "s3", "s4", "s5", "s6"];
const CURVE = [1, 2, 4, 7, 10, 14, 20, 30, 50, 75, 100];

function clamp(p: Params) {
  const n = Math.min(20, Math.max(1, Math.round(Number(p.pacotes ?? DEFAULTS.pacotes))));
  const h = Math.min(50, Math.max(1, Math.round(Number(p.cabecalho ?? DEFAULTS.cabecalho))));
  return { n, h };
}

const scene: SceneSpec = {
  viewBox: [960, 720],
  nodes: [],
  links: [],
  widgets: [
    {
      kind: "gantt",
      id: "tempo",
      title: "1 Mbit por três enlaces de 10 Mbit/s (ms; o número é o enlace)",
      at: [40, 40],
      lanes: LANES,
      span: messageTime(PATH),
      width: 880,
    },
    {
      kind: "table",
      id: "placar",
      title: "Tempo até o último bit chegar",
      at: [40, 330],
      columns: ["Comutação", "ms"],
      widths: [300, 100],
      rows: 5,
    },
    {
      kind: "table",
      id: "dividir",
      title: `Enlace que comporta ${FITS} usuários ativos`,
      at: [500, 330],
      columns: ["Comutação", "Usuários", "Risco de excesso"],
      widths: [140, 100, 180],
      rows: 2,
    },
    {
      kind: "chart",
      id: "cabecalho",
      title: "Com cabeçalho em cada pacote: tempo total (ms)",
      at: [500, 460],
      width: 400,
      height: 200,
      x: { label: "pacotes", max: MANY },
      y: { label: "ms", max: 320 },
    },
  ],
};

const pct = (x: number) => `${String(Math.round(x * 10000) / 100).replace(".", ",")}%`;
const dec = (x: number) => String(Math.round(x * 10) / 10).replace(".", ",");

export function build(p: Params) {
  const { n: N, h } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  let seq = 0;
  const bar = (lane: string, from: number, to: number, item: string, role: Role, detail: string) => {
    seq += 1;
    b.ev({
      t: seq,
      kind: "gantt",
      lane,
      from,
      to,
      item,
      itemRole: role,
      role,
      label: `${item}: ${dec(from)} a ${dec(to)} ms`,
      row: { cols: { t: `${dec(from)} ms`, who: lane, what: item, detail } },
    });
  };
  const sync = () => c.at(seq);
  const after = () => {
    seq = c.t;
  };
  const circ = circuitTime(PATH);
  const msg = messageTime(PATH);
  const pk = packetTime(PATH, N);
  const pkMany = packetTime(PATH, MANY);
  const tx = PATH.message / PATH.rate;
  const per = tx / N;
  const risk = overload(USERS, ACTIVE, FITS);
  const best = bestCount(PATH, h, MANY);
  const tBest = packetTimeWithHeader(PATH, best, h);
  const tMany = packetTimeWithHeader(PATH, MANY, h);
  const notes: string[] = [];
  if (N === 1)
    notes.push("Com 1 pacote, a comutação de pacotes é igual à de mensagem inteira: nada anda em paralelo.");

  b.step(
    {
      id: "s1-circuito",
      title: "Reservar o caminho inteiro",
      subtitle: `${circ} ms`,
      text: `Na [[comutacao-de-circuitos]], como na telefonia antiga, Lia primeiro reserva um caminho até o destino; o pedido leva ${PATH.setup} ms para atravessar a rede e voltar. Depois, os bits fluem direto, sem parar nos comutadores: 1 Mbit a 10 Mbit/s leva ${tx} ms. Total ${circ} ms. Enquanto o circuito existe, aquela fatia dos três enlaces é só dela, esteja ela enviando ou não.`,
      facts: [
        ["Estabelecimento", `${PATH.setup} ms`],
        ["Transmissão", `${tx} ms`],
        ["Total", `${circ} ms`],
      ],
      highlight: [],
    },
    () => {
      bar("Circuito", 0, PATH.setup, "reserva", "ctrl", "pedido de circuito");
      bar("Circuito", PATH.setup, circ, "arquivo", "a", "bits direto ao destino");
      sync();
      c.row("placar", 0, ["Circuito", String(circ)], { dt: 1, mark: "new" });
      after();
    },
  );

  b.step(
    {
      id: "s2-mensagem",
      title: "Mensagem inteira a cada salto",
      subtitle: `${msg} ms`,
      text: `Sem reserva, cada comutador faz [[armazena-e-encaminha]]: só repassa o que recebeu por inteiro. Se o arquivo vai como uma mensagem única, o primeiro comutador espera os ${tx} ms do arquivo todo antes de começar a repassar, e o segundo também. Os três enlaces trabalham um de cada vez, e o arquivo chega em ${msg} ms.`,
      facts: [
        ["Por enlace", `${tx} ms`],
        ["Enlaces", String(PATH.links)],
        ["Total", `${msg} ms`],
      ],
      highlight: [],
    },
    () => {
      for (let l = 0; l < PATH.links; l++)
        bar(LANES[1 + l] as string, l * tx, (l + 1) * tx, "arquivo", "warn", `enlace ${l + 1}`);
      sync();
      c.row("placar", 1, ["Mensagem inteira", String(msg)], { dt: 1, mark: "bad" });
      after();
    },
  );

  b.step(
    {
      id: "s3-pacotes",
      title: "Cortar em pacotes",
      subtitle: `${N} pacotes: ${dec(pk)} ms`,
      text: `Na [[comutacao-de-pacotes]], o arquivo vira ${N} pacotes de ${dec(per)} ms cada. Enquanto o segundo pacote atravessa o enlace 1, o primeiro já está no enlace 2: os enlaces trabalham ao mesmo tempo, como uma linha de montagem. O último pacote chega em ${dec(pk)} ms. Com ${MANY} pacotes seriam ${dec(pkMany)} ms, quase o tempo de transmitir uma vez só, sem precisar reservar nada.`,
      facts: [
        ["Pacotes", String(N)],
        ["Total", `${dec(pk)} ms`],
        [`Com ${MANY} pacotes`, `${dec(pkMany)} ms`],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Com ${N} pacotes e ${PATH.links} enlaces, cada pacote leva ${dec(per)} ms por enlace. Em quantos ms chega o último?`,
        answer: Math.round(pk * 10) / 10,
        tolerance: 0.1,
        unit: "ms",
        explain: `O último pacote sai do enlace 1 depois de ${N} tempos de pacote e ainda atravessa mais ${PATH.links - 1} enlaces: (${N} + ${PATH.links} − 1) × ${dec(per)} = ${dec(pk)} ms.`,
      },
    },
    () => {
      for (const s of packetSlots(PATH, N))
        bar(
          LANES[4 + s.link] as string,
          s.from,
          s.to,
          `P${s.packet + 1}`,
          ROLES[s.packet % ROLES.length] as Role,
          `pacote ${s.packet + 1}, enlace ${s.link + 1}`,
        );
      sync();
      c.row("placar", 2, [`${N} pacotes`, dec(pk)], { dt: 1, mark: "hit" });
      c.row("placar", 3, [`${MANY} pacotes, sem cabeçalho`, dec(pkMany)], { dt: 0, mark: "hit" });
      after();
    },
  );

  b.step(
    {
      id: "s4-dividir",
      title: "Dividir com quem não usa",
      subtitle: `${USERS} usuários em vez de ${FITS}`,
      text: `A vantagem maior é dividir. Um enlace comporta ${FITS} usuários ativos ao mesmo tempo, e cada usuário só transmite ${Math.round(ACTIVE * 100)}% do tempo. Com circuitos, cabem ${FITS}: cada um reserva sua fatia mesmo parado. Com pacotes, ${USERS} usuários dividem o enlace, e mais de ${FITS} ativos juntos só acontece com probabilidade de ${pct(risk)}; nesses raros momentos, os pacotes esperam numa fila.`,
      facts: [
        ["Circuitos", `${FITS} usuários`],
        ["Pacotes", `${USERS} usuários`],
        ["Risco de fila", pct(risk)],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: "O que a comutação de pacotes troca para atender mais usuários no mesmo enlace?",
        options: [
          "Uma garantia de taxa por filas ocasionais",
          "Mais cabos por menos usuários",
          "Atraso de estabelecimento por pacotes maiores",
        ],
        answer: 0,
        explain: `Sem reserva, ninguém tem taxa garantida; em troca, ${USERS} usuários dividem o que antes servia ${FITS}, e só raramente os pacotes esperam em fila.`,
      },
    },
    () => {
      c.row("dividir", 0, ["Circuitos", String(FITS), "0%"], { dt: 1, mark: "new" });
      c.row("dividir", 1, ["Pacotes", String(USERS), pct(risk)], { dt: 1, mark: "hit" });
    },
  );

  b.step(
    {
      id: "s5-cabecalho",
      title: "Pacotes pequenos demais",
      subtitle: `Melhor com ${best} pacotes`,
      text: `Até aqui os pacotes não tinham cabeçalho. Na prática, cada um leva endereços e controle, aqui ${h} kbit. Cortar mais encurta a linha de montagem, mas multiplica os cabeçalhos. A curva mostra o equilíbrio: o tempo cai até ${best} pacotes, ${dec(tBest)} ms, e depois volta a subir; com ${MANY} pacotes já são ${dec(tMany)} ms. Por isso redes reais usam pacotes de centenas a milhares de bytes, nem um nem milhões.`,
      facts: [
        ["Cabeçalho", `${h} kbit por pacote`],
        ["Melhor", `${best} pacotes, ${dec(tBest)} ms`],
        [`${MANY} pacotes`, `${dec(tMany)} ms`],
      ],
      highlight: [],
    },
    () => {
      CURVE.forEach((n, i) => {
        const t = packetTimeWithHeader(PATH, n, h);
        c.plot("cabecalho", "com cabeçalho", n, Math.round(t * 10) / 10, {
          role: "a",
          dt: i === 0 ? 1 : 0,
          label: `${n} pacotes: ${dec(t)} ms`,
        });
      });
      c.row("placar", 4, [`${best} pacotes, com cabeçalho`, dec(tBest)], { dt: 1, mark: "hit" });
    },
  );

  return b.done({ circ, msg, pk, pkMany, risk: pct(risk), best, tBest: dec(tBest) }, notes);
}

const lesson: LessonModule = {
  meta: {
    slug: "comutacao",
    site: "redes",
    title: "Comutação de circuitos e de pacotes",
    summary:
      "O mesmo arquivo por três enlaces com circuito, com mensagem inteira e com pacotes; por que pacotes dividem melhor o enlace e qual tamanho compensa.",
    area: "Fundamentos",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 2,
        section: "2.5.4",
        note: "Comutação de circuitos e de pacotes",
        verified: true,
      },
      {
        book: "tanenbaum-cn",
        chapter: 5,
        section: "5.1.1",
        note: "Comutação de pacotes store-and-forward",
        verified: true,
      },
    ],
    simplifications: [
      "Não há atraso de propagação nem de processamento nos comutadores.",
      "A probabilidade supõe usuários independentes, cada um ativo 10% do tempo.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "pacotes",
        kind: "int",
        label: "Pacotes",
        min: 1,
        max: 20,
        help: "Em quantos pacotes o arquivo é cortado.",
      },
      {
        key: "cabecalho",
        kind: "int",
        label: "Cabeçalho por pacote (kbit)",
        min: 1,
        max: 50,
        help: "Quanto maior o cabeçalho, menos pacotes compensam.",
      },
    ],
  },
  build,
  intro: {
    text: "Lia envia um arquivo de 1 Mbit a Malu, passando por três enlaces. Há três jeitos de a rede levar esses bits, e eles diferem no tempo, em quem pode usar o enlace ao mesmo tempo e no tamanho de pedaço que compensa.",
    facts: [
      ["Arquivo", "1 Mbit"],
      ["Enlaces", "3 de 10 Mbit/s"],
      ["Estabelecer circuito", `${PATH.setup} ms`],
    ],
  },
  outro: {
    title: "Comutação em resumo",
    text: "Circuitos reservam capacidade e garantem a taxa, mas a desperdiçam quando o usuário para. Pacotes não reservam nada, aproveitam os enlaces em paralelo e deixam muito mais usuários dividirem o mesmo enlace; o cabeçalho de cada pacote limita quão pequenos eles devem ser.",
    facts: (run) => [
      ["Circuito", `${run.stats.circ} ms`],
      ["Mensagem inteira", `${run.stats.msg} ms`],
      ["Melhor com cabeçalho", `${run.stats.best} pacotes`],
    ],
  },
  next: ["encapsulamento", "congestionamento"],
  practice,
};

export default lesson;
