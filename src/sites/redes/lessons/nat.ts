import type { LessonModule, Params } from "../../../contracts/types.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { prng, randInt } from "../../../sim/shared/prng.ts";
import { seqScene, talk } from "../../../sim/shared/seq.ts";
import { DAVI, GW, LIA, MALU } from "../plan.ts";
import { tcpFrame } from "../wire.ts";

/**
 * NAPT (port translation) on the campus router: two private hosts reach the same server through
 * one public address; replies are mapped back by port; unsolicited inbound traffic finds no
 * mapping; a static forward publishes an internal server.
 */
const SEED = 3022;
export const FIRST_PORT = 40001;
const INTERNAL = { ip: "10.20.0.80", port: 8443 } as const;
export const DEFAULTS = { timeout: 300 };

const clamp = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
};

const scene = seqScene(
  [
    { id: "lia", kind: "laptop", label: "Lia", sub: `${LIA.ip}:${LIA.port}`, at: [130, 90] },
    { id: "malu", kind: "laptop", label: "Malu", sub: `${MALU.ip}:${LIA.port}`, at: [130, 230] },
    {
      id: "srv",
      kind: "server",
      label: "Servidor do lab",
      sub: `${INTERNAL.ip}:${INTERNAL.port}`,
      at: [130, 370],
    },
    { id: "gw", kind: "router", label: "Roteador com NAT", sub: `${GW.ip} | ${GW.wanIp}`, at: [480, 230] },
    { id: "davi", kind: "server", label: "Biblioteca", sub: `${DAVI.ip}:443`, at: [850, 120] },
    { id: "ext", kind: "cloud", label: "Alguém na internet", sub: "203.0.113.200", at: [850, 340] },
  ],
  {
    height: 640,
    links: [
      { id: "a", from: "lia", to: "gw", style: "bus" },
      { id: "b", from: "malu", to: "gw", style: "bus" },
      { id: "c", from: "srv", to: "gw", style: "bus" },
      { id: "d", from: "gw", to: "davi", style: "bus" },
      { id: "e", from: "gw", to: "ext", style: "bus" },
    ],
    zones: [
      {
        id: "z-lan",
        title: "Rede privada 10.20.0.0/24",
        rect: { x: 20, y: 30, w: 300, h: 400 },
        tone: "lan",
      },
      { id: "z-wan", title: "Internet", rect: { x: 660, y: 30, w: 320, h: 400 }, tone: "wan" },
    ],
    widgets: [
      {
        kind: "table",
        id: "nat",
        title: "Tabela de NAT do roteador",
        at: [60, 470],
        columns: ["Interno", "Externo (público)", "Destino", "Expira"],
        widths: [200, 200, 180, 90],
        rows: 3,
      },
    ],
  },
);

export function build(p: Params) {
  const timeout = clamp(p.timeout, 30, 7200, DEFAULTS.timeout);
  const b = lessonBuilder();
  const c = talk(b, {
    lia: "Lia",
    malu: "Malu",
    srv: "Servidor do lab",
    gw: "Roteador (NAT)",
    davi: "Biblioteca",
    ext: "Internet",
  });
  const rand = prng(SEED);
  const isnL = randInt(rand, 1, 2 ** 31);
  const isnM = randInt(rand, 1, 2 ** 31);
  const isnS = randInt(rand, 1, 2 ** 31);
  const isnE = randInt(rand, 1, 2 ** 31);
  const pubL = FIRST_PORT;
  const pubM = FIRST_PORT + 1;
  const syn = (
    src: string,
    sport: number,
    dst: string,
    dport: number,
    seq: number,
    id: string,
    title: string,
    summary: string,
    ttl = 64,
  ) =>
    tcpFrame({ src, dst, sport, dport, seq, ack: 0, flags: ["SYN"], mss: 1460, ttl }, null, {
      id,
      title,
      summary,
    });
  const synAck = (
    src: string,
    sport: number,
    dst: string,
    dport: number,
    seq: number,
    ack: number,
    id: string,
    title: string,
    summary: string,
  ) =>
    tcpFrame({ src, dst, sport, dport, seq, ack, flags: ["SYN", "ACK"], mss: 1460 }, null, {
      id,
      title,
      summary,
    });

  b.step(
    {
      id: "s1-privado",
      title: "Um endereço que não sai",
      subtitle: "Faixas privadas não são roteadas na internet",
      text: `O notebook da Lia tem o endereço ${LIA.ip}, de uma faixa [[ip-privado|privada]]: milhares de redes usam os mesmos números lá dentro, e por isso nenhum roteador da internet aceita encaminhar pacotes com eles. O roteador do campus tem um único endereço público, ${GW.wanIp}. O [[nat]] é o que permite a todos da rede usarem esse único endereço.`,
      facts: [
        ["IP da Lia", `${LIA.ip} (privado)`],
        ["IP público do campus", GW.wanIp],
        ["Faixas privadas", "10/8, 172.16/12, 192.168/16"],
      ],
      highlight: ["lia", "gw"],
    },
    () => {
      c.send("lia", "gw", "SYN", {
        frame: syn(LIA.ip, LIA.port, DAVI.ip, 443, isnL, "f-l-in", "SYN como sai da Lia", "Origem privada."),
        detail: `${LIA.ip}:${LIA.port} → ${DAVI.ip}:443`,
      });
    },
  );

  b.step(
    {
      id: "s2-traducao",
      title: "A tradução de saída",
      subtitle: "Troca o IP e a porta de origem",
      text: `O roteador troca a origem ${LIA.ip}:${LIA.port} por ${GW.wanIp}:${pubL} e anota a troca na tabela de NAT. Como o checksum do TCP inclui os endereços IP (o pseudo-cabeçalho), ele precisa recalcular os dois checksums, o do IP e o do TCP. A biblioteca nunca fica sabendo que a Lia existe: para ela, quem pediu foi o campus.`,
      facts: [
        ["Antes", `${LIA.ip}:${LIA.port}`],
        ["Depois", `${GW.wanIp}:${pubL}`],
        ["Checksums recalculados", "IP e TCP"],
      ],
      highlight: ["gw"],
    },
    () => {
      c.row("nat", 0, [`${LIA.ip}:${LIA.port}`, `${GW.wanIp}:${pubL}`, `${DAVI.ip}:443`, `${timeout} s`], {
        mark: "new",
        dt: 1,
        label: "Nova tradução para a Lia",
      });
      c.send("gw", "davi", "SYN", {
        frame: syn(
          GW.wanIp,
          pubL,
          DAVI.ip,
          443,
          isnL,
          "f-l-out",
          "SYN depois do NAT",
          "Origem pública, porta trocada.",
          63,
        ),
        detail: `${GW.wanIp}:${pubL} → ${DAVI.ip}:443`,
      });
    },
  );

  b.step(
    {
      id: "s3-volta",
      quiz: {
        kind: "pick",
        prompt:
          "A resposta da biblioteca chega ao endereço público do roteador. Para qual máquina de dentro ele a entrega?",
        targets: [
          { id: "lia", label: "Lia" },
          { id: "malu", label: "Malu" },
          { id: "srv", label: "Servidor do lab" },
        ],
        answer: "lia",
        explain:
          "A porta pública de destino é a chave da tabela de NAT. Ela aponta para o endereço e a porta da Lia, e o roteador desfaz a troca no destino antes de entregar.",
      },
      title: "A resposta volta",
      subtitle: "A porta diz para quem é",
      text: `O SYN-ACK da biblioteca chega para ${GW.wanIp}:${pubL}. O roteador procura essa porta pública na tabela, encontra a Lia e faz a troca ao contrário no destino: ${LIA.ip}:${LIA.port}. Para o notebook, a conexão parece direta. Cada pacote seguinte da mesma conexão usa a mesma linha da tabela, que é renovada a cada uso.`,
      facts: [
        ["Chega para", `${GW.wanIp}:${pubL}`],
        ["Entregue a", `${LIA.ip}:${LIA.port}`],
      ],
      highlight: ["gw", "lia"],
    },
    () => {
      c.send("davi", "gw", "SYN-ACK", {
        role: "b",
        frame: synAck(
          DAVI.ip,
          443,
          GW.wanIp,
          pubL,
          isnS,
          isnL + 1,
          "f-l-back-out",
          "SYN-ACK na internet",
          "Para o endereço público.",
        ),
        detail: `→ ${GW.wanIp}:${pubL}`,
      });
      c.row("nat", 0, [`${LIA.ip}:${LIA.port}`, `${GW.wanIp}:${pubL}`, `${DAVI.ip}:443`, `${timeout} s`], {
        mark: "hit",
        label: "Achou a tradução",
      });
      c.send("gw", "lia", "SYN-ACK", {
        role: "b",
        frame: synAck(
          DAVI.ip,
          443,
          LIA.ip,
          LIA.port,
          isnS,
          isnL + 1,
          "f-l-back-in",
          "SYN-ACK dentro do campus",
          "Destino trocado de volta.",
        ),
        detail: `→ ${LIA.ip}:${LIA.port}`,
      });
    },
  );

  b.step(
    {
      id: "s4-porta",
      title: "Duas pessoas, uma porta",
      subtitle: "A tradução de porta resolve o empate",
      text: `A Malu também abre uma conexão para a biblioteca e, por coincidência, o sistema dela escolheu a mesma porta ${LIA.port}. Se o roteador só trocasse o IP, as duas conexões ficariam idênticas do lado de fora. Por isso ele também troca a porta: a da Malu sai como ${GW.wanIp}:${pubM}. É essa troca de porta (NAPT) que deixa milhares de conexões dividirem um único IP.`,
      facts: [
        ["Malu", `${MALU.ip}:${LIA.port}`],
        ["Sai como", `${GW.wanIp}:${pubM}`],
        ["Limite teórico", "cerca de 64 mil portas por destino"],
      ],
      highlight: ["malu", "gw"],
      quiz: {
        kind: "choice",
        prompt: `Chega um pacote da biblioteca para ${GW.wanIp}:${pubM}. Para quem o roteador entrega?`,
        options: ["Para a Lia", "Para a Malu", "Para as duas", "Descarta, porque o IP é igual"],
        answer: 1,
        explain: `A porta pública ${pubM} está ligada à Malu na tabela. O IP público é o mesmo para todos; é a **porta** que separa as conexões.`,
      },
    },
    () => {
      c.send("malu", "gw", "SYN", {
        frame: syn(
          MALU.ip,
          LIA.port,
          DAVI.ip,
          443,
          isnM,
          "f-m-in",
          "SYN da Malu",
          "Mesma porta de origem que a Lia usou.",
        ),
        detail: `${MALU.ip}:${LIA.port}`,
      });
      c.row("nat", 1, [`${MALU.ip}:${LIA.port}`, `${GW.wanIp}:${pubM}`, `${DAVI.ip}:443`, `${timeout} s`], {
        mark: "new",
        dt: 1,
        label: "Nova tradução para a Malu",
      });
      c.send("gw", "davi", "SYN", {
        frame: syn(
          GW.wanIp,
          pubM,
          DAVI.ip,
          443,
          isnM,
          "f-m-out",
          "SYN da Malu depois do NAT",
          "Outra porta pública.",
        ),
        detail: `${GW.wanIp}:${pubM}`,
      });
    },
  );

  b.step(
    {
      id: "s5-entrada",
      quiz: {
        kind: "choice",
        prompt:
          "Chega da internet um pedido de conexão para o IP público do campus, numa porta que ninguém de dentro abriu. O que o roteador faz?",
        options: [
          "Descarta: nenhuma linha da tabela diz para quem é",
          "Entrega à máquina de menor endereço da rede",
          "Copia o pacote para todas as máquinas da LAN",
        ],
        answer: 0,
        explain:
          "O NAT só sabe para quem mandar o que corresponde a uma tradução existente. Sem linha na tabela, o pacote não tem destino interno. Isso protege por acaso, mas não substitui um firewall.",
      },
      title: "Ninguém pediu",
      subtitle: "Pacotes de fora sem tradução são descartados",
      text: `Alguém na internet tenta abrir uma conexão com ${GW.wanIp}, porta 22. Não há nenhuma linha na tabela com essa porta, e o roteador não tem como saber para qual máquina de dentro mandar: descarta. Isso protege por acaso, mas não é um [[firewall]]: o NAT não olha o conteúdo, e conexões que alguém de dentro abriu passam livremente.`,
      facts: [
        ["Destino", `${GW.wanIp}:22`],
        ["Tradução", "nenhuma"],
        ["Resultado", "descartado"],
      ],
      highlight: ["ext", "gw"],
    },
    () => {
      c.send("ext", "gw", "SYN", {
        role: "warn",
        frame: syn(
          "203.0.113.200",
          50999,
          GW.wanIp,
          22,
          isnE,
          "f-ext",
          "SYN de fora",
          "Ninguém de dentro abriu esta conexão.",
        ),
        detail: `→ ${GW.wanIp}:22`,
      });
      c.state("gw", "sem tradução: descarta", { dt: 0, tone: "bad", role: "warn" });
    },
  );

  b.step(
    {
      id: "s6-encaminhamento",
      title: "Abrindo uma porta",
      subtitle: "Encaminhamento fixo e o fim das traduções",
      text: `Para publicar o servidor do laboratório, o administrador cria uma tradução **fixa**: tudo o que chegar em ${GW.wanIp}:443 vai para ${INTERNAL.ip}:${INTERNAL.port}. Já as traduções dinâmicas expiram: sem tráfego por ${timeout} s, a linha some e a porta volta a ficar livre. Por isso aplicações que ficam muito tempo caladas mandam pacotes de "estou vivo".`,
      facts: [
        ["Regra fixa", `:443 → ${INTERNAL.ip}:${INTERNAL.port}`],
        ["Traduções dinâmicas", `expiram em ${timeout} s`],
      ],
      highlight: ["srv", "gw"],
    },
    () => {
      c.row("nat", 2, [`${INTERNAL.ip}:${INTERNAL.port}`, `${GW.wanIp}:443`, "qualquer", "fixa"], {
        mark: "new",
        dt: 1,
        label: "Encaminhamento fixo",
      });
      c.send("ext", "gw", "SYN", {
        role: "b",
        frame: syn(
          "203.0.113.200",
          51000,
          GW.wanIp,
          443,
          isnE + 1,
          "f-fwd-out",
          "SYN para o serviço publicado",
          "Chega na porta pública 443.",
        ),
        detail: `→ ${GW.wanIp}:443`,
      });
      c.send("gw", "srv", "SYN", {
        role: "b",
        frame: syn(
          "203.0.113.200",
          51000,
          INTERNAL.ip,
          INTERNAL.port,
          isnE + 1,
          "f-fwd-in",
          "Depois do encaminhamento",
          "Destino trocado para o servidor interno.",
          63,
        ),
        detail: `→ ${INTERNAL.ip}:${INTERNAL.port}`,
      });
      c.at(c.t + timeout * 1000);
      c.row("nat", 0, [`${LIA.ip}:${LIA.port}`, `${GW.wanIp}:${pubL}`, `${DAVI.ip}:443`, "expirou"], {
        mark: "miss",
        dt: 0,
        label: "Tradução da Lia expira",
      });
    },
  );

  return b.done({ pubL, pubM, timeout });
}

const lesson: LessonModule = {
  meta: {
    slug: "nat",
    site: "redes",
    title: "NAT: muitos computadores, um endereço",
    summary:
      "Como o roteador troca endereço e porta para toda uma rede privada usar um único IP público, e o que isso impede.",
    area: "Rede",
    refs: [
      { book: "tanenbaum-cn", chapter: 5, section: "5.7.2", note: "Endereços IP: NAT", verified: true },
      { rfc: 1918, note: "Faixas de endereços privados" },
      { rfc: 3022, note: "NAT tradicional e NAPT" },
      { rfc: 4787, note: "Comportamento de NAT para UDP" },
    ],
    simplifications: [
      "As portas públicas são dadas em sequência; roteadores atuais as sorteiam.",
      "Só TCP; para UDP e ICMP a ideia é a mesma, com outros prazos.",
      "A expiração mostrada ignora o fim da conexão (FIN), que encerra a tradução antes.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [{ key: "timeout", kind: "int", label: "Expiração das traduções (s)", min: 30, max: 7200 }],
  },
  build,
  intro: {
    text: "Os endereços IPv4 acabaram há anos, e mesmo assim cada casa e cada campus tem dezenas de aparelhos conectados. O truque é o NAT: o roteador esconde a rede inteira atrás de um único endereço público, trocando endereços e portas em cada pacote. Você vai ver a tabela que torna isso possível.",
    facts: [
      ["Rede privada", "10.20.0.0/24"],
      ["Endereço público", GW.wanIp],
      ["Tipo", "NAT com tradução de portas (NAPT)"],
    ],
  },
  outro: {
    title: "NAT em resumo",
    text: "O roteador troca origem na saída e destino na volta, guiado por uma tabela indexada pela porta pública. Conexões de fora só entram com uma regra fixa, e as traduções dinâmicas expiram sem uso.",
    facts: (run) => [
      ["Porta pública da Lia", String(run.stats.pubL)],
      ["Porta pública da Malu", String(run.stats.pubM)],
      ["Expiração", `${run.stats.timeout} s`],
    ],
  },
  next: ["ipv6-slaac", "webrtc"],
};

export default lesson;
