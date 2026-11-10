import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { arp } from "../../../sim/net/arp.ts";
import { frameOf } from "../../../sim/net/bytes.ts";
import { ETHERTYPE, ethernet } from "../../../sim/net/ethernet.ts";
import { type PacketMeta, runIds } from "../../../sim/net/ids.ts";
import { type LessonBuilder, lessonBuilder } from "../../../sim/shared/builder.ts";
import { BROADCAST, GW, LIA, MALU, ZERO_MAC } from "../plan.ts";

/**
 * ARP spoofing and its defenses. Malu, on the same LAN, tells Lia that the
 * gateway's IP is at Malu's MAC. Simulation only: no tool names, commands or payloads.
 */
type Defense = "nenhuma" | "dai" | "estatica";
const defenseOf = (p: Params): Defense =>
  p.defesa === "dai" || p.defesa === "estatica" ? p.defesa : "nenhuma";

const scene: SceneSpec = {
  viewBox: [960, 560],
  zones: [
    { id: "z-lan", title: `LAN ${"10.20.0.0/24"}`, rect: { x: 20, y: 20, w: 640, h: 330 }, tone: "lan" },
  ],
  nodes: [
    { id: "lia", kind: "laptop", label: "Lia", sub: `${LIA.ip}`, at: [110, 100] },
    { id: "sw", kind: "switch", label: "Switch do laboratório", sub: "portas 1 a 3", at: [340, 190], w: 190 },
    { id: "malu", kind: "attacker", label: "Malu", sub: `${MALU.ip}`, at: [110, 290] },
    { id: "gw", kind: "router", label: "Roteador do campus", sub: GW.ip, at: [570, 190], w: 170 },
    { id: "net", kind: "cloud", label: "Internet", at: [830, 190] },
    { id: "ids", kind: "box", label: "Monitor (IDS)", sub: "porta espelhada", at: [340, 300], w: 170 },
  ],
  links: [
    { id: "a", from: "lia", to: "sw" },
    { id: "b", from: "malu", to: "sw" },
    { id: "c", from: "sw", to: "gw" },
    { id: "d", from: "gw", to: "net", style: "bus" },
    { id: "e", from: "sw", to: "ids", style: "dashed" },
  ],
  widgets: [
    {
      kind: "table",
      id: "cache",
      title: "Cache ARP da Lia",
      at: [60, 390],
      columns: ["IP", "MAC", "Tipo"],
      widths: [140, 200, 110],
      rows: 2,
    },
    {
      kind: "table",
      id: "binds",
      title: "Switch: vínculos do DHCP snooping",
      at: [560, 390],
      columns: ["IP", "MAC", "Porta"],
      widths: [120, 190, 60],
      rows: 3,
    },
  ],
};

const short = (m: string) => `…${m.slice(-5)}`;

export function build(p: Params) {
  const b = lessonBuilder();
  const defense = defenseOf(p);
  const tour = defense === "nenhuma";
  let t = 0;
  const packets: PacketMeta[] = [];
  const row = (who: string, what: string, detail: string) => ({ cols: { t: `${t} s`, who, what, detail } });
  const cacheRow = (i: number, ip: string, m: string, kind: string, mark?: "hit" | "new" | "bad" | "warn") =>
    b.ev({
      t,
      kind: "row",
      table: "cache",
      index: i,
      cells: [ip, m, kind],
      ...(mark ? { mark } : {}),
      role: mark === "bad" ? "bad" : "b",
      label: `Cache: ${ip} → ${m}`,
    });

  const reqFrame = b.frame(
    frameOf(
      "f-req",
      "ARP: pedido",
      "Lia pergunta, em broadcast, quem tem o IP do roteador.",
      [
        ethernet(BROADCAST, LIA.mac, ETHERTYPE.arp, { src: "Lia" }),
        arp({ op: "request", senderMac: LIA.mac, senderIp: LIA.ip, targetMac: ZERO_MAC, targetIp: GW.ip }),
      ],
      "Saindo do notebook da Lia",
    ),
  );
  const repFrame = b.frame(
    frameOf(
      "f-rep",
      "ARP: resposta",
      "O roteador responde só para a Lia.",
      [
        ethernet(LIA.mac, GW.mac, ETHERTYPE.arp, { src: "roteador", dst: "Lia" }),
        arp({ op: "reply", senderMac: GW.mac, senderIp: GW.ip, targetMac: LIA.mac, targetIp: LIA.ip }),
      ],
      "Saindo do roteador",
    ),
  );
  const forged = () =>
    b.frame(
      frameOf(
        "f-forjado",
        "ARP forjado",
        "Uma resposta que ninguém pediu, dizendo que o IP do roteador está no MAC da Malu.",
        [
          ethernet(LIA.mac, MALU.mac, ETHERTYPE.arp, { src: "Malu", dst: "Lia" }),
          arp(
            { op: "reply", senderMac: MALU.mac, senderIp: GW.ip, targetMac: LIA.mac, targetIp: LIA.ip },
            true,
          ),
        ],
        "Saindo do notebook da Malu",
      ),
    );

  const normal = (bb: LessonBuilder) => {
    t++;
    bb.ev({
      t,
      kind: "row",
      table: "binds",
      index: 0,
      cells: [LIA.ip, LIA.mac, "1"],
      role: "muted",
      label: "Vínculo da Lia",
    });
    bb.ev({
      t,
      kind: "row",
      table: "binds",
      index: 1,
      cells: [MALU.ip, MALU.mac, "2"],
      role: "muted",
      label: "Vínculo da Malu",
    });
    bb.ev({
      t,
      kind: "row",
      table: "binds",
      index: 2,
      cells: [GW.ip, GW.mac, "3"],
      role: "muted",
      label: "Vínculo do roteador",
    });
    cacheRow(0, MALU.ip, MALU.mac, "dinâmico");
    bb.ev({
      t: ++t,
      kind: "move",
      from: "lia",
      to: "sw",
      role: "b",
      label: `quem tem ${GW.ip}?`,
      frame: reqFrame,
      row: row("Lia", "ARP pedido (broadcast)", `quem tem ${GW.ip}?`),
    });
    packets.push({ i: packets.length, t, proto: "arp", op: "request", senderIp: LIA.ip, senderMac: LIA.mac });
    bb.ev({ t: ++t, kind: "move", from: "sw", to: "gw", role: "b", label: "broadcast" });
    bb.ev({ t, kind: "move", from: "sw", to: "malu", role: "b", label: "broadcast" });
    bb.ev({
      t: ++t,
      kind: "move",
      from: "gw",
      to: "lia",
      via: ["sw"],
      role: "b",
      label: `${GW.ip} está em ${short(GW.mac)}`,
      frame: repFrame,
      row: row("Roteador", "ARP resposta", `${GW.ip} está em ${GW.mac}`),
    });
    packets.push({
      i: packets.length,
      t,
      proto: "arp",
      op: "reply",
      unsolicited: false,
      senderIp: GW.ip,
      senderMac: GW.mac,
    });
    cacheRow(1, GW.ip, GW.mac, "dinâmico", "new");
  };

  const attack = (bb: LessonBuilder, dropAtSwitch: boolean, staticEntry: boolean) => {
    const fr = forged();
    bb.ev({
      t: ++t,
      kind: "state",
      target: "malu",
      text: "ARP forjado",
      tone: "bad",
      role: "bad",
      label: "Malu prepara o ARP",
    });
    packets.push({
      i: packets.length,
      t,
      proto: "arp",
      op: "reply",
      unsolicited: true,
      senderIp: GW.ip,
      senderMac: MALU.mac,
    });
    if (dropAtSwitch) {
      bb.ev({
        t,
        kind: "move",
        from: "malu",
        to: "sw",
        role: "bad",
        label: `${GW.ip} está em ${short(MALU.mac)}`,
        frame: fr,
        row: row("Malu", "ARP forjado", `${GW.ip} está em ${MALU.mac}`),
      });
      bb.ev({
        t: ++t,
        kind: "row",
        table: "binds",
        index: 2,
        cells: [GW.ip, GW.mac, "3"],
        mark: "hit",
        role: "b",
        label: "Vínculo confere com o roteador, não com a Malu",
      });
      bb.ev({
        t,
        kind: "state",
        target: "sw",
        text: "DAI: descartado",
        tone: "good",
        role: "b",
        label: "Inspeção dinâmica de ARP descarta",
        row: row("Switch", "DAI descarta", `${GW.ip} não pertence a ${MALU.mac} (porta 2)`),
      });
      return;
    }
    bb.ev({
      t,
      kind: "move",
      from: "malu",
      to: "lia",
      via: ["sw"],
      role: "bad",
      label: `${GW.ip} está em ${short(MALU.mac)}`,
      frame: fr,
      row: row("Malu", "ARP forjado", `${GW.ip} está em ${MALU.mac}`),
    });
    if (staticEntry) {
      bb.ev({
        t: ++t,
        kind: "state",
        target: "lia",
        text: "entrada estática",
        tone: "good",
        role: "b",
        label: "A entrada estática não muda",
        row: row("Lia", "Ignora", "entrada estática para o roteador"),
      });
      cacheRow(1, GW.ip, GW.mac, "estático", "hit");
    } else {
      t++;
      cacheRow(1, GW.ip, MALU.mac, "dinâmico", "bad");
      bb.ev({
        t,
        kind: "state",
        target: "lia",
        text: "cache envenenado",
        tone: "bad",
        role: "bad",
        label: "O cache da Lia aceita a mentira",
        row: row("Lia", "Cache alterado", `${GW.ip} → ${MALU.mac}`),
      });
    }
  };

  const signals = (bb: LessonBuilder) => {
    const alerts = runIds(packets);
    bb.ev({ t: ++t, kind: "move", from: "sw", to: "ids", role: "muted", label: "cópia do tráfego" });
    for (const a of alerts)
      bb.ev({
        t: ++t,
        kind: "note",
        at: "ids",
        text: a.text,
        tone: "bad",
        role: "bad",
        label: `IDS: ${a.text}`,
        row: row("IDS", "Alerta", a.text),
      });
    return alerts.length;
  };

  if (!tour) {
    b.step(
      {
        id: "s1-normal",
        title: "ARP normal",
        subtitle: "Quem tem o IP do roteador?",
        text: "A Lia descobre o MAC do roteador com um pedido em broadcast.",
        facts: [["Roteador", `${GW.ip} → ${GW.mac}`]],
      },
      () => normal(b),
    );
    b.step(
      {
        id: "s2-ataque",
        title: "O ARP forjado",
        subtitle: defense === "dai" ? "Com DAI e DHCP snooping no switch" : "Com entrada estática na Lia",
        text:
          defense === "dai"
            ? "O switch compara o ARP com os vínculos aprendidos do DHCP e descarta a mentira."
            : "A Lia fixou o MAC do roteador; uma resposta ARP não muda uma entrada estática.",
        facts: [["Defesa", defense === "dai" ? "DAI + DHCP snooping" : "entrada estática"]],
        tags: ["defense"],
      },
      () => attack(b, defense === "dai", defense === "estatica"),
    );
    let n = 0;
    b.step(
      {
        id: "s3-sinais",
        title: "Sinais",
        subtitle: "O que o monitor registra",
        text: "O IDS vê o ARP não solicitado mesmo quando a defesa funciona.",
        facts: [],
        tags: ["signals"],
      },
      () => {
        n = signals(b);
      },
    );
    return b.done({ alerts: n, poisoned: 0 }, [
      defense === "dai"
        ? "O ARP forjado parou no switch: o cache da Lia continua certo."
        : "A entrada estática protege a Lia, mas só ela: outros hosts continuam vulneráveis, e entradas estáticas dão trabalho para manter.",
      `${n} alerta${n === 1 ? "" : "s"} do IDS.`,
    ]);
  }

  b.step(
    {
      id: "s1-normal",
      title: "ARP normal",
      subtitle: "Quem tem 10.20.0.1?",
      text: `Para mandar qualquer coisa à internet, a Lia precisa do MAC do roteador. Ela pergunta em **broadcast** "quem tem ${GW.ip}?", e todos na LAN recebem, inclusive a Malu. Só o roteador responde, direto para a Lia, e ela guarda a resposta no cache ARP. Repare: nada nessa resposta é autenticado.`,
      facts: [
        ["Pedido", `quem tem ${GW.ip}?`],
        ["Resposta", `${GW.ip} está em ${GW.mac}`],
        ["Autenticação", "nenhuma"],
      ],
    },
    () => normal(b),
  );
  b.step(
    {
      id: "s2-forjado",
      title: "Uma resposta que ninguém pediu",
      subtitle: "O ARP forjado da Malu",
      text: `A Malu manda à Lia uma **resposta ARP** dizendo "${GW.ip} está em ${MALU.mac}", o MAC dela. Ninguém perguntou nada, mas o ARP não lembra quais pedidos fez: a maioria dos sistemas aceita respostas não solicitadas, porque elas também servem para avisar mudanças legítimas (o "ARP gratuito"). Abra o inspetor para ver a mentira no campo MAC do remetente.`,
      facts: [
        ["Origem", `Malu (${MALU.mac})`],
        ["Mentira", `${GW.ip} → ${MALU.mac}`],
        ["Pedido anterior", "nenhum"],
      ],
      highlight: ["malu"],
    },
    () => {
      const fr = forged();
      b.ev({
        t: ++t,
        kind: "state",
        target: "malu",
        text: "ARP forjado",
        tone: "bad",
        role: "bad",
        label: "Malu prepara o ARP",
      });
      packets.push({
        i: packets.length,
        t,
        proto: "arp",
        op: "reply",
        unsolicited: true,
        senderIp: GW.ip,
        senderMac: MALU.mac,
      });
      b.ev({
        t,
        kind: "move",
        from: "malu",
        to: "lia",
        via: ["sw"],
        role: "bad",
        label: `${GW.ip} está em ${short(MALU.mac)}`,
        frame: fr,
        row: row("Malu", "ARP forjado", `${GW.ip} está em ${MALU.mac}`),
      });
    },
  );
  b.step(
    {
      id: "s3-cache",
      title: "O cache muda",
      subtitle: "Uma linha trocada",
      text: `A Lia sobrescreve a entrada do roteador: agora ${GW.ip} aponta para ${MALU.mac}. Repare que a linha da própria Malu (${MALU.ip}) tem o **mesmo MAC**. Para a Lia nada parece errado; a página que ela estava lendo continua abrindo.`,
      facts: [
        [GW.ip, `${MALU.mac} (era ${GW.mac})`],
        [MALU.ip, MALU.mac],
      ],
      quiz: {
        kind: "pick",
        prompt:
          "A Lia vai mandar um pacote para um servidor na internet. Para qual máquina da LAN o quadro vai?",
        targets: [
          { id: "gw", label: "Roteador do campus" },
          { id: "malu", label: "Malu" },
          { id: "sw", label: "Switch" },
        ],
        answer: "malu",
        explain: `O IP de destino continua sendo o do servidor, mas o quadro vai para o MAC que o cache diz ser do gateway: **${MALU.mac}, da Malu**. O switch entrega na porta dela.`,
      },
      highlight: ["lia"],
    },
    () => {
      t++;
      cacheRow(1, GW.ip, MALU.mac, "dinâmico", "bad");
      cacheRow(0, MALU.ip, MALU.mac, "dinâmico", "warn");
      b.ev({
        t,
        kind: "state",
        target: "lia",
        text: "cache envenenado",
        tone: "bad",
        role: "bad",
        label: "O cache da Lia aceita a mentira",
        row: row("Lia", "Cache alterado", `${GW.ip} → ${MALU.mac}`),
      });
    },
  );
  b.step(
    {
      id: "s4-mitm",
      title: "A Malu no meio",
      subtitle: "Encaminhar para não ser notada",
      text: "Todo o tráfego da Lia para fora da LAN passa agora pela Malu, que o encaminha ao roteador verdadeiro para que nada pare de funcionar. Se ela fizer o mesmo com o roteador (dizendo que o IP da Lia está no MAC dela), vê também as respostas. É um ataque **homem no meio**: ela pode ler, guardar ou alterar o que não estiver cifrado.",
      facts: [
        ["Caminho", "Lia → Malu → roteador → internet"],
        ["A Lia percebe?", "não, a conexão funciona"],
      ],
      highlight: ["malu"],
    },
    () => {
      b.ev({
        t: ++t,
        kind: "move",
        from: "lia",
        to: "malu",
        via: ["sw"],
        role: "a",
        label: "pacote para a internet",
        row: row("Lia", "Pacote", `quadro para ${MALU.mac}`),
      });
      b.ev({
        t: ++t,
        kind: "state",
        target: "malu",
        text: "lê e encaminha",
        tone: "bad",
        role: "bad",
        label: "Malu lê o pacote",
      });
      b.ev({
        t: ++t,
        kind: "move",
        from: "malu",
        to: "net",
        via: ["sw", "gw"],
        role: "bad",
        label: "encaminhado",
        row: row("Malu", "Encaminha", "para o roteador verdadeiro"),
      });
    },
  );
  let alerts = 0;
  b.step(
    {
      id: "s5-sinais",
      title: "Sinais de detecção",
      subtitle: "O que aparece no monitor e na tabela ARP",
      text: "O ataque deixa rastros. Um IDS que recebe uma cópia do tráfego (porta espelhada) vê uma **resposta ARP sem pedido** e o IP do roteador **mudando de MAC**. Na própria máquina da Lia, listar a tabela ARP mostra dois IPs com o mesmo MAC. Ferramentas no estilo do arpwatch fazem exatamente essa comparação.",
      facts: [
        ["Alerta 1", "ARP reply não solicitado"],
        ["Alerta 2", `${GW.ip} mudou de MAC`],
        ["Na tabela ARP", "dois IPs com o mesmo MAC"],
      ],
      tags: ["signals"],
      highlight: ["ids"],
    },
    () => {
      alerts = signals(b);
    },
  );
  b.step(
    {
      id: "s6-defesa",
      quiz: {
        kind: "choice",
        prompt:
          "Com a inspeção dinâmica de ARP ligada, como o switch descobre que a resposta da Malu é falsa?",
        options: [
          "Compara o IP, o MAC e a porta com os vínculos aprendidos pelo DHCP snooping",
          "Pergunta ao roteador qual é o MAC verdadeiro dele",
          "Descarta qualquer resposta ARP que ninguém pediu",
        ],
        answer: 0,
        explain:
          "O switch já sabe, pelas respostas do servidor DHCP e pelo vínculo fixo do roteador, qual MAC e qual porta pertencem a cada IP. Um ARP que contradiz esse registro é descartado; respostas legítimas, inclusive as não solicitadas, passam.",
      },
      title: "Defesa: DAI e DHCP snooping",
      subtitle: "O mesmo ataque, agora com o switch protegido",
      text: "Com **DHCP snooping**, o switch aprende de quem é cada IP, em qual porta, a partir das respostas do servidor DHCP (o roteador tem um vínculo fixo). Com a **inspeção dinâmica de ARP (DAI)** ligada, todo ARP que chega por uma porta comum é conferido com esses vínculos. O ARP da Malu chega pela porta dela e diz que 10.20.0.1 está no MAC dela; o vínculo registrado diz outro MAC e outra porta. Não confere, e o switch o descarta antes de chegar à Lia.",
      facts: [
        ["DHCP snooping", "vínculos IP ↔ MAC ↔ porta"],
        ["DAI", "descarta ARP que não confere"],
        ["Cache da Lia", "continua certo"],
      ],
      tags: ["defense"],
      highlight: ["sw"],
    },
    () => {
      t++;
      cacheRow(1, GW.ip, GW.mac, "dinâmico", "hit");
      cacheRow(0, MALU.ip, MALU.mac, "dinâmico");
      b.ev({
        t,
        kind: "state",
        target: "lia",
        text: "cache restaurado",
        tone: "good",
        role: "b",
        label: "Recomeçando com o switch protegido",
      });
      b.ev({
        t,
        kind: "state",
        target: "sw",
        text: "DAI ligado",
        tone: "active",
        role: "b",
        label: "DAI e DHCP snooping ligados",
      });
      attack(b, true, false);
    },
  );
  b.step(
    {
      id: "s7-tls",
      title: "E o HTTPS?",
      subtitle: "O que o TLS ainda garante",
      text: "Sem DAI, a Malu fica no meio, mas o que vai dentro de TLS continua ilegível para ela. Se tentar se passar pelo servidor, não tem a chave privada do certificado e o navegador mostra um erro. Sobra para ela o que vai em claro: páginas HTTP, consultas DNS sem proteção e os metadados. Por isso as duas defesas se somam: a rede protegida no switch e os dados protegidos com TLS.",
      facts: [
        ["HTTP", "legível pela Malu"],
        ["HTTPS", "ilegível; imitar o servidor falha"],
        ["Referência", "RFC 826 (ARP), RFC 5227 (detecção de conflito)"],
      ],
      tags: ["defense"],
    },
    () => {
      b.ev({
        t: ++t,
        kind: "note",
        at: "malu",
        text: "TLS: só ··",
        tone: "info",
        role: "crypto",
        label: "Conteúdo cifrado continua protegido",
        row: row("Resumo", "Camadas de defesa", "DAI no switch + TLS nos dados"),
      });
    },
  );
  return b.done({ alerts, poisoned: 1 });
}

const lesson: LessonModule = {
  meta: {
    slug: "arp-spoofing",
    site: "redes",
    title: "ARP spoofing: o homem no meio da LAN",
    summary:
      "Como uma resposta ARP forjada desvia o tráfego de uma vítima, como detectar o ataque e como o switch o bloqueia.",
    area: "Segurança",
    refs: [
      { rfc: 826, note: "ARP" },
      { rfc: 5227, note: "Detecção de conflito de endereço IPv4" },
      {
        book: "tanenbaum-cn",
        chapter: 8,
        section: "8.2.2",
        note: "Sniffing, snooping e spoofing de ARP",
        verified: true,
      },
    ],
    simplifications: [
      "Só a Lia é enganada; um ataque completo engana também o roteador.",
      "O switch tem só três portas e todos os vínculos já estão aprendidos.",
      "O IDS vê tudo pela porta espelhada, sem perdas.",
    ],
  },
  scene,
  params: {
    defaults: { defesa: "nenhuma" },
    fields: [
      {
        key: "defesa",
        kind: "choice",
        label: "Defesa ligada desde o início",
        options: [
          { value: "nenhuma", label: "Nenhuma (a lição completa)" },
          { value: "dai", label: "DAI + DHCP snooping no switch" },
          { value: "estatica", label: "Entrada ARP estática na Lia" },
        ],
      },
    ],
  },
  build,
  intro: {
    text: "O [[arp]] traduz IPs em MACs dentro da LAN e confia em quem responde. A Malu, conectada ao mesmo switch que a Lia, vai explorar essa confiança. Esta lição é uma simulação para entender o ataque e, principalmente, como detectá-lo e bloqueá-lo.",
    facts: [
      ["Vítima", `${LIA.name} (${LIA.ip})`],
      ["Atacante", `${MALU.name} (${MALU.ip})`],
      ["Alvo da mentira", `roteador (${GW.ip})`],
    ],
  },
  outro: {
    title: "ARP spoofing em resumo",
    text: "O ARP aceita respostas sem pedido e sem autenticação. Monitore mudanças de vínculo IP ↔ MAC, ligue DHCP snooping e DAI nos switches e cifre o que importa com TLS.",
    facts: (run) => [["Alertas do IDS", String(run.stats.alerts)]],
  },
  next: ["syn-flood"],
};

export default lesson;
