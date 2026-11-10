import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import {
  bits,
  block,
  cidr,
  contains,
  isIp,
  longest,
  mask,
  type Route,
  split,
  toIp,
  toNum,
  vlsm,
} from "../../../sim/net/cidr.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { subRedes as practice } from "../practice.ts";

/**
 * IPv4 prefixes bit by bit: the mask splits network from host, AND gives the network, the host
 * bits give the size, a block splits into equal or variable subnets, and routers pick the
 * longest matching prefix.
 */
export const DEFAULTS = { ip: "192.168.10.77", prefixo: 26 };
const NEEDS = [100, 50, 20, 2];
const CELL = 22;

function clamp(p: Params) {
  const raw = String(p.ip ?? DEFAULTS.ip).trim();
  const ip = isIp(raw) ? raw : DEFAULTS.ip;
  const prefix = Math.min(30, Math.max(8, Math.round(Number(p.prefixo ?? DEFAULTS.prefixo))));
  return { ip, addr: toNum(ip), prefix };
}

function plan(p: Params) {
  const { ip, addr, prefix } = clamp(p);
  const net = block(addr, prefix);
  const parent = block(addr, prefix - 2);
  const parts = split(parent, 2);
  const lan = block(addr, 24);
  const alloc = vlsm(lan, NEEDS) ?? [];
  const n28 = block(addr, 28);
  // a neighbour in the same /24 but outside the /28: flip the bit of value 16
  const other = (n28.network ^ 16) >>> 0;
  const routes: Route[] = [
    { b: block(0, 0), via: "provedor" },
    { b: block(addr, 16), via: "campus" },
    { b: lan, via: "prédio" },
    { b: n28, via: "laboratório" },
  ];
  return { ip, addr, prefix, net, parent, parts, lan, alloc, routes, other };
}

function scene(p: Params): SceneSpec {
  const { ip, prefix, net, parent, lan } = plan(p);
  const grid = (id: string, title: string, y: number) => ({
    kind: "grid" as const,
    id,
    title,
    at: [40, y] as const,
    cols: 32,
    rows: 1,
    cellW: CELL,
    indexLabel: "none" as const,
  });
  return {
    viewBox: [960, 660],
    nodes: [],
    links: [],
    widgets: [
      grid("ip", `Endereço ${ip}`, 50),
      grid("mascara", `Máscara /${prefix} = ${toIp(mask(prefix))}`, 120),
      grid("rede", `Endereço AND máscara = ${toIp(net.network)}`, 190),
      { kind: "counter", id: "bloco", title: "Endereços no bloco", at: [40, 250] },
      { kind: "counter", id: "hosts", title: "Hosts úteis", at: [220, 250] },
      { kind: "counter", id: "broadcast", title: "Broadcast", at: [400, 250] },
      {
        kind: "table",
        id: "divisao",
        title: `${cidr(parent)} em 4 blocos /${prefix}`,
        at: [40, 350],
        columns: ["Sub-rede", "Faixa útil", "Broadcast"],
        widths: [150, 220, 120],
        rows: 4,
      },
      {
        kind: "table",
        id: "vlsm",
        title: `Tamanhos variáveis em ${cidr(lan)}`,
        at: [570, 350],
        columns: ["Precisa", "Bloco", "Úteis"],
        widths: [70, 170, 60],
        rows: NEEDS.length,
      },
      {
        kind: "table",
        id: "rotas",
        title: `Tabela do roteador · destino ${ip}`,
        at: [40, 510],
        columns: ["Prefixo", "Saída", "Casa?"],
        widths: [170, 120, 80],
        rows: 4,
      },
    ],
  };
}

/** Thousands with dots, as written in Portuguese, independent of the runtime locale. */
const num = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const range = (b: { network: number; broadcast: number }) =>
  `${toIp(b.network + 1)} – ${toIp(b.broadcast - 1)}`;

export function build(p: Params) {
  const { ip, addr, prefix, net, parent, parts, lan, alloc, routes, other } = plan(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const host = 32 - prefix;
  const ib = bits(addr);
  const mb = bits(mask(prefix));
  const nb = bits(net.network);
  const octets = ip.split(".");

  const fill = (grid: string, s: string, role: (i: number) => Role, label: string, mark?: "new") => {
    for (let o = 0; o < 4; o++) {
      for (let k = 0; k < 8; k++) {
        const i = o * 8 + k;
        c.cell(grid, i, s[i] as string, {
          dt: k === 0 ? 1 : 0,
          role: role(i),
          ...(mark ? { mark } : {}),
          ...(k === 0
            ? {
                log: {
                  who: label,
                  what: `octeto ${o + 1}`,
                  detail: `${Number.parseInt(s.slice(o * 8, o * 8 + 8), 2)} = ${s.slice(o * 8, o * 8 + 8)}`,
                },
              }
            : {}),
        });
      }
    }
  };
  const side = (i: number): Role => (i < prefix ? "a" : "warn");

  b.step(
    {
      id: "s1-bits",
      title: "Um endereço, 32 bits",
      subtitle: ip,
      text: `Um endereço [[ip|IPv4]] tem 32 bits. A forma ${ip} é só uma conveniência: quatro octetos de 8 bits, cada um escrito em decimal, de 0 a 255. O primeiro octeto, ${octets[0]}, vira ${ib.slice(0, 8)}, e assim por diante. Sozinho, o endereço não diz qual parte identifica a rede e qual identifica a máquina. Quem diz isso é o prefixo.`,
      facts: [
        ["Bits", "32"],
        ["Octetos", "4 × 8 bits"],
        ["Endereço", ip],
      ],
      highlight: [],
    },
    () => fill("ip", ib, () => "b", "endereço", "new"),
  );

  b.step(
    {
      id: "s2-mascara",
      title: "O prefixo divide",
      subtitle: `/${prefix} = ${toIp(mask(prefix))}`,
      text: `A notação [[cidr]] ${ip}/${prefix} diz que os ${prefix} primeiros bits são a rede e os ${host} restantes, o host. A [[mascara-de-rede]] escreve isso como 32 bits: ${prefix} uns seguidos de ${host} zeros, ${toIp(mask(prefix))} em decimal. No endereço acima, a parte da rede fica numa cor e a parte do host em outra. Todas as máquinas da mesma rede compartilham os bits da primeira parte.`,
      facts: [
        ["Prefixo", `/${prefix}`],
        ["Máscara", toIp(mask(prefix))],
        ["Bits de host", String(host)],
      ],
      highlight: [],
    },
    () => {
      fill("mascara", mb, (i) => (i < prefix ? "a" : "muted"), "máscara", "new");
      fill("ip", ib, side, "endereço por partes");
      c.count("bloco", num(net.size), { label: `2^${host} = ${num(net.size)} endereços` });
    },
  );

  b.step(
    {
      id: "s3-rede",
      title: "AND dá a rede",
      subtitle: `${toIp(net.network)} a ${toIp(net.broadcast)}`,
      text: `Um AND bit a bit entre endereço e máscara zera a parte do host e deixa só a rede: ${toIp(net.network)}. Com todos os bits de host em 1, sai o [[broadcast]] da rede, ${toIp(net.broadcast)}. Esses dois endereços são reservados, então sobram 2^${host} − 2 = ${num(net.hosts)} hosts, de ${toIp(net.network + 1)} a ${toIp(net.broadcast - 1)}. É essa conta que o computador faz para saber se o destino está na mesma rede ou precisa ir ao [[gateway]].`,
      facts: [
        ["Rede", toIp(net.network)],
        ["Broadcast", toIp(net.broadcast)],
        ["Hosts úteis", num(net.hosts)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Quantos hosts cabem numa rede /${prefix}?`,
        answer: net.hosts,
        explain: `${host} bits de host dão 2^${host} = ${num(net.size)} endereços; menos rede e broadcast, ${num(net.hosts)}.`,
      },
    },
    () => {
      fill("rede", nb, side, "rede", "new");
      c.count("hosts", num(net.hosts), { label: `${num(net.hosts)} hosts úteis` });
      c.count("broadcast", toIp(net.broadcast), { label: `broadcast ${toIp(net.broadcast)}` });
    },
  );

  const which = parts.findIndex((x) => contains(x, addr)) + 1;
  b.step(
    {
      id: "s4-divisao",
      title: "Dividir um bloco",
      subtitle: `${cidr(parent)} em 4`,
      text: `Quem recebe o bloco ${cidr(parent)} pode dividi-lo emprestando bits do host. Dois bits a mais dão 4 sub-redes /${prefix}, cada uma com ${num(net.size)} endereços. ${ip} cai na sub-rede ${which}, ${cidr(parts[which - 1] ?? net)}. Cada sub-rede perde dois endereços para rede e broadcast, então dividir demais desperdiça espaço.`,
      facts: [
        ["Bloco original", cidr(parent)],
        ["Sub-redes", `4 × /${prefix}`],
        ["Contém o endereço", `sub-rede ${which}`],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Em qual das 4 sub-redes (1 a 4) fica ${ip}?`,
        answer: which,
        explain: `As sub-redes começam a cada ${num(net.size)} endereços; ${ip} está entre ${toIp(net.network)} e ${toIp(net.broadcast)}.`,
      },
    },
    () => {
      parts.forEach((x, i) => {
        c.row("divisao", i, [cidr(x), range(x), toIp(x.broadcast)], {
          dt: 1,
          mark: contains(x, addr) ? "hit" : "new",
          log: { who: `sub-rede ${i + 1}`, what: cidr(x), detail: `${x.hosts} hosts` },
        });
      });
    },
  );

  const used = alloc.reduce((s, a) => s + a.b.size, 0);
  const first = alloc[0];
  b.step(
    {
      id: "s5-vlsm",
      title: "Tamanhos sob medida",
      subtitle: `${used} de ${lan.size} endereços`,
      text: `Redes reais têm tamanhos diferentes. Com [[vlsm]], cada uma recebe o menor bloco que a comporta, alocando das maiores para as menores para manter o alinhamento. Em ${cidr(lan)}, ${first ? `a de ${first.need} hosts leva um /${first.b.prefix}` : "a maior leva o primeiro bloco"} e o enlace entre dois roteadores leva um /30. As quatro usam ${used} dos ${lan.size} endereços, e os ${lan.size - used} restantes ficam livres para crescer.`,
      facts: [
        ["Pedidos", NEEDS.join(", ")],
        ["Usados", `${used} de ${lan.size}`],
        ["Livres", String(lan.size - used)],
      ],
      highlight: [],
    },
    () => {
      alloc.forEach((a, i) => {
        c.row("vlsm", i, [String(a.need), cidr(a.b), String(a.b.hosts)], {
          dt: 1,
          mark: "new",
          log: { who: `${a.need} hosts`, what: cidr(a.b), detail: `${a.b.hosts} úteis` },
        });
      });
    },
  );

  const lpm = longest(routes, addr);
  const win = lpm.win ?? (routes[0] as Route);
  const otherWin = longest(routes, other).win ?? (routes[0] as Route);
  b.step(
    {
      id: "s6-rotas",
      title: "O prefixo mais longo vence",
      subtitle: `/${win.b.prefix} → ${win.via}`,
      text: `Um roteador guarda prefixos, não endereços. O destino ${ip} casa com ${lpm.matches.length} linhas da tabela, da rota padrão /0 até ${cidr(win.b)}. Vale a de [[prefixo-mais-longo]], a mais específica: o pacote sai pelo ${win.via}. Um pacote para ${toIp(other)}, na mesma /24 mas fora da /28, sai pelo ${otherWin.via}. É assim que um bloco grande e uma exceção menor convivem na mesma tabela.`,
      facts: [
        ["Linhas que casam", String(lpm.matches.length)],
        ["Vence", cidr(win.b)],
        ["Saída", win.via],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Qual comprimento de prefixo decide a saída para ${ip}?`,
        answer: win.b.prefix,
        explain: `Todas as linhas que contêm ${ip} servem, e a mais longa, /${win.b.prefix}, é a mais específica.`,
      },
    },
    () => {
      routes.forEach((r, i) => {
        const hit = contains(r.b, addr);
        c.row("rotas", i, [cidr(r.b), r.via, hit ? "sim" : "não"], {
          dt: 1,
          ...(r === win ? { mark: "hit" as const } : hit ? {} : { mark: "miss" as const }),
          log: { who: cidr(r.b), what: hit ? "casa" : "não casa", detail: r.via },
        });
      });
    },
  );

  return b.done({
    network: toIp(net.network),
    broadcast: toIp(net.broadcast),
    hosts: net.hosts,
    subnet: which,
    used,
    winner: win.b.prefix,
    other: otherWin.via,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "sub-redes",
    site: "redes",
    title: "Sub-redes e CIDR",
    summary:
      "Como o prefixo separa rede e host num endereço IPv4: máscara, AND bit a bit, broadcast, quantos hosts cabem, como dividir um bloco e como o roteador escolhe a rota mais específica.",
    area: "Rede",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 5,
        section: "5.7.2",
        note: "Endereços IP, sub-redes e CIDR",
        verified: true,
      },
    ],
    simplifications: [
      "Só IPv4; em IPv6 as sub-redes são quase sempre /64 e não há broadcast.",
      "Os prefixos /31 e /32, usados em enlaces ponto a ponto e rotas de host, ficam de fora.",
      "A tabela do roteador tem quatro linhas fixas; tabelas reais têm centenas de milhares.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "ip",
        kind: "text",
        label: "Endereço IPv4",
        maxLength: 15,
        pattern: "^(\\d{1,3}\\.){3}\\d{1,3}$",
        placeholder: DEFAULTS.ip,
      },
      { key: "prefixo", kind: "int", label: "Prefixo (bits de rede)", min: 8, max: 30 },
    ],
  },
  build,
  intro: {
    text: "Todo computador numa rede IP faz uma conta antes de enviar: o destino está na minha rede ou preciso passar pelo roteador? Você vai fazer essa conta bit a bit, dividir um bloco de endereços e ver como o roteador escolhe a saída.",
    facts: [
      ["Endereço", DEFAULTS.ip],
      ["Prefixo", `/${DEFAULTS.prefixo}`],
      ["Bits", "32"],
    ],
  },
  outro: {
    title: "Sub-redes em resumo",
    text: "O prefixo diz quantos bits são rede. AND com a máscara dá o endereço da rede, os bits de host em 1 dão o broadcast, e 2 elevado aos bits de host, menos 2, dá os hosts úteis. Blocos se dividem emprestando bits, e o roteador escolhe sempre o prefixo mais longo que casa.",
    facts: (run) => [
      ["Rede", String(run.stats.network)],
      ["Hosts úteis", String(run.stats.hosts)],
      ["Prefixo vencedor", `/${run.stats.winner}`],
    ],
  },
  next: ["roteamento", "nat"],
  practice,
};

export default lesson;
