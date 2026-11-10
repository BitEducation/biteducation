import type { LessonModule, Params } from "../../../contracts/types.ts";
import {
  dijkstra,
  dvConverge,
  dvInit,
  type Edge,
  INFINITY,
  longestMatch,
  type Route,
  type Tables,
} from "../../../sim/net/routing.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { seqScene, talk } from "../../../sim/shared/seq.ts";

/**
 * Distance vector (RIP-like, synchronous rounds every 30 s) converging, count-to-infinity after a
 * link failure, longest-prefix match on the resulting forwarding table, and link state by contrast.
 */
export const DEFAULTS = { custoAC: 7, falha: true };
const NODES = ["A", "B", "C", "D"] as const;
const PERIOD = 30; // RIP sends its vector every 30 s
const DST = "10.30.5.9";
/** Who announces each prefix, so the forwarding table follows the distance table. */
const PREFIXES: { prefix: string; len: number; owner: string; what: string }[] = [
  { prefix: "0.0.0.0", len: 0, owner: "B", what: "rota padrão (saída para a internet)" },
  { prefix: "10.30.0.0", len: 16, owner: "D", what: "o campus inteiro" },
  { prefix: "10.30.5.0", len: 24, owner: "C", what: "a rede do laboratório" },
];

export function edgesOf(custoAC: number): Edge[] {
  return [
    { a: "A", b: "B", cost: 1 },
    { a: "B", b: "C", cost: 2 },
    { a: "A", b: "C", cost: custoAC },
    { a: "C", b: "D", cost: 1 },
  ];
}

const rod = (n: number) => (n === 1 ? "1 rodada" : `${n} rodadas`);
const cost = (c: number) => (c >= INFINITY ? "∞" : String(c));
const vec = (t: Tables, x: string) => NODES.map((y) => `${y}${cost(t[x]?.[y]?.cost ?? INFINITY)}`).join(" ");

const scene = seqScene(
  [
    { id: "A", kind: "router", label: "Roteador A", sub: "prédio de aulas", at: [150, 170] },
    { id: "B", kind: "router", label: "Roteador B", sub: "saída da internet", at: [450, 70] },
    { id: "C", kind: "router", label: "Roteador C", sub: "laboratório", at: [450, 270] },
    { id: "D", kind: "router", label: "Roteador D", sub: "núcleo do campus", at: [780, 270] },
  ],
  {
    width: 1000,
    height: 600,
    links: [
      { id: "AB", from: "A", to: "B", via: [[150, 70]] },
      { id: "BC", from: "B", to: "C" },
      { id: "AC", from: "A", to: "C", via: [[150, 270]] },
      { id: "CD", from: "C", to: "D" },
    ],
    widgets: [
      {
        kind: "table",
        id: "links",
        title: "Enlaces e custos",
        at: [30, 380],
        columns: ["Enlace", "Custo"],
        widths: [90, 80],
        rows: 4,
      },
      {
        kind: "table",
        id: "dv",
        title: "Tabela de distâncias de A",
        at: [230, 380],
        columns: ["Destino", "Custo", "Próximo salto"],
        widths: [80, 70, 120],
        rows: 4,
      },
      {
        kind: "table",
        id: "fib",
        title: "Encaminhamento de A",
        at: [530, 380],
        columns: ["Prefixo", "Anunciado por", "Sai por"],
        widths: [140, 120, 100],
        rows: 3,
      },
    ],
  },
);

export function build(p: Params) {
  const custoAC = Math.min(15, Math.max(1, Number(p.custoAC ?? DEFAULTS.custoAC)));
  const falha = p.falha !== false;
  const b = lessonBuilder();
  const c = talk(b, { A: "Roteador A", B: "Roteador B", C: "Roteador C", D: "Roteador D" }, (t) => `${t} s`);
  const edges = edgesOf(custoAC);
  const rounds = dvConverge(NODES, edges, dvInit(NODES, edges));
  const last = rounds[rounds.length - 1] as Tables;
  const r0 = rounds[0] as Tables;
  const r1 = (rounds[1] ?? r0) as Tables;
  const a = (t: Tables, y: string) => t.A?.[y] ?? { cost: INFINITY, via: "-" };

  const showDv = (t: Tables, mark: (y: string) => "new" | "hit" | undefined) => {
    NODES.forEach((y, i) => {
      const e = a(t, y);
      const m = mark(y);
      c.row("dv", i, [y, cost(e.cost), y === "A" ? "(ele mesmo)" : e.via], m ? { mark: m } : {});
    });
  };
  const exchange = (t: Tables, only?: readonly [string, string][]) => {
    const pairs =
      only ?? edges.flatMap((e) => [[e.a, e.b] as [string, string], [e.b, e.a] as [string, string]]);
    pairs.forEach(([from, to], i) => {
      c.send(from, to, `vetor de ${from}`, { dt: i === 0 ? PERIOD : 0, detail: vec(t, from), role: "b" });
    });
  };

  b.step(
    {
      id: "s1-vizinhos",
      title: "Só os vizinhos",
      subtitle: "Rodada zero do vetor de distância",
      text: `Quatro roteadores do campus usam [[vetor-de-distancia|vetor de distância]], como o RIP. Cada enlace tem um custo, e no começo cada roteador só conhece os vizinhos diretos. A sabe que B custa ${a(r0, "B").cost} e C custa ${custoAC}, mas não faz ideia de que D existe: custo infinito. Ninguém tem o mapa da rede; cada um vai aprender só pelo que os vizinhos contam.`,
      facts: [
        ["A conhece", `B (${a(r0, "B").cost}) e C (${custoAC})`],
        ["D para A", "desconhecido (∞)"],
        ["Mapa completo", "ninguém tem"],
      ],
      highlight: ["A"],
    },
    () => {
      edges.forEach((e, i) => {
        c.row("links", i, [`${e.a}–${e.b}`, String(e.cost)]);
      });
      showDv(r0, (y) => (y !== "A" && a(r0, y).cost < INFINITY ? "new" : undefined));
      c.note("A", "conhece só os vizinhos");
    },
  );

  b.step(
    {
      id: "s2-troca",
      title: "A primeira troca",
      subtitle: `A cada ${PERIOD} s, cada um manda seu vetor`,
      text: `A cada ${PERIOD} segundos, cada roteador manda aos vizinhos o seu vetor: a lista de destinos e custos que conhece. A recebe o de B e o de C e faz uma conta para cada destino: custo até o vizinho mais o que o vizinho anunciou, ficando com o menor. Assim A descobre D com custo ${cost(a(r1, "D").cost)}, via ${a(r1, "D").via}, e passa a ir para C com custo ${cost(a(r1, "C").cost)}, via ${a(r1, "C").via}.`,
      facts: [
        ["Regra", "custo do enlace + custo anunciado"],
        ["A até C", `${cost(a(r1, "C").cost)} via ${a(r1, "C").via}`],
        ["A até D", `${cost(a(r1, "D").cost)} via ${a(r1, "D").via}`],
      ],
      highlight: ["A"],
    },
    () => {
      exchange(r0);
      showDv(r1, (y) => (a(r1, y).cost !== a(r0, y).cost ? "new" : undefined));
    },
  );

  const extra = rounds.slice(2);
  b.step(
    {
      id: "s3-converge",
      title: "Ninguém muda mais",
      subtitle: "Convergência",
      text:
        extra.length > 0
          ? `As notícias andam um salto por rodada. ${a(last, "D").cost < a(r1, "D").cost ? `Na rodada seguinte, A ouve de ${a(last, "D").via} um caminho melhor e corrige a rota para D: custo ${cost(a(last, "D").cost)}, via ${a(last, "D").via}.` : `A já tinha a melhor rota para D, mas outros roteadores ainda ajustam as suas.`} Depois de ${rod(rounds.length - 1)} nenhum vetor muda mais: a rede convergiu. Repare que A nunca viu o enlace C–D; só confiou no que B e C contaram.`
          : `Desta vez a primeira troca já bastou: depois de ${rod(rounds.length - 1)}, nenhum vetor muda mais e a rede convergiu. A vai para D com custo ${cost(a(last, "D").cost)}, via ${a(last, "D").via}. Repare que A nunca viu o enlace C–D; só confiou no que os vizinhos contaram.`,
      facts: [
        ["Rodadas até convergir", String(rounds.length - 1)],
        ["A até D", `${cost(a(last, "D").cost)} via ${a(last, "D").via}`],
        ["Tempo", `${(rounds.length - 1) * PERIOD} s`],
      ],
      highlight: ["A", "D"],
      quiz: {
        kind: "number",
        prompt: "Somando os custos dos enlaces, qual o menor custo de A até D?",
        answer: a(last, "D").cost,
        explain: `O menor caminho é o que o vetor de distância encontra depois de convergir: custo ${cost(a(last, "D").cost)}, saindo por ${a(last, "D").via}. Cada roteador só soma o enlace até o vizinho com o que o vizinho anuncia.`,
      },
    },
    () => {
      if (extra.length === 0) {
        c.note("A", "nenhum vetor mudou", "good", { dt: PERIOD });
        return;
      }
      let prev = r1;
      for (const t of extra) {
        exchange(prev);
        showDv(t, (y) => (a(t, y).cost !== a(prev, y).cost ? "new" : undefined));
        prev = t;
      }
      c.note("A", "convergiu", "good");
    },
  );

  // forwarding table: each prefix leaves through A's next hop towards its owner
  const fib: Route[] = PREFIXES.map((x) => ({ prefix: x.prefix, len: x.len, out: a(last, x.owner).via }));
  const { hits, best } = longestMatch(fib, DST);
  const bestOwner = PREFIXES.find((x) => x.len === best?.len);
  b.step(
    {
      id: "s4-prefixo",
      title: "O prefixo mais longo",
      subtitle: "Da tabela de distâncias à de encaminhamento",
      text: `Cada roteador anuncia também as redes que tem atrás de si. Na tabela de encaminhamento de A, o destino ${DST} combina com ${hits.length} entradas: a rota padrão, o /16 do campus e o /24 do laboratório. Vale o [[prefixo-mais-longo|prefixo mais longo]]: a entrada /${best?.len}, mais específica, ganha. O pacote sai por ${best?.out}, rumo a ${bestOwner?.owner}.`,
      facts: [
        ["Destino", DST],
        ["Entradas que combinam", String(hits.length)],
        ["Vence", `/${best?.len} → sai por ${best?.out}`],
      ],
      highlight: ["A", bestOwner?.owner ?? "C"],
    },
    () => {
      PREFIXES.forEach((x, i) => {
        const r = fib[i] as Route;
        c.row("fib", i, [`${x.prefix}/${x.len}`, x.owner, r.out], {
          dt: i === 0 ? 1 : 0,
          mark: r === best ? "hit" : "miss",
        });
      });
      c.send("A", best?.out ?? "B", `pacote p/ ${DST}`, { dt: 1, role: "a", detail: `/${best?.len} venceu` });
    },
  );

  let after = edges;
  if (falha) {
    after = edges.filter((e) => !(e.a === "B" && e.b === "C"));
    const f = dvConverge(NODES, after, last).slice(1);
    const fl = (f[f.length - 1] ?? last) as Tables;
    // rounds where A sends D-bound packets to B while B sends them back to A
    const loops = f.filter((t) => t.A?.D?.via === "B" && t.B?.D?.via === "A").length;
    const finalD = a(fl, "D");
    b.step(
      {
        id: "s5-falha",
        title: "O enlace B–C cai",
        subtitle: "Boas notícias correm, más se arrastam",
        text:
          loops > 0
            ? `O enlace B–C cai. B perde a rota direta para C, mas ouve de A um caminho até lá, sem saber que esse caminho passava por ele mesmo. A e B ficam se enganando e aumentando o custo de pouco em pouco: é a [[contagem-ao-infinito|contagem ao infinito]]. Durante ${rod(loops)} um pacote para D fica indo e voltando entre A e B. ${finalD.cost >= INFINITY ? `Depois de ${rod(f.length)} o custo chega a ${INFINITY}, o infinito do RIP, e A desiste: D fica inalcançável.` : `Só depois de ${rod(f.length)} A acha a rota certa: custo ${cost(finalD.cost)}, via ${finalD.via}.`}`
            : `O enlace B–C cai. B perde a rota direta para C e aprende outra por A. Como A já ia para D pelo enlace A–C, nenhum pacote fica preso: em ${rod(f.length)} tudo se acerta, e A segue até D com custo ${cost(finalD.cost)}, via ${finalD.via}. Aumente o custo de A–C no Laboratório para ver a [[contagem-ao-infinito|contagem ao infinito]].`,
        facts: [
          ["Rodadas até reconvergir", String(f.length)],
          ["Rodadas com laço A↔B", String(loops)],
          [
            "A até D no fim",
            finalD.cost >= INFINITY ? "inalcançável" : `${cost(finalD.cost)} via ${finalD.via}`,
          ],
        ],
        highlight: ["A", "B"],
      },
      () => {
        c.state("BC", "caiu", { dt: PERIOD, tone: "bad", label: "enlace B–C caiu" });
        c.row("links", 1, ["B–C", "caiu"], { mark: "bad" });
        let prev = last;
        for (const t of f) {
          exchange(prev, [
            ["A", "B"],
            ["B", "A"],
          ]);
          if (t.A?.D?.via === "B" && t.B?.D?.via === "A") {
            c.send("A", "B", "pacote p/ D", { dt: 0, role: "bad", detail: "laço" });
            c.send("B", "A", "pacote p/ D", { dt: 1, role: "bad", detail: "volta para A" });
          }
          showDv(t, (y) => (a(t, y).cost !== a(prev, y).cost ? "new" : undefined));
          prev = t;
        }
        // the forwarding table follows the new distances
        PREFIXES.forEach((x, i) => {
          const out = a(fl, x.owner).via;
          const before = (fib[i] as Route).out;
          c.row("fib", i, [`${x.prefix}/${x.len}`, x.owner, out], out !== before ? { mark: "new" } : {});
        });
        c.note("A", loops > 0 ? "laço desfeito" : "reconvergiu", "good");
      },
    );
  }

  const ls = dijkstra(NODES, after, "A");
  b.step(
    {
      id: "s6-estado",
      title: "Outra ideia: o mapa",
      subtitle: "Estado de enlace, como no OSPF",
      text: `No [[estado-de-enlace|estado de enlace]], usado pelo OSPF, cada roteador espalha para todos a lista dos seus enlaces e custos. Assim todos montam o mesmo mapa e cada um calcula sozinho o menor caminho, com o algoritmo de Dijkstra. A fecha os destinos na ordem ${ls.order.join(", ")} e chega a D com custo ${cost(ls.table.D?.cost ?? INFINITY)}, via ${ls.table.D?.via}, sem depender de boatos de vizinhos.`,
      facts: [
        ["Cada um sabe", "o mapa inteiro"],
        ["Ordem do Dijkstra", ls.order.join(" → ")],
        ["A até D", `${cost(ls.table.D?.cost ?? INFINITY)} via ${ls.table.D?.via}`],
      ],
      highlight: NODES.slice(),
      quiz: {
        kind: "choice",
        prompt: "Por que o estado de enlace não sofre a contagem ao infinito?",
        options: [
          "Porque manda vetores mais rápido",
          "Porque cada roteador tem o mapa e calcula o caminho sozinho",
          "Porque usa custos menores",
          "Porque não usa custos",
        ],
        answer: 1,
        explain:
          "No vetor de distância, um roteador só conhece o que o vizinho afirma, inclusive caminhos que passam por ele mesmo. No estado de enlace todos recebem a mesma lista de enlaces e calculam o caminho completo; quando um enlace cai, a mudança chega a todos e cada um refaz a conta.",
      },
    },
    () => {
      const from = falha ? "B" : "A";
      const label = falha ? "LSA: B–C caiu" : "LSA de A";
      const pairs: [string, string][] = falha
        ? [
            ["B", "A"],
            ["A", "C"],
            ["C", "D"],
          ]
        : [
            ["A", "B"],
            ["A", "C"],
            ["C", "D"],
          ];
      pairs.forEach(([x, y], i) => {
        c.send(x, y, label, { dt: i === 0 ? PERIOD : 0, role: "ctrl", detail: `vindo de ${from}` });
      });
      c.state("A", `Dijkstra: ${ls.order.join(", ")}`, { dt: 1, tone: "good" });
    },
  );

  return b.done({
    rounds: rounds.length - 1,
    costAD: a(last, "D").cost,
    best: best?.len ?? 0,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "roteamento",
    site: "redes",
    title: "Roteamento: como cada roteador escolhe o caminho",
    summary:
      "Vetor de distância convergindo rodada a rodada, contagem ao infinito quando um enlace cai, o prefixo mais longo e o estado de enlace por contraste.",
    area: "Rede",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 5,
        section: "5.2.4",
        note: "Roteamento por vetor de distância",
        verified: true,
      },
      {
        book: "tanenbaum-cn",
        chapter: 5,
        section: "5.2.5",
        note: "Roteamento de estado de enlace",
        verified: true,
      },
      {
        book: "tanenbaum-cn",
        chapter: 5,
        section: "5.7.2",
        note: "Endereços IP e o maior prefixo",
        verified: true,
      },
      { rfc: 2453, note: "RIP versão 2" },
      { rfc: 2328, note: "OSPF versão 2" },
    ],
    simplifications: [
      "Todos os roteadores trocam vetores ao mesmo tempo, em rodadas; na rede real cada um tem seu relógio.",
      "Sem horizonte dividido nem envenenamento reverso, para a contagem ao infinito aparecer.",
      "Os prefixos são anunciados junto com os vetores; o RIP real anuncia redes, não roteadores.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "custoAC",
        kind: "int",
        label: "Custo do enlace A–C",
        min: 1,
        max: 15,
        help: "Custos altos deixam a contagem ao infinito mais longa; 16 é o infinito do RIP.",
      },
      {
        key: "falha",
        kind: "bool",
        label: "Derrubar o enlace B–C",
        help: "Desligue para ver só a convergência.",
      },
    ],
  },
  build,
  intro: {
    text: "Um pacote atravessa vários roteadores, e cada um decide sozinho para onde mandá-lo. Mas de onde vem a tabela que ele consulta? Você vai ver quatro roteadores aprendendo caminhos só pelo que os vizinhos contam, o que acontece quando um enlace cai e como o estado de enlace resolve o mesmo problema de outro jeito.",
    facts: [
      ["Roteadores", "4"],
      ["Protocolos", "RIP (vetor) e OSPF (mapa)"],
      ["Troca de vetores", `a cada ${PERIOD} s`],
    ],
  },
  outro: {
    title: "Roteamento em resumo",
    text: "No vetor de distância cada roteador soma o custo até o vizinho com o que o vizinho anuncia; é simples, mas notícias ruins demoram e podem criar laços. No estado de enlace todos têm o mapa e calculam o caminho. Na hora de encaminhar, vence o prefixo mais longo.",
    facts: (run) => [
      ["Rodadas até convergir", String(run.stats.rounds)],
      ["Menor custo de A até D", String(run.stats.costAD)],
      ["Prefixo vencedor", `/${run.stats.best}`],
    ],
  },
  next: ["ping-traceroute", "nat"],
};

export default lesson;
