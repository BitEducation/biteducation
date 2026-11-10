import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { bits, clientServer, lookup, peerToPeer, rarest, type Swarm, xor } from "../../../sim/net/p2p.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { p2p as practice } from "../practice.ts";

/**
 * Peer-to-peer: distribution time with and without peers uploading, BitTorrent's rarest-first
 * choice, and a Kademlia lookup by XOR distance.
 */
const DEFAULTS = { envio: 5 };
const swarm = (p: Params): Swarm => ({
  file: 1000,
  server: 100,
  up: Math.min(20, Math.max(1, Math.round(Number(p.envio ?? DEFAULTS.envio)))),
  down: 20,
});
const MAX = 50;
const MINE = [true, false, false, false, false, false];
const PEERS = [
  [true, true, false, false, true, false],
  [true, false, false, true, true, false],
  [true, true, true, false, true, false],
];
const KEY = 0b1011;
const START = 0b0001;
// Contacts keyed by node id (0001 = 1, 0100 = 4, 1100 = 12, 1010 = 10, 1111 = 15, 0111 = 7).
const CONTACTS: Record<number, number[]> = {
  1: [0b0100, 0b1100],
  4: [0b0001, 0b0111],
  12: [0b1010, 0b1111, 0b0100],
  10: [0b1100, 0b1111],
  15: [0b1100],
  7: [0b0100],
};

const scene: SceneSpec = {
  viewBox: [960, 600],
  nodes: [],
  links: [],
  widgets: [
    {
      kind: "chart",
      id: "tempo",
      title: "Tempo para todos terem o arquivo de 1 Gbit (s)",
      at: [40, 40],
      width: 420,
      height: 220,
      x: { label: "clientes", max: MAX },
      y: { label: "segundos", max: 500 },
    },
    {
      kind: "table",
      id: "pecas",
      title: "Peças que Lia não tem: quantos vizinhos têm",
      at: [560, 40],
      columns: ["Peça", "Vizinhos com ela", "Escolha"],
      widths: [70, 160, 130],
      rows: 5,
    },
    {
      kind: "table",
      id: "dht",
      title: `Busca da chave ${bits(KEY)} a partir de ${bits(START)}`,
      at: [40, 330],
      columns: ["Consulta", "Distância XOR", "Indicou"],
      widths: [140, 200, 260],
      rows: 2,
    },
  ],
};

const s0 = (x: number) => String(Math.round(x));

export function build(p: Params = DEFAULTS) {
  const SWARM = swarm(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const ns = [1, ...Array.from({ length: MAX / 5 }, (_, i) => (i + 1) * 5)];
  const cs = clientServer(SWARM, MAX);
  const pp = peerToPeer(SWARM, MAX);
  const r = rarest(MINE, PEERS);
  const hops = lookup(START, KEY, CONTACTS);
  const found = hops[hops.length - 1]?.best ?? START;
  const firstAsk = hops[0]?.asked ?? START;

  b.step(
    {
      id: "s1-servidor",
      title: "Um servidor para todos",
      subtitle: `${MAX} clientes: ${s0(cs)} s`,
      text: `A biblioteca distribui um arquivo de 1 Gbit com um servidor de 100 Mbit/s. Cada cliente precisa receber o arquivo inteiro, e todas as cópias saem do mesmo servidor: ${MAX} clientes são ${MAX} Gbit para enviar, ${s0(cs)} segundos. O tempo cresce em linha reta com o número de clientes, porque a capacidade de envio não cresce. Os clientes, que também poderiam enviar, ficam parados.`,
      facts: [
        ["Servidor", "100 Mbit/s"],
        ["Clientes", String(MAX)],
        ["Tempo", `${s0(cs)} s`],
      ],
      highlight: [],
    },
    () => {
      ns.forEach((n, i) => {
        c.plot("tempo", "cliente-servidor", n, Math.round(clientServer(SWARM, n)), {
          role: "bad",
          dt: i === 0 ? 1 : 0,
          label: `${n} clientes: ${s0(clientServer(SWARM, n))} s`,
        });
      });
    },
  );

  b.step(
    {
      id: "s2-pares",
      title: "Cada cliente também envia",
      subtitle: `${MAX} pares: ${s0(pp)} s`,
      text: `Numa rede [[p2p]], cada par repassa aos outros as partes que já tem, a ${SWARM.up} Mbit/s. A capacidade total de envio passa a ser 100 + ${SWARM.up} vezes o número de pares, e cresce junto com a demanda. Com ${MAX} pares, todos têm o arquivo em ${s0(pp)} segundos, contra ${s0(cs)}. A curva quase se achata: mais gente pedindo também é mais gente enviando.`,
      facts: [
        ["Envio de cada par", `${SWARM.up} Mbit/s`],
        ["Capacidade total", `${SWARM.server + MAX * SWARM.up} Mbit/s`],
        ["Tempo", `${s0(pp)} s`],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Com ${MAX} pares enviando a ${SWARM.up} Mbit/s e o servidor a 100 Mbit/s, quantos segundos leva para todos terem o arquivo de 1000 Mbit?`,
        answer: Math.round(pp),
        tolerance: 2,
        unit: "s",
        explain: `É preciso entregar ${MAX} × 1000 Mbit com ${SWARM.server + MAX * SWARM.up} Mbit/s de envio somados: ${MAX * 1000} / ${SWARM.server + MAX * SWARM.up} ≈ ${s0(pp)} s. O download de 20 Mbit/s daria no mínimo 50 s.`,
      },
    },
    () => {
      ns.forEach((n, i) => {
        c.plot("tempo", "par a par", n, Math.round(peerToPeer(SWARM, n)), {
          role: "a",
          dt: i === 0 ? 1 : 0,
          label: `${n} pares: ${s0(peerToPeer(SWARM, n))} s`,
        });
      });
    },
  );

  b.step(
    {
      id: "s3-rara",
      title: "Pedir a peça mais rara",
      subtitle: `Lia escolhe a peça ${r.pick + 1}`,
      text: `No BitTorrent, o arquivo é dividido em peças, e Lia tem só a peça 1. Ela conta quantos dos ${PEERS.length} vizinhos têm cada peça que lhe falta e pede primeiro a mais rara, a política [[mais-rara-primeiro]]. As peças 3 e 4 só existem num vizinho cada; Lia fica com a 3. Se esse vizinho sair, a peça continua no enxame, porque agora Lia também a tem. A peça 6 ninguém tem: vai esperar.`,
      facts: [
        ["Vizinhos", String(PEERS.length)],
        ["Escolha", `peça ${r.pick + 1}`],
        ["Sem ninguém", "peça 6"],
      ],
      highlight: [],
    },
    () => {
      let row = 0;
      r.counts.forEach((n, i) => {
        if (n === null) return;
        c.row(
          "pecas",
          row++,
          [String(i + 1), String(n), i === r.pick ? "pede esta" : n === 0 ? "ninguém tem" : ""],
          {
            dt: row === 1 ? 1 : 0,
            mark: i === r.pick ? "hit" : n === 0 ? "bad" : "new",
          },
        );
      });
    },
  );

  b.step(
    {
      id: "s4-xor",
      title: "Distância por XOR",
      subtitle: `${bits(firstAsk)} está a ${xor(firstAsk, KEY)} da chave`,
      text: `Quem tem o arquivo? Sem servidor central, a resposta mora numa [[dht]]. No Kademlia, nós e chaves têm identificadores do mesmo tamanho, aqui 4 bits, e cada chave fica no nó mais próximo dela. A distância é o XOR dos identificadores lido como número: entre ${bits(firstAsk)} e a chave ${bits(KEY)}, o XOR é ${bits(xor(firstAsk, KEY))}, distância ${xor(firstAsk, KEY)}. Quem difere no primeiro bit está longe, quem difere só no último, perto.`,
      facts: [
        ["Chave", bits(KEY)],
        ["Identificadores", "4 bits"],
        ["Distância", "XOR"],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Qual é a distância XOR entre o nó ${bits(found)} e a chave ${bits(KEY)}?`,
        answer: xor(found, KEY),
        explain: `${bits(found)} XOR ${bits(KEY)} = ${bits(xor(found, KEY))}, que vale ${xor(found, KEY)}.`,
      },
    },
    () => {
      const h = hops[0];
      if (h)
        c.row(
          "dht",
          0,
          [bits(h.asked), `${bits(xor(h.asked, KEY))} = ${xor(h.asked, KEY)}`, h.heard.map(bits).join(", ")],
          {
            dt: 1,
            mark: "new",
          },
        );
    },
  );

  b.step(
    {
      id: "s5-busca",
      title: "Cada salto, metade do caminho",
      subtitle: `${hops.length} consultas até ${bits(found)}`,
      text: `O nó ${bits(START)} conhece poucos outros, mas guarda contatos em todas as distâncias. Ele pergunta ao contato mais próximo da chave, ${bits(firstAsk)}, que indica nós mais perto ainda. A próxima consulta vai a ${bits(found)}, distância ${xor(found, KEY)}, e ninguém mais próximo aparece: em ${hops.length} consultas, a busca termina. Cada salto acerta pelo menos mais um bit, então numa rede de um milhão de nós bastam cerca de 20.`,
      facts: [
        ["Consultas", String(hops.length)],
        ["Nó responsável", bits(found)],
        ["Um milhão de nós", "cerca de 20 saltos"],
      ],
      highlight: [],
    },
    () => {
      const h = hops[1];
      if (h)
        c.row(
          "dht",
          1,
          [bits(h.asked), `${bits(xor(h.asked, KEY))} = ${xor(h.asked, KEY)}`, h.heard.map(bits).join(", ")],
          {
            dt: 1,
            mark: "hit",
          },
        );
    },
  );

  return b.done(
    { cs: s0(cs), pp: s0(pp), pick: r.pick + 1, hops: hops.length, found: bits(found) },
    SWARM.up === DEFAULTS.envio
      ? []
      : [
          `Com cada par enviando a ${SWARM.up} Mbit/s, ${MAX} pares recebem o arquivo em ${s0(pp)} s; só o servidor levaria ${s0(cs)} s.`,
        ],
  );
}

const lesson: LessonModule = {
  meta: {
    slug: "p2p",
    site: "redes",
    title: "Redes par a par: BitTorrent e DHT",
    summary:
      "Por que distribuir entre pares escala, a peça mais rara primeiro e a busca por distância XOR do Kademlia.",
    area: "Aplicação",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 7,
        section: "7.5.4",
        note: "Redes par a par: BitTorrent e DHTs",
        verified: true,
      },
      { url: "https://www.bittorrent.org/beps/bep_0005.html", title: "BEP 5: DHT do BitTorrent (Kademlia)" },
    ],
    simplifications: [
      "O tempo de distribuição usa a fórmula de fluxo contínuo, sem cabeçalhos nem atrasos.",
      "Os identificadores têm 4 bits; no BitTorrent têm 160, e cada nó guarda vários contatos por distância.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [{ key: "envio", kind: "int", label: "Envio de cada par (Mbit/s)", min: 1, max: 20 }],
  },
  build,
  intro: {
    text: "Distribuir um arquivo grande para muita gente sobrecarrega o servidor. Você vai ver por que deixar os clientes repassarem partes muda a conta, como cada par escolhe o que pedir e como achar quem tem algo sem um servidor central.",
    facts: [
      ["Arquivo", "1 Gbit"],
      ["Servidor", "100 Mbit/s"],
      ["Pares", `até ${MAX}`],
    ],
  },
  outro: {
    title: "P2P em resumo",
    text: "Quando cada par também envia, a capacidade cresce com a demanda. O BitTorrent pede primeiro as peças raras para mantê-las no enxame, e a DHT acha o nó responsável por uma chave em poucos saltos, aproximando-se pela distância XOR.",
    facts: (run) => [
      [`${MAX} clientes, servidor só`, `${run.stats.cs} s`],
      [`${MAX} pares`, `${run.stats.pp} s`],
      ["Consultas na DHT", String(run.stats.hops)],
    ],
  },
  next: ["streaming-cdn", "dns"],
  practice,
};

export default lesson;
