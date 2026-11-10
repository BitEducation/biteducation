import type { LessonModule, Params } from "../../../contracts/types.ts";
import { frameOf } from "../../../sim/net/bytes.ts";
import { dns } from "../../../sim/net/dns.ts";
import { clientHello, encrypted } from "../../../sim/net/tls13.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { prng, randInt } from "../../../sim/shared/prng.ts";
import { seqScene, talk } from "../../../sim/shared/seq.ts";
import { LIA, RESOLVER } from "../plan.ts";
import { tcpFrame, textLayer, udpFrame } from "../wire.ts";

/**
 * DNS over HTTPS: the same question in clear (seen by the campus router) and inside HTTPS to a
 * public resolver, with what each observer can still see; where trust moves.
 */
const SEED = 8484;
export const DOH = { ip: "198.51.100.53", host: "dns.resolvedor.example" } as const;
const NAME = "saude.example";

const scene = seqScene(
  [
    { id: "lia", kind: "laptop", label: "Navegador da Lia", sub: LIA.ip, at: [120, 140] },
    { id: "gw", kind: "router", label: "Roteador do campus", sub: "registra o tráfego", at: [440, 140] },
    { id: "res", kind: "dns", label: "Resolvedor do campus", sub: RESOLVER.ip, at: [440, 320] },
    { id: "doh", kind: "dns", label: "Resolvedor DoH", sub: `${DOH.host}`, at: [820, 140] },
  ],
  {
    height: 600,
    links: [
      { id: "a", from: "lia", to: "gw", style: "bus" },
      { id: "b", from: "gw", to: "doh", style: "bus" },
      { id: "c", from: "gw", to: "res", style: "bus" },
    ],
    widgets: [
      {
        kind: "table",
        id: "log",
        title: "O que o roteador do campus registrou",
        at: [40, 440],
        columns: ["Destino", "Porta", "O que dá para ler"],
        widths: [170, 80, 380],
        rows: 2,
      },
    ],
  },
);

export function build(_p: Params) {
  const b = lessonBuilder();
  const c = talk(b, {
    lia: "Lia",
    gw: "Roteador do campus",
    res: "Resolvedor do campus",
    doh: "Resolvedor DoH",
  });
  const rand = prng(SEED);
  const bytes32 = () => Array.from({ length: 32 }, () => randInt(rand, 0, 255));
  const qid = randInt(rand, 1, 0xffff);
  const sport = randInt(rand, 49152, 65535);
  const q = { name: NAME, type: "A" as const };
  const query = dns({ id: 0, response: false, rd: true, question: q });
  const answer = dns({
    id: 0,
    response: true,
    rd: true,
    ra: true,
    question: q,
    answers: [{ name: NAME, type: "A", ttl: 600, data: "203.0.113.60" }],
  });
  const post = [
    "POST /dns-query HTTP/2",
    `host: ${DOH.host}`,
    "content-type: application/dns-message",
    "accept: application/dns-message",
    `content-length: ${query.bytes.length}`,
    "",
    "",
  ].join("\r\n");
  const tls = { src: LIA.ip, dst: DOH.ip, sport: LIA.port, dport: 443 };
  const isn = randInt(rand, 1, 2 ** 31);

  b.step(
    {
      id: "s1-claro",
      title: "Uma pergunta indiscreta",
      subtitle: "DNS comum: o nome em claro",
      text: `A Lia procura uma clínica em \`${NAME}\`. Pelo DNS comum, a pergunta vai por UDP, em claro, ao resolvedor do campus. O roteador, e qualquer um no caminho, registra o nome; o resolvedor também, e ainda poderia responder outra coisa. Nomes revelam muito: sites de saúde, de banco, de emprego. O conteúdo da página até vai cifrado depois, mas o nome já escapou.`,
      facts: [
        ["Pergunta", `${NAME} A`],
        ["Transporte", "UDP 53, sem cifra"],
        ["Quem vê o nome", "a rede inteira no caminho"],
      ],
      highlight: ["gw"],
    },
    () => {
      c.send("lia", "res", "A?", {
        dt: 1,
        via: ["gw"],
        frame: udpFrame(
          { src: LIA.ip, dst: RESOLVER.ip, sport, dport: 53 },
          dns({ id: qid, response: false, rd: true, question: q }),
          {
            id: "f-plain",
            title: "DNS em claro",
            summary: "O nome aparece inteiro.",
            where: "Passando pelo roteador do campus, que registra o tráfego",
          },
        ),
        detail: NAME,
      });
      c.row("log", 0, [RESOLVER.ip, "53/UDP", `pergunta: ${NAME}`], {
        mark: "bad",
        label: "Nome registrado",
      });
    },
  );

  b.step(
    {
      id: "s2-tls",
      title: "Um túnel até o resolvedor",
      subtitle: "TLS na porta 443",
      text: `Com o [[doh]] ligado, o navegador abre uma conexão TLS na porta 443 com um resolvedor escolhido, \`${DOH.host}\`, igual a qualquer site. O ClientHello ainda mostra o SNI: quem olha sabe que a Lia usa esse resolvedor, mas não o que ela pergunta. A conexão é reaproveitada para todas as consultas seguintes.`,
      facts: [
        ["Destino", `${DOH.ip}:443`],
        ["SNI visível", DOH.host],
        ["Perguntas visíveis", "nenhuma"],
      ],
      highlight: ["lia", "doh"],
    },
    () => {
      c.send("lia", "doh", "ClientHello", {
        dt: 10,
        via: ["gw"],
        frame: tcpFrame(
          { ...tls, seq: isn, ack: 1, flags: ["PSH", "ACK"] },
          clientHello(DOH.host, { random: bytes32(), sessionId: bytes32(), keyShare: bytes32() }),
          {
            id: "f-hello",
            title: "ClientHello",
            summary: "O SNI aponta o resolvedor.",
            where: "Passando pelo roteador do campus: o handshake ainda não está cifrado",
          },
        ),
        role: "crypto",
      });
      c.send("doh", "lia", "handshake TLS", { dt: 10, via: ["gw"], role: "crypto" });
    },
  );

  b.step(
    {
      id: "s3-dentro",
      title: "A pergunta dentro do HTTPS",
      subtitle: "POST /dns-query",
      text: `Dentro do TLS vai um pedido HTTP/2 **POST** para \`/dns-query\`, com tipo \`application/dns-message\`. O corpo é exatamente a mesma mensagem DNS binária do primeiro passo, com o identificador zerado (o HTTP já liga pedido e resposta). Abra o inspetor (I): há o quadro como sai na rede e o quadro como o resolvedor o vê, depois de decifrar.`,
      facts: [
        ["Método", "POST /dns-query"],
        ["Corpo", `${query.bytes.length} bytes de DNS`],
        ["ID do DNS", "0"],
      ],
      highlight: ["doh"],
    },
    () => {
      const inner = textLayer("http", "HTTP/2 (simplificado)", post, { 2: "O corpo é uma mensagem DNS" });
      b.frame(
        frameOf(
          "f-inside",
          "Como o resolvedor vê",
          "Depois de decifrar: HTTP e a mensagem DNS.",
          [inner, query],
          "Dentro do resolvedor DoH, depois de tirar o TLS: só ele vê isto",
        ),
      );
      c.send("lia", "doh", "POST /dns-query", {
        dt: 10,
        via: ["gw"],
        role: "crypto",
        frame: tcpFrame(
          { ...tls, seq: isn + 300, ack: 4000, flags: ["PSH", "ACK"] },
          encrypted(inner.bytes.length + query.bytes.length, "POST /dns-query com a pergunta"),
          {
            id: "f-wire",
            title: "Como sai na rede",
            summary: "Um registro TLS: só o tamanho aparece.",
            where: "Passando pelo roteador do campus, que agora só vê destino e tamanho",
          },
        ),
      });
      c.send("doh", "lia", "200 + resposta", {
        dt: 10,
        via: ["gw"],
        role: "crypto",
        frame: tcpFrame(
          {
            src: DOH.ip,
            dst: LIA.ip,
            sport: 443,
            dport: LIA.port,
            seq: 4000,
            ack: isn + 400,
            flags: ["PSH", "ACK"],
          },
          encrypted(answer.bytes.length + 60, "200 com a resposta DNS"),
          {
            id: "f-wire-r",
            title: "Resposta cifrada",
            summary: "O endereço vai dentro.",
            where: "Passando pelo roteador do campus, de volta à Lia",
          },
        ),
        detail: "203.0.113.60",
      });
    },
  );

  b.step(
    {
      id: "s4-observador",
      quiz: {
        kind: "choice",
        prompt:
          "Com DoH, a pergunta por saude.example foi cifrada. O roteador do campus ainda pode descobrir que a Lia visitou o site?",
        options: [
          "Pode, pela conexão seguinte: endereço de destino e, sem ECH, o SNI",
          "Não: o DoH esconde toda a navegação",
          "Só se o resolvedor contar para o campus",
        ],
        answer: 0,
        explain:
          "O DoH protege a consulta, não o que vem depois. Para abrir a página, o navegador ainda conecta ao endereço do site e, sem ECH, escreve o nome no SNI do ClientHello.",
      },
      title: "O que sobrou à vista",
      subtitle: "Destino, SNI, tamanhos e horários",
      text: `O registro do roteador agora mostra só uma conexão HTTPS com ${DOH.ip}, o nome do resolvedor no SNI e o tamanho dos registros. O nome \`${NAME}\` sumiu. Mas a conexão seguinte, ao próprio site, ainda revela o endereço de destino e, sem ECH, o SNI. O DoH esconde a pergunta, não a navegação inteira.`,
      facts: [
        ["Roteador vê", `${DOH.ip}:443 e o SNI`],
        ["Roteador não vê", NAME],
        ["Ainda vaza", "IP e SNI do site visitado"],
      ],
      highlight: ["gw"],
    },
    () => {
      c.row("log", 1, [DOH.ip, "443/TCP", `TLS com ${DOH.host}; tamanhos`], {
        mark: "hit",
        label: "Só metadados",
      });
    },
  );

  b.step(
    {
      id: "s5-confianca",
      title: "Em quem confiar?",
      subtitle: "A privacidade muda de lugar",
      text: `Agora quem vê todos os nomes que a Lia consulta é o operador de \`${DOH.host}\`, e não mais o campus. Isso é bom se ele for confiável e ruim se não for. Redes de empresas e escolas que filtram domínios perdem essa visão. Existe também o DoT, DNS sobre TLS na porta 853: mesma proteção, mas fácil de reconhecer e bloquear.`,
      facts: [
        ["Vê os nomes", "o resolvedor DoH"],
        ["DoT", "TLS na porta 853"],
        ["DoH", "parece HTTPS comum"],
      ],
      highlight: ["doh"],
      quiz: {
        kind: "choice",
        prompt: "Com DoH ligado, quem ainda consegue saber todos os nomes que a Lia consulta?",
        options: ["O roteador do campus", "O resolvedor DoH escolhido", "Ninguém", "Qualquer um no caminho"],
        answer: 1,
        explain:
          "O resolvedor DoH precisa ler a pergunta para respondê-la. O DoH tira a visão da rede no caminho, mas concentra a confiança em quem resolve. Por isso a escolha do resolvedor importa.",
      },
    },
    () => {
      c.note("doh", "vê todas as perguntas", "warn", { dt: 1 });
    },
  );

  return b.done({ query: query.bytes.length });
}

const lesson: LessonModule = {
  meta: {
    slug: "doh",
    site: "redes",
    title: "DoH: DNS dentro do HTTPS",
    summary:
      "A mesma pergunta DNS em claro e dentro de HTTPS: o que o roteador deixa de ver, o que continua vazando e para onde vai a confiança.",
    area: "Segurança",
    refs: [
      { book: "tanenbaum-cn", chapter: 7, section: "7.1.7", note: "Privacidade do DNS", verified: true },
      { rfc: 8484, note: "DNS sobre HTTPS" },
      { rfc: 7858, note: "DNS sobre TLS" },
    ],
    simplifications: [
      "O HTTP/2 aparece como texto; na rede ele é binário e com cabeçalhos comprimidos.",
      "O handshake TLS aparece resumido; a lição de TLS 1.3 mostra os detalhes.",
      "Números de sequência TCP do túnel ilustrativos.",
    ],
  },
  scene,
  params: { defaults: {} },
  build,
  intro: {
    text: "Mesmo com HTTPS em todo lugar, a primeira coisa que o computador faz, perguntar o endereço do site, ainda vai em claro. O DoH coloca essa pergunta dentro de uma conexão HTTPS. Você vai comparar o que o roteador do campus registra antes e depois e descobrir quem passa a saber o quê.",
    facts: [
      ["Nome consultado", NAME],
      ["Resolvedor DoH", DOH.host],
      ["Porta", "443"],
    ],
  },
  outro: {
    title: "DoH em resumo",
    text: "O DoH leva a mensagem DNS num POST HTTPS: quem está no caminho vê só uma conexão com o resolvedor. A privacidade não some, muda de lugar: o resolvedor escolhido passa a ver todas as perguntas.",
    facts: (run) => [["Mensagem DNS", `${run.stats.query} bytes`]],
  },
  next: ["dnssec", "tls13"],
};

export default lesson;
