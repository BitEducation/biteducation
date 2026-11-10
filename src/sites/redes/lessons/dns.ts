import type { LessonModule, Params } from "../../../contracts/types.ts";
import { type DnsMsg, dns } from "../../../sim/net/dns.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { prng, randInt } from "../../../sim/shared/prng.ts";
import { seqScene, talk } from "../../../sim/shared/seq.ts";
import { AUTH_NS, DAVI, LIA, RESOLVER, ROOT_NS, TLD_NS } from "../plan.ts";
import { udpFrame } from "../wire.ts";

/**
 * Iterative resolution: Lia's stub asks the campus resolver, which walks root → .example →
 * campus.example, caches the answer and serves a second query from the cache.
 * Event times are arrival times; one-way delays are fixed so totals can be checked by hand.
 */
const SEED = 1035;
const NAME = DAVI.host;
/** One-way delays (ms). Lia ↔ resolver is inside the campus. */
export const D = { lan: 1, root: 10, tld: 15, auth: 8 } as const;
export const DEFAULTS = { ttl: 300, depois: 60 };

const clamp = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
};
/** Which stretch of the network a DNS packet was captured on. */
function dnsHop(src: string, dst: string): string {
  const far: Record<string, string> = {
    [ROOT_NS.ip]: "um servidor raiz",
    [TLD_NS.ip]: "o servidor do .example",
    [AUTH_NS.ip]: "o servidor autoritativo de campus.example",
  };
  const other = far[src] ?? far[dst];
  if (other) return `Na internet, entre o resolvedor do campus e ${other}`;
  return src === LIA.ip
    ? "Na rede do campus, saindo do notebook da Lia rumo ao resolvedor"
    : "Na rede do campus, do resolvedor de volta ao notebook da Lia";
}

const hex = (n: number) => `0x${n.toString(16).padStart(4, "0")}`;

const scene = seqScene(
  [
    { id: "lia", kind: "laptop", label: "Lia", sub: LIA.ip, at: [110, 250] },
    { id: "res", kind: "dns", label: "Resolvedor", sub: RESOLVER.ip, at: [390, 250] },
    { id: "root", kind: "dns", label: "Raiz", sub: ROOT_NS.ip, at: [780, 80] },
    { id: "tld", kind: "dns", label: "Servidor .example", sub: TLD_NS.ip, at: [780, 250] },
    { id: "auth", kind: "dns", label: "campus.example", sub: AUTH_NS.ip, at: [780, 420] },
  ],
  {
    height: 640,
    links: [
      { id: "l1", from: "lia", to: "res", style: "bus" },
      { id: "l2", from: "res", to: "root", style: "dashed" },
      { id: "l3", from: "res", to: "tld", style: "dashed" },
      { id: "l4", from: "res", to: "auth", style: "dashed" },
    ],
    zones: [
      { id: "z-campus", title: "Rede do campus", rect: { x: 20, y: 170, w: 520, h: 160 }, tone: "lan" },
    ],
    widgets: [
      {
        kind: "table",
        id: "cache",
        title: "Cache do resolvedor",
        at: [40, 490],
        columns: ["Nome", "Tipo", "Valor", "TTL"],
        widths: [250, 60, 200, 90],
        rows: 3,
      },
    ],
  },
);

export function build(p: Params) {
  const ttl = clamp(p.ttl, 0, 86400, DEFAULTS.ttl);
  const depois = clamp(p.depois, 1, 86400, DEFAULTS.depois);
  const b = lessonBuilder();
  const c = talk(b, { lia: "Lia", res: "Resolvedor", root: "Raiz", tld: ".example", auth: "campus.example" });
  const rand = prng(SEED);
  const idLia = randInt(rand, 1, 0xffff);
  const idRoot = randInt(rand, 1, 0xffff);
  const idTld = randInt(rand, 1, 0xffff);
  const idAuth = randInt(rand, 1, 0xffff);
  const idLia2 = randInt(rand, 1, 0xffff);
  const pLia = randInt(rand, 49152, 65535);
  const pRes = randInt(rand, 49152, 65535);
  const pLia2 = randInt(rand, 49152, 65535);
  const q = { name: NAME, type: "A" as const };
  const fr = (
    id: string,
    src: string,
    dst: string,
    sport: number,
    dport: number,
    m: Omit<DnsMsg, "question">,
    title: string,
    summary: string,
  ) =>
    udpFrame({ src, dst, sport, dport }, dns({ question: q, ...m }), {
      id,
      title,
      summary,
      names: dport === 53 ? { dport: "53 = DNS" } : { sport: "53 = DNS" },
      where: dnsHop(src, dst),
    });
  const answer = { name: NAME, type: "A" as const, ttl, data: DAVI.ip };

  b.step(
    {
      id: "s1-pergunta",
      title: "Lia pergunta o endereço",
      subtitle: "Uma pergunta por UDP ao resolvedor do campus",
      text: `Para abrir \`${NAME}\`, o navegador precisa de um endereço IP. O sistema da Lia não resolve nomes sozinho: manda uma pergunta do tipo **A** (endereço IPv4) ao [[resolvedor]] do campus, por [[udp]] na porta 53, com a flag "recursão pedida": quer a resposta pronta. O identificador de 16 bits, ${hex(idLia)}, vai ligar a resposta a esta pergunta.`,
      facts: [
        ["Pergunta", `${NAME} A`],
        ["Transporte", `UDP ${pLia} → 53`],
        ["Identificador", hex(idLia)],
      ],
      highlight: ["lia", "res"],
    },
    () => {
      c.send("lia", "res", "A?", {
        dt: D.lan,
        frame: fr(
          "f-q1",
          LIA.ip,
          RESOLVER.ip,
          pLia,
          53,
          { id: idLia, response: false, rd: true },
          "Pergunta da Lia",
          "IP + UDP + DNS: um pacote só, sem conexão.",
        ),
        detail: `${NAME} A, RD=1`,
      });
      c.state("res", "cache vazio", { dt: 0, tone: "warn", role: "muted", label: "Nada no cache" });
    },
  );

  b.step(
    {
      id: "s2-raiz",
      title: "Começando pela raiz",
      subtitle: "Uma indicação, não uma resposta",
      text: `Com o cache vazio, o resolvedor começa pelo topo da árvore: um [[servidor-raiz]], cujo endereço vem configurado nele. A raiz não sabe o IP da biblioteca, mas sabe quem cuida de \`.example\` e devolve uma **indicação** (*referral*): um registro NS na seção de autoridade e, como "cola", o IP desse servidor. Repare que o resolvedor pergunta sem pedir recursão: aqui ele mesmo faz o caminho.`,
      facts: [
        ["Raiz indica", TLD_NS.host],
        ["Respostas", "0 (só indicação)"],
        ["Ida e volta", `${2 * D.root} ms`],
      ],
      highlight: ["root"],
    },
    () => {
      c.send("res", "root", "A?", {
        dt: D.root,
        role: "b",
        frame: fr(
          "f-q-root",
          RESOLVER.ip,
          ROOT_NS.ip,
          pRes,
          53,
          { id: idRoot, response: false },
          "Resolvedor → raiz",
          "A mesma pergunta, sem RD.",
        ),
        detail: "RD=0",
      });
      c.send("root", "res", "NS .example", {
        dt: D.root,
        role: "b",
        frame: fr(
          "f-r-root",
          ROOT_NS.ip,
          RESOLVER.ip,
          53,
          pRes,
          {
            id: idRoot,
            response: true,
            authority: [{ name: "example", type: "NS", ttl: 172800, data: TLD_NS.host }],
            additional: [
              {
                name: TLD_NS.host,
                type: "A",
                ttl: 172800,
                data: TLD_NS.ip,
                note: "Cola (glue): o IP do servidor indicado",
              },
            ],
          },
          "Indicação da raiz",
          "Nenhuma resposta, mas o próximo passo do caminho.",
        ),
        detail: `vá a ${TLD_NS.host}`,
      });
    },
  );

  b.step(
    {
      id: "s3-tld",
      title: "Descendo um nível",
      subtitle: "O servidor de .example indica campus.example",
      text: `O resolvedor repete a pergunta ao servidor de \`.example\`. Ele também não tem o endereço final, mas a [[zona]] dele delega \`campus.example\` para \`${AUTH_NS.host}\`, e é isso que devolve. Cada nível só conhece o nível de baixo: é essa delegação que deixa cada organização administrar os próprios nomes sem pedir licença à raiz.`,
      facts: [
        ["Indica", AUTH_NS.host],
        ["Ida e volta", `${2 * D.tld} ms`],
      ],
      highlight: ["tld"],
    },
    () => {
      c.send("res", "tld", "A?", {
        dt: D.tld,
        role: "b",
        frame: fr(
          "f-q-tld",
          RESOLVER.ip,
          TLD_NS.ip,
          pRes,
          53,
          { id: idTld, response: false },
          "Resolvedor → .example",
          "A pergunta, de novo.",
        ),
      });
      c.send("tld", "res", "NS campus.example", {
        dt: D.tld,
        role: "b",
        frame: fr(
          "f-r-tld",
          TLD_NS.ip,
          RESOLVER.ip,
          53,
          pRes,
          {
            id: idTld,
            response: true,
            authority: [{ name: "campus.example", type: "NS", ttl: 86400, data: AUTH_NS.host }],
            additional: [{ name: AUTH_NS.host, type: "A", ttl: 86400, data: AUTH_NS.ip }],
          },
          "Indicação do .example",
          "Delegação para o servidor do campus.",
        ),
        detail: `vá a ${AUTH_NS.host}`,
      });
    },
  );

  b.step(
    {
      id: "s4-autoritativo",
      title: "A resposta de verdade",
      subtitle: "Só o autoritativo conhece o registro",
      text: `O servidor de \`campus.example\` é [[autoritativo]]: o registro está na zona que ele administra. A resposta traz a flag **AA** e o registro A: \`${NAME}\` → ${DAVI.ip}, com [[ttl-dns|TTL]] de ${ttl} s. Esse TTL é o prazo em que qualquer resolvedor pode reaproveitar a resposta sem perguntar de novo.`,
      facts: [
        ["Registro", `${NAME} A ${DAVI.ip}`],
        ["TTL", `${ttl} s`],
        ["Flag", "AA (autoritativa)"],
      ],
      highlight: ["auth"],
      quiz: {
        kind: "pick",
        prompt: "Qual servidor realmente guarda o registro A da biblioteca?",
        targets: [
          { id: "root", label: "Raiz" },
          { id: "tld", label: "Servidor .example" },
          { id: "auth", label: "campus.example" },
          { id: "res", label: "Resolvedor do campus" },
        ],
        answer: "auth",
        explain:
          "Só o **autoritativo** da zona campus.example tem o registro. A raiz e o .example só indicam o caminho, e o resolvedor guarda uma cópia temporária, que expira com o TTL.",
      },
    },
    () => {
      c.send("res", "auth", "A?", {
        dt: D.auth,
        role: "b",
        frame: fr(
          "f-q-auth",
          RESOLVER.ip,
          AUTH_NS.ip,
          pRes,
          53,
          { id: idAuth, response: false },
          "Resolvedor → autoritativo",
          "A última pergunta do caminho.",
        ),
      });
      c.send("auth", "res", `A ${DAVI.ip}`, {
        dt: D.auth,
        role: "s4",
        frame: fr(
          "f-r-auth",
          AUTH_NS.ip,
          RESOLVER.ip,
          53,
          pRes,
          { id: idAuth, response: true, aa: true, answers: [answer] },
          "Resposta autoritativa",
          "O registro A, com AA=1.",
        ),
        detail: `AA, TTL ${ttl} s`,
      });
    },
  );

  const first = D.lan * 2 + D.root * 2 + D.tld * 2 + D.auth * 2;
  b.step(
    {
      id: "s5-cache",
      title: "Guardar e responder",
      subtitle: "O resolvedor anota tudo o que aprendeu",
      text: `O resolvedor guarda no cache o registro A e também as indicações: na próxima pergunta sobre outro nome de \`campus.example\` ele já pula a raiz e o \`.example\`. Depois responde à Lia com o mesmo identificador ${hex(idLia)}. Do clique ao endereço passaram **${first} ms**, quase todos gastos fora do campus.`,
      facts: [
        ["Tempo total", `${first} ms`],
        ["Perguntas feitas pelo resolvedor", "3"],
        ["Entradas no cache", "3"],
      ],
      highlight: ["res"],
    },
    () => {
      c.row("cache", 0, ["example", "NS", TLD_NS.host, "172800 s"], {
        mark: "new",
        label: "Cache: NS de .example",
      });
      c.row("cache", 1, ["campus.example", "NS", AUTH_NS.host, "86400 s"], {
        mark: "new",
        label: "Cache: NS de campus.example",
      });
      c.row("cache", 2, [NAME, "A", DAVI.ip, `${ttl} s`], { mark: "new", label: `Cache: A de ${NAME}` });
      c.send("res", "lia", `A ${DAVI.ip}`, {
        dt: D.lan,
        role: "s4",
        frame: fr(
          "f-r1",
          RESOLVER.ip,
          LIA.ip,
          53,
          pLia,
          { id: idLia, response: true, rd: true, ra: true, answers: [answer] },
          "Resposta para a Lia",
          "Mesmo identificador da pergunta.",
        ),
        detail: `${first} ms desde a pergunta`,
      });
    },
  );

  const hit = depois < ttl;
  const left = ttl - depois;
  c.at(first + depois * 1000);
  b.step(
    {
      id: "s6-segunda",
      ...(hit
        ? {
            quiz: {
              kind: "number" as const,
              prompt: `O registro chegou ao cache com TTL ${ttl} s e a nova pergunta vem ${depois} s depois. Com que TTL o resolvedor responde?`,
              answer: left,
              unit: "s",
              explain: `O resolvedor devolve o que falta do prazo: ${ttl} − ${depois} = ${left} s.`,
            },
          }
        : {}),
      title: hit ? "A segunda vez" : "Cache expirado",
      subtitle: hit ? "Resposta direto do cache" : "O TTL acabou antes da nova pergunta",
      text: hit
        ? `${depois} s depois, outro estudante do campus pede o mesmo nome. O resolvedor encontra o registro no cache e responde na hora, em ${2 * D.lan} ms, sem tocar em nenhum servidor de fora. A resposta sai com TTL ${left} s: o que falta do prazo original. Por isso o TTL é uma escolha de quem administra a zona: alto alivia os servidores, baixo faz mudanças valerem mais rápido.`
        : `${depois} s depois, outro estudante pede o mesmo nome, mas o TTL de ${ttl} s já venceu e o registro A saiu do cache. As indicações ainda valem, então o resolvedor pergunta direto ao autoritativo. É o preço de um TTL baixo: mudanças valem mais rápido, mas há mais perguntas pela rede.`,
      facts: hit
        ? [
            ["Depois de", `${depois} s`],
            ["Tempo de resposta", `${2 * D.lan} ms`],
            ["TTL restante", `${left} s`],
          ]
        : [
            ["Depois de", `${depois} s`],
            ["TTL original", `${ttl} s`],
            ["Tempo de resposta", `${2 * D.lan + 2 * D.auth} ms`],
          ],
      highlight: ["res"],
    },
    () => {
      c.send("lia", "res", "A?", {
        dt: D.lan,
        frame: fr(
          "f-q2",
          LIA.ip,
          RESOLVER.ip,
          pLia2,
          53,
          { id: idLia2, response: false, rd: true },
          "Segunda pergunta",
          `${depois} s depois.`,
        ),
        detail: `${depois} s depois`,
      });
      if (hit) {
        c.row("cache", 2, [NAME, "A", DAVI.ip, `${left} s`], { mark: "hit", label: "Acerto no cache" });
      } else {
        c.row("cache", 2, [NAME, "A", "expirado", "0 s"], { mark: "miss", label: "Expirou" });
        c.send("res", "auth", "A?", { dt: D.auth, role: "b" });
        c.send("auth", "res", `A ${DAVI.ip}`, { dt: D.auth, role: "s4" });
        c.row("cache", 2, [NAME, "A", DAVI.ip, `${ttl} s`], { mark: "new", label: "Cache renovado" });
      }
      c.send("res", "lia", `A ${DAVI.ip}`, {
        dt: D.lan,
        role: "s4",
        frame: fr(
          "f-r2",
          RESOLVER.ip,
          LIA.ip,
          53,
          pLia2,
          { id: idLia2, response: true, rd: true, ra: true, answers: [{ ...answer, ttl: hit ? left : ttl }] },
          "Resposta do cache",
          hit ? "TTL já descontado." : "Renovada no autoritativo.",
        ),
        detail: hit ? "do cache" : "renovado",
      });
    },
  );

  b.step(
    {
      id: "s7-riscos",
      title: "O que fica exposto",
      subtitle: "Texto claro e identificadores curtos",
      text: `Tudo isso viajou em claro: quem observa a rede do campus vê cada nome que a Lia consulta. E a resposta só é aceita se vier do servidor certo, com a porta e o identificador certos; quem conseguir forjar uma antes da verdadeira [[envenenamento-de-cache|envenena o cache]]. Portas aleatórias dificultam o palpite; o [[dnssec]] assina os registros e o [[doh]] cifra o caminho até o resolvedor.`,
      facts: [
        ["Identificador", "16 bits"],
        ["Porta de origem", "aleatória (mais 16 bits)"],
        ["Defesas", "DNSSEC, DoH/DoT"],
      ],
      highlight: ["lia", "res"],
    },
    () => {
      c.note("res", "nomes visíveis na rede", "warn", { dt: 1, label: "Consultas em claro" });
    },
  );

  return b.done({ first, ttl, depois, hit: hit ? 1 : 0, left: hit ? left : 0 });
}

const lesson: LessonModule = {
  meta: {
    slug: "dns",
    site: "redes",
    title: "DNS: do nome ao endereço",
    summary:
      "Como um resolvedor percorre raiz, domínio de topo e servidor autoritativo, e por que o cache e o TTL importam.",
    area: "Aplicação",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 7,
        section: "7.1",
        note: "O sistema de nomes de domínio",
        verified: true,
      },
      { rfc: 1034, note: "Conceitos do DNS" },
      { rfc: 1035, note: "Formato das mensagens" },
    ],
    simplifications: [
      "Os nomes vão sem compressão; servidores reais costumam apontar para nomes já escritos (0xC0…).",
      "A raiz e os servidores usam endereços de documentação.",
      "Atrasos fixos de ida; na internet eles variam a cada pergunta.",
      "Sem IPv6 (registros AAAA) nem nova tentativa por TCP quando a resposta é grande.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "ttl", kind: "int", label: "TTL do registro A (s)", min: 0, max: 86400 },
      { key: "depois", kind: "int", label: "Segunda pergunta depois de (s)", min: 1, max: 86400 },
    ],
  },
  build,
  intro: {
    text: "Pessoas lembram nomes; a rede só entende números. O DNS é o catálogo distribuído que liga um ao outro, e nenhum servidor sozinho conhece tudo. Você vai seguir uma pergunta da Lia pela hierarquia inteira e ver o cache transformar dezenas de milissegundos em quase nada.",
    facts: [
      ["Nome", NAME],
      ["Tipo pedido", "A (IPv4)"],
      ["Resolvedor", RESOLVER.ip],
    ],
  },
  outro: {
    title: "O DNS em resumo",
    text: "A resolução desce a árvore: a raiz indica o domínio de topo, que indica o servidor autoritativo, o único que tem a resposta. O cache com TTL faz quase todas as perguntas pararem no resolvedor.",
    facts: (run) => [
      ["Primeira resolução", `${run.stats.first} ms`],
      ["TTL", `${run.stats.ttl} s`],
      ["Segunda pergunta", run.stats.hit ? "respondida do cache" : "foi de novo ao autoritativo"],
    ],
  },
  next: ["dnssec", "doh"],
};

export default lesson;
