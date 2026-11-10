import type { LessonModule, Params } from "../../../contracts/types.ts";
import { buildTime, type Hop, knowledge, layers } from "../../../sim/net/onion.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { seqScene, talk } from "../../../sim/shared/seq.ts";
import { tor as practice } from "../practice.ts";

/**
 * Tor: Lia reaches a site through guard, middle and exit relays. The circuit is built hop by
 * hop, each cell carries three layers, and no single relay knows both ends.
 */
const DEFAULTS = { meio: 30 };
const pathOf = (p: Params): Hop[] => [
  { name: "Guarda", ms: 20 },
  { name: "Meio", ms: Math.min(150, Math.max(5, Math.round(Number(p.meio ?? DEFAULTS.meio)))) },
  { name: "Saída", ms: 25 },
];
const TO_SITE = 15;
const DIRECT = 35;
const RELAYS = pathOf(DEFAULTS).map((h) => h.name);
const ENDS = ["Lia", ...RELAYS, "Site"];

const scene = seqScene(
  [
    { id: "lia", kind: "laptop", label: "Lia", sub: "198.51.100.23" },
    { id: "g", kind: "server", label: "Guarda", sub: "relé 1" },
    { id: "m", kind: "server", label: "Meio", sub: "relé 2" },
    { id: "x", kind: "server", label: "Saída", sub: "relé 3" },
    { id: "site", kind: "server", label: "Site", sub: "biblioteca.example" },
  ],
  {
    height: 620,
    widgets: [
      {
        kind: "table",
        id: "sabe",
        title: "Quem sabe o quê",
        at: [40, 240],
        columns: ["Ponto", "Recebe de", "Entrega a", "Sabe que Lia acessa o site?"],
        widths: [150, 150, 150, 260],
        rows: 4,
      },
      { kind: "counter", id: "camadas", title: "Camadas na célula", at: [800, 240] },
      {
        kind: "table",
        id: "tempo",
        title: "Montar o circuito (ms)",
        at: [40, 440],
        columns: ["Estende até", "Ida e volta", "Acumulado"],
        widths: [150, 140, 140],
        rows: 3,
      },
    ],
  },
);

const ID: Record<string, string> = { Guarda: "g", Meio: "m", Saída: "x" };

export function build(p: Params = DEFAULTS) {
  const PATH = pathOf(p);
  const b = lessonBuilder();
  const c = talk(b, { lia: "Lia", g: "Guarda", m: "Meio", x: "Saída", site: "Site" });
  const bt = buildTime(PATH);
  const ly = layers(RELAYS);
  const kn = knowledge(ENDS);
  const built = (bt[bt.length - 1] as { total: number }).total;
  const oneWay = PATH.reduce((a, h) => a + h.ms, 0) + TO_SITE;
  const rttTor = 2 * oneWay;

  b.step(
    {
      id: "s1-proxy",
      title: "Um intermediário sabe tudo",
      subtitle: "O proxy vê os dois lados",
      text: "Lia quer ler a biblioteca sem que o provedor saiba qual site ela acessa e sem que o site saiba quem ela é. Um proxy ou uma VPN escondem Lia do site, mas o próprio intermediário vê as duas pontas: quem pediu e o que pediu. A ideia do [[roteamento-cebola]] é dividir esse conhecimento entre vários intermediários, de modo que nenhum, sozinho, ligue Lia ao site.",
      facts: [
        ["Proxy único", "sabe as duas pontas"],
        ["Tor", "três relés"],
        ["Objetivo", "ninguém sabe tudo"],
      ],
      highlight: ["lia", "site"],
    },
    () => {
      c.row("sabe", 0, ["Proxy único", "Lia", "Site", "sim"], { dt: 1, mark: "bad" });
    },
  );

  b.step(
    {
      id: "s2-circuito",
      title: "Um relé de cada vez",
      subtitle: `${built} ms para montar`,
      text: `No [[tor]], Lia escolhe três relés: guarda, meio e saída. Ela combina uma chave com a guarda por Diffie-Hellman; depois, pelo canal cifrado com a guarda, combina outra com o meio; e, pelos dois, uma terceira com a saída. Cada extensão é uma ida e volta até o relé mais novo: ${bt.map((x) => x.rtt).join(", ")} ms, ${built} ms no total. O meio nunca fala diretamente com Lia.`,
      facts: [
        ["Relés", RELAYS.join(", ")],
        ["Chaves", "uma por relé"],
        ["Montagem", `${built} ms`],
      ],
      highlight: ["lia", "g", "m", "x"],
      quiz: {
        kind: "number",
        prompt: `Os trechos levam ${PATH.map((h) => `${h.ms} ms`).join(", ")} só de ida, de Lia à guarda, da guarda ao meio e do meio à saída. Quantos ms leva montar o circuito inteiro?`,
        answer: built,
        tolerance: 0,
        unit: "ms",
        explain: `Cada extensão vai e volta até o relé mais novo: ${bt.map((x) => `2 × ${x.rtt / 2}`).join(" + ")} = ${built} ms. O primeiro trecho é pago três vezes.`,
      },
    },
    () => {
      const ids = ["g", "m", "x"];
      bt.forEach((x, i) => {
        const to = ids[i] as string;
        c.send("lia", to, `estende até ${x.hop}`, {
          role: "ctrl",
          detail: "troca Diffie-Hellman",
          ...(i > 0 ? { via: ids.slice(0, i) } : {}),
        });
        c.row("tempo", i, [x.hop, String(x.rtt), String(x.total)], { dt: 0, mark: "new" });
      });
    },
  );

  b.step(
    {
      id: "s3-camadas",
      title: "Três camadas, uma por relé",
      subtitle: "Cada relé tira a sua",
      text: `Lia cifra o pedido três vezes: primeiro com a chave da saída, depois com a do meio, por fim com a da guarda. A célula sai com ${ly[0]?.layers} camadas. A guarda tira a sua e só lê para onde repassar; o meio faz o mesmo; a saída tira a última e encontra o pedido ao site. Todas as células têm 512 bytes, para que o tamanho não diga nada sobre o conteúdo.`,
      facts: [
        ["Camadas ao sair", String(ly[0]?.layers)],
        ["Célula", "512 bytes"],
        ["Ordem de cifrar", "saída, meio, guarda"],
      ],
      highlight: ["g", "m", "x"],
    },
    () => {
      const ids = ["lia", "g", "m", "x"];
      ly.forEach((l, i) => {
        c.send(ids[i] as string, ID[l.at] as string, `célula, ${l.layers} camadas`, {
          role: "a",
          detail: l.sees,
        });
        c.count("camadas", String(l.layers - 1), { dt: 0, label: `${l.at} tira 1: ${l.layers - 1}` });
      });
      c.send("x", "site", "GET /", { role: "b", detail: "sai da rede Tor" });
    },
  );

  b.step(
    {
      id: "s4-quem-sabe",
      title: "Ninguém liga as pontas",
      subtitle: "Cada relé vê só os vizinhos",
      text: `A guarda sabe que Lia usa o Tor, mas só vê que repassa células ao meio. O meio recebe da guarda e entrega à saída: não conhece nenhuma das pontas. A saída sabe qual site está sendo acessado, mas recebe do meio, não de Lia. Para ligar Lia ao site, seria preciso dominar ao mesmo tempo a guarda e a saída do mesmo circuito, e os relés são escolhidos entre milhares mantidos por pessoas diferentes.`,
      facts: [
        ["Guarda", "sabe quem, não onde"],
        ["Meio", "não sabe nenhum"],
        ["Saída", "sabe onde, não quem"],
      ],
      highlight: ["g", "m", "x"],
      quiz: {
        kind: "choice",
        prompt: "Qual relé conhece o endereço IP de Lia?",
        options: ["Só a guarda", "Só a saída", "Os três"],
        answer: 0,
        explain: "Só a guarda recebe pacotes diretamente de Lia; o meio e a saída recebem de outros relés.",
      },
    },
    () => {
      kn.forEach((k, i) => {
        c.row("sabe", i + 1, [k.who, k.from, k.to, "não"], { dt: i === 0 ? 1 : 0, mark: "hit" });
      });
    },
  );

  b.step(
    {
      id: "s5-limites",
      title: "O que fica exposto",
      subtitle: `${rttTor} ms contra ${2 * DIRECT}`,
      text: `O caminho mais longo custa: cada ida e volta leva ${rttTor} ms em vez de ${2 * DIRECT}. A saída lê o pedido como ele sai, então sem HTTPS ela vê o conteúdo; com HTTPS, só o nome do site. E quem observa as duas pontas ao mesmo tempo, o provedor de Lia e o do site, pode correlacionar os horários e tamanhos dos fluxos. O Tor esconde quem fala com quem de observadores parciais, não de quem vê a rede inteira.`,
      facts: [
        ["Ida e volta", `${rttTor} ms`],
        ["Direto", `${2 * DIRECT} ms`],
        ["Use junto", "HTTPS"],
      ],
      highlight: ["x", "site"],
    },
    () => {
      c.state("x", "lê o pedido que sai", { tone: "warn", label: "sem HTTPS, vê o conteúdo" });
    },
  );

  return b.done(
    { built, rttTor, direct: 2 * DIRECT },
    PATH[1]?.ms === DEFAULTS.meio
      ? []
      : [
          `Com o relé do meio a ${PATH[1]?.ms} ms, montar o circuito leva ${built} ms e cada ida e volta, ${rttTor} ms.`,
        ],
  );
}

const lesson: LessonModule = {
  meta: {
    slug: "tor",
    site: "redes",
    title: "Tor: roteamento cebola",
    summary:
      "Um circuito de três relés montado um de cada vez, uma camada de cifra por relé, e ninguém que conheça as duas pontas.",
    area: "Segurança",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 8,
        section: "8.13.1",
        note: "Privacidade e anonimato: roteamento cebola",
        verified: true,
      },
      { url: "https://spec.torproject.org/tor-spec/", title: "Tor Protocol Specification" },
    ],
    simplifications: [
      "As latências são fixas e a montagem ignora o tempo de cálculo das chaves.",
      "A escolha dos relés, as guardas fixas e o diretório de relés não aparecem.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "meio", kind: "int", label: "Guarda até o meio (ms, só ida)", min: 5, max: 150, step: 5 },
    ],
  },
  build,
  intro: {
    text: "Cifrar esconde o conteúdo, mas não quem conversa com quem. Você vai acompanhar Lia montando um circuito Tor e ver, relé por relé, o que cada um consegue saber.",
    facts: [
      ["Relés", "3"],
      ["Célula", "512 bytes"],
      ["Destino", "biblioteca.example"],
    ],
  },
  outro: {
    title: "Tor em resumo",
    text: "Lia monta um circuito de três relés, combinando uma chave com cada um, e envia células com uma camada de cifra por relé. Cada relé vê só os vizinhos; o preço é latência maior, e quem observa as duas pontas ainda pode correlacionar.",
    facts: (run) => [
      ["Montagem do circuito", `${run.stats.built} ms`],
      ["Ida e volta pelo Tor", `${run.stats.rttTor} ms`],
      ["Ida e volta direta", `${run.stats.direct} ms`],
    ],
  },
  next: ["tls13", "wireguard"],
  practice,
};

export default lesson;
