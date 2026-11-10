import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import {
  bin,
  bitmap,
  bitmapEfficiency,
  countdown,
  countdownEfficiency,
  token,
} from "../../../sim/net/mac-free.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { macSemColisao as practice } from "../practice.ts";

/**
 * Collision-free MAC: eight stations on a shared channel, three ready to send; the bitmap
 * protocol, token passing, and binary countdown among four addresses.
 */
const N = 8;
// Stations become ready in this order as the lab raises the count.
const ORDER = [1, 3, 7, 0, 5, 2, 6, 4];
const DEFAULTS = { prontas: 3 };
const readyOf = (p: Params) =>
  ORDER.slice(0, Math.min(N, Math.max(1, Math.round(Number(p.prontas ?? DEFAULTS.prontas))))).sort(
    (a, b) => a - b,
  );
const FRAME = 100;
const LARGE = 1024;
const HOLDER = 2;
const IDS = [0b0010, 0b0100, 0b1001, 0b1010];
const W = 4;
const BIG = 1000;

const scene: SceneSpec = {
  viewBox: [960, 660],
  nodes: [],
  links: [],
  widgets: [
    {
      kind: "table",
      id: "mapa",
      title: "Mapa de bits: um intervalo por estação",
      at: [40, 40],
      columns: ["Fase", ...Array.from({ length: N }, (_, i) => String(i))],
      widths: [140, ...Array.from({ length: N }, () => 60)],
      rows: 3,
    },
    {
      kind: "table",
      id: "contagem",
      title: "Contagem binária: o canal faz OU dos bits",
      at: [40, 260],
      columns: ["Estação", "Bit 1", "Bit 2", "Bit 3", "Bit 4", "Situação"],
      widths: [110, 70, 70, 70, 70, 220],
      rows: IDS.length + 1,
    },
    {
      kind: "table",
      id: "eficiencia",
      title: `${LARGE} estações, quadros de ${FRAME} bits: tempo útil`,
      at: [40, 480],
      columns: ["Protocolo e carga", "Disputa por quadro", "Tempo útil"],
      widths: [330, 200, 150],
      rows: 3,
    },
  ],
};

const pc = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")}%`;

export function build(p: Params = DEFAULTS) {
  const READY = readyOf(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const bm = bitmap(N, READY);
  const tk = token(N, READY, HOLDER);
  const cd = countdown(IDS, W);
  const outAt = (id: number) => cd.rounds.findIndex((r) => r.out.includes(id));
  const low = bitmapEfficiency(FRAME, LARGE, 1);
  const high = bitmapEfficiency(FRAME, LARGE, LARGE);
  const cdEff = countdownEfficiency(FRAME, LARGE);
  const addrBits = Math.ceil(Math.log2(LARGE));

  b.step(
    {
      id: "s1-mapa",
      title: "Cada um no seu intervalo",
      subtitle: `${N} intervalos, ${READY.length} reservas`,
      text: `Com ALOHA e CSMA, duas estações podem falar juntas e colidir. Os [[protocolo-sem-colisao|protocolos sem colisão]] combinam antes quem fala. No [[mapa-de-bits]], há um período de disputa com ${N} intervalos curtos, um por estação, na ordem dos endereços. Quem tem um quadro põe 1 no seu intervalo. Aqui ${READY.length === 1 ? `só a estação ${READY[0]} reserva` : `as estações ${READY.join(", ")} reservam`}; depois, cada uma transmite na ordem, sem chance de colisão.`,
      facts: [
        ["Estações", String(N)],
        ["Prontas", READY.join(", ")],
        ["Colisões", "nenhuma"],
      ],
      highlight: [],
    },
    () => {
      c.row("mapa", 0, ["Disputa", ...bm.slots.map((s) => (s ? "1" : "0"))], { dt: 1, mark: "new" });
      c.row("mapa", 1, ["Transmite", ...bm.slots.map((s, i) => (s ? `${bm.order.indexOf(i) + 1}º` : ""))], {
        dt: 1,
        mark: "hit",
      });
    },
  );

  b.step(
    {
      id: "s2-custo",
      title: "O preço da reserva",
      subtitle: `${N} bits por rodada`,
      text: `Cada rodada custa ${N} intervalos de disputa, haja ${READY.length === 1 ? "um quadro só" : `${READY.length} quadros`} ou ${READY.length === 1 ? "vários" : "só um"}. Com muitas estações prontas, esse custo se divide entre todas e quase não pesa. Com carga baixa, ele domina: numa rede de ${BIG} estações em que só uma quer falar, ela espera ${BIG} intervalos de disputa por um quadro. E a estação de número alto sempre espera mais do que a de número baixo.`,
      facts: [
        ["Disputa por rodada", `${N} bits`],
        [`Com ${READY.length} quadros`, `${(N / READY.length).toFixed(1).replace(".", ",")} bits por quadro`],
        [`${BIG} estações, 1 pronta`, `${BIG} bits`],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Numa rede de ${N} estações com mapa de bits, quantos intervalos de disputa há numa rodada em que só a estação 5 quer transmitir?`,
        answer: N,
        explain: `O período de disputa sempre tem um intervalo por estação, ${N} no total, não importa quantas estejam prontas.`,
      },
    },
    () => {
      c.row("mapa", 2, ["Só a 5", ...Array.from({ length: N }, (_, i) => (i === 5 ? "1" : "0"))], {
        dt: 1,
        mark: "warn",
      });
    },
  );

  b.step(
    {
      id: "s3-ficha",
      title: "Passar a ficha",
      subtitle: `Ordem: ${tk.order.join(", ")}`,
      text: `Na [[passagem-de-ficha]], uma mensagem especial, a ficha, circula de estação em estação. Só quem está com ela transmite, e depois a repassa. Se a ficha está na estação ${HOLDER}, as prontas são atendidas na ordem ${tk.order.join(", ")}, e uma volta completa passa por ${tk.passes} estações. Ninguém colide, e a espera máxima é limitada; o risco é perder a ficha, e a rede precisa de um jeito de gerar outra.`,
      facts: [
        ["Ficha começa em", String(HOLDER)],
        ["Ordem", tk.order.join(", ")],
        ["Passagens por volta", String(tk.passes)],
      ],
      highlight: [],
    },
    () => {
      c.note("mapa", `Com a ficha a partir da estação ${HOLDER}: ${tk.order.join(" → ")}`, "info", { dt: 1 });
    },
  );

  b.step(
    {
      id: "s4-contagem",
      title: "Endereços em disputa",
      subtitle: `Vence ${bin(cd.winner, W)}`,
      text: `Na [[contagem-binaria]], cada estação pronta envia o próprio endereço, bit a bit, começando pelo mais significativo, e o canal combina os bits com um OU. Quem enviou 0 e ouviu 1 desiste. No primeiro bit, ${bin(IDS[0] as number, W)} e ${bin(IDS[1] as number, W)} saem; no terceiro, ${bin(IDS[2] as number, W)}. Sobra ${bin(cd.winner, W)}, o maior endereço, sem nenhum intervalo desperdiçado com quem não quer transmitir.`,
      facts: [
        ["Estações", IDS.map((x) => bin(x, W)).join(", ")],
        ["Vencedora", bin(cd.winner, W)],
        ["Bits", String(W)],
      ],
      highlight: [],
    },
    () => {
      IDS.forEach((id, i) => {
        const k = outAt(id);
        const cells = cd.rounds.map((r, j) => (k >= 0 && j > k ? "" : String(r.sent[id] ?? "")));
        c.row("contagem", i, [bin(id, W), ...cells, k >= 0 ? `desiste no bit ${k + 1}` : "transmite"], {
          dt: i === 0 ? 1 : 0,
          mark: k >= 0 ? "bad" : "hit",
        });
      });
      c.row("contagem", IDS.length, ["Canal (OU)", ...cd.rounds.map((r) => String(r.channel)), ""], {
        dt: 1,
        mark: "new",
      });
    },
  );

  b.step(
    {
      id: "s5-eficiencia",
      title: "Quanto sobra para dados",
      subtitle: `Contagem: ${pc(cdEff)} útil`,
      text: `Numa rede de ${LARGE} estações com quadros de ${FRAME} bits, o mapa de bits gasta ${LARGE} intervalos por rodada. Se só uma estação fala, sobra ${pc(low)} do tempo para dados; se todas falam, a disputa se divide e sobe para ${pc(high)}. A contagem binária gasta só os ${addrBits} bits do endereço por quadro, qualquer que seja a carga: ${pc(cdEff)}. Cada protocolo vence numa faixa de carga.`,
      facts: [
        ["Mapa, 1 pronta", pc(low)],
        ["Mapa, todas prontas", pc(high)],
        ["Contagem binária", pc(cdEff)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Com ${LARGE} estações e quadros de ${FRAME} bits, que fração do tempo, em %, a contagem binária deixa para dados?`,
        answer: Number((cdEff * 100).toFixed(1)),
        tolerance: 0.2,
        unit: "%",
        explain: `Cada quadro paga ${addrBits} bits de disputa, log2 de ${LARGE}: ${FRAME} / (${FRAME} + ${addrBits}) = ${pc(cdEff)}.`,
      },
    },
    () => {
      const rows: [string, string, string, number][] = [
        ["Mapa de bits, 1 estação pronta", `${LARGE} bits`, pc(low), low],
        ["Mapa de bits, todas prontas", "1 bit", pc(high), high],
        ["Contagem binária, qualquer carga", `${addrBits} bits`, pc(cdEff), cdEff],
      ];
      rows.forEach(([a, d, e, v], i) => {
        c.row("eficiencia", i, [a, d, e], { dt: 1, mark: v < 0.5 ? "bad" : "hit" });
      });
    },
  );

  return b.done(
    { order: bm.order.join(","), token: tk.order.join(","), winner: bin(cd.winner, W), countdown: pc(cdEff) },
    READY.length === DEFAULTS.prontas
      ? []
      : [
          `Com ${READY.length} ${READY.length === 1 ? "estação pronta" : "estações prontas"}, cada quadro paga ${(N / READY.length).toFixed(1).replace(".", ",")} intervalos de disputa no mapa de bits.`,
        ],
  );
}

const lesson: LessonModule = {
  meta: {
    slug: "mac-sem-colisao",
    site: "redes",
    title: "Acesso ao meio sem colisões",
    summary: "Mapa de bits, passagem de ficha e contagem binária: combinar quem fala antes de falar.",
    area: "Enlace",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 4,
        section: "4.2.3",
        note: "Protocolos livres de colisão",
        verified: true,
      },
    ],
    simplifications: [
      "Os intervalos de disputa e os quadros têm duração fixa, e nenhuma estação entra no meio de uma rodada.",
      "A passagem de ficha não trata a perda nem a duplicação da ficha.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [{ key: "prontas", kind: "int", label: "Estações prontas", min: 1, max: N }],
  },
  build,
  intro: {
    text: "Num canal compartilhado, duas estações falando juntas perdem as duas. Em vez de tentar e recuperar, há protocolos que decidem a vez antes. Você vai ver três deles e quanto cada um cobra pela organização.",
    facts: [
      ["Estações", String(N)],
      ["Prontas", readyOf(DEFAULTS).join(", ")],
      ["Protocolos", "mapa de bits, ficha, contagem"],
    ],
  },
  outro: {
    title: "Sem colisões em resumo",
    text: "O mapa de bits reserva com um intervalo por estação, a ficha dá a vez a quem a segura e a contagem binária deixa os endereços disputarem bit a bit. Nenhum colide; o custo é a disputa fixa, a ficha circulando ou a prioridade de quem tem endereço maior.",
    facts: (run) => [
      ["Ordem no mapa", String(run.stats.order)],
      ["Ordem com ficha", String(run.stats.token)],
      ["Vence a contagem", String(run.stats.winner)],
    ],
  },
  next: ["aloha-csma", "wifi-csma-ca"],
  practice,
};

export default lesson;
