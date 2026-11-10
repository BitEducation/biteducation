import type { LessonModule, Params } from "../../../contracts/types.ts";
import { arp } from "../../../sim/net/arp.ts";
import { hexN } from "../../../sim/net/bytes.ts";
import { type DhcpMsg, dhcp } from "../../../sim/net/dhcp.ts";
import { ETHERTYPE } from "../../../sim/net/ethernet.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { prng, randInt } from "../../../sim/shared/prng.ts";
import { seqScene, talk } from "../../../sim/shared/seq.ts";
import { BROADCAST, GW, LIA, MALU, RESOLVER, ZERO_MAC } from "../plan.ts";
import { ethFrame, udpFrame } from "../wire.ts";

/**
 * DHCP: Discover, Offer, Request, Ack, the ARP probe before using the address, and the renewal
 * at T1 = half the lease. The campus router is the DHCP server.
 */
const SEED = 2131;
export const DEFAULTS = { lease: 3600 };
const MASK = "255.255.255.0";
const BC = "255.255.255.255";
const PARAMS = [1, 3, 6, 15, 42];

const clamp = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
};

const scene = seqScene(
  [
    { id: "lia", kind: "laptop", label: "Lia", sub: "sem IP", at: [140, 120] },
    { id: "sw", kind: "switch", label: "Switch", at: [480, 120] },
    { id: "gw", kind: "router", label: "Roteador (DHCP)", sub: GW.ip, at: [820, 120] },
    { id: "malu", kind: "laptop", label: "Malu", sub: MALU.ip, at: [480, 290] },
  ],
  {
    height: 560,
    links: [
      { id: "a", from: "lia", to: "sw", style: "bus" },
      { id: "b", from: "sw", to: "gw", style: "bus" },
      { id: "c", from: "sw", to: "malu", style: "bus" },
    ],
    zones: [
      {
        id: "z-lan",
        title: "LAN do campus · 10.20.0.0/24",
        rect: { x: 30, y: 40, w: 900, h: 320 },
        tone: "lan",
      },
    ],
    widgets: [
      {
        kind: "table",
        id: "cfg",
        title: "Configuração da Lia",
        at: [60, 400],
        columns: ["Item", "Valor", "Origem"],
        widths: [150, 200, 160],
        rows: 5,
      },
    ],
  },
);

export function build(p: Params) {
  const lease = clamp(p.lease, 120, 86400, DEFAULTS.lease);
  const t1 = Math.floor(lease / 2);
  const b = lessonBuilder();
  const c = talk(b, { lia: "Lia", gw: "Roteador", sw: "Switch", malu: "Malu" });
  const rand = prng(SEED);
  const xid = randInt(rand, 1, 0xffffffff);
  const xid2 = randInt(rand, 1, 0xffffffff);
  const base: Omit<DhcpMsg, "type"> = { xid, clientMac: LIA.mac };
  const offer = {
    yiaddr: LIA.ip,
    serverId: GW.ip,
    lease,
    mask: MASK,
    router: GW.ip,
    dns: [RESOLVER.ip],
  };
  const bcast = { dst: BROADCAST, src: LIA.mac, names: { dst: "todos", src: "Lia" } };
  const fromGw = { dst: BROADCAST, src: GW.mac, names: { dst: "todos", src: "roteador" } };
  const toServer = (
    m: DhcpMsg,
    id: string,
    title: string,
    summary: string,
    src = "0.0.0.0",
    dst = BC,
    eth = bcast,
  ) =>
    udpFrame({ src, dst, sport: 68, dport: 67 }, dhcp(m), {
      id,
      title,
      summary,
      eth,
      names: { sport: "68 = cliente DHCP", dport: "67 = servidor DHCP" },
    });
  const toClient = (m: DhcpMsg, id: string, title: string, summary: string, dst = BC, eth = fromGw) =>
    udpFrame({ src: GW.ip, dst, sport: 67, dport: 68 }, dhcp(m), {
      id,
      title,
      summary,
      eth,
      names: { sport: "67 = servidor DHCP", dport: "68 = cliente DHCP" },
    });

  b.step(
    {
      id: "s1-discover",
      title: "Alguém aí?",
      subtitle: "DISCOVER: um grito para a rede toda",
      text: `A Lia conecta o notebook ao cabo da biblioteca. Ele ainda não tem endereço IP, nem sabe quem é o roteador. Então manda um **DHCPDISCOVER** de 0.0.0.0 para 255.255.255.255, num quadro de [[broadcast]]: todos na LAN recebem, inclusive a Malu. O número de transação ${hexN(xid, 8)}, sorteado pelo notebook, vai marcar todas as mensagens desta conversa.`,
      facts: [
        ["Origem", "0.0.0.0:68"],
        ["Destino", "255.255.255.255:67"],
        ["Transação", hexN(xid, 8)],
      ],
      highlight: ["lia"],
    },
    () => {
      c.send("lia", "sw", "DISCOVER", {
        frame: toServer(
          { ...base, type: "DISCOVER", broadcast: true, paramList: PARAMS, hostname: "notebook-lia" },
          "f-discover",
          "DHCPDISCOVER",
          "Ethernet broadcast, IP 0.0.0.0 → 255.255.255.255.",
        ),
        detail: "broadcast",
      });
      c.send("sw", "gw", "DISCOVER", { dt: 0 });
      c.send("sw", "malu", "DISCOVER", { dt: 0, role: "muted", detail: "a Malu também recebe" });
      c.state("malu", "ignora", { dt: 1, tone: "none", role: "muted", label: "Não é servidor DHCP" });
    },
  );

  b.step(
    {
      id: "s2-offer",
      quiz: {
        kind: "pick",
        prompt: "O DHCPDISCOVER da Lia foi em broadcast, para todos. Quem responde com uma oferta?",
        targets: [
          { id: "sw", label: "Switch" },
          { id: "gw", label: "Roteador (DHCP)" },
          { id: "malu", label: "Malu" },
        ],
        answer: "gw",
        explain:
          "Todos recebem o broadcast, mas só quem roda um servidor DHCP responde. O switch apenas repassa quadros, e a Malu é outra cliente.",
      },
      title: "Uma oferta",
      subtitle: "OFFER: um endereço e o pacote completo",
      text: `O servidor [[dhcp]] do roteador escolhe um endereço livre do seu conjunto e reserva por alguns segundos: **${LIA.ip}**. A oferta já traz tudo o que a Lia vai precisar: máscara, roteador padrão, resolvedor DNS e o tempo de [[concessao]] (${lease} s). Ela vai em broadcast porque a Lia pediu: sem IP, o notebook ainda não aceitaria um pacote endereçado a ${LIA.ip}.`,
      facts: [
        ["Endereço oferecido", LIA.ip],
        ["Roteador padrão", GW.ip],
        ["DNS", RESOLVER.ip],
        ["Concessão", `${lease} s`],
      ],
      highlight: ["gw"],
    },
    () => {
      c.send("gw", "sw", "OFFER", {
        role: "b",
        frame: toClient(
          { ...base, type: "OFFER", broadcast: true, ...offer },
          "f-offer",
          "DHCPOFFER",
          `Oferece ${LIA.ip}.`,
        ),
        detail: `oferece ${LIA.ip}`,
      });
      c.send("sw", "lia", "OFFER", { dt: 0, role: "b" });
    },
  );

  b.step(
    {
      id: "s3-request",
      title: "Aceito este",
      subtitle: "REQUEST: ainda em broadcast",
      text: `A Lia responde com um **DHCPREQUEST** pedindo ${LIA.ip} ao servidor ${GW.ip} (opção 54). Ainda vai em broadcast: se houvesse dois servidores na rede, o que não foi escolhido veria a mensagem e devolveria o endereço que tinha reservado. Até aqui, nenhuma das mensagens tinha autenticação nenhuma.`,
      facts: [
        ["Pede", LIA.ip],
        ["Ao servidor", GW.ip],
        ["Destino", "255.255.255.255"],
      ],
      highlight: ["lia"],
      quiz: {
        kind: "choice",
        prompt: "Por que o DHCPREQUEST vai em broadcast, se a Lia já sabe quem é o servidor?",
        options: [
          "Porque ela ainda não pode usar o endereço oferecido",
          "Para que outros servidores saibam que a oferta deles foi recusada",
          "As duas coisas",
          "Por compatibilidade com o ARP",
        ],
        answer: 2,
        explain:
          "As duas. O endereço só vale depois do ACK, então a Lia continua usando 0.0.0.0; e o broadcast avisa qualquer outro servidor que fez oferta para liberar o endereço reservado.",
      },
    },
    () => {
      c.send("lia", "sw", "REQUEST", {
        frame: toServer(
          {
            ...base,
            type: "REQUEST",
            broadcast: true,
            requested: LIA.ip,
            serverId: GW.ip,
            paramList: PARAMS,
            hostname: "notebook-lia",
          },
          "f-request",
          "DHCPREQUEST",
          "Aceita a oferta do roteador.",
        ),
        detail: `pede ${LIA.ip}`,
      });
      c.send("sw", "gw", "REQUEST", { dt: 0 });
      c.send("sw", "malu", "REQUEST", { dt: 0, role: "muted" });
    },
  );

  b.step(
    {
      id: "s4-ack",
      title: "Confirmado",
      subtitle: "ACK: a concessão começa a contar",
      text: `O servidor registra que ${LIA.ip} pertence ao MAC ${LIA.mac} por ${lease} s e confirma com um **DHCPACK**. Só agora o notebook configura a placa de rede: endereço, máscara (a rede é 10.20.0.0/24), [[gateway]] e DNS. Repare que a Lia nunca digitou nada; é por isso que entrar numa rede nova funciona sem configurar nada.`,
      facts: [
        ["IP", `${LIA.ip}/24`],
        ["Gateway", GW.ip],
        ["Renovar em (T1)", `${t1} s`],
      ],
      highlight: ["lia", "gw"],
    },
    () => {
      c.send("gw", "sw", "ACK", {
        role: "b",
        frame: toClient(
          { ...base, type: "ACK", broadcast: true, ...offer },
          "f-ack",
          "DHCPACK",
          "A concessão está valendo.",
        ),
        detail: `${LIA.ip} por ${lease} s`,
      });
      c.send("sw", "lia", "ACK", { dt: 0, role: "b" });
      const cfg: [string, string][] = [
        ["Endereço IP", LIA.ip],
        ["Máscara", MASK],
        ["Roteador", GW.ip],
        ["DNS", RESOLVER.ip],
        ["Concessão", `${lease} s`],
      ];
      cfg.forEach(([k, v], i) => {
        c.row("cfg", i, [k, v, "DHCP"], { mark: "new", dt: i === 0 ? 1 : 0, label: `${k}: ${v}` });
      });
      c.state("lia", LIA.ip, { dt: 0, tone: "good", label: "Notebook configurado" });
    },
  );

  b.step(
    {
      id: "s5-sonda",
      title: "Alguém já usa?",
      subtitle: "Uma sonda ARP antes de usar o endereço",
      text: `Antes de usar o endereço, o notebook pergunta por [[arp]] quem tem ${LIA.ip}, com o próprio IP de origem zerado para não sujar o cache de ninguém. É uma **sonda**: se alguém responder, o endereço já está em uso (alguém configurou à mão, por exemplo) e a Lia recusa a concessão com um DHCPDECLINE. Ninguém responde, e o endereço é dela.`,
      facts: [
        ["Pergunta", `quem tem ${LIA.ip}?`],
        ["IP de origem", "0.0.0.0"],
        ["Respostas", "nenhuma"],
      ],
      highlight: ["lia"],
    },
    () => {
      const probe = ethFrame(
        BROADCAST,
        LIA.mac,
        { dst: "todos", src: "Lia" },
        [
          arp({
            op: "request",
            senderMac: LIA.mac,
            senderIp: "0.0.0.0",
            targetMac: ZERO_MAC,
            targetIp: LIA.ip,
          }),
        ],
        { id: "f-probe", title: "Sonda ARP", summary: "Quem tem o meu novo endereço?" },
        ETHERTYPE.arp,
      );
      c.send("lia", "sw", "ARP sonda", { frame: probe, detail: `quem tem ${LIA.ip}?`, role: "s3" });
      c.send("sw", "malu", "ARP sonda", { dt: 0, role: "muted" });
      c.send("sw", "gw", "ARP sonda", { dt: 0, role: "muted" });
      c.note("lia", "sem resposta: endereço livre", "good", { dt: 1 });
    },
  );

  c.at(t1 * 1000);
  b.step(
    {
      id: "s6-renovacao",
      quiz: {
        kind: "number",
        prompt: `A concessão dura ${lease} s. Depois de quantos segundos o notebook tenta renovar pela primeira vez?`,
        answer: t1,
        unit: "s",
        explain: `A primeira tentativa, T1, acontece na metade da concessão: ${t1} s. Renovar cedo dá tempo de achar outro servidor antes de o endereço vencer.`,
      },
      title: "Renovando a concessão",
      subtitle: `Em T1, metade dos ${lease} s`,
      text: `A concessão não é para sempre. Em **T1**, metade do tempo (${t1} s), o notebook pede para renovar direto ao servidor, em [[unicast]], já usando o próprio IP. O servidor confirma e o relógio volta a contar do zero. Se o servidor não responder, a Lia tenta qualquer servidor em T2 (87,5% do tempo) e, se a concessão vencer, para de usar o endereço.`,
      facts: [
        ["T1", `${t1} s`],
        ["Destino", `${GW.ip} (unicast)`],
        ["Nova concessão", `${lease} s`],
      ],
      highlight: ["lia", "gw"],
    },
    () => {
      const uni = { dst: GW.mac, src: LIA.mac, names: { dst: "roteador", src: "Lia" } };
      c.send("lia", "sw", "REQUEST", {
        frame: toServer(
          { xid: xid2, clientMac: LIA.mac, type: "REQUEST", ciaddr: LIA.ip },
          "f-renew",
          "Renovação (REQUEST)",
          "Unicast, com o IP da Lia.",
          LIA.ip,
          GW.ip,
          uni,
        ),
        detail: "renovar",
      });
      c.send("sw", "gw", "REQUEST", { dt: 0 });
      c.send("gw", "sw", "ACK", {
        role: "b",
        frame: toClient(
          {
            xid: xid2,
            clientMac: LIA.mac,
            type: "ACK",
            ciaddr: LIA.ip,
            yiaddr: LIA.ip,
            serverId: GW.ip,
            lease,
            mask: MASK,
            router: GW.ip,
            dns: [RESOLVER.ip],
          },
          "f-renew-ack",
          "Renovação (ACK)",
          "A concessão recomeça.",
          LIA.ip,
          { dst: LIA.mac, src: GW.mac, names: { dst: "Lia", src: "roteador" } },
        ),
      });
      c.send("sw", "lia", "ACK", { dt: 0, role: "b" });
      c.row("cfg", 4, ["Concessão", `${lease} s`, "renovada"], { mark: "hit", label: "Concessão renovada" });
    },
  );

  b.step(
    {
      id: "s7-confianca",
      title: "Em quem confiar?",
      subtitle: "Servidores falsos e o DHCP snooping",
      text: "O DHCP acredita em qualquer resposta que chegar primeiro. Um servidor falso na LAN poderia oferecer a si mesmo como gateway ou DNS e ficar no meio de todo o tráfego; outro truque é pedir endereços com MACs inventados até o conjunto acabar. A defesa fica no switch: com [[dhcp-snooping]], só a porta do roteador pode mandar OFFER e ACK, e cada porta tem um limite de pedidos.",
      facts: [
        ["Autenticação no DHCP", "nenhuma"],
        ["Defesa", "DHCP snooping no switch"],
        ["Portas confiáveis", "só a do roteador"],
      ],
      highlight: ["sw"],
    },
    () => {
      c.state("sw", "porta do roteador = confiável", {
        dt: 1,
        tone: "good",
        role: "b",
        label: "DHCP snooping",
      });
    },
  );

  return b.done({ lease, t1, xid });
}

const lesson: LessonModule = {
  meta: {
    slug: "dhcp",
    site: "redes",
    title: "DHCP: um endereço emprestado",
    summary:
      "Como um notebook sem IP consegue endereço, máscara, gateway e DNS em quatro mensagens, e por que a concessão tem prazo.",
    area: "Rede",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 5,
        section: "5.7.4",
        note: "Protocolos de controle da Internet: DHCP",
        verified: true,
      },
      { rfc: 2131, note: "DHCP" },
      { rfc: 2132, note: "Opções do DHCP" },
      { rfc: 5227, note: "Sonda ARP de conflito de endereço" },
    ],
    simplifications: [
      "Um servidor só, no próprio roteador; redes maiores usam um relay até um servidor central.",
      "Sem DHCPv6; a lição de IPv6 mostra a autoconfiguração.",
      "O servidor não faz a própria verificação de conflito (ping) antes de oferecer.",
      "As opções 15 e 42 aparecem pedidas, mas o servidor não as envia.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [{ key: "lease", kind: "int", label: "Tempo de concessão (s)", min: 120, max: 86400 }],
  },
  build,
  intro: {
    text: "Toda vez que você entra numa rede, o computador precisa de um endereço que ninguém esteja usando, da máscara, do roteador e de um DNS. Ninguém digita isso: o DHCP empresta tudo por um prazo. Você vai ver a conversa inteira, do grito em broadcast à renovação.",
    facts: [
      ["Cliente", `Lia (${LIA.mac})`],
      ["Servidor", `roteador do campus (${GW.ip})`],
      ["Mensagens", "DISCOVER, OFFER, REQUEST, ACK"],
    ],
  },
  outro: {
    title: "O DHCP em resumo",
    text: "Quatro mensagens (DORA) entregam endereço e configuração a quem ainda não tem IP. A concessão vence e precisa ser renovada; e, como nada é autenticado, a proteção vem do switch.",
    facts: (run) => [
      ["Concessão", `${run.stats.lease} s`],
      ["Renovação (T1)", `${run.stats.t1} s`],
    ],
  },
  next: ["arp-spoofing", "ipv6-slaac"],
};

export default lesson;
