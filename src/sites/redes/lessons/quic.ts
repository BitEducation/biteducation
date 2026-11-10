import type { LessonModule, Params } from "../../../contracts/types.ts";
import type { Layer } from "../../../sim/net/bytes.ts";
import { quicLong, quicShort } from "../../../sim/net/quic.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { prng, randInt } from "../../../sim/shared/prng.ts";
import { seqScene, talk } from "../../../sim/shared/seq.ts";
import { DAVI, LIA } from "../plan.ts";
import { udpFrame } from "../wire.ts";

/**
 * QUIC: transport and TLS 1.3 handshake in one round trip over UDP, the 1200-byte Initial and the
 * anti-amplification limit, independent streams under loss, and connection migration by ID.
 */
const SEED = 9000;
export const RTT = 40;
export const MIN_INITIAL = 1200;
const LTE_IP = "198.51.100.200";
const LTE_PORT = 61001;

const scene = seqScene(
  [
    { id: "lia", kind: "laptop", label: "Navegador da Lia", sub: `${LIA.ip}:${LIA.port}`, at: [130, 120] },
    { id: "net", kind: "cloud", label: "Internet", sub: `RTT ${RTT} ms`, at: [480, 120], w: 150 },
    { id: "davi", kind: "server", label: "Biblioteca", sub: `${DAVI.ip}:443 (UDP)`, at: [830, 120] },
    { id: "lte", kind: "device", label: "Lia no 4G", sub: `${LTE_IP}:${LTE_PORT}`, at: [130, 290] },
  ],
  {
    height: 560,
    links: [
      { id: "a", from: "lia", to: "net", style: "bus" },
      { id: "b", from: "net", to: "davi", style: "bus" },
      { id: "c", from: "lte", to: "net", style: "dashed" },
    ],
    widgets: [
      {
        kind: "table",
        id: "streams",
        title: "Fluxos dentro da conexão",
        at: [60, 400],
        columns: ["Fluxo", "Conteúdo", "Estado"],
        widths: [80, 260, 240],
        rows: 2,
      },
    ],
  },
);

export function build(_p: Params) {
  const b = lessonBuilder();
  const c = talk(b, { lia: "Lia (Wi-Fi)", lte: "Lia (4G)", net: "Internet", davi: "Biblioteca" });
  const rand = prng(SEED);
  const cid = (n: number) => Array.from({ length: n }, () => randInt(rand, 0, 255));
  const dcid0 = cid(8);
  const cliCid = cid(8);
  const srvCid = cid(8);
  const half = RTT / 2;
  const up = (src: { ip: string; port: number }, layer: Layer, id: string, title: string, summary: string) =>
    udpFrame({ src: src.ip, dst: DAVI.ip, sport: src.port, dport: 443 }, layer, {
      id,
      title,
      summary,
      names: { dport: "443 = HTTPS (QUIC)" },
      where:
        src.ip === LIA.ip
          ? "Saindo do navegador da Lia, pelo Wi-Fi do campus"
          : "Saindo do celular da Lia, já na rede 4G, com outro IP",
    });
  const down = (layer: Layer, id: string, title: string, summary: string) =>
    udpFrame({ src: DAVI.ip, dst: LIA.ip, sport: 443, dport: LIA.port }, layer, {
      id,
      title,
      summary,
      where: "Chegando ao navegador da Lia, vindo da biblioteca",
    });
  const wifi = { ip: LIA.ip, port: LIA.port };
  const hdr = 1 + 4 + 1 + 8 + 1 + 8 + 1 + 2 + 2;
  const initialPayload = MIN_INITIAL - hdr;
  const serverBytes = [150 + 28, 1100 + 27, 900 + 27];
  const sent = serverBytes.reduce((a, x) => a + x, 0);

  b.step(
    {
      id: "s1-porque",
      title: "Por que outro transporte?",
      subtitle: "TCP + TLS custam duas idas e voltas",
      text: `Com TCP e TLS 1.3, o navegador gasta uma ida e volta no handshake TCP e outra no TLS antes de mandar o pedido: ${2 * RTT} ms aqui. O [[quic]] junta as duas coisas e roda sobre [[udp]], na porta 443. Por ser feito por cima do UDP, ele cuida sozinho de confirmações, retransmissões e controle de congestionamento, dentro da própria aplicação.`,
      facts: [
        ["TCP + TLS 1.3", `2 RTT = ${2 * RTT} ms`],
        ["QUIC", `1 RTT = ${RTT} ms`],
        ["Transporte por baixo", "UDP, porta 443"],
      ],
      highlight: ["lia", "davi"],
    },
    () => {
      c.note("lia", `TCP + TLS: ${2 * RTT} ms antes do pedido`, "warn", { dt: 1 });
    },
  );

  b.step(
    {
      id: "s2-initial",
      title: "O pacote Initial",
      subtitle: `ClientHello em ${MIN_INITIAL} bytes`,
      text: `O primeiro pacote leva o ClientHello do TLS 1.3 dentro de um quadro CRYPTO, num pacote **Initial** de cabeçalho longo. O ID de conexão de destino é sorteado pelo cliente, e dele saem as chaves que cifram este pacote: qualquer um pode decifrá-lo, mas isso impede equipamentos no caminho de mexer no protocolo. O cliente completa com enchimento até ${MIN_INITIAL} bytes.`,
      facts: [
        ["Datagrama", `${MIN_INITIAL} bytes de UDP`],
        ["Cabeçalho", "longo, tipo Initial"],
        ["Dentro", "ClientHello + enchimento"],
      ],
      highlight: ["lia"],
    },
    () => {
      c.send("lia", "davi", "Initial", {
        dt: half,
        via: ["net"],
        frame: up(
          wifi,
          quicLong({
            type: "initial",
            dcid: dcid0,
            scid: cliCid,
            pn: 0,
            payload: initialPayload,
            what: "CRYPTO(ClientHello) + PADDING",
          }),
          "f-c-initial",
          "Initial do cliente",
          `${MIN_INITIAL} bytes de UDP.`,
        ),
        detail: `${MIN_INITIAL} bytes`,
      });
    },
  );

  b.step(
    {
      id: "s3-servidor",
      title: "Resposta com limite",
      subtitle: "No máximo 3 vezes o que recebeu",
      text: `O servidor responde com o ServerHello num Initial e com o resto do handshake TLS (certificado, assinatura, Finished) em pacotes **Handshake**. Enquanto não tem certeza de que o endereço da Lia é verdadeiro, ele só pode mandar até três vezes o que recebeu: ${3 * MIN_INITIAL} bytes. Aqui foram ${sent}. É essa regra que justifica o enchimento do primeiro pacote.`,
      facts: [
        ["Recebido do cliente", `${MIN_INITIAL} bytes`],
        ["Limite", `${3 * MIN_INITIAL} bytes`],
        ["Enviado", `${sent} bytes`],
      ],
      highlight: ["davi"],
      quiz: {
        kind: "choice",
        prompt: "Por que o cliente enche o primeiro pacote QUIC até 1200 bytes?",
        options: [
          "Para caber o certificado",
          "Para o servidor poder responder mais sem virar amplificador de ataques",
          "Porque o UDP exige pacotes grandes",
          "Para esconder o SNI",
        ],
        answer: 1,
        explain:
          "Com origem forjada, um atacante faria o servidor despejar respostas grandes numa vítima. Limitando a resposta a 3× o recebido, e exigindo 1200 bytes de entrada, a **amplificação** fica pequena e o handshake ainda cabe.",
      },
    },
    () => {
      c.send("davi", "lia", "Initial", {
        dt: half,
        via: ["net"],
        role: "b",
        frame: down(
          quicLong({
            type: "initial",
            dcid: cliCid,
            scid: srvCid,
            pn: 0,
            payload: 150,
            what: "CRYPTO(ServerHello) + ACK",
          }),
          "f-s-initial",
          "Initial do servidor",
          "ServerHello.",
        ),
      });
      c.send("davi", "lia", "Handshake", {
        dt: 0,
        via: ["net"],
        role: "b",
        frame: down(
          quicLong({
            type: "handshake",
            dcid: cliCid,
            scid: srvCid,
            pn: 0,
            payload: 1100,
            what: "CRYPTO(EncryptedExtensions, Certificate)",
          }),
          "f-s-hs1",
          "Handshake 1",
          "Certificado.",
        ),
      });
      c.send("davi", "lia", "Handshake", {
        dt: 0,
        via: ["net"],
        role: "b",
        frame: down(
          quicLong({
            type: "handshake",
            dcid: cliCid,
            scid: srvCid,
            pn: 1,
            payload: 900,
            what: "CRYPTO(CertificateVerify, Finished)",
          }),
          "f-s-hs2",
          "Handshake 2",
          "Assinatura e Finished.",
        ),
      });
    },
  );

  b.step(
    {
      id: "s4-pedido",
      title: "Pedido em 1 RTT",
      subtitle: "Finished e GET no mesmo voo",
      text: `A Lia confere o certificado, manda o seu Finished e, **no mesmo voo**, o pedido HTTP/3 num pacote de cabeçalho curto. Passaram ${RTT} ms desde o primeiro pacote, metade do que custaria com TCP e TLS. Cada pedido vai num **fluxo** próprio: a página no fluxo 0 e uma imagem no fluxo 4, os dois dentro da mesma conexão.`,
      facts: [
        ["Até o pedido", `${RTT} ms`],
        ["Cabeçalho", "curto (1-RTT)"],
        ["Fluxos", "0 (página) e 4 (imagem)"],
      ],
      highlight: ["lia"],
    },
    () => {
      c.send("lia", "davi", "Finished + GET", {
        dt: half,
        via: ["net"],
        frame: up(
          wifi,
          quicShort({
            dcid: srvCid,
            pn: 1,
            payload: 140,
            what: "STREAM 0: GET /horarios; STREAM 4: GET /mapa.png",
          }),
          "f-c-req",
          "Pedidos",
          "Dois fluxos no mesmo pacote.",
        ),
        detail: "fluxos 0 e 4",
      });
      c.row("streams", 0, ["0", "GET /horarios", "pedido enviado"], { mark: "new", label: "Fluxo 0" });
      c.row("streams", 1, ["4", "GET /mapa.png", "pedido enviado"], { mark: "new", label: "Fluxo 4" });
    },
  );

  b.step(
    {
      id: "s5-perda",
      quiz: {
        kind: "choice",
        prompt: "Um pacote da imagem (fluxo 4) se perde. O que acontece com a página, que vem no fluxo 0?",
        options: [
          "É entregue na hora; só o fluxo 4 espera",
          "Espera a retransmissão, como no TCP",
          "A conexão inteira recomeça do handshake",
        ],
        answer: 0,
        explain:
          "O QUIC ordena os bytes dentro de cada fluxo, não na conexão toda. Uma perda segura só o fluxo afetado; no TCP, a fila única travaria tudo o que viesse depois.",
      },
      title: "Uma perda, um fluxo",
      subtitle: "Sem bloqueio de quem não tem nada com isso",
      text: "O pacote com o começo da imagem se perde. No TCP, tudo o que viesse depois, inclusive a página, ficaria esperando a retransmissão: os bytes são uma fila única. No QUIC, a página do fluxo 0 é entregue ao navegador na hora; só o fluxo 4 espera. A retransmissão vai num pacote **novo**, com outro número, o que deixa claro a qual envio cada confirmação se refere.",
      facts: [
        ["Perdido", "pacote 2 (fluxo 4)"],
        ["Fluxo 0", "entregue sem esperar"],
        ["Retransmissão", "pacote 4, número novo"],
      ],
      highlight: ["net"],
    },
    () => {
      c.send("davi", "net", "imagem (1)", {
        dt: half / 2,
        role: "b",
        lost: true,
        frame: down(
          quicShort({ dcid: cliCid, pn: 2, payload: 1200, what: "STREAM 4: começo da imagem" }),
          "f-lost",
          "Pacote 2 (perdido)",
          "Parte da imagem.",
        ),
      });
      c.send("davi", "lia", "página", {
        dt: 0,
        via: ["net"],
        role: "b",
        frame: down(
          quicShort({ dcid: cliCid, pn: 3, payload: 400, what: "STREAM 0: página (FIN)" }),
          "f-page",
          "Pacote 3",
          "A página inteira.",
        ),
      });
      c.row("streams", 0, ["0", "GET /horarios", "entregue"], { mark: "hit", label: "Página entregue" });
      c.row("streams", 1, ["4", "GET /mapa.png", "esperando retransmissão"], {
        mark: "warn",
        label: "Imagem espera",
      });
      c.send("lia", "davi", "ACK 0,1,3", {
        dt: half,
        via: ["net"],
        frame: up(
          wifi,
          quicShort({ dcid: srvCid, pn: 2, payload: 30, what: "ACK: 0, 1, 3 (falta 2)" }),
          "f-ack",
          "Confirmação",
          "Falta o 2.",
        ),
      });
      c.send("davi", "lia", "imagem (de novo)", {
        dt: half,
        via: ["net"],
        role: "b",
        frame: down(
          quicShort({ dcid: cliCid, pn: 4, payload: 1200, what: "STREAM 4: mesmo trecho da imagem" }),
          "f-retx",
          "Pacote 4",
          "Retransmissão com número novo.",
        ),
      });
      c.row("streams", 1, ["4", "GET /mapa.png", "entregue"], { mark: "hit", label: "Imagem entregue" });
    },
  );

  b.step(
    {
      id: "s6-migracao",
      title: "Trocando de rede",
      subtitle: "O ID de conexão sobrevive",
      text: `A Lia sai da biblioteca e o celular passa do Wi-Fi para o 4G: endereço e porta mudam para ${LTE_IP}:${LTE_PORT}. Uma conexão TCP morreria, porque ela é identificada por esses números. A QUIC é identificada pelo **ID de conexão**: o servidor reconhece o mesmo ID, confere que o novo caminho funciona (PATH_CHALLENGE) e continua de onde parou.`,
      facts: [
        ["Endereço novo", `${LTE_IP}:${LTE_PORT}`],
        ["ID de conexão", "o mesmo"],
        ["Conexão", "continua"],
      ],
      highlight: ["lte", "davi"],
    },
    () => {
      c.send("lte", "davi", "dados", {
        dt: half,
        via: ["net"],
        frame: up(
          { ip: LTE_IP, port: LTE_PORT },
          quicShort({ dcid: srvCid, pn: 3, payload: 60, what: "STREAM 8 + PATH_CHALLENGE" }),
          "f-mig",
          "Do 4G",
          "Mesmo ID, outro endereço.",
        ),
        detail: "mesmo ID de conexão",
      });
      c.send("davi", "lte", "PATH_RESPONSE", { dt: half, via: ["net"], role: "b" });
      c.state("lte", "conexão mantida", { dt: 0, tone: "good" });
    },
  );

  return b.done({ initial: MIN_INITIAL, sent, rtt: RTT });
}

const lesson: LessonModule = {
  meta: {
    slug: "quic",
    site: "redes",
    title: "QUIC: transporte e TLS juntos",
    summary:
      "Handshake em uma ida e volta sobre UDP, o Initial de 1200 bytes, fluxos que não se bloqueiam e a conexão que sobrevive à troca de rede.",
    area: "Transporte",
    refs: [
      { book: "tanenbaum-cn", chapter: 6, section: "6.6.1", note: "QUIC", verified: true },
      { rfc: 9000, note: "QUIC" },
      { rfc: 9001, note: "QUIC com TLS" },
      { rfc: 9114, note: "HTTP/3" },
    ],
    simplifications: [
      "Sem proteção de cabeçalho: o número do pacote aparece em claro, o que não acontece na rede.",
      "Tamanhos das cargas cifradas aproximados.",
      "O 4G aparece como outro aparelho na cena, mas é o mesmo notebook da Lia.",
      "Sem 0-RTT (retomada com dados no primeiro pacote).",
    ],
  },
  scene,
  params: { defaults: {} },
  build,
  intro: {
    text: "Uma página moderna abre dezenas de pedidos, e cada ida e volta na rede custa tempo. O QUIC, base do HTTP/3, junta transporte e cifra num só handshake, separa os pedidos em fluxos independentes e mantém a conexão mesmo quando o celular troca de rede. Você vai ver os primeiros pacotes de uma conexão.",
    facts: [
      ["Servidor", `${DAVI.ip}:443 (UDP)`],
      ["Cifra", "TLS 1.3 dentro do QUIC"],
      ["RTT", `${RTT} ms`],
    ],
  },
  outro: {
    title: "QUIC em resumo",
    text: "O QUIC faz transporte e TLS 1.3 numa ida e volta, sobre UDP. Fluxos independentes evitam que uma perda trave tudo, e o ID de conexão permite trocar de endereço sem cair.",
    facts: (run) => [
      ["Primeiro pacote", `${run.stats.initial} bytes`],
      ["Até o pedido", `${run.stats.rtt} ms`],
    ],
  },
  next: ["http", "udp", "tls13"],
};

export default lesson;
