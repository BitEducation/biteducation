import type { LessonModule, Params } from "../../../contracts/types.ts";
import { frameOf, type Layer } from "../../../sim/net/bytes.ts";
import { ETHERTYPE, ethernet } from "../../../sim/net/ethernet.ts";
import { icmp6, type NdMsg } from "../../../sim/net/icmp.ts";
import { eui64, ip6, ip6Text, ipv6, multicastMac, NEXT, solicitedNode } from "../../../sim/net/ipv6.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { prng, randInt } from "../../../sim/shared/prng.ts";
import { seqScene, talk } from "../../../sim/shared/seq.ts";
import { LIA, V6 } from "../plan.ts";

/**
 * IPv6 stateless autoconfiguration: link-local address, duplicate address detection, router
 * solicitation and advertisement, the global address, and neighbor discovery replacing ARP.
 */
const SEED = 4862;
export const DEFAULTS = { valido: 86400 };
const ALL_NODES = "ff02::1";
const ALL_ROUTERS = "ff02::2";

const clamp = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
};

/** A random 64-bit interface id (RFC 7217 style), deterministic from the seed. */
export function interfaceId(seed = SEED): number[] {
  const rand = prng(seed);
  return Array.from({ length: 8 }, () => randInt(rand, 0, 255));
}

const scene = seqScene(
  [
    { id: "lia", kind: "laptop", label: "Lia", sub: "sem endereço global", at: [140, 120] },
    { id: "sw", kind: "switch", label: "Switch", at: [480, 120] },
    { id: "gw", kind: "router", label: "Roteador", sub: V6.routerLL, at: [820, 120] },
    { id: "malu", kind: "laptop", label: "Malu", at: [480, 290] },
  ],
  {
    height: 600,
    links: [
      { id: "a", from: "lia", to: "sw", style: "bus" },
      { id: "b", from: "sw", to: "gw", style: "bus" },
      { id: "c", from: "sw", to: "malu", style: "bus" },
    ],
    zones: [
      {
        id: "z-lan",
        title: `LAN do campus · ${V6.prefix}/64`,
        rect: { x: 30, y: 40, w: 900, h: 320 },
        tone: "lan",
      },
    ],
    widgets: [
      {
        kind: "table",
        id: "addr",
        title: "Endereços da Lia",
        at: [60, 400],
        columns: ["Endereço", "Escopo", "Estado"],
        widths: [330, 110, 140],
        rows: 3,
      },
    ],
  },
);

export function build(p: Params) {
  const valid = clamp(p.valido, 600, 2592000, DEFAULTS.valido);
  const preferred = Math.floor(valid / 2);
  const b = lessonBuilder();
  const c = talk(b, { lia: "Lia", sw: "Switch", gw: "Roteador", malu: "Malu" });
  const iid = interfaceId();
  const ll = ip6Text([0xfe, 0x80, 0, 0, 0, 0, 0, 0, ...iid]);
  const global = ip6Text([...ip6(V6.prefix).slice(0, 8), ...iid]);
  const eui = ip6Text([0xfe, 0x80, 0, 0, 0, 0, 0, 0, ...eui64(LIA.mac)]);
  const snLl = solicitedNode(ll);
  const snGw = solicitedNode(V6.routerLL);

  const nd = (
    m: NdMsg,
    ethDst: string,
    ethSrc: string,
    names: { dst?: string; src?: string },
    id: string,
    title: string,
    summary: string,
  ) => {
    const icmp: Layer = icmp6(m);
    const ip = ipv6({
      src: m.src,
      dst: m.dst,
      next: NEXT.icmp6,
      payloadLen: icmp.bytes.length,
      hopLimit: 255,
    });
    // Neighbor Discovery only accepts hop limit 255: proof the packet never crossed a router.
    return frameOf(
      id,
      title,
      summary,
      [ethernet(ethDst, ethSrc, ETHERTYPE.ipv6, names), ip, icmp],
      `Na LAN, saindo ${names.src === "roteador" ? "do roteador" : "do notebook da Lia"}; com limite 255, nunca passou por roteador`,
    );
  };

  b.step(
    {
      id: "s1-link-local",
      title: "Endereço só da LAN",
      subtitle: "fe80:: mais um identificador",
      text: `Assim que a placa liga, o notebook monta sozinho um endereço [[link-local]]: o prefixo fe80::/64 seguido de 64 bits de identificador de interface. Antigamente esse identificador vinha do MAC (seria ${eui}); hoje é sorteado, para o endereço não denunciar o aparelho. Esse endereço só vale dentro desta LAN, mas já basta para conversar com o roteador.`,
      facts: [
        ["Link-local", ll],
        ["Prefixo", "fe80::/64"],
        ["Identificador", "64 bits sorteados"],
      ],
      highlight: ["lia"],
    },
    () => {
      c.row("addr", 0, [ll, "enlace", "tentativo"], { mark: "warn", dt: 1, label: "Link-local tentativo" });
    },
  );

  b.step(
    {
      id: "s2-dad",
      quiz: {
        kind: "choice",
        prompt:
          "Ao conferir se o endereço está livre, a Lia ainda não tem endereço válido. Que origem vai no Neighbor Solicitation?",
        options: [
          ":: , o endereço não especificado",
          "fe80::1, o endereço do roteador",
          "ff02::1, o grupo de todos os nós",
        ],
        answer: 0,
        explain:
          'Enquanto o endereço não passa na verificação de duplicado, a Lia não pode usá-lo. Ela pergunta com origem ::, que significa "ainda sem endereço", como a sonda ARP faz com o IP zerado.',
      },
      title: "Alguém já usa?",
      subtitle: "Detecção de endereço duplicado",
      text: `Antes de usar o endereço, a Lia pergunta se alguém já o tem: manda um **Neighbor Solicitation** com origem :: (ela ainda não tem endereço válido) para o grupo [[multicast]] ${snLl}, do qual só participa quem tem um endereço terminado nos mesmos 24 bits. Ninguém responde em 1 s, e o endereço passa a valer. É a [[dad]], o equivalente IPv6 da sonda ARP.`,
      facts: [
        ["Pergunta para", snLl],
        ["MAC de destino", multicastMac(snLl)],
        ["Origem", ":: (não especificada)"],
      ],
      highlight: ["lia"],
    },
    () => {
      c.send("lia", "sw", "NS (DAD)", {
        role: "b",
        frame: nd(
          { type: "ns", src: "::", dst: snLl, target: ll },
          multicastMac(snLl),
          LIA.mac,
          { dst: "multicast", src: "Lia" },
          "f-dad",
          "Neighbor Solicitation (DAD)",
          "Alguém tem este endereço?",
        ),
        detail: `alvo ${ll}`,
      });
      c.note("lia", "ninguém respondeu", "good", { dt: 1000 });
      c.row("addr", 0, [ll, "enlace", "válido"], { mark: "new", label: "Link-local válido" });
    },
  );

  b.step(
    {
      id: "s3-rs",
      title: "Chamando os roteadores",
      subtitle: "Router Solicitation para ff02::2",
      text: `Para falar com o resto da internet, a Lia precisa de um prefixo global e de um roteador. Em vez de esperar o próximo anúncio periódico, ela manda um **Router Solicitation** para ${ALL_ROUTERS}, o grupo de todos os roteadores do enlace. Não existe broadcast no IPv6: cada mensagem vai para um grupo multicast, e só quem se inscreveu nele presta atenção.`,
      facts: [
        ["Para", `${ALL_ROUTERS} (todos os roteadores)`],
        ["De", ll],
        ["Broadcast no IPv6", "não existe"],
      ],
      highlight: ["lia"],
    },
    () => {
      c.send("lia", "sw", "RS", {
        role: "b",
        frame: nd(
          { type: "rs", src: ll, dst: ALL_ROUTERS, options: [{ kind: "slla", mac: LIA.mac }] },
          multicastMac(ALL_ROUTERS),
          LIA.mac,
          { dst: "multicast", src: "Lia" },
          "f-rs",
          "Router Solicitation",
          "Há roteadores aqui?",
        ),
      });
      c.send("sw", "gw", "RS", { dt: 0, role: "b" });
    },
  );

  b.step(
    {
      id: "s4-ra",
      title: "O anúncio do roteador",
      subtitle: "Prefixo, permissão e gateway",
      text: `O roteador responde com um **Router Advertisement** para ${ALL_NODES}, todos os nós. Ele traz o prefixo ${V6.prefix}/64 com a flag **A** ligada, que autoriza cada um a montar o próprio endereço, sem servidor nenhum: é a [[slaac]]. As flags M e O em zero dizem que não há DHCPv6. E a própria origem do anúncio, ${V6.routerLL}, vira o gateway padrão.`,
      facts: [
        ["Prefixo", `${V6.prefix}/64`],
        ["Válido / preferido", `${valid} s / ${preferred} s`],
        ["Flags", "A=1, M=0, O=0"],
        ["MTU", "1500"],
      ],
      highlight: ["gw"],
    },
    () => {
      c.send("gw", "sw", "RA", {
        role: "s4",
        frame: nd(
          {
            type: "ra",
            src: V6.routerLL,
            dst: ALL_NODES,
            lifetime: 1800,
            options: [
              { kind: "slla", mac: V6.routerMac },
              { kind: "mtu", mtu: 1500 },
              { kind: "prefix", prefix: V6.prefix, len: 64, valid, preferred },
            ],
          },
          multicastMac(ALL_NODES),
          V6.routerMac,
          { dst: "todos os nós", src: "roteador" },
          "f-ra",
          "Router Advertisement",
          "Prefixo, MTU e o MAC do roteador.",
        ),
        detail: `${V6.prefix}/64`,
      });
      c.send("sw", "lia", "RA", { dt: 0, role: "s4" });
      c.send("sw", "malu", "RA", { dt: 0, role: "muted", detail: "todos os nós recebem" });
    },
  );

  b.step(
    {
      id: "s5-global",
      title: "O endereço global",
      subtitle: "Prefixo do roteador, identificador da Lia",
      text: `A Lia junta o prefixo anunciado com o mesmo identificador de 64 bits e obtém **${global}**, depois de outra verificação de duplicado. Ninguém guardou essa escolha em tabela nenhuma; o roteador nem sabe ainda que esse endereço existe. Os ${valid} s do anúncio são o prazo: se o roteador parar de anunciar, o endereço expira.`,
      facts: [
        ["Global", global],
        ["Gateway", V6.routerLL],
        ["Quem decidiu", "a própria Lia"],
      ],
      highlight: ["lia"],
      quiz: {
        kind: "choice",
        prompt: "Qual endereço a Lia vai usar como gateway padrão?",
        options: [V6.routerLL, `${V6.prefix}1`, ALL_ROUTERS, "Nenhum: o IPv6 não usa gateway"],
        answer: 0,
        explain: `O gateway é o endereço **link-local** de quem mandou o anúncio, ${V6.routerLL}. Como o próximo salto sempre está no mesmo enlace, o link-local basta, e não muda se o prefixo da rede mudar.`,
      },
    },
    () => {
      c.row("addr", 1, [`${global}/64`, "global", "válido"], {
        mark: "new",
        dt: 1000,
        label: "Endereço global",
      });
      c.row("addr", 2, [`padrão via ${V6.routerLL}`, "rota", "do RA"], { mark: "new", label: "Rota padrão" });
      c.state("lia", global, { dt: 0, tone: "good", label: "Endereço global pronto" });
    },
  );

  b.step(
    {
      id: "s6-vizinhos",
      title: "Descobrindo o vizinho",
      subtitle: "NDP no lugar do ARP",
      text: `Para mandar um pacote ao servidor ${V6.server}, que fica fora da LAN, a Lia precisa do MAC do roteador (o anúncio até trazia, mas vamos ver o caminho geral). Ela manda um Neighbor Solicitation para ${snGw}, o grupo do endereço do roteador, e só ele responde, com um **Neighbor Advertisement** contendo o MAC. É o [[ndp]]: o ARP do IPv6, sem incomodar a rede inteira.`,
      facts: [
        ["Pergunta para", snGw],
        ["Resposta", `${V6.routerMac}`],
        ["Quem recebe a pergunta", "só quem está no grupo"],
      ],
      highlight: ["lia", "gw"],
    },
    () => {
      c.send("lia", "sw", "NS", {
        role: "b",
        frame: nd(
          {
            type: "ns",
            src: global,
            dst: snGw,
            target: V6.routerLL,
            options: [{ kind: "slla", mac: LIA.mac }],
          },
          multicastMac(snGw),
          LIA.mac,
          { dst: "multicast", src: "Lia" },
          "f-ns",
          "Neighbor Solicitation",
          `Qual o MAC de ${V6.routerLL}?`,
        ),
        detail: `quem tem ${V6.routerLL}?`,
      });
      c.send("sw", "gw", "NS", { dt: 0, role: "b" });
      c.send("gw", "sw", "NA", {
        role: "b",
        frame: nd(
          {
            type: "na",
            src: V6.routerLL,
            dst: global,
            target: V6.routerLL,
            router: true,
            solicited: true,
            override: true,
            options: [{ kind: "tlla", mac: V6.routerMac }],
          },
          LIA.mac,
          V6.routerMac,
          { dst: "Lia", src: "roteador" },
          "f-na",
          "Neighbor Advertisement",
          "Unicast, com o MAC do roteador.",
        ),
        detail: V6.routerMac,
      });
      c.send("sw", "lia", "NA", { dt: 0, role: "b" });
    },
  );

  b.step(
    {
      id: "s7-cuidados",
      title: "Privacidade e anúncios falsos",
      subtitle: "Endereços temporários e RA Guard",
      text: `Um identificador fixo deixaria sites reconhecerem o notebook em qualquer rede. Por isso os sistemas também criam endereços **temporários**, trocados de tempos em tempos, para as conexões de saída. E, como no DHCP, nada autentica um anúncio: a Malu poderia anunciar um prefixo e virar o gateway de todos. A defesa é o **RA Guard** no switch, que só aceita anúncios pela porta do roteador.`,
      facts: [
        ["Endereços temporários", "RFC 8981"],
        ["Ataque", "anúncio falso de roteador"],
        ["Defesa", "RA Guard no switch"],
      ],
      highlight: ["malu", "sw"],
    },
    () => {
      c.state("sw", "RA só pela porta do roteador", { dt: 1, tone: "good", role: "b", label: "RA Guard" });
      c.state("malu", "não pode anunciar prefixos", {
        dt: 0,
        tone: "none",
        role: "muted",
        label: "Malu bloqueada",
      });
    },
  );

  return b.done({ ll, global, valid, preferred });
}

const lesson: LessonModule = {
  meta: {
    slug: "ipv6-slaac",
    site: "redes",
    title: "IPv6: um endereço sem servidor",
    summary:
      "Link-local, detecção de duplicados, anúncio do roteador, autoconfiguração e a descoberta de vizinhos que substitui o ARP.",
    area: "Rede",
    refs: [
      { book: "tanenbaum-cn", chapter: 5, section: "5.7.3", note: "IP versão 6", verified: true },
      { rfc: 4861, note: "Descoberta de vizinhos (NDP)" },
      { rfc: 4862, note: "Autoconfiguração sem estado (SLAAC)" },
      { rfc: 8981, note: "Endereços temporários" },
      { rfc: 6105, note: "RA Guard" },
    ],
    simplifications: [
      "Um único roteador; com vários, a Lia escolheria pela preferência e pela vida útil de cada anúncio.",
      "Sem a opção RDNSS (DNS no próprio anúncio) nem DHCPv6.",
      "A espera da detecção de duplicado é mostrada como 1 s.",
      "O endereço temporário é citado, mas não aparece na tabela.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [{ key: "valido", kind: "int", label: "Validade do prefixo (s)", min: 600, max: 2592000 }],
  },
  build,
  intro: {
    text: "No IPv6 há endereços de sobra, e a configuração muda de lugar: em vez de pedir um endereço a um servidor, cada computador monta o seu a partir do que o roteador anuncia. Você vai acompanhar o notebook da Lia do primeiro endereço local até falar com o roteador, sem ARP e sem broadcast.",
    facts: [
      ["Prefixo da rede", `${V6.prefix}/64`],
      ["Roteador", V6.routerLL],
      ["Mensagens", "NS, RS, RA, NA (ICMPv6)"],
    ],
  },
  outro: {
    title: "IPv6 em resumo",
    text: "O roteador anuncia o prefixo e cada computador escolhe o próprio identificador, conferindo antes se não está em uso. A descoberta de vizinhos usa grupos multicast no lugar do broadcast do ARP.",
    facts: (run) => [
      ["Link-local", String(run.stats.ll)],
      ["Global", String(run.stats.global)],
    ],
  },
  next: ["dhcp", "ping-traceroute"],
};

export default lesson;
