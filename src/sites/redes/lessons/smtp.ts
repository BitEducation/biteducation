import type { LessonModule, Params } from "../../../contracts/types.ts";
import { dns } from "../../../sim/net/dns.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { prng, randInt } from "../../../sim/shared/prng.ts";
import { seqScene, talk } from "../../../sim/shared/seq.ts";
import { MAIL_CAMPUS as CAMPUS_MTA, MAIL_DEST as DEST_MX, RESOLVER } from "../plan.ts";
import { tcpSession, textLayer, udpFrame } from "../wire.ts";

/**
 * SMTP between two mail servers: MX lookup, greeting, EHLO, the envelope (MAIL FROM, RCPT TO),
 * DATA with the message headers, and QUIT. Plain text on port 25 so every command is visible.
 */
const SEED = 5321;
const FROM = "lia@campus.example";
const TO = "ana@pesquisa.example";
export const DEFAULTS = { remetente: "lia@campus.example" };
const CRLF = "\r\n";

const scene = seqScene(
  [
    { id: "res", kind: "dns", label: "Resolvedor", sub: RESOLVER.ip, at: [480, 330] },
    { id: "mta", kind: "server", label: "Correio do campus", sub: CAMPUS_MTA.host, at: [160, 130] },
    { id: "mx", kind: "server", label: "Correio de pesquisa.example", sub: DEST_MX.host, at: [800, 130] },
  ],
  {
    height: 520,
    links: [
      { id: "a", from: "mta", to: "mx", style: "bus" },
      { id: "b", from: "mta", to: "res", style: "dashed" },
    ],
    widgets: [{ kind: "counter", id: "codes", title: "Última resposta", at: [60, 420] }],
  },
);

export function build(p: Params) {
  const from =
    typeof p.remetente === "string" && /^[a-z0-9.]{1,20}@[a-z0-9.-]{1,30}$/.test(p.remetente)
      ? p.remetente
      : FROM;
  const forged = from !== FROM;
  const b = lessonBuilder();
  const c = talk(b, { mta: "Correio do campus", mx: "MX de pesquisa.example", res: "Resolvedor" });
  const rand = prng(SEED);
  const s = tcpSession(
    { ip: CAMPUS_MTA.ip, port: CAMPUS_MTA.port },
    { ip: DEST_MX.ip, port: 25 },
    randInt(rand, 1, 2 ** 31),
    randInt(rand, 1, 2 ** 31),
    64,
    {
      up: "Na internet, do correio do campus para o de pesquisa.example",
      down: "Na internet, do correio de pesquisa.example para o do campus",
    },
  );
  const dnsId = randInt(rand, 1, 0xffff);
  let n = 0;
  const say = (
    fromCli: boolean,
    text: string,
    label: string,
    notes: Record<number, string> = {},
    detail = "",
  ) => {
    n++;
    const f = s.data(fromCli, textLayer("smtp", "SMTP", text, notes), {
      id: `f-${n}`,
      title: fromCli ? "Comando" : "Resposta",
      summary: text.split(CRLF)[0] ?? "",
    });
    c.send(fromCli ? "mta" : "mx", fromCli ? "mx" : "mta", label, {
      dt: 15,
      frame: f,
      role: fromCli ? "a" : "b",
      detail,
    });
    const code = /^\d{3}/.exec(text);
    if (!fromCli && code)
      c.count("codes", code[0], {
        label: `código ${code[0]}`,
        role: code[0].startsWith("2") || code[0].startsWith("3") ? "b" : "bad",
      });
  };

  b.step(
    {
      id: "s1-mx",
      quiz: {
        kind: "choice",
        prompt: "O servidor do campus precisa entregar para ana@pesquisa.example. O que ele pergunta ao DNS?",
        options: [
          "O registro MX de pesquisa.example",
          "O registro A de ana.pesquisa.example",
          "O registro A de pesquisa.example, o endereço do site",
        ],
        answer: 0,
        explain:
          "O MX diz qual servidor recebe o correio do domínio, que pode ser diferente do servidor do site. A parte antes do @ só interessa ao servidor de destino.",
      },
      title: "Quem recebe o correio?",
      subtitle: "Uma consulta MX no DNS",
      text: `A Lia escreveu para \`${TO}\` e o servidor de correio do campus precisa entregar. Ele não manda direto para \`pesquisa.example\`: pergunta ao DNS pelo registro **MX** (*mail exchanger*) desse domínio, que aponta \`${DEST_MX.host}\`. É assim que um domínio pode receber correio num servidor diferente do seu site.`,
      facts: [
        ["Domínio", "pesquisa.example"],
        ["Registro MX", `10 ${DEST_MX.host}`],
        ["Endereço", DEST_MX.ip],
      ],
      highlight: ["mta", "res"],
    },
    () => {
      const q = { name: "pesquisa.example", type: "MX" as const };
      c.send("mta", "res", "MX?", {
        dt: 2,
        frame: udpFrame(
          { src: CAMPUS_MTA.ip, dst: RESOLVER.ip, sport: 41000, dport: 53 },
          dns({ id: dnsId, response: false, rd: true, question: q }),
          {
            id: "f-mx-q",
            title: "Pergunta MX",
            summary: "Quem recebe o correio deste domínio?",
            where: "Na rede do campus, do correio do campus para o resolvedor",
          },
        ),
      });
      c.send("res", "mta", `MX ${DEST_MX.host}`, {
        dt: 2,
        role: "s4",
        frame: udpFrame(
          { src: RESOLVER.ip, dst: CAMPUS_MTA.ip, sport: 53, dport: 41000 },
          dns({
            id: dnsId,
            response: true,
            rd: true,
            ra: true,
            question: q,
            answers: [
              {
                name: "pesquisa.example",
                type: "MX",
                ttl: 3600,
                data: `10 ${DEST_MX.host}`,
                note: "10 é a preferência: menor vem primeiro",
              },
            ],
            additional: [{ name: DEST_MX.host, type: "A", ttl: 3600, data: DEST_MX.ip }],
          }),
          {
            id: "f-mx-r",
            title: "Resposta MX",
            summary: "O servidor de correio e o seu IP.",
            where: "Na rede do campus, do resolvedor de volta ao correio do campus",
          },
        ),
      });
    },
  );

  b.step(
    {
      id: "s2-saudacao",
      title: "Conexão e saudação",
      subtitle: "Porta 25 e o código 220",
      text: `O servidor do campus abre uma conexão TCP na porta 25 do MX. Quem fala primeiro é o servidor: \`220\`, com o próprio nome. Toda resposta [[smtp]] começa com um código de três dígitos, pensado para programas: 2xx deu certo, 3xx continue, 4xx falha temporária (tente mais tarde), 5xx falha definitiva.`,
      facts: [
        ["Porta", "25"],
        ["Quem fala primeiro", "o servidor"],
        ["Código", "220 (pronto)"],
      ],
      highlight: ["mx"],
    },
    () => {
      c.send("mta", "mx", "SYN", { dt: 15, frame: s.syn("f-syn") });
      c.send("mx", "mta", "SYN-ACK", { dt: 15, role: "b", frame: s.synAck("f-synack") });
      c.send("mta", "mx", "ACK", { dt: 0, frame: s.ack(true, "f-ack") });
      say(false, `220 ${DEST_MX.host} ESMTP pronto${CRLF}`, "220");
    },
  );

  b.step(
    {
      id: "s3-ehlo",
      title: "Apresentações",
      subtitle: "EHLO e as extensões do servidor",
      text: "O cliente se apresenta com **EHLO** e o nome dele. O servidor responde com várias linhas `250-`: cada uma anuncia uma extensão que ele aceita, como o tamanho máximo da mensagem e o **STARTTLS**, que transformaria esta conversa numa conexão cifrada. Nesta lição o cliente não usa o STARTTLS, para que você possa ler o resto.",
      facts: [
        ["Comando", `EHLO ${CAMPUS_MTA.host}`],
        ["Extensões", "SIZE, 8BITMIME, STARTTLS"],
      ],
      highlight: ["mta", "mx"],
    },
    () => {
      say(true, `EHLO ${CAMPUS_MTA.host}${CRLF}`, "EHLO");
      say(
        false,
        [
          `250-${DEST_MX.host} ola, ${CAMPUS_MTA.host}`,
          "250-SIZE 26214400",
          "250-8BITMIME",
          "250 STARTTLS",
          "",
        ].join(CRLF),
        "250",
        { 3: "Aceita cifrar a conversa" },
      );
    },
  );

  b.step(
    {
      id: "s4-envelope",
      title: "O envelope",
      subtitle: "MAIL FROM e RCPT TO",
      text: `Antes do texto, o SMTP manda o **envelope**: \`MAIL FROM:<${from}>\` diz para onde devolver se a entrega falhar, e \`RCPT TO:<${TO}>\` diz para quem é. O servidor confere se aceita cada destinatário. Repare que nada aqui prova que o remetente é quem diz ser: ${forged ? "você trocou o remetente no Laboratório e o servidor aceitou do mesmo jeito." : "qualquer um poderia escrever outro endereço."}`,
      facts: [
        ["Remetente do envelope", from],
        ["Destinatário", TO],
        ["Prova de identidade", "nenhuma no SMTP"],
      ],
      highlight: ["mta"],
      quiz: {
        kind: "choice",
        prompt: "O que impede alguém de mandar um e-mail dizendo ser do campus.example?",
        options: [
          "O próprio SMTP confere a senha do remetente",
          "Nada no SMTP; quem recebe confere SPF, DKIM e DMARC do domínio",
          "O registro MX do campus.example",
          "O código 250 do servidor",
        ],
        answer: 1,
        explain:
          "O SMTP entre servidores aceita qualquer remetente. Quem recebe consulta o DNS do domínio: o **SPF** lista quais IPs podem enviar por ele, o **DKIM** assina a mensagem e o **DMARC** diz o que fazer quando os dois falham.",
      },
    },
    () => {
      say(true, `MAIL FROM:<${from}>${CRLF}`, "MAIL FROM");
      say(false, `250 2.1.0 remetente ok${CRLF}`, "250");
      say(true, `RCPT TO:<${TO}>${CRLF}`, "RCPT TO");
      say(false, `250 2.1.5 destinatario ok${CRLF}`, "250");
    },
  );

  const body = [
    `From: Lia <${from}>`,
    `To: Ana <${TO}>`,
    "Subject: Horario da monitoria",
    "Date: Mon, 9 Nov 2026 10:12:00 -0300",
    "",
    "Oi, Ana! A monitoria de redes vai ser na biblioteca, sala 3.",
    ".",
    "",
  ].join(CRLF);
  b.step(
    {
      id: "s5-data",
      title: "A mensagem",
      subtitle: "DATA, cabeçalhos e o ponto final",
      text: "Depois de `DATA` e da resposta 354, vai a mensagem em si: cabeçalhos (From, To, Subject, Date), uma linha em branco e o texto. O **From** daqui é o que o programa de e-mail mostra, e pode ser diferente do envelope. Uma linha só com `.` encerra a mensagem; o servidor responde 250 e assume a responsabilidade pela entrega.",
      facts: [
        ["Fim da mensagem", "linha com um ponto"],
        ["Resposta", "250 (aceita para entrega)"],
        ["Tamanho", `${body.length} bytes`],
      ],
      highlight: ["mx"],
    },
    () => {
      say(true, `DATA${CRLF}`, "DATA");
      say(false, `354 pode enviar; termine com <CRLF>.<CRLF>${CRLF}`, "354");
      say(
        true,
        body,
        "mensagem",
        { 0: "O remetente que aparece na tela", 4: "Separa cabeçalhos do texto", 6: "Fim da mensagem" },
        `${body.length} bytes`,
      );
      say(false, `250 2.0.0 aceita, fila 4F2A1${CRLF}`, "250");
    },
  );

  b.step(
    {
      id: "s6-fim",
      title: "Até logo",
      subtitle: "QUIT e o que falta para ser seguro",
      text: "O cliente encerra com **QUIT** e o servidor responde 221. A mensagem agora está na caixa da Ana, esperando ser buscada por [[pop3]] ou [[imap]]. Tudo viajou em claro: na prática os servidores usam STARTTLS (ou TLS desde o início, na porta 465 para envio), e o destino confere SPF, DKIM e DMARC antes de aceitar.",
      facts: [
        ["Comando", "QUIT → 221"],
        ["Cifra entre servidores", "STARTTLS"],
        ["Autenticidade do domínio", "SPF, DKIM, DMARC"],
      ],
      highlight: ["mta", "mx"],
    },
    () => {
      say(true, `QUIT${CRLF}`, "QUIT");
      say(false, `221 2.0.0 ate logo${CRLF}`, "221");
    },
  );

  return b.done({ messages: n, body: body.length, forged: forged ? 1 : 0 });
}

const lesson: LessonModule = {
  meta: {
    slug: "smtp",
    site: "redes",
    title: "SMTP: como um e-mail é entregue",
    summary:
      "Registro MX, saudação, EHLO, envelope, DATA e QUIT: a conversa entre dois servidores de correio, comando por comando.",
    area: "Aplicação",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 7,
        section: "7.2.4",
        note: "Transferência de mensagens",
        verified: true,
      },
      { rfc: 5321, note: "SMTP" },
      { rfc: 5322, note: "Formato da mensagem" },
      { rfc: 7489, note: "DMARC" },
    ],
    simplifications: [
      "Sem STARTTLS, para que os comandos apareçam; servidores reais cifram quando o outro lado aceita.",
      "O envio da Lia até o servidor do campus (porta 587, com senha) não aparece.",
      "Sem SPF, DKIM e DMARC na simulação; eles são citados no quiz e no último passo.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "remetente",
        kind: "text",
        label: "Remetente do envelope",
        maxLength: 52,
        pattern: "[a-z0-9.]{1,20}@[a-z0-9.-]{1,30}",
        placeholder: FROM,
        help: "Troque o remetente e veja que o servidor aceita do mesmo jeito.",
      },
    ],
  },
  build,
  intro: {
    text: "Um e-mail não vai do seu computador direto para o da outra pessoa: ele passa de servidor em servidor, e a conversa entre eles é texto puro desde 1982. Você vai ler, comando por comando, o servidor do campus entregando uma mensagem da Lia ao servidor de outra instituição.",
    facts: [
      ["De", FROM],
      ["Para", TO],
      ["Protocolo", "SMTP, porta 25"],
    ],
  },
  outro: {
    title: "SMTP em resumo",
    text: "O remetente acha o servidor de destino pelo registro MX e conversa com comandos de texto e códigos de três dígitos. O envelope e o cabeçalho não provam quem enviou: isso fica para SPF, DKIM e DMARC.",
    facts: (run) => [
      ["Mensagens SMTP trocadas", String(run.stats.messages)],
      ["Tamanho da mensagem", `${run.stats.body} bytes`],
    ],
  },
  next: ["imap", "pop3"],
};

export default lesson;
