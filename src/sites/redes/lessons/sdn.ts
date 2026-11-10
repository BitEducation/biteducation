import type { LessonModule, Params } from "../../../contracts/types.ts";
import { type Pkt, type Policy, type Rule, type Step, simulate } from "../../../sim/net/sdn.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { seqScene, talk } from "../../../sim/shared/seq.ts";

/**
 * Software-defined networking: one controller programs one switch. Six packets of three flows;
 * only the first packet of each flow goes to the controller.
 */
const SRV = "203.0.113.5";
const PKTS: Pkt[] = [
  { src: "Lia", dst: SRV, port: 443 },
  { src: "Lia", dst: SRV, port: 443 },
  { src: "Malu", dst: SRV, port: 23 },
  { src: "Lia", dst: SRV, port: 443 },
  { src: "Malu", dst: SRV, port: 23 },
  { src: "Malu", dst: SRV, port: 443 },
];
const POLICY: Policy = (p) => (p.port === 23 ? "descartar" : "porta 3");
const STEPS = [[0, 1], [2, 3, 4], [5]];
/** Three flows taking turns, for the small-table step. */
const CYCLE: Pkt[] = [0, 1, 2, 0, 1, 2].map((i) => ({
  src: ["Lia", "Malu", "Caio"][i] as string,
  dst: SRV,
  port: 443,
}));
export const DEFAULTS = { capacidade: 2 };
const cap = (p: Params) => Math.min(6, Math.max(1, Math.round(Number(p.capacidade ?? DEFAULTS.capacidade))));

const scene = seqScene(
  [
    { id: "lia", kind: "laptop", label: "Lia", sub: "porta 1", at: [110, 60] },
    { id: "malu", kind: "laptop", label: "Malu", sub: "porta 2", at: [110, 170] },
    { id: "sw", kind: "switch", label: "Comutador", sub: "tabela de fluxos", at: [430, 115] },
    { id: "ctl", kind: "server", label: "Controlador", sub: "a política", at: [740, 50] },
    { id: "srv", kind: "server", label: "Biblioteca", sub: "porta 3", at: [740, 175] },
  ],
  {
    height: 600,
    links: [
      { id: "l1", from: "lia", to: "sw", style: "bus" },
      { id: "l2", from: "malu", to: "sw", style: "bus" },
      { id: "l3", from: "sw", to: "ctl", style: "dashed" },
      { id: "l4", from: "sw", to: "srv", style: "bus" },
    ],
    widgets: [
      {
        kind: "table",
        id: "fluxos",
        title: "Tabela de fluxos do comutador",
        at: [40, 240],
        columns: ["Casa com (origem, destino, porta)", "Ação", "Pacotes"],
        widths: [340, 140, 100],
        rows: 3,
      },
      { kind: "counter", id: "pin", title: "Pacotes enviados ao controlador", at: [680, 240] },
      {
        kind: "table",
        id: "pequena",
        title: "Três fluxos se alternando, tabela pequena",
        at: [40, 400],
        columns: ["Pacote", "Fluxo", "Na tabela?", "Regra que saiu"],
        widths: [90, 120, 140, 200],
        rows: CYCLE.length,
      },
    ],
  },
);

const matchText = (p: Pkt) => `${p.src}, ${p.dst}, ${p.port}`;

export function build(p: Params) {
  const capacity = cap(p);
  const b = lessonBuilder();
  const c = talk(b, { lia: "Lia", malu: "Malu", sw: "Comutador", ctl: "Controlador", srv: "Biblioteca" });
  const { steps } = simulate(PKTS, POLICY);
  const hits: number[] = [];
  const rules: Rule[] = [];
  let pin = 0;
  const play = (s: Step) => {
    const from = s.pkt.src === "Lia" ? "lia" : "malu";
    c.send(from, "sw", `porta ${s.pkt.port}`, { role: from === "lia" ? "a" : "b", detail: matchText(s.pkt) });
    if (s.miss) {
      pin++;
      c.send("sw", "ctl", "packet-in", { role: "ctrl", detail: "nenhuma regra casa" });
      c.send("ctl", "sw", "flow-mod", { role: "ctrl", detail: `instala: ${s.action}` });
      rules[s.rule] = { match: s.pkt, action: s.action, hits: 0 };
      c.count("pin", String(pin), { dt: 0, label: `${pin} ao controlador` });
    }
    hits[s.rule] = (hits[s.rule] ?? 0) + 1;
    c.row("fluxos", s.rule, [matchText(s.pkt), s.action, String(hits[s.rule])], {
      dt: 0,
      mark: s.miss ? "new" : s.action === "descartar" ? "bad" : "hit",
    });
    if (s.action === "descartar")
      c.state("sw", "descartado", { tone: "bad", label: `porta ${s.pkt.port} descartada`, dt: 0 });
    else c.send("sw", "srv", `porta ${s.pkt.port}`, { role: from === "lia" ? "a" : "b" });
  };
  const playStep = (k: number) => {
    for (const i of STEPS[k] as number[]) play(steps[i] as Step);
  };
  const misses = steps.filter((s) => s.miss).length;
  const small = simulate(CYCLE, POLICY, capacity);
  const smallMiss = small.steps.filter((s) => s.miss).length;
  const two = simulate(CYCLE, POLICY, 2).steps.filter((s) => s.miss).length;
  const notes: string[] = [];
  if (capacity >= 3)
    notes.push(
      `Com ${capacity} regras, os três fluxos cabem: só o primeiro pacote de cada um vai ao controlador.`,
    );
  const after1 = steps.slice(0, 2).filter((s) => s.miss).length;

  b.step(
    {
      id: "s1-separar",
      title: "Quem decide e quem repassa",
      subtitle: `${after1} de 2 pacotes ao controlador`,
      text: `Num roteador comum, a decisão e o repasse moram na mesma caixa. Na [[sdn]], o comutador só guarda uma [[tabela-de-fluxos]]: regras do tipo "se casar com isto, faça aquilo". A decisão fica num [[controlador-sdn]] à parte. O primeiro pacote de Lia não casa com nada, e o comutador o manda ao controlador (packet-in). O controlador consulta a política e instala a regra (flow-mod); o segundo pacote já casa e segue direto.`,
      facts: [
        ["Comutador", "casa e executa"],
        ["Controlador", "decide e instala"],
        ["Ao controlador", `${after1} de 2`],
      ],
      highlight: ["sw", "ctl"],
    },
    () => playStep(0),
  );

  b.step(
    {
      id: "s2-politica",
      title: "Uma política para a rede",
      subtitle: "A porta 23 é descartada",
      text: `A política diz que telnet, a porta 23, não passa: sem cifra, ela expõe senhas. Malu tenta a porta 23; a primeira tentativa vai ao controlador, que instala uma regra de descarte. A segunda tentativa de Malu morre no próprio comutador, sem incomodar o controlador. Enquanto isso, o terceiro pacote de Lia casa com a regra dela. A mesma política, escrita uma vez no controlador, vale para todos os comutadores que ele programa.`,
      facts: [
        ["Regra", "porta 23 → descartar"],
        ["Regras na tabela", "2"],
        ["Escrita", "uma vez, no controlador"],
      ],
      highlight: ["malu", "sw", "ctl"],
    },
    () => playStep(1),
  );

  b.step(
    {
      id: "s3-novo-fluxo",
      title: "Cada fluxo novo pergunta",
      subtitle: `${misses} de ${PKTS.length} pacotes ao controlador`,
      text: `Malu agora abre a porta 443. É um fluxo novo, porque a regra dela casava só com a porta 23, e ele vai ao controlador. No total, ${misses} dos ${PKTS.length} pacotes subiram: um por fluxo. É assim que a SDN escala: o controlador vê só o começo de cada fluxo, e o resto anda na velocidade do comutador. Se o controlador cair, os fluxos já instalados continuam, mas nenhum fluxo novo é decidido.`,
      facts: [
        ["Fluxos", String(misses)],
        ["Pacotes", String(PKTS.length)],
        ["Ao controlador", String(misses)],
      ],
      highlight: ["malu", "ctl"],
      quiz: {
        kind: "number",
        prompt: `Chegam mais 10 pacotes, todos de fluxos que já têm regra. Quantos vão ao controlador?`,
        answer: 0,
        explain: "Todos casam com regras já instaladas na tabela de fluxos; o comutador os trata sozinho.",
      },
    },
    () => playStep(2),
  );

  b.step(
    {
      id: "s4-tabela-pequena",
      title: "Quando a tabela enche",
      subtitle: `${smallMiss} de ${CYCLE.length} ao controlador`,
      text: `A tabela de fluxos fica numa memória rápida e cara, e cabe pouco: aqui, ${capacity} ${capacity === 1 ? "regra" : "regras"}. Lia, Malu e Caio se alternam. Quando chega um fluxo sem regra e a tabela está cheia, o comutador apaga a regra usada há mais tempo para abrir espaço. Com três fluxos se revezando, ${smallMiss} dos ${CYCLE.length} pacotes vão ao controlador. O controlador vira gargalo, e redes reais agrupam fluxos com curingas para usar menos regras.`,
      facts: [
        ["Capacidade", `${capacity} ${capacity === 1 ? "regra" : "regras"}`],
        ["Fluxos", "3, alternados"],
        ["Ao controlador", `${smallMiss} de ${CYCLE.length}`],
      ],
      highlight: ["sw", "ctl"],
      quiz: {
        kind: "number",
        prompt: `Com espaço para 2 regras e os fluxos Lia, Malu, Caio, Lia, Malu, Caio, quantos dos ${CYCLE.length} pacotes vão ao controlador?`,
        answer: two,
        explain:
          "Cada fluxo novo apaga a regra usada há mais tempo, que é justamente a do próximo fluxo da fila: todos os pacotes erram a tabela.",
      },
    },
    () => {
      const inTable: string[] = [];
      small.steps.forEach((s, i) => {
        let out = "";
        if (s.miss) {
          if (inTable.length >= capacity) out = inTable[s.rule] ?? "";
          inTable[s.rule] = s.pkt.src;
          c.send("sw", "ctl", "packet-in", { role: "ctrl", detail: `${s.pkt.src}: sem regra`, dt: 1 });
        }
        c.row("pequena", i, [String(i + 1), s.pkt.src, s.miss ? "não" : "sim", out ? `a de ${out}` : ""], {
          dt: 0,
          mark: s.miss ? "bad" : "hit",
        });
      });
    },
  );

  b.step(
    {
      id: "s5-onde",
      title: "Onde a SDN está",
      subtitle: "Datacenters e redes de longa distância",
      text: "A ideia de separar controle e repasse veio do OpenFlow, por volta de 2008. Hoje ela está nos datacenters, onde um controlador programa milhares de comutadores, e em redes de longa distância como a B4 do Google, que decide de forma centralizada por onde mandar o tráfego entre datacenters. A regra pode casar com muitos campos, de endereços MAC a portas TCP, e a ação pode reescrever cabeçalhos, além de descartar ou repassar.",
      facts: [
        ["Origem", "OpenFlow, 2008"],
        ["Uso", "datacenters, WAN"],
        ["Ações", "repassar, descartar, reescrever"],
      ],
      highlight: ["ctl"],
    },
    () => {
      c.state("ctl", "programa a rede toda", { tone: "good", label: "visão central" });
    },
  );

  return b.done({ misses, packets: PKTS.length, rules: rules.length, smallMiss }, notes);
}

const lesson: LessonModule = {
  meta: {
    slug: "sdn",
    site: "redes",
    title: "Redes definidas por software",
    summary:
      "Um controlador programa a tabela de fluxos de um comutador; só o primeiro pacote de cada fluxo pergunta, enquanto a tabela couber.",
    area: "Rede",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 5,
        section: "5.6",
        note: "Redes definidas por software: planos de controle e de dados",
        verified: true,
      },
      {
        url: "https://opennetworking.org/sdn-resources/openflow/",
        title: "Open Networking Foundation: OpenFlow",
      },
    ],
    simplifications: [
      "A regra casa com origem, destino e porta exatos; o OpenFlow aceita curingas e prioridades.",
      "Não há tempo de expiração das regras nem vários comutadores; a troca da regra usada há mais tempo é uma das políticas possíveis.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "capacidade",
        kind: "int",
        label: "Regras que cabem na tabela",
        min: 1,
        max: 6,
        help: "Vale para o passo da tabela pequena, com três fluxos se alternando.",
      },
    ],
  },
  build,
  intro: {
    text: "Lia e Malu acessam a biblioteca por um comutador que não sabe decidir nada sozinho: ele só segue regras. Você vai ver quem escreve essas regras, quando ele é consultado e por que isso não vira um gargalo.",
    facts: [
      ["Pacotes", String(PKTS.length)],
      ["Fluxos", "3"],
      ["Política", "porta 23 bloqueada"],
    ],
  },
  outro: {
    title: "SDN em resumo",
    text: "O comutador casa pacotes com uma tabela de fluxos; o controlador decide e instala regras quando aparece um fluxo novo. A política fica num lugar só, e o controlador só vê o primeiro pacote de cada fluxo.",
    facts: (run) => [
      ["Pacotes", String(run.stats.packets)],
      ["Ao controlador", String(run.stats.misses)],
      ["Regras instaladas", String(run.stats.rules)],
    ],
  },
  next: ["roteamento", "firewall-varredura"],
};

export default lesson;
