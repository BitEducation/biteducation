import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import {
  backoff,
  csmaEfficiency,
  ETH,
  pureAloha,
  SLOT_US,
  slots,
  slottedAloha,
} from "../../../sim/net/aloha.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { alohaCsma as practice } from "../practice.ts";

/**
 * Sharing one channel: pure ALOHA collides over two frame times, slots halve that, the throughput
 * curves peak at 18.4% and 36.8%, carrier sense with collision detection does much better on short
 * cables, and binary exponential backoff spreads the retries.
 */
export const DEFAULTS = { carga: 5, quadro: 64 };
const SLOTS = 20;
const CURVE = Array.from({ length: 13 }, (_, i) => i * 0.25);
const STATIONS = ["e1", "e2", "e3", "e4"];

function clamp(p: Params) {
  const tenth = Math.min(30, Math.max(1, Math.round(Number(p.carga ?? DEFAULTS.carga))));
  const frame = Math.min(1500, Math.max(64, Math.round(Number(p.quadro ?? DEFAULTS.quadro))));
  return { g: tenth / 10, frame };
}

const dec = (x: number, d = 1) => String(Math.round(x * 10 ** d) / 10 ** d).replace(".", ",");
const pct = (x: number) => `${dec(x * 100)}%`;
const wait = (us: number) => (us >= 1000 ? `${dec(us / 1000, 2)} ms` : `${dec(us)} µs`);

const scene: SceneSpec = {
  viewBox: [960, 680],
  nodes: STATIONS.map((id, i) => ({
    id,
    kind: "laptop" as const,
    label: `Estação ${i + 1}`,
    sub: "mesmo canal",
    at: [130 + i * 230, 90] as const,
  })),
  links: STATIONS.slice(1).map((id, i) => ({
    id: `bus-${i}`,
    from: STATIONS[i] as string,
    to: id,
    style: "bus" as const,
  })),
  widgets: [
    {
      kind: "grid",
      id: "slots",
      title: `ALOHA com slots: ${SLOTS} slots seguidos`,
      at: [40, 190],
      cols: SLOTS,
      rows: 1,
      cellW: 44,
      indexLabel: "dec",
    },
    {
      kind: "chart",
      id: "vazao",
      title: "Vazão (% do canal) por carga oferecida G",
      at: [60, 300],
      width: 480,
      height: 190,
      x: { label: "G (quadros por tempo de quadro)", max: 3 },
      y: { label: "vazão %", max: 40 },
    },
    { kind: "counter", id: "puro", title: "ALOHA puro", at: [600, 290] },
    { kind: "counter", id: "comSlots", title: "ALOHA com slots", at: [790, 290] },
    { kind: "counter", id: "simulado", title: "Sucessos nos slots", at: [600, 380] },
    { kind: "counter", id: "csma", title: "CSMA/CD", at: [790, 380] },
    {
      kind: "table",
      id: "recuo",
      title: "Recuo exponencial binário",
      at: [40, 530],
      columns: ["Colisões", "Sorteia de 0 a", "Espera média"],
      widths: [110, 160, 160],
      rows: 5,
    },
  ],
};

export function build(p: Params) {
  const { g, frame } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, Object.fromEntries(STATIONS.map((id, i) => [id, `estação ${i + 1}`])), (t) => String(t));
  const sPure = pureAloha(g);
  const sSlot = slottedAloha(g);
  const run = slots(g, SLOTS);
  const ok = run.filter((k) => k === 1).length;
  const coll = run.filter((k) => k > 1).length;
  const idle = run.filter((k) => k === 0).length;
  const eff = csmaEfficiency(frame);
  const effMin = csmaEfficiency(64);
  const effMax = csmaEfficiency(1500);
  const gTxt = dec(g, 2);

  b.step(
    {
      id: "s1-canal",
      title: "Um canal para todos",
      subtitle: "Duas falam, ninguém entende",
      text: `Num cabo coaxial antigo ou no ar do Wi-Fi, todas as estações usam o mesmo canal. Se duas transmitem ao mesmo tempo, os sinais se somam e os dois quadros viram lixo: é uma [[colisao]]. Não há um coordenador central que diga quem fala. Cada estação decide sozinha quando transmitir, e o problema da subcamada de acesso ao meio é escolher uma regra que desperdice pouco canal com colisões e com silêncio.`,
      facts: [
        ["Estações", String(STATIONS.length)],
        ["Canal", "um, compartilhado"],
        ["Colisão", "os dois quadros se perdem"],
      ],
      highlight: STATIONS,
    },
    () => {
      c.send("e1", "e4", "quadro", { via: ["e2", "e3"], what: "estação 1 transmite" });
      c.send("e3", "e1", "quadro", { dt: 0, via: ["e2"], role: "b", what: "estação 3 também" });
      c.state("e2", "colisão", { tone: "bad", role: "bad", label: "os sinais se somam" });
    },
  );

  b.step(
    {
      id: "s2-puro",
      title: "Fale quando quiser",
      subtitle: `G = ${gTxt}: ${pct(sPure)}`,
      text: `No [[aloha]] puro, quem tem um quadro transmite na hora e, se não vier confirmação, tenta de novo depois de um tempo aleatório. Um quadro só se salva se ninguém mais começar durante dois tempos de quadro: um antes, que o atropelaria no início, e um durante. Com carga oferecida G, contando novas tentativas e repetições, a fração útil do canal é G × e^(−2G). Com G = ${gTxt}, dá ${pct(sPure)}.`,
      facts: [
        ["Carga G", gTxt],
        ["Período vulnerável", "2 tempos de quadro"],
        ["Vazão", pct(sPure)],
      ],
      highlight: STATIONS,
    },
    () => {
      c.count("puro", pct(sPure), { role: "warn", label: `ALOHA puro: ${pct(sPure)}` });
    },
  );

  b.step(
    {
      id: "s3-slots",
      title: "Começar só na batida",
      subtitle: `${ok} de ${SLOTS} slots úteis`,
      text: `Dividindo o tempo em slots do tamanho de um quadro e só deixando começar no início de um slot, um quadro só colide com quem escolheu o mesmo slot. O período vulnerável cai à metade e a vazão vira G × e^(−G): ${pct(sSlot)} com G = ${gTxt}. Na simulação, ${SLOTS} slots com essa carga: ${ok} levaram exatamente um quadro, ${coll} tiveram colisão e ${idle} ficaram vazios.`,
      facts: [
        ["Úteis", String(ok)],
        ["Colisões", String(coll)],
        ["Vazios", String(idle)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Com G = ${gTxt}, qual é a vazão do ALOHA com slots, em porcentagem do canal?`,
        answer: Math.round(sSlot * 1000) / 10,
        tolerance: 0.2,
        unit: "%",
        explain: `${gTxt} × e^(−${gTxt}) = ${dec(sSlot, 3)}, ou ${pct(sSlot)}.`,
      },
    },
    () => {
      run.forEach((k, i) => {
        c.cell("slots", i, k === 0 ? "" : k === 1 ? "ok" : `×${k}`, {
          dt: 1,
          mark: k === 1 ? "hit" : k > 1 ? "miss" : "bubble",
          role: k === 1 ? "a" : k > 1 ? "bad" : "muted",
          label: `slot ${i}: ${k === 0 ? "vazio" : k === 1 ? "um quadro, sucesso" : `${k} quadros, colisão`}`,
          ...(k > 1 ? { log: { who: `slot ${i}`, what: "colisão", detail: `${k} quadros` } } : {}),
        });
      });
      c.count("comSlots", pct(sSlot), { dt: 0, role: "a", label: `com slots: ${pct(sSlot)}` });
      c.count("simulado", `${ok} de ${SLOTS}`, { dt: 0, label: `${ok} slots úteis` });
    },
  );

  b.step(
    {
      id: "s4-curvas",
      title: "Carga demais atrapalha",
      subtitle: `Picos de ${pct(pureAloha(0.5))} e ${pct(slottedAloha(1))}`,
      text: `As curvas mostram a vazão para cada carga. O ALOHA puro chega no máximo a ${pct(pureAloha(0.5))}, com G = 0,5; o com slots, a ${pct(slottedAloha(1))}, com G = 1. Depois do pico, mais carga piora: as colisões crescem mais rápido que as tentativas, e as repetições aumentam a carga ainda mais. Em G = 3, o com slots cai para ${pct(slottedAloha(3))}. Mesmo no melhor ponto, mais de 60% do canal se perde.`,
      facts: [
        ["Pico puro", `${pct(pureAloha(0.5))} em 0,5`],
        ["Pico com slots", `${pct(slottedAloha(1))} em 1`],
        ["Com slots em G = 3", pct(slottedAloha(3))],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: "No ALOHA com slots, o que acontece com a vazão quando a carga passa de G = 1?",
        options: [
          "Cai: sobram slots com colisão e faltam slots com um quadro só",
          "Continua subindo até 100%",
          "Fica parada em 36,8%",
        ],
        answer: 0,
        explain: `Em G = 1, ${pct(slottedAloha(1))}; em G = 3, ${pct(slottedAloha(3))}. Com muita gente tentando, quase todo slot ocupado tem dois ou mais quadros.`,
      },
    },
    () => {
      for (const x of CURVE) {
        c.plot("vazao", "puro", x, pureAloha(x) * 100, {
          role: "warn",
          dt: 1,
          label: `puro, G ${dec(x, 2)}: ${pct(pureAloha(x))}`,
        });
        c.plot("vazao", "slots", x, slottedAloha(x) * 100, {
          role: "a",
          dt: 0,
          label: `slots, G ${dec(x, 2)}: ${pct(slottedAloha(x))}`,
        });
      }
    },
  );

  b.step(
    {
      id: "s5-csma",
      title: "Escutar antes de falar",
      subtitle: `Quadro de ${frame} bytes: ${pct(eff)}`,
      text: `O [[csma-cd]] da Ethernet clássica escuta o canal antes e só transmite se estiver quieto; durante a transmissão continua escutando e, ao perceber colisão, para na hora. Colisões só acontecem no tempo que o sinal leva para atravessar o cabo, e por isso o quadro mínimo é de 64 bytes: ${ETH.slotBits} bits, ${dec(SLOT_US)} µs a 10 Mbit/s. Num cabo de ${ETH.cable} m, a eficiência é ${pct(eff)} com quadros de ${frame} bytes; vai de ${pct(effMin)} com 64 a ${pct(effMax)} com 1500.`,
      facts: [
        ["Quadro mínimo", `64 bytes, ${dec(SLOT_US)} µs`],
        ["Eficiência", pct(eff)],
        ["Com 1500 bytes", pct(effMax)],
      ],
      highlight: STATIONS,
    },
    () => {
      c.state("e2", "escuta", { role: "b", label: "canal livre?" });
      c.send("e2", "e4", "quadro", { via: ["e3"], role: "a", what: "transmite e continua escutando" });
      c.count("csma", pct(eff), { dt: 0, role: "a", label: `CSMA/CD: ${pct(eff)}` });
    },
  );

  const rows = [1, 2, 3, 4, 10].map((i) => ({ i, ...backoff(i) }));
  b.step(
    {
      id: "s6-recuo",
      title: "Esperar cada vez mais",
      subtitle: "Recuo exponencial binário",
      text: `Depois de uma colisão, cada estação sorteia quantos slots de ${dec(SLOT_US)} µs esperar. Na primeira, 0 ou 1; na segunda, de 0 a 3; a cada nova colisão o intervalo dobra, até 1023 depois da décima, e na décima sexta a placa desiste. Com pouca gente, a espera é curta; com muita, o sorteio se espalha e as colisões rareiam. Hoje a Ethernet comutada e full-duplex não tem colisões, mas o Wi-Fi ainda sorteia esperas parecidas.`,
      facts: [
        ["Slot", `${dec(SLOT_US)} µs`],
        ["Teto", "0 a 1023 slots"],
        ["Desiste", "na 16ª colisão"],
      ],
      highlight: [],
    },
    () => {
      rows.forEach((r, i) => {
        c.row("recuo", i, [String(r.i), String(r.top), wait(r.meanUs)], {
          dt: 1,
          mark: "new",
          log: { who: `${r.i} colisões`, what: `0 a ${r.top}`, detail: `média ${wait(r.meanUs)}` },
        });
      });
    },
  );

  return b.done({
    pure: pct(sPure),
    slotted: pct(sSlot),
    ok,
    collisions: coll,
    idle,
    csma: pct(eff),
    csma1500: pct(effMax),
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "aloha-csma",
    site: "redes",
    title: "ALOHA e CSMA/CD: dividir um canal sem juiz",
    summary:
      "Colisões num canal compartilhado, a vazão do ALOHA puro e com slots, por que carga demais derruba o canal, a escuta e detecção de colisão da Ethernet clássica e o recuo exponencial.",
    area: "Enlace",
    refs: [
      { book: "tanenbaum-cn", chapter: 4, section: "4.2.1", note: "ALOHA", verified: true },
      {
        book: "tanenbaum-cn",
        chapter: 4,
        section: "4.2.2",
        note: "Acesso múltiplo com detecção de portadora",
        verified: true,
      },
      { book: "tanenbaum-cn", chapter: 4, section: "4.3.3", note: "Desempenho da Ethernet", verified: true },
    ],
    simplifications: [
      "As fórmulas de vazão supõem chegadas de Poisson e infinitas estações.",
      "A simulação sorteia de uma vez quantos quadros tentam cada slot, com semente fixa.",
      "A eficiência do CSMA/CD usa o modelo de 10 Mbit/s com cabo de 2500 m.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "carga", kind: "int", label: "Carga G × 10", min: 1, max: 30 },
      { key: "quadro", kind: "int", label: "Quadro Ethernet (bytes)", min: 64, max: 1500 },
    ],
  },
  build,
  intro: {
    text: "Quando várias estações dividem o mesmo canal e ninguém coordena, transmitir ao mesmo tempo destrói os quadros. Você vai medir quanto do canal sobra com o ALOHA, ver os slots dobrarem esse valor e entender por que a Ethernet escuta antes de falar.",
    facts: [
      ["Carga G", dec(DEFAULTS.carga / 10, 2)],
      ["Slots simulados", String(SLOTS)],
      ["Quadro", `${DEFAULTS.quadro} bytes`],
    ],
  },
  outro: {
    title: "Acesso ao meio em resumo",
    text: `Sem coordenação, colisões desperdiçam o canal: o ALOHA puro aproveita no máximo ${pct(pureAloha(0.5))} e o com slots ${pct(slottedAloha(1))}, e carga demais derruba ambos. O CSMA/CD escuta antes, aborta ao detectar colisão e chega perto de 100% com quadros longos em cabos curtos. O recuo exponencial espalha as novas tentativas conforme a disputa aumenta.`,
    facts: (run) => [
      ["ALOHA puro", String(run.stats.pure)],
      ["Com slots", String(run.stats.slotted)],
      ["CSMA/CD", String(run.stats.csma)],
    ],
  },
  next: ["switch-vlan", "wpa"],
  practice,
};

export default lesson;
