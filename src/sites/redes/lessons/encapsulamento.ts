import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import { ascii, frameOf, hexN, type Layer } from "../../../sim/net/bytes.ts";
import { ETHERTYPE, ethernet } from "../../../sim/net/ethernet.ts";
import { ipv4, PROTO } from "../../../sim/net/ipv4.ts";
import { payloadLayer, tcp } from "../../../sim/net/tcp.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { prng, randInt } from "../../../sim/shared/prng.ts";
import { DAVI, GW, ISP, LIA, PAGE_PATH, PAGE_REQUEST } from "../plan.ts";

/**
 * Encapsulation. Lia's browser asks the library server for a page over plain
 * HTTP, so every header is visible. Bytes come from the sim/net encoders.
 */
const SEED = 20;
const PATH = PAGE_PATH;
export const HTTP = PAGE_REQUEST;

const LAYERS: { id: string; label: string; sub: string; role: Role }[] = [
  { id: "app", label: "Aplicação", sub: "HTTP", role: "s4" },
  { id: "transp", label: "Transporte", sub: "TCP", role: "a" },
  { id: "rede", label: "Rede", sub: "IP", role: "b" },
  { id: "enlace", label: "Enlace", sub: "Ethernet", role: "s3" },
  { id: "fisica", label: "Física", sub: "sinal no fio", role: "muted" },
];

const scene: SceneSpec = {
  viewBox: [960, 560],
  zones: [
    { id: "z-lia", title: "Notebook da Lia", rect: { x: 20, y: 20, w: 200, h: 380 }, tone: "lan" },
    { id: "z-davi", title: "Servidor da biblioteca", rect: { x: 740, y: 20, w: 200, h: 380 }, tone: "wan" },
  ],
  nodes: [
    ...LAYERS.map((l, i) => ({
      id: `l-${l.id}`,
      kind: "layer" as const,
      label: l.label,
      sub: l.sub,
      at: [120, 80 + i * 66] as const,
      w: 160,
      h: 46,
    })),
    ...LAYERS.map((l, i) => ({
      id: `s-${l.id}`,
      kind: "layer" as const,
      label: l.label,
      sub: l.sub,
      at: [840, 80 + i * 66] as const,
      w: 160,
      h: 46,
    })),
    { id: "lia", kind: "laptop", label: "Lia", sub: LIA.ip, at: [120, 470] },
    { id: "r1", kind: "router", label: "Roteador do campus", sub: GW.ip, at: [340, 470], w: 180 },
    { id: "r2", kind: "router", label: "Provedor", sub: ISP.ip, at: [580, 470], w: 150 },
    { id: "davi", kind: "server", label: "Biblioteca", sub: DAVI.ip, at: [840, 470] },
  ],
  links: [
    ...LAYERS.slice(1).map((l, i) => ({
      id: `ll-${i}`,
      from: `l-${(LAYERS[i] as { id: string }).id}`,
      to: `l-${l.id}`,
    })),
    ...LAYERS.slice(1).map((l, i) => ({
      id: `sl-${i}`,
      from: `s-${(LAYERS[i] as { id: string }).id}`,
      to: `s-${l.id}`,
    })),
    { id: "lk-lia", from: "l-fisica", to: "lia", style: "dashed" },
    { id: "lk-davi", from: "s-fisica", to: "davi", style: "dashed" },
    { id: "w1", from: "lia", to: "r1", style: "bus" },
    { id: "w2", from: "r1", to: "r2", style: "bus" },
    { id: "w3", from: "r2", to: "davi", style: "bus" },
  ],
  widgets: [
    {
      kind: "grid",
      id: "bits",
      title: "Primeiros 2 bytes do quadro, como bits no fio",
      at: [270, 250],
      cols: 16,
      rows: 1,
      cellW: 24,
      indexLabel: "none",
    },
  ],
};

export function packet(seed = SEED) {
  const rand = prng(seed);
  const isnC = randInt(rand, 1, 2 ** 31);
  const isnS = randInt(rand, 1, 2 ** 31);
  const ipId = randInt(rand, 1, 0xffff);
  const body = ascii(HTTP);
  const http = payloadLayer("http", "HTTP", body, `GET ${PATH} (${body.length} bytes de texto)`);
  const tcpL = tcp({
    srcIp: LIA.ip,
    dstIp: DAVI.ip,
    sport: LIA.port,
    dport: 80,
    seq: isnC + 1,
    ack: isnS + 1,
    flags: ["PSH", "ACK"],
    window: 64240,
    payload: body,
  });
  const ipAt = (ttl: number) =>
    ipv4({
      src: LIA.ip,
      dst: DAVI.ip,
      proto: PROTO.tcp,
      payloadLen: tcpL.bytes.length + body.length,
      id: ipId,
      ttl,
    });
  const eth = (src: string, dst: string, names: { src: string; dst: string }) =>
    ethernet(dst, src, ETHERTYPE.ipv4, names);
  return { http, tcpL, ipAt, eth, body, isnC };
}

export function build(_p: Params) {
  const b = lessonBuilder();
  const { http, tcpL, ipAt, eth } = packet();
  let t = 0;
  const ip64 = ipAt(64);
  const eth1 = eth(LIA.mac, GW.mac, { src: "Lia", dst: "roteador do campus" });
  const sizes = (ls: Layer[]) => ls.reduce((n, l) => n + l.bytes.length, 0);
  const f = (id: string, title: string, summary: string, layers: Layer[], where: string) =>
    b.frame(frameOf(id, title, summary, layers, where));
  const row = (who: string, what: string, detail: string) => ({ cols: { t: `${t} ms`, who, what, detail } });

  b.step(
    {
      id: "s1-http",
      title: "A mensagem",
      subtitle: "Camada de aplicação: HTTP",
      text: `Lia clica num link e o navegador escreve um pedido HTTP: texto puro, com o caminho \`${PATH}\` e o nome do site no cabeçalho \`Host\`. Escolhemos HTTP sem TLS de propósito, para ver tudo. A aplicação não sabe nada de endereços IP, portas ou cabos: ela só entrega o texto para a camada de baixo.`,
      facts: [
        ["Pedido", `GET ${PATH}`],
        ["Tamanho", `${http.bytes.length} bytes`],
        ["Site", DAVI.host],
      ],
      highlight: ["l-app"],
    },
    () => {
      const fr = f(
        "f-http",
        "Só a mensagem HTTP",
        "O texto que o navegador escreve.",
        [http],
        "Dentro do navegador, antes de descer na pilha",
      );
      b.ev({
        t: ++t,
        kind: "state",
        target: "l-app",
        text: `GET ${PATH}`,
        tone: "active",
        role: "s4",
        label: "Pedido HTTP pronto",
        frame: fr,
        row: row("Aplicação", "Pedido HTTP", `${http.bytes.length} bytes`),
      });
    },
  );
  b.step(
    {
      id: "s2-tcp",
      title: "Vira segmento",
      subtitle: "Camada de transporte: TCP",
      text: `O TCP põe na frente um cabeçalho de ${tcpL.bytes.length} bytes. As **portas** dizem para qual programa vai (80, o servidor web) e de qual veio (${LIA.port}, escolhida pelo sistema da Lia). Os números de sequência e de confirmação permitem detectar perdas e reordenar. A conexão já foi aberta antes (a lição de TCP mostra como).`,
      facts: [
        ["Portas", `${LIA.port} → 80`],
        ["Cabeçalho TCP", `${tcpL.bytes.length} bytes`],
        ["Total", `${sizes([tcpL, http])} bytes`],
      ],
      highlight: ["l-transp"],
    },
    () => {
      const fr = f(
        "f-tcp",
        "Segmento TCP",
        "Cabeçalho TCP + HTTP.",
        [tcpL, http],
        "Entre a camada de transporte e a de rede",
      );
      b.ev({ t: ++t, kind: "move", from: "l-app", to: "l-transp", role: "s4", label: "HTTP" });
      b.ev({
        t: ++t,
        kind: "state",
        target: "l-transp",
        text: `porta ${LIA.port} → 80`,
        tone: "active",
        role: "a",
        label: "Cabeçalho TCP",
        frame: fr,
        row: row("Transporte", "+ cabeçalho TCP", `portas ${LIA.port} → 80`),
      });
    },
  );
  b.step(
    {
      id: "s3-ip",
      title: "Vira datagrama",
      subtitle: "Camada de rede: IP",
      text: `O IP acrescenta 20 bytes com o endereço de origem (${LIA.ip}, da Lia) e o de destino (${DAVI.ip}, do servidor). Nesta lição, sem NAT, esses dois endereços não mudam no caminho todo; na prática, o roteador do campus trocaria o IP privado da Lia por um público. O **TTL** começa em 64 e cada roteador vai subtrair 1. O checksum protege só o cabeçalho IP.`,
      facts: [
        ["IP", `${LIA.ip} → ${DAVI.ip}`],
        ["TTL", "64"],
        ["Total", `${sizes([ip64, tcpL, http])} bytes`],
      ],
      highlight: ["l-rede"],
    },
    () => {
      const fr = f(
        "f-ip",
        "Datagrama IP",
        "Cabeçalho IP + TCP + HTTP.",
        [ip64, tcpL, http],
        "Entre a camada de rede e a de enlace",
      );
      b.ev({ t: ++t, kind: "move", from: "l-transp", to: "l-rede", role: "a", label: "TCP" });
      b.ev({
        t: ++t,
        kind: "state",
        target: "l-rede",
        text: `${LIA.ip} → ${DAVI.ip}`,
        tone: "active",
        role: "b",
        label: "Cabeçalho IP",
        frame: fr,
        row: row("Rede", "+ cabeçalho IP", `${LIA.ip} → ${DAVI.ip}, TTL 64`),
      });
    },
  );
  b.step(
    {
      id: "s4-ethernet",
      title: "Vira quadro",
      subtitle: "Camada de enlace: Ethernet",
      text: `O servidor não está na rede da Lia, então o quadro vai para o **roteador do campus**: o MAC de destino é o dele (${GW.mac}), não o do servidor. O sistema já sabia esse MAC porque o ARP tinha sido feito antes e estava em cache. O EtherType 0x0800 avisa que dentro vem IPv4.`,
      facts: [
        ["MAC de destino", `${GW.mac} (roteador)`],
        ["MAC de origem", `${LIA.mac} (Lia)`],
        ["Quadro", `${sizes([eth1, ip64, tcpL, http])} bytes`],
      ],
      highlight: ["l-enlace"],
      quiz: {
        kind: "choice",
        prompt:
          "O servidor está em outra rede. Qual MAC de destino vai no quadro que sai do notebook da Lia?",
        options: [
          "O MAC do servidor da biblioteca",
          "O MAC do roteador do campus",
          "ff:ff:ff:ff:ff:ff (broadcast)",
        ],
        answer: 1,
        explain:
          "O MAC só vale dentro de um enlace. Para sair da rede, o quadro vai para o **gateway** (o roteador do campus), que abre o pacote, olha o IP de destino e monta um quadro novo para o próximo enlace.",
      },
    },
    () => {
      const fr = f(
        "f-eth",
        "Quadro Ethernet",
        "As quatro camadas, uma dentro da outra.",
        [eth1, ip64, tcpL, http],
        "Saindo da placa de rede da Lia",
      );
      b.ev({ t: ++t, kind: "move", from: "l-rede", to: "l-enlace", role: "b", label: "IP" });
      b.ev({
        t: ++t,
        kind: "state",
        target: "l-enlace",
        text: `→ ${GW.mac}`,
        tone: "active",
        role: "s3",
        label: "Cabeçalho Ethernet",
        frame: fr,
        row: row("Enlace", "+ cabeçalho Ethernet", `${LIA.mac} → ${GW.mac}`),
      });
      b.ev({
        t,
        kind: "note",
        at: "l-enlace",
        text: `ARP em cache: ${GW.ip} = ${GW.mac}`,
        tone: "info",
        role: "s3",
        label: "ARP já resolvido",
      });
    },
  );
  const first = eth1.bytes.slice(0, 2) as number[];
  b.step(
    {
      id: "s5-fio",
      title: "Sinal no fio",
      subtitle: "Camada física: bits",
      text: `A placa de rede transforma o quadro em uma sequência de bits e os bits em sinal elétrico (ou luz, ou rádio). Começa pelo MAC de destino: os primeiros 2 bytes, ${hexN(first[0] ?? 0, 2)} e ${hexN(first[1] ?? 0, 2)}, aparecem como 16 bits na grade. A camada física não entende nada do que carrega.`,
      facts: [
        ["Bits", `${sizes([eth1, ip64, tcpL, http]) * 8}`],
        ["Primeiro byte", hexN(first[0] ?? 0, 2)],
      ],
      highlight: ["l-fisica", "lia"],
    },
    () => {
      b.ev({ t: ++t, kind: "move", from: "l-enlace", to: "l-fisica", role: "s3", label: "Quadro" });
      t++;
      first.forEach((byte, k) => {
        for (let bit = 0; bit < 8; bit++)
          b.ev({
            t,
            kind: "cell",
            grid: "bits",
            index: k * 8 + bit,
            value: String((byte >>> (7 - bit)) & 1),
            role: "s3",
            label: `bit ${k * 8 + bit}`,
          });
      });
      b.ev({ t: ++t, kind: "move", from: "l-fisica", to: "lia", role: "muted", label: "0101…" });
      b.ev({
        t: ++t,
        kind: "move",
        from: "lia",
        to: "r1",
        role: "s3",
        label: "Quadro",
        row: row("Física", "Bits no fio", `${sizes([eth1, ip64, tcpL, http]) * 8} bits`),
      });
    },
  );
  const ip63 = ipAt(63);
  const ip62 = ipAt(62);
  const eth2 = eth(GW.wanMac, ISP.mac, { src: "roteador do campus", dst: "provedor" });
  const eth3 = eth(ISP.farMac, DAVI.mac, { src: "provedor", dst: "servidor" });
  b.step(
    {
      id: "s6-roteadores",
      quiz: {
        kind: "choice",
        prompt: "O quadro chega ao roteador do campus. O que ele muda antes de mandar o pacote adiante?",
        options: [
          "Monta um quadro Ethernet novo e subtrai 1 do TTL no IP; TCP e HTTP passam intactos",
          "Troca o IP de destino pelo endereço do próximo roteador",
          "Abre o TCP para conferir a porta e remonta tudo do zero",
        ],
        answer: 0,
        explain:
          "Um roteador trabalha até a camada de rede: descarta o quadro, lê o IP de destino, subtrai 1 do TTL (e recalcula o checksum do IP) e cria um quadro com os MACs do próximo enlace. Os IPs de origem e destino não mudam.",
      },
      title: "Roteadores abrem até o IP",
      subtitle: "Quadro novo a cada enlace",
      text: "O roteador do campus recebe o quadro, joga fora o cabeçalho Ethernet, lê o IP de destino e consulta a tabela de rotas. Ele subtrai 1 do TTL (e por isso recalcula o checksum do IP) e monta um **quadro novo**, com MACs do próximo enlace. O provedor faz o mesmo. Nenhum dos dois abre o TCP ou o HTTP.",
      facts: [
        ["IPs", "não mudam (sem NAT)"],
        ["MACs", "mudam a cada enlace"],
        ["TTL na chegada", "62"],
      ],
      highlight: ["r1", "r2"],
    },
    () => {
      const fr1 = f(
        "f-hop1",
        "Depois do roteador do campus",
        "Ethernet novo, TTL 63, o resto igual.",
        [eth2, ip63, tcpL, http],
        "Entre o roteador do campus e o provedor",
      );
      const fr2 = f(
        "f-hop2",
        "Depois do provedor",
        "Ethernet novo, TTL 62.",
        [eth3, ip62, tcpL, http],
        "No último enlace, chegando ao servidor",
      );
      b.ev({
        t: ++t,
        kind: "state",
        target: "r1",
        text: "TTL 64 → 63",
        tone: "active",
        role: "b",
        label: "Roteador do campus encaminha",
        frame: fr1,
        row: row("Roteador do campus", "Novo quadro", `${GW.wanMac} → ${ISP.mac}, TTL 63`),
      });
      b.ev({ t: ++t, kind: "move", from: "r1", to: "r2", role: "s3", label: "Quadro" });
      b.ev({
        t: ++t,
        kind: "state",
        target: "r2",
        text: "TTL 63 → 62",
        tone: "active",
        role: "b",
        label: "Provedor encaminha",
        frame: fr2,
        row: row("Provedor", "Novo quadro", `${ISP.farMac} → ${DAVI.mac}, TTL 62`),
      });
      b.ev({ t: ++t, kind: "move", from: "r2", to: "davi", role: "s3", label: "Quadro" });
    },
  );
  b.step(
    {
      id: "s7-servidor",
      title: "Desencapsulando",
      subtitle: "Cada camada tira o seu cabeçalho",
      text: "No servidor, o caminho é o inverso. A placa confere que o MAC de destino é dela e entrega ao IP pelo EtherType. O IP confere o endereço e entrega ao TCP pelo campo Protocolo (6). O TCP usa a porta 80 para achar o servidor web, que finalmente lê `GET /horarios`. Cada camada só lê o cabeçalho que a camada par do outro lado escreveu.",
      facts: [
        ["Enlace → rede", "EtherType 0x0800"],
        ["Rede → transporte", "Protocolo 6 (TCP)"],
        ["Transporte → aplicação", "porta 80"],
      ],
      highlight: ["s-app"],
    },
    () => {
      b.ev({ t: ++t, kind: "move", from: "davi", to: "s-fisica", role: "muted", label: "bits" });
      const up: [string, string, Role, string][] = [
        ["s-fisica", "s-enlace", "s3", "Quadro"],
        ["s-enlace", "s-rede", "b", "IP"],
        ["s-rede", "s-transp", "a", "TCP"],
        ["s-transp", "s-app", "s4", "HTTP"],
      ];
      const what = ["Tira o Ethernet", "Tira o IP", "Tira o TCP", "Lê o pedido"];
      up.forEach(([from, to, role, label], k) => {
        b.ev({ t: ++t, kind: "move", from, to, role, label });
        b.ev({
          t,
          kind: "state",
          target: to,
          text: what[k] as string,
          tone: "active",
          role,
          label: what[k] as string,
          row: row("Servidor", what[k] as string, label),
        });
      });
      b.ev({
        t: ++t,
        kind: "note",
        at: "s-app",
        text: `GET ${PATH}`,
        tone: "good",
        role: "s4",
        label: "O servidor web recebe o pedido",
      });
    },
  );
  return b.done({ bytes: sizes([eth1, ip64, tcpL, http]), http: http.bytes.length });
}

const lesson: LessonModule = {
  meta: {
    slug: "encapsulamento",
    site: "redes",
    title: "Do clique ao sinal: encapsulamento em camadas",
    summary:
      "Como um pedido HTTP ganha cabeçalhos TCP, IP e Ethernet, atravessa dois roteadores e é desmontado no servidor.",
    area: "Fundamentos",
    refs: [
      { book: "tanenbaum-cn", chapter: 1, section: "1.6", note: "Modelos de referência", verified: true },
    ],
    simplifications: [
      "Sem preâmbulo nem FCS no quadro Ethernet, como numa captura.",
      "A conexão TCP e o ARP já estavam prontos; outras lições mostram os dois.",
      "Dois roteadores no caminho; na internet costumam ser mais de dez.",
      "O roteador do campus não faz NAT nesta lição.",
    ],
  },
  scene,
  params: { defaults: {} },
  build,
  intro: {
    text: "Cada camada da rede resolve um problema e confia na de baixo para o resto. Você vai seguir um único pedido da Lia ao servidor da biblioteca, vendo cada cabeçalho entrar ([[encapsulamento]]) e sair. Abra o inspetor (I) a qualquer momento para ver os bytes.",
    facts: [
      ["Origem", `${LIA.name} (${LIA.ip})`],
      ["Destino", `${DAVI.host} (${DAVI.ip})`],
      ["Pedido", `GET ${PATH}`],
    ],
  },
  outro: {
    title: "Encapsulamento em resumo",
    text: "Na descida, cada camada põe um cabeçalho na frente do que recebeu; na subida, cada uma tira o seu. Roteadores só abrem até o IP e trocam o quadro a cada enlace; os endereços IP vão de ponta a ponta (quando não há NAT).",
    facts: (run) => [
      ["Quadro completo", `${run.stats.bytes} bytes`],
      ["Mensagem HTTP", `${run.stats.http} bytes`],
    ],
  },
  next: ["tcp-conexao"],
};

export default lesson;
