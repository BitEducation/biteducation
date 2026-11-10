import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { antiReplay, type EspSize, espSize } from "../../../sim/net/ipsec.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { seqScene, talk } from "../../../sim/shared/seq.ts";
import { ipsec as practice } from "../practice.ts";

/**
 * IPsec between the library's branch and its main site: a security association, ESP tunnel
 * sizes, transport mode, and the anti-replay window.
 */
const DEFAULTS = { pacote: 1400 };
const UDP = 8;
const MTU = 1500;
const packetOf = (p: Params) => Math.min(1500, Math.max(40, Math.round(Number(p.pacote ?? DEFAULTS.pacote))));
const WINDOW = 64;
const SEQS = [1, 2, 3, 5, 4, 4, 70, 6, 71];
const SPI = "0x3a7f0c21";

function scene(p: Params): SceneSpec {
  const PACKET = packetOf(p);
  return seqScene(
    [
      { id: "lia", kind: "laptop", label: "Lia", sub: "rede da filial" },
      { id: "gw1", kind: "firewall", label: "Gateway da filial", sub: "198.51.100.1" },
      { id: "net", kind: "cloud", label: "Internet" },
      { id: "gw2", kind: "firewall", label: "Gateway da sede", sub: "203.0.113.1" },
      { id: "srv", kind: "server", label: "Acervo", sub: "rede da sede" },
    ],
    {
      height: 620,
      widgets: [
        {
          kind: "table",
          id: "tamanho",
          title: `Pacote de ${PACKET} bytes dentro do ESP (bytes)`,
          at: [40, 240],
          columns: ["Parte", "Túnel", "Transporte"],
          widths: [250, 90, 110],
          rows: 9,
        },
        {
          kind: "table",
          id: "janela",
          title: `Janela contra repetição (${WINDOW} números)`,
          at: [520, 240],
          columns: ["Número", "Maior visto", "Resultado"],
          widths: [100, 120, 150],
          rows: SEQS.length,
        },
      ],
    },
  );
}

export function build(p: Params = DEFAULTS) {
  const PACKET = packetOf(p);
  const b = lessonBuilder();
  const c = talk(b, {
    lia: "Lia",
    gw1: "Gateway filial",
    net: "Internet",
    gw2: "Gateway sede",
    srv: "Acervo",
  });
  const tun = espSize(PACKET, "tunnel");
  const tra = espSize(PACKET, "transport");
  const over = tun.total - PACKET;
  const overT = tra.total - PACKET;
  const pct = Math.round((over / PACKET) * 100);
  const rep = antiReplay(SEQS, WINDOW);
  const verdicts = rep.map((r) => r.verdict);
  const parts: [string, keyof EspSize][] = [
    ["Novo cabeçalho IP", "outerIp"],
    ["Cabeçalho ESP (SPI e número)", "esp"],
    ["Vetor de inicialização", "iv"],
    ["Carga cifrada", "payload"],
    ["Enchimento", "pad"],
    ["Fim do ESP", "trailer"],
    ["Etiqueta de autenticação", "icv"],
    ["Total", "total"],
  ];
  const oldest = rep.find((r) => r.verdict === "velho demais");
  const natT = tun.total + UDP;
  // Largest inner packet whose tunnel plus UDP still fits one 1500-byte frame.
  let fit = MTU;
  while (fit > 0 && espSize(fit, "tunnel").total + UDP > MTU) fit--;

  b.step(
    {
      id: "s1-sa",
      title: "Um acordo para cada sentido",
      subtitle: `SPI ${SPI}`,
      text: `A filial e a sede da biblioteca ligam as redes pela Internet com [[ipsec]]. Antes de qualquer dado, os dois gateways combinam, com o protocolo IKE, uma [[associacao-de-seguranca]]: algoritmo, chaves e um número que a identifica, o [[spi]]. Há uma associação para cada sentido. Todo pacote protegido leva o SPI no cabeçalho, e o gateway que recebe usa esse número para achar as chaves certas.`,
      facts: [
        ["Associação", "uma por sentido"],
        ["Identificador", `SPI ${SPI}`],
        ["Combinada por", "IKE"],
      ],
      highlight: ["gw1", "gw2"],
    },
    () => {
      c.send("gw1", "gw2", "IKE: proposta", { role: "ctrl", detail: "AES-GCM, troca Diffie-Hellman" });
      c.send("gw2", "gw1", "IKE: aceita", { role: "ctrl", detail: `SPI ${SPI}` });
      c.state("gw2", `SA ${SPI}`, { tone: "good", label: "associação pronta" });
    },
  );

  b.step(
    {
      id: "s2-tunel",
      title: "O pacote inteiro vai dentro",
      subtitle: `${tun.total} bytes, ${over} a mais`,
      text: `No modo túnel, o gateway da filial cifra o pacote de Lia inteiro, cabeçalho IP incluído, e o põe dentro de um pacote novo endereçado ao gateway da sede. Quem olha a Internet vê só os dois gateways. O [[esp]] acrescenta o próprio cabeçalho com SPI e número de sequência, o vetor de inicialização, ${tun.pad} bytes de enchimento, 2 de fim e 16 de autenticação: ${PACKET} bytes viram ${tun.total}, ${over} a mais, cerca de ${pct}%.`,
      facts: [
        ["Pacote de Lia", `${PACKET} bytes`],
        ["Com ESP em túnel", `${tun.total} bytes`],
        ["A mais", `${over} bytes`],
      ],
      highlight: ["gw1", "net", "gw2"],
      quiz: {
        kind: "choice",
        prompt: "No modo túnel, o que um observador na Internet consegue ler?",
        options: [
          "Os endereços dos dois gateways e o SPI",
          "Os endereços de Lia e do acervo",
          "A porta TCP que Lia está usando",
        ],
        answer: 0,
        explain:
          "O cabeçalho original vai cifrado dentro do ESP; ficam visíveis o IP externo, com os gateways, e o cabeçalho ESP com o SPI e o número de sequência.",
      },
    },
    () => {
      c.send("lia", "gw1", `${PACKET} B`, { role: "a", detail: "para o acervo" });
      c.send("gw1", "gw2", `ESP ${tun.total} B`, { role: "b", via: ["net"], detail: `SPI ${SPI}` });
      c.send("gw2", "srv", `${PACKET} B`, { role: "a", detail: "decifrado e verificado" });
      parts.forEach(([name, k], i) => {
        c.row("tamanho", i, [name, String(tun[k]), ""], { dt: 0, mark: k === "total" ? "warn" : "new" });
      });
    },
  );

  b.step(
    {
      id: "s3-transporte",
      title: "Só a carga vai dentro",
      subtitle: `${tra.total} bytes, ${overT} a mais`,
      text: `No modo transporte, usado entre dois computadores, não há cabeçalho novo: o cabeçalho IP original continua na frente, e o ESP protege só o que vem depois dele. Os ${tra.payload} bytes de carga mais enchimento e fim dão ${tra.total} bytes, ${overT} a mais. É mais barato, mas expõe os endereços reais de quem conversa. Por isso redes ligadas por gateways usam túnel.`,
      facts: [
        ["Carga protegida", `${tra.payload} bytes`],
        ["Total", `${tra.total} bytes`],
        ["Visível", "os endereços reais"],
      ],
      highlight: ["lia", "srv"],
      quiz: {
        kind: "number",
        prompt: `No modo transporte, quantos bytes o ESP acrescenta ao pacote de ${PACKET} bytes?`,
        answer: overT,
        tolerance: 0,
        unit: "bytes",
        explain: `Sem IP novo, entram ${8} de cabeçalho ESP, ${8} de vetor, ${tra.pad} de enchimento, 2 de fim e 16 de etiqueta: ${overT} bytes, contra ${over} no túnel.`,
      },
    },
    () => {
      parts.forEach(([name, k], i) => {
        const v = k === "outerIp" ? `${tra[k]} (o original)` : String(tra[k]);
        c.row("tamanho", i, [name, String(tun[k]), v], {
          dt: i === 0 ? 1 : 0,
          mark: k === "total" ? "hit" : "new",
        });
      });
    },
  );

  b.step(
    {
      id: "s4-repeticao",
      title: "Ninguém repete um pacote",
      subtitle: `${verdicts.filter((v) => v !== "aceito").length} recusados`,
      text: `Cifrar não impede que alguém grave um pacote e o reenvie depois. Por isso cada pacote ESP tem um número de sequência, e o gateway da sede guarda uma [[janela-antirrepeticao]] dos últimos ${WINDOW}. Números fora de ordem dentro da janela são aceitos, como o 4 depois do 5; o segundo 4 é recusado como repetido. Quando chega o 70, a janela anda, e o 6 fica ${oldest ? `${oldest.top - oldest.seq}` : ""} números atrás do maior: velho demais.`,
      facts: [
        ["Janela", `${WINDOW} números`],
        ["Repetido", "recusado"],
        ["Fora da janela", "recusado"],
      ],
      highlight: ["gw2"],
    },
    () => {
      rep.forEach((r, i) => {
        c.send("net", "gw2", `ESP nº ${r.seq}`, {
          role: r.verdict === "aceito" ? "b" : "bad",
          detail: r.verdict,
          dt: i === 0 ? 1 : 0,
        });
        c.row("janela", i, [String(r.seq), String(r.top), r.verdict], {
          dt: 0,
          mark: r.verdict === "aceito" ? "hit" : "bad",
        });
      });
    },
  );

  b.step(
    {
      id: "s5-nat",
      title: "Atravessar um NAT",
      subtitle: `${natT} bytes dentro de UDP`,
      text: `O roteador doméstico da filial faz [[nat]] e troca portas, mas o ESP não tem portas, e o NAT não sabe a quem devolver a resposta. A saída é pôr o ESP dentro de UDP, na porta 4500: mais ${UDP} bytes, e o pacote de ${PACKET} bytes vira ${natT}. Num enlace de ${MTU} bytes, o maior pacote de Lia que passa sem fragmentar tem ${fit} bytes. Por isso túneis reduzem a MTU interna ou o MSS do TCP.`,
      facts: [
        ["Porta", "UDP 4500"],
        ["Com UDP", `${natT} bytes`],
        ["Maior pacote sem fragmentar", `${fit} bytes`],
      ],
      highlight: ["gw1", "net"],
      quiz: {
        kind: "number",
        prompt: `Com ESP em túnel dentro de UDP, qual é o maior pacote de Lia, em bytes, que ainda cabe num quadro de ${MTU} bytes?`,
        answer: fit,
        tolerance: 0,
        unit: "bytes",
        explain: `O túnel soma 20 + 8 + 8 + 2 + 16 = 54 bytes mais o enchimento, e o UDP mais 8. Com ${fit} bytes, o total fica em ${espSize(fit, "tunnel").total + UDP}; um byte a mais já passa de ${MTU} por causa do alinhamento em 4.`,
      },
    },
    () => {
      c.send("gw1", "gw2", `UDP 4500, ESP ${natT} B`, { role: "b", via: ["net"], detail: "atravessa o NAT" });
      c.row("tamanho", 8, ["Com UDP para o NAT", String(natT), String(tra.total + UDP)], {
        dt: 0,
        mark: natT > MTU ? "bad" : "warn",
      });
    },
  );

  return b.done(
    { tunnel: tun.total, transport: tra.total, over, verdicts: verdicts.join(","), natT, fit },
    PACKET === DEFAULTS.pacote
      ? []
      : [
          `Um pacote de ${PACKET} bytes vira ${tun.total} no túnel e ${natT} com UDP${natT > MTU ? `, mais que os ${MTU} do enlace` : ""}.`,
        ],
  );
}

const lesson: LessonModule = {
  meta: {
    slug: "ipsec",
    site: "redes",
    title: "IPsec: proteger os pacotes na camada de rede",
    summary:
      "Associação de segurança e SPI, o ESP em modo túnel e em modo transporte, e a janela que recusa pacotes repetidos.",
    area: "Segurança",
    refs: [
      { book: "tanenbaum-cn", chapter: 8, section: "8.10.1", note: "IPsec", verified: true },
      { rfc: 3948, note: "ESP dentro de UDP para atravessar NAT" },
      { rfc: 4303, note: "IP Encapsulating Security Payload (ESP)" },
      { rfc: 4106, note: "AES-GCM no ESP: IV de 8 bytes, ICV de 16" },
    ],
    simplifications: [
      "O NAT só aparece no último passo, sem as mensagens que mantêm o mapeamento vivo.",
      "A troca IKE aparece resumida em duas mensagens; o IKEv2 usa pelo menos quatro.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [{ key: "pacote", kind: "int", label: "Pacote de Lia (bytes)", min: 40, max: 1500 }],
  },
  build,
  intro: {
    text: "Lia, na filial, acessa o acervo da sede pela Internet, e nada no caminho deve ler ou alterar os pacotes. Você vai ver o que o IPsec acrescenta a cada pacote, o que fica visível e como ele recusa pacotes gravados e reenviados.",
    facts: [
      ["Pacote", `${DEFAULTS.pacote} bytes`],
      ["Cifra", "AES-GCM"],
      ["Janela", `${WINDOW} números`],
    ],
  },
  outro: {
    title: "IPsec em resumo",
    text: "Os gateways combinam associações identificadas por SPI e protegem cada pacote com ESP. No modo túnel o pacote inteiro vai cifrado; no transporte só a carga. Números de sequência e uma janela impedem reenviar pacotes antigos, e dentro de UDP o ESP atravessa NAT.",
    facts: (run) => [
      ["Túnel", `${run.stats.tunnel} bytes`],
      ["Transporte", `${run.stats.transport} bytes`],
      ["A mais no túnel", `${run.stats.over} bytes`],
    ],
  },
  next: ["wireguard", "tls13"],
  practice,
};

export default lesson;
