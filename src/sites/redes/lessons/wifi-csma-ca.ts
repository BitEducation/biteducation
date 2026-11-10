import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import {
  ACK,
  airtime,
  backoffRace,
  CTS,
  collisionLoss,
  DIFS,
  exchange,
  RATE,
  RTS,
  SIFS,
  SLOT,
} from "../../../sim/net/wifi.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { num } from "../../shared/practice-kit.ts";
import { wifiCsmaCa as practice } from "../practice.ts";

/**
 * Wi-Fi medium access: a radio cannot hear a collision while it transmits, so 802.11 avoids
 * them (DIFS, random backoff that freezes, ACK after SIFS). Two stations that cannot hear each
 * other collide at the access point; RTS/CTS reserves the air, at a cost worth it for big frames.
 */
export const DEFAULTS = { quadro: 1500, recuoA: 3, recuoB: 5 };

function clamp(p: Params) {
  const bytes = Math.min(2300, Math.max(100, Math.round(Number(p.quadro ?? DEFAULTS.quadro))));
  const a = Math.min(15, Math.max(0, Math.round(Number(p.recuoA ?? DEFAULTS.recuoA))));
  const bb = Math.min(15, Math.max(0, Math.round(Number(p.recuoB ?? DEFAULTS.recuoB))));
  return { bytes, a, b: bb };
}

const scene: SceneSpec = {
  viewBox: [960, 620],
  zones: [
    { id: "za", title: "Alcance de A", rect: { x: 20, y: 30, w: 600, h: 230 }, tone: "user" },
    { id: "zc", title: "Alcance de C", rect: { x: 340, y: 50, w: 600, h: 230 }, tone: "kernel" },
  ],
  nodes: [
    { id: "A", kind: "laptop", label: "A", sub: "notebook", at: [110, 180] },
    { id: "B", kind: "laptop", label: "B", sub: "celular", at: [300, 100] },
    { id: "ap", kind: "router", label: "Ponto de acesso", sub: "ouve todos", at: [480, 190], w: 190 },
    { id: "C", kind: "laptop", label: "C", sub: "do outro lado", at: [850, 180] },
  ],
  links: [
    { id: "l-a", from: "A", to: "ap", style: "dashed" },
    { id: "l-b", from: "B", to: "ap", style: "dashed" },
    { id: "l-c", from: "C", to: "ap", style: "dashed" },
  ],
  widgets: [
    { kind: "counter", id: "recA", title: "Recuo de A (slots)", at: [40, 300] },
    { kind: "counter", id: "recB", title: "Recuo de B (slots)", at: [240, 300] },
    {
      kind: "table",
      id: "tempos",
      title: `Tempos do 802.11 a ${RATE} Mb/s (µs)`,
      at: [460, 300],
      columns: ["Intervalo ou quadro", "µs"],
      widths: [300, 120],
      rows: 5,
    },
    {
      kind: "table",
      id: "cmp",
      title: "Enviar um quadro, sem e com reserva",
      at: [40, 470],
      columns: ["Forma", "Tempo total", "Perda numa colisão"],
      widths: [260, 220, 260],
      rows: 2,
    },
  ],
};

export function build(p: Params) {
  const { bytes, a, b: bOff } = clamp(p);
  const race = backoffRace(a, bOff);
  const plain = exchange(bytes, false);
  const rts = exchange(bytes, true);
  const lossPlain = collisionLoss(bytes, false);
  const lossRts = collisionLoss(bytes, true);
  const b = lessonBuilder();
  const c = talk(b, { A: "A", B: "B", ap: "ponto de acesso", C: "C" }, (t) => `t${t}`);
  const us = (x: number) => `${num(x, 1)} µs`;
  const loser = race.first === "A" ? "B" : "A";
  const worth = lossPlain - lossRts > rts.total - plain.total;

  b.step(
    {
      id: "s1-sem-deteccao",
      title: "Rádio não ouve colisão",
      subtitle: "Evitar em vez de detectar",
      text: `No cabo, a placa transmite e escuta ao mesmo tempo, e para assim que percebe uma colisão. No rádio isso não funciona: o próprio sinal, saindo da antena, abafa qualquer outro. Por isso o Wi-Fi usa [[csma-ca|CSMA/CA]]: tenta evitar a colisão antes de transmitir e confirma cada quadro com um ACK. Sem ACK, o transmissor supõe que houve colisão e tenta de novo.`,
      facts: [
        ["Cabo", "detecta colisão"],
        ["Rádio", "evita e confirma"],
        ["Confirmação", "ACK por quadro"],
      ],
      highlight: ["A", "ap"],
    },
    () => {
      c.send("A", "ap", "quadro", { what: "dados", detail: `${bytes} B` });
      c.send("ap", "A", "ACK", { role: "b", what: "confirmação", detail: "chegou inteiro" });
    },
  );

  b.step(
    {
      id: "s2-recuo",
      title: "Esperar e sortear",
      subtitle: race.tie ? "Mesmo sorteio" : `${race.first} transmite primeiro`,
      text: race.tie
        ? `A e B têm quadros prontos. Cada um espera o meio ficar livre por um DIFS, ${DIFS} µs, e sorteia um [[recuo-aleatorio|recuo]] em slots de ${SLOT} µs. Os dois sortearam ${a}: chegam a zero juntos, transmitem juntos e colidem. Sem ACK, cada um dobra a faixa do sorteio e tenta outra vez. É raro, porque a faixa inicial vai de 0 a 15.`
        : `A e B têm quadros prontos. Cada um espera o meio ficar livre por um DIFS, ${DIFS} µs, e sorteia um [[recuo-aleatorio|recuo]] em slots de ${SLOT} µs: A tirou ${a}, B tirou ${bOff}. Os dois contam para baixo. ${race.first} chega a zero primeiro e transmite; ${loser} ouve o meio ocupado e congela o contador em ${race.frozenAt}, para retomar depois. Quem esperou mais não perde a vez.`,
      facts: [
        ["DIFS", `${DIFS} µs`],
        ["Slot", `${SLOT} µs`],
        [`${loser} congela em`, race.tie ? "—" : String(race.frozenAt)],
      ],
      highlight: ["recA", "recB"],
      quiz: {
        kind: "number",
        prompt: `A sorteou ${a} slots e B sorteou ${bOff}. Quando o primeiro começa a transmitir, em quanto fica o contador do outro?`,
        answer: race.frozenAt,
        unit: "slots",
        explain: race.tie
          ? "Os dois chegam a zero no mesmo slot: o contador do outro também está em 0, e eles colidem."
          : `${race.first} transmite depois de ${race.waitedSlots} slots; o outro contou os mesmos ${race.waitedSlots} e para em ${Math.max(a, bOff)} − ${race.waitedSlots} = ${race.frozenAt}.`,
      },
    },
    () => {
      c.count("recA", String(a), { label: `A: ${a}` });
      c.count("recB", String(bOff), { label: `B: ${bOff}` });
      c.count("recA", String(a - race.waitedSlots), { label: `A: ${a - race.waitedSlots}`, dt: 1 });
      c.count("recB", String(bOff - race.waitedSlots), { label: `B: ${bOff - race.waitedSlots}`, dt: 0 });
      if (race.tie) {
        c.send("A", "ap", "quadro", { what: "dados", lost: true, detail: "colide" });
        c.send("B", "ap", "quadro", { what: "dados", lost: true, detail: "colide", dt: 0 });
      } else {
        c.send(race.first, "ap", "quadro", { what: "dados", detail: `${bytes} B` });
        c.state(loser, `congela em ${race.frozenAt}`, { tone: "warn" });
      }
    },
  );

  b.step(
    {
      id: "s3-ack",
      title: "O ACK passa na frente",
      subtitle: `SIFS de ${SIFS} µs`,
      text: `Quando o quadro termina, o ponto de acesso espera só um SIFS, ${SIFS} µs, e manda o ACK. Como o SIFS é menor que o DIFS de ${DIFS} µs, ninguém mais consegue começar a transmitir no meio: o ACK tem prioridade garantida pelo tempo. Só depois do ACK e de um novo DIFS o ${loser} retoma a contagem de onde parou.`,
      facts: [
        ["SIFS", `${SIFS} µs`],
        ["DIFS", `${DIFS} µs`],
        ["Quadro de dados", us(plain.data)],
      ],
      highlight: ["tempos"],
    },
    () => {
      c.send("ap", race.first, "ACK", { role: "b", what: "confirmação", detail: `após ${SIFS} µs` });
      c.row("tempos", 0, ["SIFS (antes de ACK e CTS)", String(SIFS)], { dt: 1, mark: "new" });
      c.row("tempos", 1, ["DIFS (antes de disputar)", String(DIFS)], { dt: 1, mark: "new" });
      c.row("tempos", 2, ["Slot de recuo", String(SLOT)], { dt: 1, mark: "new" });
      c.row("tempos", 3, [`Quadro de ${bytes} B`, num(plain.data, 1)], { dt: 1, mark: "new" });
      c.row("tempos", 4, [`ACK (${ACK} B)`, num(airtime(ACK), 1)], { dt: 1, mark: "new" });
    },
  );

  b.step(
    {
      id: "s4-oculto",
      title: "O terminal oculto",
      subtitle: "A e C não se ouvem",
      text: `A e C estão em lados opostos do ponto de acesso: cada um alcança o ponto, mas não o outro. A escuta, acha o meio livre e transmite. C escuta, também acha o meio livre, porque não ouve A, e transmite. Os dois sinais se misturam no ponto de acesso, e nenhum quadro chega. É o problema do [[terminal-oculto|terminal oculto]]: ouvir antes de falar não basta.`,
      facts: [
        ["A ouve C", "não"],
        ["Onde colidem", "no ponto de acesso"],
        ["Tempo perdido", us(lossPlain)],
      ],
      highlight: ["A", "C", "ap"],
      quiz: {
        kind: "pick",
        prompt: "Onde os quadros de A e de C colidem? Clique na cena.",
        targets: [
          { id: "ap", label: "No ponto de acesso" },
          { id: "A", label: "Em A" },
          { id: "C", label: "Em C" },
        ],
        answer: "ap",
        explain:
          "A colisão acontece no receptor, onde os dois sinais chegam juntos. A e C, cada um no seu canto, acham que transmitiram sem problema.",
      },
    },
    () => {
      c.state("A", "meio livre: transmite", { tone: "active" });
      c.state("C", "meio livre: transmite", { tone: "active", dt: 0 });
      c.send("A", "ap", "quadro", { what: "dados", lost: true, detail: "colide no AP" });
      c.send("C", "ap", "quadro", { what: "dados", lost: true, detail: "colide no AP", dt: 0 });
      c.state("ap", "dois sinais: nada legível", { tone: "bad" });
    },
  );

  b.step(
    {
      id: "s5-rts-cts",
      title: "Reservar com RTS e CTS",
      subtitle: "C ouve o CTS",
      text: `A solução é reservar o meio. A manda um [[rts-cts|RTS]] curto ao ponto de acesso, com a duração da troca. O ponto responde com um CTS, que todos à volta dele ouvem, inclusive C. C anota a duração no seu NAV, um temporizador de silêncio, e fica quieto até a troca acabar, mesmo sem ouvir A. Se houver colisão, ela acontece entre RTS de ${RTS} bytes, não entre quadros grandes.`,
      facts: [
        ["RTS", `${RTS} B`],
        ["CTS", `${CTS} B`],
        ["C ouve", "o CTS do ponto"],
      ],
      highlight: ["ap", "C"],
      quiz: {
        kind: "choice",
        prompt: "C não ouve A. Como ele fica sabendo que deve esperar?",
        options: [
          "Ouve o CTS do ponto de acesso, que traz a duração da troca",
          "Ouve o RTS de A, que tem mais potência",
          "O ponto de acesso desliga o rádio de C",
        ],
        answer: 0,
        explain:
          "O CTS sai do ponto de acesso, que todos os clientes alcançam. Ele carrega a duração da reserva, e cada estação que o ouve fica em silêncio por esse tempo.",
      },
    },
    () => {
      c.send("A", "ap", "RTS", { what: "reserva", detail: `${RTS} B` });
      c.send("ap", "A", "CTS", { role: "b", what: "liberado", detail: `${CTS} B` });
      c.send("ap", "C", "CTS", { role: "b", what: "NAV", detail: "fique quieto", dt: 0 });
      c.state("C", "NAV: em silêncio", { tone: "warn" });
      c.send("A", "ap", "quadro", { what: "dados", detail: `${bytes} B` });
      c.send("ap", "A", "ACK", { role: "b", what: "confirmação" });
    },
  );

  b.step(
    {
      id: "s6-custo",
      title: "Quando a reserva compensa",
      subtitle: `Quadro de ${bytes} B`,
      text: `A reserva custa tempo em toda troca: sem ela, enviar o quadro de ${bytes} bytes leva ${us(plain.total)}; com RTS e CTS, ${us(rts.total)}. Em compensação, uma colisão passa a desperdiçar ${us(lossRts)}, e não ${us(lossPlain)}. ${worth ? "Com quadros deste tamanho, uma colisão evitada já paga a reserva." : "Com quadros pequenos como este, a reserva custa mais do que a colisão que ela evitaria."} Por isso as placas só usam RTS acima de um limite de tamanho configurável.`,
      facts: [
        ["Sem reserva", us(plain.total)],
        ["Com reserva", us(rts.total)],
        ["Compensa?", worth ? "sim" : "não"],
      ],
      highlight: ["cmp"],
    },
    () => {
      c.row("cmp", 0, ["Só dados e ACK", us(plain.total), us(lossPlain)], {
        dt: 1,
        mark: worth ? "warn" : "hit",
      });
      c.row("cmp", 1, ["RTS, CTS, dados e ACK", us(rts.total), us(lossRts)], {
        dt: 1,
        mark: worth ? "hit" : "warn",
      });
    },
  );

  return b.done({
    first: race.first,
    frozen: race.frozenAt,
    plain: Math.round(plain.total * 10) / 10,
    rts: Math.round(rts.total * 10) / 10,
    worth: worth ? 1 : 0,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "wifi-csma-ca",
    site: "redes",
    title: "Wi-Fi: CSMA/CA e o terminal oculto",
    summary:
      "O rádio não ouve colisões enquanto transmite, então o Wi-Fi as evita: espera, sorteia um recuo que congela, confirma com ACK. Duas estações que não se ouvem colidem no ponto de acesso, e RTS/CTS reserva o meio.",
    area: "Enlace",
    refs: [
      { book: "tanenbaum-cn", chapter: 4, section: "4.4", note: "LANs sem fio", verified: true },
      {
        book: "tanenbaum-cn",
        chapter: 4,
        section: "4.2.5",
        note: "Protocolos de LANs sem fio",
        verified: true,
      },
    ],
    simplifications: [
      "Todos os quadros, inclusive os de controle, a 54 Mb/s; na prática os de controle vão mais devagar.",
      "Preâmbulo fixo de 20 µs e tempos do 802.11a/g.",
      "O recuo inicial vai de 0 a 15 slots e não aparece a duplicação depois de uma falha.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "quadro", kind: "int", label: "Tamanho do quadro (bytes)", min: 100, max: 2300 },
      { key: "recuoA", kind: "int", label: "Recuo sorteado por A (slots)", min: 0, max: 15 },
      { key: "recuoB", kind: "int", label: "Recuo sorteado por B (slots)", min: 0, max: 15 },
    ],
  },
  build,
  practice,
  intro: {
    text: "Todos os aparelhos de uma rede Wi-Fi falam no mesmo canal, e um rádio não consegue ouvir enquanto fala. Você vai ver como o 802.11 divide o ar sem detectar colisões, o caso em que duas estações não se ouvem e a reserva que resolve.",
    facts: [
      ["Estações", "A, B e C"],
      ["Taxa", `${RATE} Mb/s`],
      ["Quadro", "1500 bytes"],
    ],
  },
  outro: {
    title: "CSMA/CA em resumo",
    text: "O Wi-Fi espera o meio livre por um DIFS, sorteia um recuo em slots, congela a contagem quando alguém transmite e confirma cada quadro com ACK depois de um SIFS. Estações que não se ouvem colidem no ponto de acesso; RTS e CTS reservam o meio e reduzem a perda a quadros curtos, o que compensa para quadros grandes.",
    facts: (r) => [
      ["Transmite primeiro", String(r.stats.first)],
      ["Sem reserva", `${num(Number(r.stats.plain), 1)} µs`],
      ["Com reserva", `${num(Number(r.stats.rts), 1)} µs`],
    ],
  },
  next: ["aloha-csma", "wpa", "switch-vlan"],
};

export default lesson;
