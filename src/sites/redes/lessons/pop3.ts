import type { LessonModule, Params } from "../../../contracts/types.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { prng, randInt } from "../../../sim/shared/prng.ts";
import { seqScene, talk } from "../../../sim/shared/seq.ts";
import { ANA, MAIL_DEST as DEST_MX, MAIL } from "../plan.ts";
import { tcpSession, textLayer } from "../wire.ts";

/**
 * POP3: Ana's mail client logs in, lists the mailbox, downloads the message and deletes it from
 * the server. Plain port 110 so the commands are visible.
 */
const SEED = 1939;
export const DEFAULTS = { apagar: true };
const CRLF = "\r\n";

const scene = seqScene(
  [
    { id: "ana", kind: "laptop", label: "Cliente de e-mail da Ana", sub: ANA.ip },
    { id: "srv", kind: "server", label: "Servidor POP3", sub: `${DEST_MX.ip}:110` },
  ],
  {
    height: 440,
    widgets: [
      {
        kind: "table",
        id: "box",
        title: "Caixa de entrada",
        at: [60, 240],
        columns: ["Onde", "Mensagem", "Tamanho", "Estado"],
        widths: [160, 260, 100, 140],
        rows: 2,
      },
    ],
  },
);

export function build(p: Params) {
  const apagar = p.apagar !== false;
  const b = lessonBuilder();
  const c = talk(b, { ana: "Ana", srv: "Servidor POP3" });
  const rand = prng(SEED);
  const s = tcpSession(
    { ip: ANA.ip, port: ANA.port },
    { ip: DEST_MX.ip, port: 110 },
    randInt(rand, 1, 2 ** 31),
    randInt(rand, 1, 2 ** 31),
  );
  let n = 0;
  const say = (fromCli: boolean, text: string, label: string, notes: Record<number, string> = {}) => {
    n++;
    c.send(fromCli ? "ana" : "srv", fromCli ? "srv" : "ana", label, {
      dt: 10,
      role: fromCli ? "a" : "b",
      frame: s.data(fromCli, textLayer("pop3", "POP3", text, notes), {
        id: `f-${n}`,
        title: fromCli ? "Comando" : "Resposta",
        summary: text.split(CRLF)[0] ?? "",
      }),
    });
  };
  const size = MAIL.length;

  b.step(
    {
      id: "s1-conexao",
      title: "Buscar o correio",
      subtitle: "Conexão na porta 110",
      text: `A mensagem da Lia chegou ao servidor da Ana, mas está lá, não no notebook. O [[pop3]] é o protocolo mais antigo para buscá-la: o cliente abre uma conexão TCP na porta 110 e o servidor saúda com \`+OK\`. No POP3 só existem duas respostas: \`+OK\` e \`-ERR\`.`,
      facts: [
        ["Porta", "110 (995 com TLS)"],
        ["Respostas possíveis", "+OK ou -ERR"],
      ],
      highlight: ["ana", "srv"],
    },
    () => {
      c.row("box", 0, ["servidor", "Horario da monitoria", `${size} bytes`, "nova"], {
        mark: "new",
        label: "Mensagem no servidor",
      });
      c.send("ana", "srv", "SYN", { dt: 10, frame: s.syn("f-syn") });
      c.send("srv", "ana", "SYN-ACK", { dt: 10, role: "b", frame: s.synAck("f-synack") });
      c.send("ana", "srv", "ACK", { dt: 0, frame: s.ack(true, "f-ack") });
      say(false, `+OK servidor POP3 pronto${CRLF}`, "+OK");
    },
  );

  b.step(
    {
      id: "s2-login",
      quiz: {
        kind: "choice",
        prompt: "Na porta 110, sem TLS, alguém no caminho consegue ler a senha da Ana?",
        options: [
          "Sim, ela vai exatamente como foi digitada",
          "Não, o POP3 cifra só o comando PASS",
          "Só um resumo da senha, que não dá para desfazer",
        ],
        answer: 0,
        explain:
          "O POP3 é texto puro: USER e PASS viajam como foram escritos. A proteção vem de fora, com TLS desde o início na porta 995 ou com STLS antes do login.",
      },
      title: "Usuário e senha",
      subtitle: "USER e PASS, em texto",
      text: "O cliente manda `USER ana` e depois `PASS` com a senha, cada um com a sua resposta. Sem TLS, a senha viaja exatamente como foi digitada: qualquer um no caminho a lê. É por isso que hoje se usa a porta 995, com TLS desde o primeiro byte, ou o comando STLS antes do login.",
      facts: [
        ["Comandos", "USER, PASS"],
        ["Senha na rede", "visível sem TLS"],
      ],
      highlight: ["ana"],
    },
    () => {
      say(true, `USER ana${CRLF}`, "USER");
      say(false, `+OK${CRLF}`, "+OK");
      say(true, `PASS correto-cavalo-bateria${CRLF}`, "PASS", {
        0: "A senha, legível por quem estiver no caminho",
      });
      say(false, `+OK caixa com 1 mensagem${CRLF}`, "+OK");
    },
  );

  b.step(
    {
      id: "s3-lista",
      title: "O que tem na caixa?",
      subtitle: "STAT e LIST",
      text: `\`STAT\` devolve quantas mensagens há e o total de bytes; \`LIST\` dá o tamanho de cada uma, numerada a partir de 1. A resposta de várias linhas termina com uma linha só com um ponto, a mesma convenção do SMTP. Com esses números o cliente sabe o que ainda não baixou.`,
      facts: [
        ["Mensagens", "1"],
        ["Tamanho", `${size} bytes`],
      ],
      highlight: ["srv"],
    },
    () => {
      say(true, `STAT${CRLF}`, "STAT");
      say(false, `+OK 1 ${size}${CRLF}`, "+OK");
      say(true, `LIST${CRLF}`, "LIST");
      say(false, [`+OK 1 mensagem`, `1 ${size}`, ".", ""].join(CRLF), "+OK", { 2: "Fim da lista" });
    },
  );

  b.step(
    {
      id: "s4-retr",
      title: "Baixando a mensagem",
      subtitle: "RETR 1",
      text: `\`RETR 1\` traz a mensagem inteira, cabeçalhos e texto, como o SMTP a entregou. O cliente guarda uma cópia no disco da Ana. A partir daqui, ler, organizar em pastas e procurar acontece **no notebook**: o servidor não sabe se a mensagem foi lida.`,
      facts: [
        ["Comando", "RETR 1"],
        ["Bytes", String(size)],
        ["Cópia local", "sim"],
      ],
      highlight: ["ana"],
    },
    () => {
      say(true, `RETR 1${CRLF}`, "RETR 1");
      say(false, `+OK ${size} bytes${CRLF}${MAIL}.${CRLF}`, "mensagem", { 0: "Tamanho anunciado" });
      c.row("box", 1, ["notebook da Ana", "Horario da monitoria", `${size} bytes`, "baixada"], {
        mark: "new",
        label: "Cópia no notebook",
      });
    },
  );

  b.step(
    {
      id: "s5-dele",
      title: apagar ? "Apagar do servidor" : "Deixar no servidor",
      subtitle: apagar ? "DELE e QUIT" : "Só QUIT",
      text: apagar
        ? "Por padrão o POP3 baixa e **apaga**: o cliente marca a mensagem com `DELE 1`, e ela só some de verdade no `QUIT`, quando a sessão termina bem. Se a Ana abrir o correio no celular depois, a mensagem não estará mais lá. Esse é o principal limite do POP3: ele foi feito para um computador só."
        : "No Laboratório você desligou o apagamento: o cliente só manda `QUIT` e a mensagem continua no servidor. O celular da Ana também vai baixá-la, mas como cópia separada; marcar como lida num lugar não muda nada no outro. O POP3 não sincroniza estado: foi feito para um computador só.",
      facts: apagar
        ? [
            ["Comandos", "DELE 1, QUIT"],
            ["No servidor", "apagada"],
          ]
        : [
            ["Comando", "QUIT"],
            ["No servidor", "continua"],
          ],
      highlight: ["srv"],
      quiz: {
        kind: "choice",
        prompt: "A Ana lê o e-mail no notebook por POP3 (com apagar) e depois abre o celular. O que ela vê?",
        options: [
          "A mensagem como lida",
          "A mensagem como nova",
          "Nada: a mensagem saiu do servidor",
          "Uma cópia sincronizada",
        ],
        answer: 2,
        explain:
          "Com DELE, a mensagem é removida do servidor no QUIT. O celular não tem de onde baixá-la. Para ver o mesmo estado em vários aparelhos, use **IMAP**.",
      },
    },
    () => {
      if (apagar) {
        say(true, `DELE 1${CRLF}`, "DELE 1");
        say(false, `+OK marcada${CRLF}`, "+OK");
      }
      say(true, `QUIT${CRLF}`, "QUIT");
      say(false, `+OK ate logo${CRLF}`, "+OK");
      c.row(
        "box",
        0,
        ["servidor", "Horario da monitoria", `${size} bytes`, apagar ? "apagada" : "continua"],
        {
          mark: apagar ? "bad" : "hit",
          label: apagar ? "Removida do servidor" : "Continua no servidor",
        },
      );
    },
  );

  return b.done({ size, commands: n, apagar: apagar ? 1 : 0 });
}

const lesson: LessonModule = {
  meta: {
    slug: "pop3",
    site: "redes",
    title: "POP3: baixar e apagar",
    summary:
      "Login, lista, download e remoção: como o POP3 traz o correio do servidor para um único computador.",
    area: "Aplicação",
    refs: [
      { book: "tanenbaum-cn", chapter: 7, section: "7.2.5", note: "Entrega final", verified: true },
      { rfc: 1939, note: "POP3" },
      { rfc: 8314, note: "TLS implícito para acesso ao correio" },
    ],
    simplifications: [
      "Porta 110 sem TLS, para mostrar os comandos.",
      "Login com USER e PASS; servidores atuais preferem SASL ou exigem TLS antes.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [{ key: "apagar", kind: "bool", label: "Apagar do servidor depois de baixar (DELE)" }],
  },
  build,
  intro: {
    text: "O SMTP leva o e-mail até o servidor do destinatário, mas a Ana lê no notebook. Alguém precisa buscar. O POP3 é a resposta mais simples: entrar, baixar tudo e, em geral, apagar do servidor. Você vai ver a sessão inteira e descobrir por que ele não combina com vários aparelhos.",
    facts: [
      ["Cliente", `Ana (${ANA.ip})`],
      ["Servidor", `${DEST_MX.ip}:110`],
      ["Mensagens na caixa", "1"],
    ],
  },
  outro: {
    title: "POP3 em resumo",
    text: "Poucos comandos (USER, PASS, STAT, LIST, RETR, DELE, QUIT) e respostas +OK ou -ERR. A mensagem passa a viver no computador que a baixou; para vários aparelhos, o IMAP é a escolha.",
    facts: (run) => [
      ["Mensagem", `${run.stats.size} bytes`],
      ["Comandos e respostas", String(run.stats.commands)],
    ],
  },
  next: ["imap", "smtp"],
};

export default lesson;
