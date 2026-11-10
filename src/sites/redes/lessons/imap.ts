import type { LessonModule, Params } from "../../../contracts/types.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { prng, randInt } from "../../../sim/shared/prng.ts";
import { seqScene, talk } from "../../../sim/shared/seq.ts";
import { ANA, MAIL, MAIL_DEST } from "../plan.ts";
import { tcpSession, textLayer } from "../wire.ts";

/**
 * IMAP: the mailbox stays on the server. Ana's notebook selects INBOX, fetches only the headers,
 * then the body, marks it \Seen; her phone, connected with IDLE, is told about the flag change.
 */
const SEED = 9051;
const PHONE = { ip: "203.0.113.78", port: 49920 } as const;
const CRLF = "\r\n";

const scene = seqScene(
  [
    { id: "ana", kind: "laptop", label: "Notebook da Ana", sub: ANA.ip, at: [140, 110] },
    { id: "srv", kind: "server", label: "Servidor IMAP", sub: `${MAIL_DEST.ip}:143`, at: [520, 200] },
    { id: "cel", kind: "device", label: "Celular da Ana", sub: PHONE.ip, at: [140, 300] },
  ],
  {
    height: 560,
    links: [
      { id: "a", from: "ana", to: "srv", style: "bus" },
      { id: "b", from: "cel", to: "srv", style: "bus" },
    ],
    widgets: [
      {
        kind: "table",
        id: "box",
        title: "INBOX no servidor",
        at: [60, 420],
        columns: ["UID", "Assunto", "Flags"],
        widths: [80, 300, 200],
        rows: 1,
      },
    ],
  },
);

export function build(_p: Params) {
  const b = lessonBuilder();
  const c = talk(b, { ana: "Notebook", srv: "Servidor IMAP", cel: "Celular" });
  const rand = prng(SEED);
  const s = tcpSession(
    { ip: ANA.ip, port: ANA.port },
    { ip: MAIL_DEST.ip, port: 143 },
    randInt(rand, 1, 2 ** 31),
    randInt(rand, 1, 2 ** 31),
  );
  const sp = tcpSession(
    { ip: PHONE.ip, port: PHONE.port },
    { ip: MAIL_DEST.ip, port: 143 },
    randInt(rand, 1, 2 ** 31),
    randInt(rand, 1, 2 ** 31),
  );
  let n = 0;
  const say = (
    who: "ana" | "cel",
    fromCli: boolean,
    text: string,
    label: string,
    notes: Record<number, string> = {},
  ) => {
    n++;
    const sess = who === "ana" ? s : sp;
    c.send(fromCli ? who : "srv", fromCli ? "srv" : who, label, {
      dt: 10,
      role: fromCli ? "a" : "b",
      frame: sess.data(fromCli, textLayer("imap", "IMAP", text, notes), {
        id: `f-${n}`,
        title: fromCli ? "Comando" : "Resposta",
        summary: text.split(CRLF)[0] ?? "",
      }),
    });
  };
  const subject = "Horario da monitoria";

  b.step(
    {
      id: "s1-login",
      title: "A caixa fica no servidor",
      subtitle: "Conexão, saudação e login com etiquetas",
      text: `O [[imap]] parte da ideia oposta à do POP3: a caixa de correio **mora no servidor**, e cada aparelho só mostra uma visão dela. Cada comando leva uma etiqueta escolhida pelo cliente (\`a1\`, \`a2\`…), e a resposta final repete a etiqueta. Assim o cliente pode mandar vários comandos sem esperar e saber qual resposta é de qual.`,
      facts: [
        ["Porta", "143 (993 com TLS)"],
        ["Etiquetas", "a1, a2, a3…"],
        ["Onde ficam as mensagens", "no servidor"],
      ],
      highlight: ["ana", "srv"],
    },
    () => {
      c.row("box", 0, ["101", subject, "(nenhuma)"], { mark: "new", label: "Mensagem nova" });
      c.send("ana", "srv", "SYN", { dt: 10, frame: s.syn("f-syn") });
      c.send("srv", "ana", "SYN-ACK", { dt: 10, role: "b", frame: s.synAck("f-synack") });
      c.send("ana", "srv", "ACK", { dt: 0, frame: s.ack(true, "f-ack") });
      say("ana", false, `* OK servidor IMAP4rev2 pronto${CRLF}`, "* OK");
      say("ana", true, `a1 LOGIN ana correto-cavalo-bateria${CRLF}`, "a1 LOGIN", {
        0: "Sem TLS, a senha fica visível",
      });
      say("ana", false, `a1 OK login feito${CRLF}`, "a1 OK");
    },
  );

  b.step(
    {
      id: "s2-select",
      title: "Abrindo a INBOX",
      subtitle: "SELECT e as respostas não pedidas",
      text: "`SELECT INBOX` abre a pasta. Antes do `a2 OK`, o servidor manda várias linhas começando com `*`: são respostas **não etiquetadas**, informações sobre o estado da pasta. `1 EXISTS` diz que há uma mensagem; `UIDVALIDITY` e `UIDNEXT` deixam o cliente reconhecer mensagens pelo UID, um número que não muda quando outras são apagadas.",
      facts: [
        ["Mensagens", "1 EXISTS"],
        ["UID da mensagem", "101"],
        ["Linhas com *", "estado da pasta"],
      ],
      highlight: ["srv"],
    },
    () => {
      say("ana", true, `a2 SELECT INBOX${CRLF}`, "a2 SELECT");
      say(
        "ana",
        false,
        [
          "* 1 EXISTS",
          "* FLAGS (\\Seen \\Answered \\Flagged \\Deleted \\Draft)",
          "* OK [UIDVALIDITY 3857529045] UIDs validos",
          "* OK [UIDNEXT 102] proximo UID",
          "a2 OK [READ-WRITE] SELECT feito",
          "",
        ].join(CRLF),
        "a2 OK",
        {
          0: "Quantas mensagens a pasta tem",
          2: "Se mudar, o cliente refaz o cache",
        },
      );
    },
  );

  b.step(
    {
      id: "s3-cabecalhos",
      quiz: {
        kind: "choice",
        prompt: "Para desenhar a lista de mensagens, o que o cliente IMAP baixa?",
        options: [
          "Só alguns cabeçalhos e as flags de cada mensagem",
          "Cada mensagem inteira, como o POP3",
          "Nada: o servidor manda a lista pronta em HTML",
        ],
        answer: 0,
        explain:
          "Com FETCH o cliente escolhe os campos: From, Subject e as flags bastam para a lista. O corpo só é pedido quando a mensagem é aberta, o que economiza muito numa caixa grande ou num celular.",
      },
      title: "Só os cabeçalhos",
      subtitle: "FETCH de cabeçalhos",
      text: `Para desenhar a lista de mensagens, o cliente não precisa do texto inteiro. Ele pede só os campos From e Subject e as flags, com \`FETCH\`. Numa caixa com milhares de mensagens, ou num celular com internet ruim, isso faz toda a diferença: o corpo só é baixado quando a Ana abre a mensagem.`,
      facts: [
        ["Pedido", "FLAGS e 2 cabeçalhos"],
        ["Corpo baixado", "ainda não"],
      ],
      highlight: ["ana"],
    },
    () => {
      say(
        "ana",
        true,
        `a3 UID FETCH 101 (FLAGS BODY.PEEK[HEADER.FIELDS (FROM SUBJECT)])${CRLF}`,
        "a3 FETCH",
        { 0: "PEEK: ler sem marcar como lida" },
      );
      const fields = `From: Lia <lia@campus.example>${CRLF}Subject: ${subject}${CRLF}${CRLF}`;
      say(
        "ana",
        false,
        [
          `* 1 FETCH (UID 101 FLAGS () BODY[HEADER.FIELDS (FROM SUBJECT)] {${fields.length}}`,
          `${fields})`,
          "a3 OK FETCH feito",
          "",
        ].join(CRLF),
        "a3 OK",
        { 0: "{n}: os próximos n bytes são dados literais" },
      );
    },
  );

  b.step(
    {
      id: "s4-ler",
      title: "Abrir e marcar lida",
      subtitle: "FETCH do corpo e a flag \\Seen",
      text: "Quando a Ana abre a mensagem, o cliente pede o corpo. Ler com `BODY[]` (sem PEEK) faz o próprio servidor ligar a flag `\\Seen`, e ele avisa a mudança na mesma resposta. A flag fica **no servidor**, junto da mensagem: é por isso que todos os aparelhos da Ana vão concordar que ela já leu.",
      facts: [
        ["Pedido", "BODY[TEXT]"],
        ["Flag nova", "\\Seen"],
        ["Onde fica a flag", "no servidor"],
      ],
      highlight: ["srv"],
    },
    () => {
      const text = MAIL.split(`${CRLF}${CRLF}`)[1] ?? "";
      say("ana", true, `a4 UID FETCH 101 (BODY[TEXT])${CRLF}`, "a4 FETCH");
      say(
        "ana",
        false,
        [
          `* 1 FETCH (UID 101 FLAGS (\\Seen) BODY[TEXT] {${text.length}}`,
          `${text})`,
          "a4 OK FETCH feito",
          "",
        ].join(CRLF),
        "a4 OK",
      );
      c.row("box", 0, ["101", subject, "\\Seen"], { mark: "hit", label: "Marcada como lida" });
    },
  );

  b.step(
    {
      id: "s5-idle",
      title: "O celular fica sabendo",
      subtitle: "IDLE: o servidor avisa sem ser perguntado",
      text: "O celular da Ana mantém outra conexão aberta, parada em `IDLE`: em vez de perguntar a cada minuto se algo mudou, ele espera o servidor avisar. Assim que o notebook marcou a mensagem como lida, o servidor manda ao celular `* 1 FETCH (FLAGS (\\Seen))`, e a bolinha de não lida some sem a Ana fazer nada.",
      facts: [
        ["Conexões abertas", "2 (notebook e celular)"],
        ["Aviso", "* 1 FETCH (FLAGS (\\Seen))"],
      ],
      highlight: ["cel"],
      quiz: {
        kind: "choice",
        prompt: "Por que o celular soube da mudança sem perguntar?",
        options: [
          "Porque baixou a mensagem de novo",
          "Porque estava em IDLE e o servidor avisa mudanças",
          "Porque o notebook mandou um aviso direto ao celular",
          "Por causa do SMTP",
        ],
        answer: 1,
        explain:
          "Em **IDLE** o servidor pode mandar respostas não pedidas a qualquer momento. Os aparelhos não falam entre si: todos olham para a mesma caixa no servidor.",
      },
    },
    () => {
      c.send("cel", "srv", "SYN", { dt: 0, frame: sp.syn("f-p-syn") });
      c.send("srv", "cel", "SYN-ACK", { dt: 10, role: "b", frame: sp.synAck("f-p-synack") });
      c.send("cel", "srv", "ACK", { dt: 0, frame: sp.ack(true, "f-p-ack") });
      say("cel", true, `b1 IDLE${CRLF}`, "b1 IDLE");
      say("cel", false, `+ esperando${CRLF}`, "+ esperando");
      say("cel", false, `* 1 FETCH (UID 101 FLAGS (\\Seen))${CRLF}`, "* FETCH \\Seen", {
        0: "Mudança feita por outro aparelho",
      });
    },
  );

  b.step(
    {
      id: "s6-resumo",
      title: "POP3 ou IMAP?",
      subtitle: "Cópia local ou caixa compartilhada",
      text: "O POP3 entrega a mensagem a um computador e esquece; o IMAP guarda pastas, flags e mensagens no servidor e deixa cada aparelho sincronizar o que quiser, quando quiser. O custo é mais trabalho e mais espaço no servidor, e uma conexão aberta por aparelho. Em todos os casos, a porta certa hoje é a com TLS: 993.",
      facts: [
        ["POP3", "baixa e, em geral, apaga"],
        ["IMAP", "sincroniza estado no servidor"],
        ["Porta recomendada", "993 (IMAP com TLS)"],
      ],
      highlight: ["srv"],
    },
    () => {
      say("ana", true, `a5 LOGOUT${CRLF}`, "a5 LOGOUT");
      say("ana", false, ["* BYE ate logo", "a5 OK LOGOUT feito", ""].join(CRLF), "a5 OK");
    },
  );

  return b.done({ commands: n });
}

const lesson: LessonModule = {
  meta: {
    slug: "imap",
    site: "redes",
    title: "IMAP: a caixa no servidor",
    summary:
      "Comandos com etiquetas, pastas, flags e IDLE: como vários aparelhos enxergam a mesma caixa de correio.",
    area: "Aplicação",
    refs: [
      { book: "tanenbaum-cn", chapter: 7, section: "7.2.5", note: "Entrega final", verified: true },
      { rfc: 9051, note: "IMAP4rev2" },
      { rfc: 2177, note: "IDLE" },
    ],
    simplifications: [
      "Porta 143 sem TLS, para mostrar os comandos.",
      "Respostas encurtadas: servidores reais mandam mais linhas no SELECT.",
      "O celular abre a conexão depois do notebook só para caber na sequência.",
    ],
  },
  scene,
  params: { defaults: {} },
  build,
  intro: {
    text: "A Ana lê e-mail no notebook e no celular, e espera que os dois concordem sobre o que já foi lido. Isso só funciona se a caixa ficar no servidor. Você vai ver o IMAP buscar só o necessário, guardar a flag de lida no servidor e avisar o outro aparelho sem ser perguntado.",
    facts: [
      ["Aparelhos", "notebook e celular"],
      ["Servidor", `${MAIL_DEST.ip}:143`],
      ["Pasta", "INBOX"],
    ],
  },
  outro: {
    title: "IMAP em resumo",
    text: "No IMAP a caixa vive no servidor, com pastas e flags. Os clientes pedem só o que vão mostrar, e com IDLE recebem avisos de mudanças feitas em outros aparelhos.",
    facts: (run) => [["Comandos e respostas", String(run.stats.commands)]],
  },
  next: ["pop3", "smtp"],
};

export default lesson;
