import type { LessonModule, Params } from "../../../contracts/types.ts";
import { closePayload, OPCODE, wsFrame } from "../../../sim/net/websocket.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { base64, sha1, textBytes } from "../../../sim/shared/hash.ts";
import { prng, randInt } from "../../../sim/shared/prng.ts";
import { seqScene, talk } from "../../../sim/shared/seq.ts";
import { DAVI, LIA } from "../plan.ts";
import { tcpSession, textLayer } from "../wire.ts";

/**
 * WebSocket: an HTTP Upgrade with a real Sec-WebSocket-Accept, masked client frames, server
 * pushes without a request, ping/pong and the close handshake. Plain ws:// to show the bytes.
 */
const SEED = 6455;
export const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const CRLF = "\r\n";
const RTT = 20;

const scene = seqScene(
  [
    { id: "lia", kind: "laptop", label: "Navegador da Lia", sub: `${LIA.ip}:${LIA.port}` },
    { id: "net", kind: "cloud", label: "Internet", w: 120 },
    { id: "davi", kind: "server", label: "Biblioteca (ao vivo)", sub: `${DAVI.ip}:80` },
  ],
  {
    height: 440,
    widgets: [
      {
        kind: "table",
        id: "vagas",
        title: "Painel de salas de estudo (na tela da Lia)",
        at: [60, 250],
        columns: ["Sala", "Vagas", "Atualizado por"],
        widths: [140, 100, 300],
        rows: 2,
      },
    ],
  },
);

export function acceptOf(key: string): string {
  return base64(sha1(textBytes(key + GUID)));
}

export function build(_p: Params) {
  const b = lessonBuilder();
  const c = talk(b, { lia: "Navegador", net: "Internet", davi: "Servidor" });
  const rand = prng(SEED);
  const s = tcpSession(
    { ip: LIA.ip, port: LIA.port },
    { ip: DAVI.ip, port: 80 },
    randInt(rand, 1, 2 ** 31),
    randInt(rand, 1, 2 ** 31),
    64,
    {
      up: "Saindo do navegador da Lia, rumo à biblioteca",
      down: "Chegando ao navegador da Lia, vindo da biblioteca",
    },
  );
  const key = base64(Array.from({ length: 16 }, () => randInt(rand, 0, 255)));
  const accept = acceptOf(key);
  const mask = () => Array.from({ length: 4 }, () => randInt(rand, 0, 255));
  let n = 0;
  const go = (
    fromCli: boolean,
    label: string,
    layer: Parameters<typeof s.data>[1],
    title: string,
    summary: string,
    detail = "",
  ) => {
    n++;
    c.send(fromCli ? "lia" : "davi", fromCli ? "davi" : "lia", label, {
      dt: RTT / 2,
      via: ["net"],
      role: fromCli ? "a" : "b",
      frame: s.data(fromCli, layer, { id: `f-${n}`, title, summary }),
      detail,
    });
  };
  const upgrade = [
    "GET /ao-vivo HTTP/1.1",
    `Host: ${DAVI.host}`,
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Key: ${key}`,
    "Sec-WebSocket-Version: 13",
    `Origin: http://${DAVI.host}`,
    "",
    "",
  ].join(CRLF);
  const switching = [
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    "",
  ].join(CRLF);

  b.step(
    {
      id: "s1-problema",
      title: "Quem avisa quem?",
      subtitle: "No HTTP, o servidor só responde",
      text: "O site da biblioteca mostra quantas vagas há em cada sala de estudo, e o número muda a toda hora. No HTTP, o servidor só fala quando alguém pede: o navegador teria de perguntar a cada poucos segundos, quase sempre à toa. O [[websocket]] transforma uma conexão HTTP num canal de mão dupla, em que o servidor pode mandar mensagens quando quiser.",
      facts: [
        ["HTTP", "pedido → resposta"],
        ["WebSocket", "mensagens nos dois sentidos, a qualquer hora"],
      ],
      highlight: ["lia", "davi"],
    },
    () => {
      c.send("lia", "davi", "SYN", { dt: RTT / 2, via: ["net"], frame: s.syn("f-syn") });
      c.send("davi", "lia", "SYN-ACK", { dt: RTT / 2, via: ["net"], role: "b", frame: s.synAck("f-synack") });
      c.send("lia", "davi", "ACK", { dt: 0, via: ["net"], frame: s.ack(true, "f-ack") });
    },
  );

  b.step(
    {
      id: "s2-upgrade",
      title: "Um pedido de troca",
      subtitle: "HTTP com Upgrade: websocket",
      text: `Tudo começa como um GET comum, com dois cabeçalhos especiais: \`Upgrade: websocket\` e \`Connection: Upgrade\`. O navegador manda também uma chave aleatória, \`${key}\`, em Base64. Ela não é segredo nem cifra nada: serve para o servidor provar que entendeu o pedido de WebSocket e não é só um servidor HTTP respondendo qualquer coisa.`,
      facts: [
        ["Caminho", "/ao-vivo"],
        ["Chave", key],
        ["Versão", "13"],
      ],
      highlight: ["lia"],
    },
    () => {
      go(
        true,
        "GET Upgrade",
        textLayer("http", "HTTP", upgrade, {
          2: "Quero trocar de protocolo",
          4: "16 bytes aleatórios em Base64",
        }),
        "Pedido de Upgrade",
        "Um GET com cabeçalhos especiais.",
      );
    },
  );

  b.step(
    {
      id: "s3-101",
      title: "Troca aceita",
      subtitle: "101 e a prova do servidor",
      text: `O servidor responde **101 Switching Protocols**. Para provar que entendeu, ele junta a chave do navegador a um identificador fixo do protocolo, calcula o SHA-1 e devolve em Base64: \`${accept}\`. O navegador refaz a conta e confere. A partir daqui, a mesma conexão TCP deixa de falar HTTP.`,
      facts: [
        ["Estado", "101 Switching Protocols"],
        ["Accept", accept],
        ["Conta", "Base64(SHA-1(chave + GUID))"],
      ],
      highlight: ["davi"],
      quiz: {
        kind: "choice",
        prompt: "Para que serve o Sec-WebSocket-Accept?",
        options: [
          "Para cifrar as mensagens seguintes",
          "Para provar que o servidor entendeu o pedido de WebSocket",
          "Para autenticar a Lia",
          "Para escolher a porta",
        ],
        answer: 1,
        explain:
          "É só uma prova de que o servidor fala WebSocket: ninguém responde com o valor certo por acaso. Não há cifra nem autenticação aqui; para isso existe o wss://, com TLS.",
      },
    },
    () => {
      go(
        false,
        "101",
        textLayer("http", "HTTP", switching, {
          0: "A conexão muda de protocolo",
          3: "Base64(SHA-1(chave + GUID))",
        }),
        "101 Switching Protocols",
        "Fim do HTTP nesta conexão.",
      );
    },
  );

  b.step(
    {
      id: "s4-mascara",
      quiz: {
        kind: "choice",
        prompt: "A chave da máscara viaja junto com o quadro. Então para que ela serve?",
        options: [
          "Para que proxies antigos não confundam o quadro com HTTP",
          "Para cifrar a mensagem contra quem observa a rede",
          "Para comprimir a carga e economizar bytes",
        ],
        answer: 0,
        explain:
          "Com a chave à vista, qualquer um desfaz o XOR: não é sigilo. A máscara torna os bytes imprevisíveis para o próprio site, que assim não consegue montar algo que um proxy antigo tomaria por um pedido HTTP.",
      },
      title: "Mensagens com máscara",
      subtitle: "Todo quadro do cliente é mascarado",
      text: "O navegador avisa em quais salas a Lia tem interesse. Cada mensagem vira um **quadro**: um byte com o tipo (texto), um com o tamanho e, como vem do cliente, uma chave de máscara de 4 bytes que embaralha a carga com XOR. Não é cifra, já que a chave vai junto: a máscara existe para que proxies antigos não confundam o quadro com um pedido HTTP e guardem lixo em cache.",
      facts: [
        ["Cabeçalho", "2 bytes + 4 da máscara"],
        ["Máscara", "XOR com 4 bytes sorteados"],
        ["É cifra?", "não"],
      ],
      highlight: ["lia"],
    },
    () => {
      const msg = '{"seguir":["sala-2","sala-3"]}';
      go(
        true,
        "seguir salas",
        wsFrame({ opcode: OPCODE.text, payload: textBytes(msg), mask: mask(), show: msg }),
        "Quadro de texto do cliente",
        "Mascarado.",
        `${msg.length} bytes`,
      );
    },
  );

  b.step(
    {
      id: "s5-empurra",
      title: "O servidor empurra",
      subtitle: "Mensagens sem ninguém pedir",
      text: "Quando alguém sai da sala 2, o servidor manda um quadro na hora, sem esperar pedido. O cabeçalho tem só 2 bytes e não há máscara do lado do servidor. Compare com o HTTP: nada de linha de pedido, cabeçalhos repetidos ou nova conexão. O painel da Lia se atualiza sozinho, duas vezes, sem ela recarregar a página.",
      facts: [
        ["Pedido do navegador", "nenhum"],
        ["Cabeçalho", "2 bytes"],
        ["Atualizações", "2"],
      ],
      highlight: ["davi"],
    },
    () => {
      const a = '{"sala-2":5}';
      const d = '{"sala-3":0}';
      c.at(c.t + 4000);
      go(
        false,
        "sala-2: 5",
        wsFrame({ opcode: OPCODE.text, payload: textBytes(a), show: a }),
        "Atualização",
        "Sem máscara.",
        "servidor empurra",
      );
      c.row("vagas", 0, ["sala 2", "5", "servidor, sem pedido"], { mark: "new", label: "Sala 2 atualizada" });
      c.at(c.t + 7000);
      go(
        false,
        "sala-3: 0",
        wsFrame({ opcode: OPCODE.text, payload: textBytes(d), show: d }),
        "Atualização",
        "Sem máscara.",
        "servidor empurra",
      );
      c.row("vagas", 1, ["sala 3", "0", "servidor, sem pedido"], { mark: "new", label: "Sala 3 atualizada" });
    },
  );

  b.step(
    {
      id: "s6-fim",
      title: "Vivo e depois fechado",
      subtitle: "Ping, pong e o quadro de fechar",
      text: "Para a conexão não ser derrubada por um NAT ou proxy que acha que ela está parada, o servidor manda um **ping** de tempos em tempos e o navegador responde **pong**. Quando a Lia fecha a aba, o navegador manda um quadro de fechar com o código 1000 (normal), o servidor responde com outro e a conexão TCP termina.",
      facts: [
        ["Manter viva", "ping / pong"],
        ["Fechar", "código 1000"],
        ["Em produção", "wss:// (com TLS)"],
      ],
      highlight: ["lia", "davi"],
    },
    () => {
      c.at(c.t + 30000);
      go(
        false,
        "ping",
        wsFrame({ opcode: OPCODE.ping, payload: [], show: "(vazio)" }),
        "Ping",
        "Ainda está aí?",
      );
      go(
        true,
        "pong",
        wsFrame({ opcode: OPCODE.pong, payload: [], mask: mask(), show: "(vazio)" }),
        "Pong",
        "Estou.",
      );
      go(
        true,
        "fechar 1000",
        wsFrame({
          opcode: OPCODE.close,
          payload: closePayload(1000, "tchau"),
          mask: mask(),
          show: "1000 tchau",
        }),
        "Fechar",
        "Código 1000: fim normal.",
      );
      go(
        false,
        "fechar 1000",
        wsFrame({ opcode: OPCODE.close, payload: closePayload(1000, ""), show: "1000" }),
        "Fechar",
        "O servidor confirma.",
      );
    },
  );

  return b.done({ key, accept, frames: n });
}

const lesson: LessonModule = {
  meta: {
    slug: "websocket",
    site: "redes",
    title: "WebSocket: o servidor também fala",
    summary:
      "De um GET com Upgrade a um canal de mão dupla: a prova do Sec-WebSocket-Accept, quadros mascarados, mensagens empurradas e o fechamento.",
    area: "Aplicação",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 7,
        section: "7.3.3",
        note: "Páginas Web dinâmicas e aplicações Web",
        verified: true,
      },
      { rfc: 6455, note: "WebSocket" },
    ],
    simplifications: [
      "ws:// sem TLS, para mostrar os quadros; sites reais usam wss://.",
      "Mensagens curtas, de até 125 bytes, que dispensam os campos de tamanho estendido.",
      "Sem extensões de compressão (permessage-deflate).",
    ],
  },
  scene,
  params: { defaults: {} },
  build,
  intro: {
    text: "Chats, placares ao vivo e painéis que se atualizam sozinhos precisam que o servidor fale sem ser perguntado. O WebSocket consegue isso aproveitando uma conexão HTTP e trocando de protocolo no meio do caminho. Você vai ver a troca, a conta que prova que o servidor entendeu e as mensagens indo e vindo.",
    facts: [
      ["Endereço", `ws://${DAVI.host}/ao-vivo`],
      ["Começa como", "HTTP/1.1"],
      ["Vira", "quadros WebSocket"],
    ],
  },
  outro: {
    title: "WebSocket em resumo",
    text: "Um GET com Upgrade e um 101 com a prova do Accept transformam a conexão num canal de mão dupla. Quadros pequenos vão nos dois sentidos, os do cliente sempre mascarados, até o quadro de fechar.",
    facts: (run) => [
      ["Sec-WebSocket-Accept", String(run.stats.accept)],
      ["Mensagens trocadas", String(run.stats.frames)],
    ],
  },
  next: ["http", "webrtc"],
};

export default lesson;
