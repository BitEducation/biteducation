import type { LessonModule, Params } from "../../../contracts/types.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { prng, randInt } from "../../../sim/shared/prng.ts";
import { seqScene, talk } from "../../../sim/shared/seq.ts";
import { DAVI, LIA, PAGE_PATH } from "../plan.ts";
import { tcpSession, textLayer } from "../wire.ts";

/**
 * HTTP/1.1 over one persistent connection: a request, a 200 with cache headers and a cookie,
 * a 404 on the same connection, and a conditional request answered with 304.
 * Event times assume a fixed 20 ms round trip.
 */
const SEED = 9110;
export const RTT = 20;
export const BODY =
  "<!doctype html><title>Biblioteca</title><h1>Hor&aacute;rios</h1><p>Seg a sex, 8h &agrave;s 22h.</p>";
const ETAG = '"h-7f3a"';
export const DEFAULTS = { maxAge: 60 };
const CRLF = "\r\n";

const clamp = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
};
const msg = (lines: string[], body = "") => lines.join(CRLF) + CRLF + CRLF + body;

const scene = seqScene(
  [
    { id: "lia", kind: "laptop", label: "Navegador da Lia", sub: `${LIA.ip}:${LIA.port}` },
    { id: "net", kind: "cloud", label: "Internet", sub: `RTT ${RTT} ms`, w: 150 },
    { id: "davi", kind: "server", label: "Servidor web", sub: `${DAVI.ip}:80` },
  ],
  {
    height: 470,
    widgets: [
      {
        kind: "table",
        id: "cache",
        title: "Cache do navegador",
        at: [60, 250],
        columns: ["Recurso", "ETag", "Validade", "Estado"],
        widths: [170, 120, 130, 160],
        rows: 2,
      },
    ],
  },
);

export function build(p: Params) {
  const maxAge = clamp(p.maxAge, 0, 86400, DEFAULTS.maxAge);
  const b = lessonBuilder();
  const c = talk(b, { lia: "Navegador", net: "Internet", davi: "Servidor web" });
  const rand = prng(SEED);
  const s = tcpSession(
    { ip: LIA.ip, port: LIA.port },
    { ip: DAVI.ip, port: 80 },
    randInt(rand, 1, 2 ** 31),
    randInt(rand, 1, 2 ** 31),
    64,
    {
      up: "Saindo do notebook da Lia, rumo ao servidor web",
      down: "Chegando ao notebook da Lia, vindo do servidor web",
    },
  );
  const half = RTT / 2;
  const go = (from: "lia" | "davi", label: string, o: Parameters<typeof c.send>[3] = {}) =>
    c.send(from, from === "lia" ? "davi" : "lia", label, {
      via: ["net"],
      dt: half,
      role: from === "lia" ? "a" : "b",
      ...o,
    });

  const req1 = msg([
    `GET ${PAGE_PATH} HTTP/1.1`,
    `Host: ${DAVI.host}`,
    "User-Agent: navegador-didatico",
    "Accept: text/html",
    "Accept-Encoding: identity",
  ]);
  const res1 = msg(
    [
      "HTTP/1.1 200 OK",
      "Content-Type: text/html; charset=utf-8",
      `Content-Length: ${BODY.length}`,
      `Cache-Control: max-age=${maxAge}`,
      `ETag: ${ETAG}`,
      "Set-Cookie: sessao=a81f; HttpOnly; SameSite=Lax",
    ],
    BODY,
  );
  const req2 = msg(["GET /favicon.ico HTTP/1.1", `Host: ${DAVI.host}`, "Cookie: sessao=a81f"]);
  const res2 = msg(["HTTP/1.1 404 Not Found", "Content-Length: 0"]);
  const req3 = msg([
    `GET ${PAGE_PATH} HTTP/1.1`,
    `Host: ${DAVI.host}`,
    "Cookie: sessao=a81f",
    `If-None-Match: ${ETAG}`,
  ]);
  const res3 = msg(["HTTP/1.1 304 Not Modified", `ETag: ${ETAG}`, `Cache-Control: max-age=${maxAge}`]);

  b.step(
    {
      id: "s1-conexao",
      title: "Primeiro, uma conexão",
      subtitle: "HTTP anda por cima do TCP",
      text: `O HTTP não sabe entregar bytes: ele confia no [[tcp]]. Antes de qualquer pedido, o navegador abre uma conexão com a porta 80 do servidor, com o handshake de três mensagens. Isso custa uma ida e volta inteira (${RTT} ms) antes do primeiro byte útil. Por isso o HTTP/1.1 tenta **reaproveitar** a conexão para vários pedidos.`,
      facts: [
        ["Destino", `${DAVI.ip}:80`],
        ["Custo", `1 RTT = ${RTT} ms`],
      ],
      highlight: ["lia", "davi"],
    },
    () => {
      go("lia", "SYN", { frame: s.syn("f-syn") });
      go("davi", "SYN-ACK", { frame: s.synAck("f-synack") });
      go("lia", "ACK", { frame: s.ack(true, "f-ack"), dt: 0 });
    },
  );

  b.step(
    {
      id: "s2-pedido",
      title: "O pedido",
      subtitle: "Método, caminho e cabeçalhos",
      text: `O pedido é texto, linha por linha. A primeira diz o **método** (GET: só quero ler), o caminho \`${PAGE_PATH}\` e a versão. Depois vêm os [[cabecalho-http|cabeçalhos]]: \`Host\` diz qual site (um mesmo IP pode servir vários), \`Accept\` diz que formatos o navegador entende. Uma linha em branco encerra o pedido. Abra o inspetor (I): cada linha aparece separada.`,
      facts: [
        ["Método", "GET"],
        ["Caminho", PAGE_PATH],
        ["Tamanho", `${req1.length} bytes`],
      ],
      highlight: ["lia"],
    },
    () => {
      go("lia", `GET ${PAGE_PATH}`, {
        frame: s.data(
          true,
          textLayer("http", "HTTP", req1, { 0: "Método, caminho e versão", 1: "Obrigatório no HTTP/1.1" }),
          { id: "f-req1", title: "Pedido GET", summary: "Texto puro, sem cifra." },
        ),
        detail: `${req1.length} bytes`,
      });
    },
  );

  b.step(
    {
      id: "s3-resposta",
      title: "A resposta",
      subtitle: "Código, cabeçalhos e corpo",
      text: `A resposta começa com o **código de estado**: 200 quer dizer "deu certo". \`Content-Length\` diz que o corpo tem ${BODY.length} bytes, e é assim que o navegador sabe onde a resposta termina, sem fechar a conexão. \`Cache-Control\` e \`ETag\` ensinam o navegador a guardar a página; \`Set-Cookie\` pede que ele devolva \`sessao=a81f\` nos próximos pedidos.`,
      facts: [
        ["Estado", "200 OK"],
        ["Corpo", `${BODY.length} bytes`],
        ["Pode guardar por", `${maxAge} s`],
      ],
      highlight: ["davi"],
    },
    () => {
      go("davi", "200 OK", {
        frame: s.data(
          false,
          textLayer("http", "HTTP", res1, {
            0: "Versão, código e frase",
            2: "Onde termina o corpo",
            3: "Por quanto tempo pode guardar",
            4: "Identifica esta versão da página",
          }),
          { id: "f-res1", title: "Resposta 200", summary: "Cabeçalhos, linha em branco e o HTML." },
        ),
        detail: `${res1.length} bytes`,
      });
      c.row("cache", 0, [PAGE_PATH, ETAG, `${maxAge} s`, "guardada"], {
        mark: "new",
        label: "Página no cache",
      });
      go("lia", "ACK", { frame: s.ack(true, "f-ack1"), dt: 0, role: "muted" });
    },
  );

  b.step(
    {
      id: "s4-mesma",
      title: "Mesma conexão, outro pedido",
      subtitle: "Conexão persistente e um 404",
      text: "O navegador pede o ícone do site na **mesma** conexão, sem novo handshake, e já manda o cookie de volta. O servidor não tem esse arquivo e responde 404. Os códigos são agrupados pela centena: 2xx deu certo, 3xx vá a outro lugar ou use o que tem, 4xx o pedido tem problema, 5xx o servidor falhou.",
      facts: [
        ["Pedido", "GET /favicon.ico"],
        ["Estado", "404 Not Found"],
        ["Handshakes novos", "0"],
      ],
      highlight: ["lia", "davi"],
      quiz: {
        kind: "choice",
        prompt:
          "O servidor está fora do ar por um erro no programa dele. Qual faixa de código ele deveria devolver?",
        options: ["2xx", "3xx", "4xx", "5xx"],
        answer: 3,
        explain:
          "Erros do **servidor** são 5xx (500, 502, 503…). Os 4xx são para problemas do pedido, como um caminho que não existe (404) ou falta de permissão (403).",
      },
    },
    () => {
      go("lia", "GET /favicon.ico", {
        frame: s.data(true, textLayer("http", "HTTP", req2, { 2: "O cookie volta sozinho" }), {
          id: "f-req2",
          title: "Segundo pedido",
          summary: "Mesma conexão TCP.",
        }),
      });
      go("davi", "404", {
        frame: s.data(false, textLayer("http", "HTTP", res2), {
          id: "f-res2",
          title: "Resposta 404",
          summary: "Corpo vazio.",
        }),
      });
    },
  );

  c.at(c.t + (maxAge + 30) * 1000);
  b.step(
    {
      id: "s5-validar",
      quiz: {
        kind: "choice",
        prompt:
          "A cópia guardada venceu, mas a página não mudou no servidor. O que o navegador recebe ao perguntar de novo?",
        options: [
          "Um 304, sem corpo, e reaproveita a cópia que tinha",
          "A página inteira de novo, com 200",
          "Um 404, porque a cópia venceu",
        ],
        answer: 0,
        explain:
          "O navegador manda a ETag da versão que tem em If-None-Match. Se for a mesma, o servidor responde 304 Not Modified, sem corpo: só a validade é renovada.",
      },
      title: "Ainda é a mesma?",
      subtitle: "Pedido condicional e 304",
      text: `Passaram ${maxAge + 30} s e a página no cache venceu. Em vez de baixar tudo de novo, o navegador pergunta com \`If-None-Match: ${ETAG}\`: "mudou desde esta versão?". Não mudou, e o servidor responde **304 Not Modified**, sem corpo nenhum. O navegador renova a validade e usa a cópia que já tinha.`,
      facts: [
        ["Pergunta", `If-None-Match: ${ETAG}`],
        ["Resposta", "304, sem corpo"],
        ["Corpo economizado", `${BODY.length} bytes`],
      ],
      highlight: ["lia"],
    },
    () => {
      c.row("cache", 0, [PAGE_PATH, ETAG, "0 s", "vencida"], { mark: "warn", dt: 0, label: "Cache vencido" });
      go("lia", "GET condicional", {
        frame: s.data(true, textLayer("http", "HTTP", req3, { 3: "Só mande se mudou" }), {
          id: "f-req3",
          title: "Pedido condicional",
          summary: "Com o ETag guardado.",
        }),
      });
      go("davi", "304", {
        frame: s.data(false, textLayer("http", "HTTP", res3, { 0: "Use o que você já tem" }), {
          id: "f-res3",
          title: "Resposta 304",
          summary: "Nenhum byte de corpo.",
        }),
      });
      c.row("cache", 0, [PAGE_PATH, ETAG, `${maxAge} s`, "revalidada"], {
        mark: "hit",
        dt: 0,
        label: "Cache revalidado",
      });
    },
  );

  b.step(
    {
      id: "s6-limites",
      title: "Texto claro e fila única",
      subtitle: "Por que vieram HTTPS, HTTP/2 e HTTP/3",
      text: "Qualquer um no caminho leu tudo isso, inclusive o cookie de sessão, que basta para se passar pela Lia: é por isso que a web usa HTTPS. E numa conexão HTTP/1.1 as respostas saem uma atrás da outra; uma resposta lenta trava as seguintes. O HTTP/2 mistura várias respostas na mesma conexão, e o HTTP/3 faz o mesmo sobre o QUIC, sem o TCP.",
      facts: [
        ["Cookie visível", "sim, sem TLS"],
        ["HTTP/2", "vários fluxos numa conexão"],
        ["HTTP/3", "sobre QUIC (UDP)"],
      ],
      highlight: ["net"],
    },
    () => {
      c.note("net", "cookie sessao=a81f visível", "bad", { dt: 1 });
    },
  );

  return b.done({ body: BODY.length, req1: req1.length, maxAge });
}

const lesson: LessonModule = {
  meta: {
    slug: "http",
    site: "redes",
    title: "HTTP: pedido, resposta e cache",
    summary:
      "O texto de um pedido e de uma resposta HTTP/1.1, códigos de estado, cookies, conexão persistente e o 304 que economiza a página inteira.",
    area: "Aplicação",
    refs: [
      { book: "tanenbaum-cn", chapter: 7, section: "7.3.4", note: "HTTP e HTTPS", verified: true },
      { rfc: 9110, note: "Semântica do HTTP" },
      { rfc: 9112, note: "HTTP/1.1" },
      { rfc: 9111, note: "Cache" },
      { rfc: 6265, note: "Cookies" },
    ],
    simplifications: [
      "HTTP sem TLS, para que os bytes apareçam; a lição de TLS mostra a mesma página cifrada.",
      "Sem compressão do corpo e sem os cabeçalhos de data.",
      "O navegador real pediria CSS, imagens e scripts, e abriria até seis conexões por servidor.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [{ key: "maxAge", kind: "int", label: "Cache-Control: max-age (s)", min: 0, max: 86400 }],
  },
  build,
  intro: {
    text: "Toda página que você abre começa com um pedido em texto e uma resposta em texto. Você vai ler, linha por linha, a conversa entre o navegador da Lia e o servidor da biblioteca: o método, os cabeçalhos, os códigos de estado e o truque que evita baixar de novo o que não mudou.",
    facts: [
      ["Site", DAVI.host],
      ["Versão", "HTTP/1.1, sem TLS"],
      ["Porta", "80"],
    ],
  },
  outro: {
    title: "HTTP em resumo",
    text: "Um pedido diz método, caminho e cabeçalhos; a resposta traz um código, cabeçalhos e o corpo. Conexões persistentes evitam handshakes, e ETag com 304 evita baixar de novo o que não mudou.",
    facts: (run) => [
      ["Corpo da página", `${run.stats.body} bytes`],
      ["Pedido GET", `${run.stats.req1} bytes`],
    ],
  },
  next: ["tls13", "websocket", "quic"],
};

export default lesson;
