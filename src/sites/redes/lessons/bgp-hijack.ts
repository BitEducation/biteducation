import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { type AsLink, type BgpResult, type BgpRoute, lookup, rpki, runBgp } from "../../../sim/net/bgp.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * BGP between six autonomous systems: path-vector announcements, policy before path length,
 * AS_PATH loop rejection, and a simulated more-specific prefix hijack with its signals and RPKI
 * origin validation as the defense. Documentation prefixes and private-use AS numbers only.
 */
export const DEFAULTS = { politica: true, rov: true };
const PREFIX = "203.0.113.0/24";
const HALVES = ["203.0.113.0/25", "203.0.113.128/25"];
const DST = "203.0.113.10";
const ASES = [100, 200, 250, 300, 400, 666];
const LINKS: AsLink[] = [
  { a: 100, b: 300, rel: "provider" },
  { a: 100, b: 200, rel: "peer" },
  { a: 250, b: 200, rel: "provider" },
  { a: 400, b: 250, rel: "provider" },
  { a: 400, b: 300, rel: "provider" },
  { a: 666, b: 300, rel: "provider" },
];
const ROAS = [{ prefix: PREFIX, maxLen: 24, asn: 400 }];
const NAME = {
  100: "universidade",
  200: "provedor par",
  250: "provedor regional",
  300: "trânsito",
  400: "dono do prefixo",
  666: "sequestrador",
} as const;
const id = (asn: number) => `as${asn}`;

const scene: SceneSpec = {
  viewBox: [960, 560],
  nodes: [
    { id: "as100", kind: "router", label: "AS100", sub: NAME[100], at: [140, 200] },
    { id: "as300", kind: "router", label: "AS300", sub: NAME[300], at: [470, 80] },
    { id: "as200", kind: "router", label: "AS200", sub: NAME[200], at: [380, 310] },
    { id: "as250", kind: "router", label: "AS250", sub: NAME[250], at: [640, 310] },
    { id: "as400", kind: "router", label: "AS400", sub: PREFIX, at: [820, 190] },
    { id: "as666", kind: "attacker", label: "AS666", sub: NAME[666], at: [310, 195], hidden: true },
  ],
  links: [
    { id: "l100-300", from: "as100", to: "as300", via: [[140, 80]] },
    { id: "l100-200", from: "as100", to: "as200", via: [[140, 310]] },
    { id: "l200-250", from: "as200", to: "as250" },
    { id: "l250-400", from: "as250", to: "as400", via: [[820, 310]] },
    { id: "l300-400", from: "as300", to: "as400", via: [[820, 80]] },
    { id: "l666-300", from: "as666", to: "as300", style: "dashed" },
  ],
  widgets: [
    {
      kind: "table",
      id: "rib",
      title: "Rotas que o AS100 conhece",
      at: [40, 400],
      columns: ["Prefixo", "AS_PATH", "Recebida de", "Escolhida"],
      widths: [150, 150, 170, 110],
      rows: 4,
    },
    { kind: "counter", id: "saida", title: `Pacote para ${DST} vai para`, at: [690, 410] },
  ],
};

const relPt = { customer: "cliente", peer: "par", provider: "provedor", self: "própria" } as const;
const path = (r: BgpRoute) => r.path.join(" ");

export function build(p: Params) {
  const policy = p.politica === undefined ? DEFAULTS.politica : Boolean(p.politica);
  const useRov = p.rov === undefined ? DEFAULTS.rov : Boolean(p.rov);
  const b = lessonBuilder();
  const c = talk(
    b,
    { ...Object.fromEntries(ASES.map((a) => [id(a), `AS${a}`])), "l666-300": "enlace AS666–AS300" },
    (t) => `${t}`,
  );

  const legit = runBgp(ASES, LINKS, [{ prefix: PREFIX, origin: 400 }], { policy });
  const hijackAnn = [{ prefix: PREFIX, origin: 400 }, ...HALVES.map((h) => ({ prefix: h, origin: 666 }))];
  const hijack = runBgp(ASES, LINKS, hijackAnn, { policy });
  const defended = runBgp(ASES, LINKS, hijackAnn, useRov ? { policy, roas: ROAS, rov: [300] } : { policy });

  const ribRows = (res: BgpResult) => {
    const rows: BgpRoute[] = [];
    for (const [, list] of res.rib.get(100) ?? []) rows.push(...list);
    rows.sort((x, y) => x.prefix.localeCompare(y.prefix) || x.path.length - y.path.length);
    for (let i = 0; i < 4; i++) {
      const r = rows[i];
      const chosen = r && res.best.get(100)?.get(r.prefix);
      const isBest = !!r && !!chosen && chosen.from === r.from && path(chosen) === path(r);
      c.row(
        "rib",
        i,
        r ? [r.prefix, path(r), `AS${r.from} (${relPt[r.rel]})`, isBest ? "sim" : "não"] : ["", "", "", ""],
        {
          ...(r && isBest ? { mark: (r.path.includes(666) ? "bad" : "hit") as "bad" | "hit" } : {}),
          ...(r
            ? {
                log: {
                  who: "AS100",
                  what: `${r.prefix} via ${path(r)}`,
                  detail: isBest ? "escolhida" : "guardada",
                },
              }
            : {}),
        },
      );
    }
  };
  const exit = (res: BgpResult) => {
    const r = lookup(res, 100, DST);
    c.count("saida", r ? `AS${r.path[r.path.length - 1]}` : "nenhum", {
      role: r?.path.includes(666) ? "bad" : "a",
      label: r ? `${DST} casa com ${r.prefix}, caminho ${path(r)}` : "sem rota",
    });
    return r;
  };

  // ---- 1. autonomous systems
  b.step(
    {
      id: "s1-sistemas",
      title: "Redes de redes",
      subtitle: "Sistemas autônomos e o BGP",
      text: `A internet é feita de milhares de [[sistema-autonomo|sistemas autônomos]], redes de um mesmo dono, cada uma com um número (AS). Dentro de um AS, cada rede escolhe seu roteamento. Entre eles, todos falam [[bgp]]. O AS400 é dono do prefixo ${PREFIX}; a universidade, AS100, quer alcançá-lo. As ligações são contratos: um cliente paga ao provedor, e pares trocam tráfego sem pagar.`,
      facts: [
        ["Prefixo", PREFIX],
        ["Dono", "AS400"],
        ["Protocolo entre AS", "BGP"],
      ],
      highlight: ["as400", "as100"],
    },
    () => {
      c.state("as400", `anuncia ${PREFIX}`, { tone: "good", label: "AS400 é a origem" });
    },
  );

  // ---- 2. announcements travel, each AS prepending itself
  const route100 = legit.best.get(100)?.get(PREFIX);
  b.step(
    {
      id: "s2-anuncio",
      title: "O anúncio se espalha",
      subtitle: "Vetor de caminhos",
      text: `O AS400 anuncia o prefixo aos provedores. Cada AS que repassa o anúncio põe o próprio número na frente do [[as-path]]: o AS300 recebe "400" e repassa "300 400"; o AS200 recebe "250 400" e repassa "200 250 400". Quem repassa o quê segue o contrato: rotas de clientes vão para todos, mas rotas de pares e provedores só descem para clientes. O AS100 termina com dois caminhos.`,
      facts: [
        ["Via AS300", "300 400"],
        ["Via AS200", "200 250 400"],
        ["Rodadas até estabilizar", String(legit.rounds)],
      ],
      highlight: [],
    },
    () => {
      c.send("as400", "as300", "400", { what: PREFIX, detail: "AS_PATH 400" });
      c.send("as400", "as250", "400", { what: PREFIX, detail: "AS_PATH 400", dt: 0 });
      c.send("as250", "as200", "250 400", { what: PREFIX, detail: "AS_PATH 250 400" });
      c.send("as300", "as100", "300 400", { what: PREFIX, detail: "AS_PATH 300 400" });
      c.send("as200", "as100", "200 250 400", { what: PREFIX, detail: "AS_PATH 200 250 400" });
      ribRows(legit);
    },
  );

  // ---- 3. choice: policy first
  const alt = runBgp(ASES, LINKS, [{ prefix: PREFIX, origin: 400 }], { policy: !policy })
    .best.get(100)
    ?.get(PREFIX);
  const viaPeer = route100?.from === 200;
  b.step(
    {
      id: "s3-escolha",
      title: "Política antes da distância",
      subtitle: `AS100 sai pelo AS${route100?.from}`,
      text: policy
        ? `O BGP não procura o caminho mais curto primeiro. Antes vem a [[preferencia-local]], que reflete dinheiro: rota de cliente vale mais que rota de par, que vale mais que rota de provedor. O caminho pelo AS300 tem 2 saltos, mas o AS300 cobra; o pelo AS200 tem 3 e é de graça. O AS100 escolhe ${path(route100 as BgpRoute)}. Sem essa política, escolheria ${alt ? path(alt) : "outro"}.`
        : `Sem política de preferência, todas as rotas empatam e o BGP desempata pelo AS_PATH mais curto: ${path(route100 as BgpRoute)}, pelo AS300. Na prática, quase todo AS configura a [[preferencia-local]] para preferir rotas de clientes e de pares, mais baratas; com ela, o AS100 escolheria ${alt ? path(alt) : "outro"}.`,
      facts: [
        ["Escolhida", path(route100 as BgpRoute)],
        ["Critério", policy ? "preferência local" : "AS_PATH mais curto"],
        ["Alternativa", alt ? path(alt) : "—"],
      ],
      highlight: ["as100"],
      quiz: {
        kind: "choice",
        prompt: policy
          ? "O AS100 recebe 300 400 do provedor (pago) e 200 250 400 do par (gratuito). Com preferência local por custo, qual ele usa?"
          : "Sem preferência local, o AS100 compara 300 400 e 200 250 400. Qual ele usa?",
        options: ["300 400, pelo AS300", "200 250 400, pelo AS200"],
        answer: viaPeer ? 1 : 0,
        explain: viaPeer
          ? "A preferência local é comparada antes do tamanho do caminho: rota de par (150) ganha de rota de provedor (100), mesmo sendo mais longa."
          : "Com a mesma preferência local, vence o AS_PATH mais curto: 2 saltos contra 3.",
      },
    },
    () => {
      ribRows(legit);
      exit(legit);
    },
  );

  // ---- 4. loops
  const loop = legit.dropped.find((d) => d.why === "laço" && d.at === 400);
  b.step(
    {
      id: "s4-laco",
      quiz: {
        kind: "choice",
        prompt: "O AS400 recebe de volta um anúncio do próprio prefixo, com caminho 300 400. O que ele faz?",
        options: [
          "Descarta, porque o próprio número já está no caminho",
          "Guarda como rota alternativa para o prefixo",
          "Repassa adiante, pondo 400 na frente de novo",
        ],
        answer: 0,
        explain:
          "Ver o próprio número no as-path quer dizer que o anúncio já passou por ali. Aceitá-lo criaria um laço. É uma checagem local, sem precisar de contagem até o infinito.",
      },
      title: "Sem voltas",
      subtitle: "O AS_PATH impede laços",
      text: `O AS300 também repassa "300 400" para o próprio AS400, que é seu cliente. Ao ver o próprio número no caminho, o AS400 descarta o anúncio: aceitar faria o tráfego andar em círculo. Essa checagem simples basta para o BGP nunca formar laços, sem precisar de contagem até o infinito como no vetor de distâncias. Nesta rede, ${legit.dropped.filter((d) => d.why === "laço").length} anúncios foram descartados assim.`,
      facts: [
        ["Anúncio", loop ? path(loop.route) : "300 400"],
        ["Recebido por", "AS400"],
        ["Ação", "descarta"],
      ],
      highlight: ["as400"],
    },
    () => {
      c.send("as300", "as400", "300 400", {
        what: PREFIX,
        detail: "AS400 está no caminho: descarta",
        role: "warn",
      });
      c.state("as400", "vê 400 no caminho", { tone: "warn", label: "laço detectado" });
    },
  );

  // ---- 5. hijack (simulated)
  const hr = lookup(hijack, 100, DST);
  b.step(
    {
      id: "s5-sequestro",
      quiz: {
        kind: "pick",
        prompt:
          "Simulação: o AS666 anuncia dois /25 que cobrem o prefixo do AS400. Para qual AS vai o pacote do AS100 para 203.0.113.10?",
        targets: [
          { id: "as200", label: "AS200" },
          { id: "as300", label: "AS300" },
          { id: "as400", label: "AS400" },
          { id: "as666", label: "AS666" },
        ],
        answer: "as666",
        explain:
          "O encaminhamento escolhe o prefixo mais longo. Um /25 vence o /24 legítimo, não importa a preferência entre os caminhos: o pacote termina no AS666.",
      },
      title: "Um prefixo sequestrado",
      subtitle: "Mais específico vence",
      text: `Simulação: o AS666, cliente do AS300, anuncia ${HALVES.join(" e ")} como se fossem seus. Nada no BGP confere quem é dono de um prefixo, e o AS300 repassa os anúncios. Como o encaminhamento usa o [[prefixo-mais-longo]], os /25 vencem o /24 legítimo: o pacote do AS100 para ${DST} agora segue ${hr ? path(hr) : "?"} e cai no AS666. Foi esse tipo de erro, ou de ataque, que já tirou do ar serviços inteiros.`,
      facts: [
        ["Anúncio falso", HALVES.join(", ")],
        ["Caminho do pacote", hr ? path(hr) : "—"],
        ["Por quê", "/25 é mais longo que /24"],
      ],
      highlight: ["as666"],
    },
    () => {
      c.show(["as666"]);
      c.state("l666-300", "", { tone: "bad", label: "anúncio falso" });
      for (const h of HALVES)
        c.send("as666", "as300", "666", { role: "bad", what: h, detail: "origem falsa AS666" });
      c.send("as300", "as100", "300 666", { role: "bad", what: "dois /25", detail: "AS_PATH 300 666" });
      ribRows(hijack);
      exit(hijack);
    },
  );

  // ---- 6. signals
  b.step(
    {
      id: "s6-sinais",
      title: "Como perceber",
      subtitle: "Sinais de sequestro",
      text: `De dentro do AS100 tudo parece normal: a rota foi aprendida pelo BGP como qualquer outra. Os sinais aparecem para quem olha de fora. Coletores públicos de rotas mostram uma origem nova, AS666, para pedaços de ${PREFIX}. Um traceroute passa por redes que nunca estiveram no caminho. A latência muda, e usuários reclamam de certificado inválido quando o serviço é HTTPS. Serviços de monitoramento alertam o dono do prefixo.`,
      facts: [
        ["Origem esperada", "AS400"],
        ["Origem vista", "AS666"],
        ["Prefixo", "mais específico que o anunciado"],
      ],
      highlight: [],
      tags: ["signals"],
    },
    () => {
      c.note("as400", "monitor: origem inesperada AS666", "bad");
      c.state("as400", "alerta de origem", { tone: "bad", label: "monitor de rotas alerta o AS400" });
    },
  );

  // ---- 7. defense: RPKI origin validation
  const dr = lookup(defended, 100, DST);
  const verdict = rpki(ROAS, HALVES[0] as string, 666);
  b.step(
    {
      id: "s7-rpki",
      title: "Assinar a origem",
      subtitle: useRov ? "RPKI e validação de origem" : "Sem validação de origem",
      text: useRov
        ? `Com [[rpki]], o AS400 publica um certificado (ROA) dizendo: ${PREFIX}, até /24, só pode ser originado pelo AS400. O AS300 valida cada anúncio: os /25 vindos do AS666 dão ${verdict === "invalid" ? "inválido" : verdict}, pela origem errada e pelo tamanho acima do permitido, e são descartados. O pacote volta a seguir ${dr ? path(dr) : "?"}. O RPKI não confere o caminho inteiro; filtros de prefixo dos clientes completam a proteção.`
        : `Sem validação de origem, o AS300 aceita qualquer anúncio do cliente, e o sequestro continua: o pacote segue ${dr ? path(dr) : "?"}. Com [[rpki]], o dono publica um certificado (ROA) dizendo qual AS pode originar o prefixo e até que tamanho; quem valida descarta os /25 do AS666. No Laboratório, ligue a validação no AS300.`,
      facts: [
        ["ROA", `${PREFIX}, máx. /24, AS400`],
        ["Anúncio do AS666", verdict === "invalid" ? "inválido" : verdict],
        ["Caminho do pacote", dr ? path(dr) : "—"],
      ],
      highlight: ["as300"],
      tags: ["defense"],
    },
    () => {
      if (useRov) {
        c.state("as300", "valida origem", { tone: "good", label: "AS300 aplica validação de origem" });
        c.state("l666-300", "", { tone: "none", label: "anúncios do AS666 descartados" });
      }
      ribRows(defended);
      exit(defended);
    },
  );

  return b.done({
    via: route100?.from ?? 0,
    loops: legit.dropped.filter((d) => d.why === "laço").length,
    hijacked: hr?.path.join(" ") ?? "",
    defended: dr?.path.join(" ") ?? "",
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "bgp-hijack",
    site: "redes",
    title: "BGP e o sequestro de prefixos",
    summary:
      "Como sistemas autônomos trocam rotas com vetor de caminhos e política, por que um anúncio mais específico desvia tráfego e como o RPKI barra a origem falsa.",
    area: "Rede",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 5,
        section: "5.7.7",
        note: "BGP: protocolo de roteamento de gateway exterior",
        verified: true,
      },
      { url: "https://www.rfc-editor.org/rfc/rfc4271", title: "RFC 4271: BGP-4", note: "AS_PATH e seleção" },
      {
        url: "https://www.rfc-editor.org/rfc/rfc6811",
        title: "RFC 6811: BGP Prefix Origin Validation",
        note: "estados válido, inválido e desconhecido",
      },
    ],
    simplifications: [
      "Cada AS aparece como um único roteador; na prática há muitos, ligados por iBGP.",
      "A seleção usa só preferência local, tamanho do AS_PATH e o menor número de vizinho.",
      "Números de AS e prefixos são de uso privado e de documentação.",
      "O sequestro é uma simulação do comportamento das rotas; não há comandos nem configurações reais.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "politica",
        kind: "bool",
        label: "Preferir rotas mais baratas (preferência local)",
        help: "Cliente > par > provedor, antes do tamanho do caminho.",
      },
      { key: "rov", kind: "bool", label: "AS300 valida a origem com RPKI" },
    ],
  },
  build,
  intro: {
    text: "Nenhuma rede enxerga a internet inteira. Os sistemas autônomos contam uns aos outros quais prefixos alcançam, e por qual caminho, usando o BGP. Você vai ver um anúncio se espalhar, a política de custos decidir a rota, e um anúncio falso desviar tráfego até a validação de origem barrá-lo.",
    facts: [
      ["Prefixo", PREFIX],
      ["Sistemas autônomos", String(ASES.length)],
      ["Destino", DST],
    ],
  },
  outro: {
    title: "BGP em resumo",
    text: "O BGP propaga caminhos de AS, não distâncias. Cada AS escolhe por política e só depois pelo tamanho do caminho, e descarta anúncios que já passaram por ele. Como ninguém confere a origem por padrão, um prefixo mais específico desvia tráfego; o RPKI publica quem pode originar cada prefixo, e quem valida descarta o resto.",
    facts: (run) => [
      ["AS100 sai por", `AS${run.stats.via}`],
      ["Com sequestro", String(run.stats.hijacked)],
      ["Com validação", String(run.stats.defended)],
    ],
  },
  next: ["roteamento", "dnssec"],
};

export default lesson;
