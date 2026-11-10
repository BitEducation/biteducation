import type { LessonModule, Params } from "../../../contracts/types.ts";
import { payloadLayer } from "../../../sim/net/tcp.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { prng, randInt } from "../../../sim/shared/prng.ts";
import { seqScene, talk } from "../../../sim/shared/seq.ts";
import { GW, LIA } from "../plan.ts";
import { ftp as practice } from "../practice.ts";
import { tcpSession, textLayer } from "../wire.ts";

/**
 * FTP: a control connection with text commands and a separate data connection per transfer.
 * Passive mode (PASV) by default; the Lab switches to active mode (PORT), which NAT breaks.
 */
const SEED = 959;
export const FTP_SRV = { ip: "192.0.2.21", host: "arquivos.campus.example" } as const;
export const DEFAULTS = { modo: "passivo" };
export const PASV_PORT = 50000;
const FILE_SIZE = 1200;
const CRLF = "\r\n";

const scene = seqScene(
  [
    { id: "lia", kind: "laptop", label: "Cliente FTP da Lia", sub: LIA.ip, at: [140, 140] },
    { id: "gw", kind: "router", label: "Roteador com NAT", sub: GW.wanIp, at: [480, 140] },
    { id: "srv", kind: "server", label: "Servidor FTP", sub: FTP_SRV.ip, at: [820, 140] },
  ],
  {
    height: 460,
    widgets: [
      {
        kind: "table",
        id: "conns",
        title: "Conexões TCP",
        at: [60, 280],
        columns: ["Para quê", "Cliente", "Servidor", "Estado"],
        widths: [130, 200, 190, 130],
        rows: 2,
      },
    ],
  },
);

export function build(p: Params) {
  const ativo = p.modo === "ativo";
  const b = lessonBuilder();
  const c = talk(b, { lia: "Lia", gw: "Roteador", srv: "Servidor FTP" });
  const rand = prng(SEED);
  const ctl = tcpSession(
    { ip: LIA.ip, port: LIA.port },
    { ip: FTP_SRV.ip, port: 21 },
    randInt(rand, 1, 2 ** 31),
    randInt(rand, 1, 2 ** 31),
  );
  const dataPort = LIA.port + 1;
  const dat = ativo
    ? tcpSession(
        { ip: FTP_SRV.ip, port: 20 },
        { ip: LIA.ip, port: dataPort },
        randInt(rand, 1, 2 ** 31),
        randInt(rand, 1, 2 ** 31),
      )
    : tcpSession(
        { ip: LIA.ip, port: dataPort },
        { ip: FTP_SRV.ip, port: PASV_PORT },
        randInt(rand, 1, 2 ** 31),
        randInt(rand, 1, 2 ** 31),
      );
  let n = 0;
  const say = (fromCli: boolean, text: string, label: string, notes: Record<number, string> = {}) => {
    n++;
    c.send(fromCli ? "lia" : "srv", fromCli ? "srv" : "lia", label, {
      dt: 10,
      via: ["gw"],
      role: fromCli ? "a" : "b",
      frame: ctl.data(fromCli, textLayer("ftp", "FTP", text, notes), {
        id: `f-${n}`,
        title: fromCli ? "Comando" : "Resposta",
        summary: text.split(CRLF)[0] ?? "",
      }),
    });
  };
  const ipParts = FTP_SRV.ip.split(".").join(",");
  const p1 = Math.floor(PASV_PORT / 256);
  const p2 = PASV_PORT % 256;

  b.step(
    {
      id: "s1-controle",
      title: "A conexão de controle",
      subtitle: "Porta 21, comandos em texto",
      text: `O [[ftp]] usa **duas** conexões. A primeira, de controle, vai para a porta 21 e carrega só comandos e respostas em texto, no mesmo estilo do SMTP: códigos de três dígitos. A Lia entra com \`USER\` e \`PASS\` (331 pede a senha, 230 confirma). Os arquivos não passam por aqui.`,
      facts: [
        ["Controle", `${FTP_SRV.ip}:21`],
        ["Login", "USER, PASS"],
        ["Respostas", "220, 331, 230"],
      ],
      highlight: ["lia", "srv"],
    },
    () => {
      c.send("lia", "srv", "SYN", { dt: 10, via: ["gw"], frame: ctl.syn("f-syn") });
      c.send("srv", "lia", "SYN-ACK", { dt: 10, via: ["gw"], role: "b", frame: ctl.synAck("f-synack") });
      c.send("lia", "srv", "ACK", { dt: 0, via: ["gw"], frame: ctl.ack(true, "f-ack") });
      c.row("conns", 0, ["controle", `${LIA.ip}:${LIA.port}`, `${FTP_SRV.ip}:21`, "aberta"], {
        mark: "new",
        label: "Conexão de controle",
      });
      say(false, `220 ${FTP_SRV.host} FTP pronto${CRLF}`, "220");
      say(true, `USER lia${CRLF}`, "USER");
      say(false, `331 senha, por favor${CRLF}`, "331");
      say(true, `PASS correto-cavalo-bateria${CRLF}`, "PASS", { 0: "Em texto claro" });
      say(false, `230 bem-vinda${CRLF}`, "230");
    },
  );

  b.step(
    ativo
      ? {
          id: "s2-port",
          title: "Modo ativo: PORT",
          subtitle: "O servidor vai ligar de volta",
          text: `No modo ativo, a Lia diz onde está escutando: \`PORT\` com o IP ${LIA.ip} e a porta ${dataPort}, escritos como seis números. O servidor é que vai **abrir** a conexão de dados, a partir da porta 20. O problema: ${LIA.ip} é um endereço privado, e o roteador com NAT não tem nenhuma tradução para uma conexão que começa lá fora.`,
          facts: [
            [
              "Comando",
              `PORT ${LIA.ip.split(".").join(",")},${Math.floor(dataPort / 256)},${dataPort % 256}`,
            ],
            ["Quem abre a conexão de dados", "o servidor"],
          ],
          highlight: ["lia"],
        }
      : {
          id: "s2-pasv",
          title: "Modo passivo: PASV",
          subtitle: "O servidor diz onde esperar",
          text: `Para baixar um arquivo é preciso uma **segunda** conexão. No modo passivo a Lia manda \`PASV\` e o servidor responde onde vai esperar: seis números, os quatro do IP e dois da porta. A porta é o quinto vezes 256 mais o sexto: ${p1} × 256 + ${p2} = **${PASV_PORT}**. Quem abre a conexão é a Lia, o que funciona bem atrás de NAT.`,
          facts: [
            ["Resposta", `227 (${ipParts},${p1},${p2})`],
            ["Porta de dados", String(PASV_PORT)],
            ["Quem abre a conexão de dados", "a Lia"],
          ],
          highlight: ["srv"],
          quiz: {
            kind: "number",
            prompt:
              "Se o servidor respondesse 227 (192,0,2,21,200,10), em qual porta ele esperaria a conexão de dados?",
            answer: 200 * 256 + 10,
            explain:
              "Porta = 200 × 256 + 10 = **51210**. Os dois últimos números são os bytes alto e baixo da porta.",
          },
        },
    () => {
      if (ativo) {
        say(
          true,
          `PORT ${LIA.ip.split(".").join(",")},${Math.floor(dataPort / 256)},${dataPort % 256}${CRLF}`,
          "PORT",
          { 0: "IP privado e porta da Lia" },
        );
        say(false, `200 PORT ok${CRLF}`, "200");
      } else {
        say(true, `PASV${CRLF}`, "PASV");
        say(false, `227 Entrando no modo passivo (${ipParts},${p1},${p2})${CRLF}`, "227", {
          0: "IP e porta, em seis números",
        });
      }
    },
  );

  b.step(
    {
      id: "s3-dados",
      quiz: {
        kind: "choice",
        prompt: "Como o cliente FTP sabe que o arquivo terminou de chegar?",
        options: [
          "O servidor fecha a conexão de dados",
          "Um byte especial marca o fim do arquivo",
          "O cliente conta até um tamanho combinado no login",
        ],
        answer: 0,
        explain:
          "No modo normal, o fim da conexão de dados é o fim do arquivo. Por isso cada arquivo, e cada listagem, precisa de uma conexão de dados nova.",
      },
      title: ativo ? "A ligação que não chega" : "A conexão de dados",
      subtitle: ativo ? "O NAT descarta a conexão do servidor" : "RETR e o arquivo pela outra conexão",
      text: ativo
        ? `A Lia pede \`RETR horarios.pdf\` e o servidor tenta conectar em ${LIA.ip}:${dataPort}. Esse endereço não existe na internet; mesmo usando o IP público, o roteador não tem tradução para essa porta e descarta o SYN. Depois de esperar, o servidor responde 425: não conseguiu abrir a conexão de dados. É por isso que quase todo cliente usa o modo passivo.`
        : `Com \`RETR horarios.pdf\`, o servidor responde 150 na conexão de controle e manda os ${FILE_SIZE} bytes do arquivo pela conexão de dados, que é fechada no fim: é assim que o cliente sabe que o arquivo acabou. Então chega o 226 pelo controle. Cada arquivo, e até cada listagem de diretório, usa uma conexão de dados nova.`,
      facts: ativo
        ? [
            ["SYN do servidor", "descartado no NAT"],
            ["Resposta", "425"],
          ]
        : [
            ["Arquivo", `${FILE_SIZE} bytes`],
            ["Fim do arquivo", "a conexão de dados fecha"],
            ["Respostas", "150, 226"],
          ],
      highlight: ["gw"],
    },
    () => {
      say(true, `RETR horarios.pdf${CRLF}`, "RETR");
      if (ativo) {
        c.send("srv", "gw", "SYN", {
          dt: 10,
          role: "warn",
          frame: dat.syn("f-d-syn"),
          detail: `→ ${LIA.ip}:${dataPort}`,
        });
        c.state("gw", "sem tradução: descarta", { dt: 0, tone: "bad", role: "warn" });
        c.row("conns", 1, ["dados", `${LIA.ip}:${dataPort}`, `${FTP_SRV.ip}:20`, "falhou"], {
          mark: "bad",
          label: "Conexão de dados falhou",
        });
        say(false, `425 nao foi possivel abrir a conexao de dados${CRLF}`, "425");
      } else {
        c.send("lia", "srv", "SYN", {
          dt: 10,
          via: ["gw"],
          frame: dat.syn("f-d-syn"),
          detail: `→ :${PASV_PORT}`,
        });
        c.send("srv", "lia", "SYN-ACK", { dt: 10, via: ["gw"], role: "b", frame: dat.synAck("f-d-synack") });
        c.send("lia", "srv", "ACK", { dt: 0, via: ["gw"], frame: dat.ack(true, "f-d-ack") });
        c.row("conns", 1, ["dados", `${LIA.ip}:${dataPort}`, `${FTP_SRV.ip}:${PASV_PORT}`, "aberta"], {
          mark: "new",
          label: "Conexão de dados",
        });
        say(false, `150 abrindo conexao de dados para horarios.pdf (${FILE_SIZE} bytes)${CRLF}`, "150");
        c.send("srv", "lia", "arquivo", {
          dt: 10,
          via: ["gw"],
          role: "s4",
          frame: dat.data(
            false,
            payloadLayer(
              "arquivo",
              "Arquivo",
              Array(FILE_SIZE).fill(null),
              `horarios.pdf, ${FILE_SIZE} bytes`,
            ),
            { id: "f-file", title: "Dados do arquivo", summary: "Pela conexão de dados." },
          ),
          detail: `${FILE_SIZE} bytes`,
        });
        c.send("srv", "lia", "FIN", { dt: 0, via: ["gw"], role: "muted", frame: dat.fin(false, "f-d-fin") });
        c.row("conns", 1, ["dados", `${LIA.ip}:${dataPort}`, `${FTP_SRV.ip}:${PASV_PORT}`, "fechada"], {
          mark: "hit",
          label: "Arquivo completo",
        });
        say(false, `226 transferencia completa${CRLF}`, "226");
      }
    },
  );

  b.step(
    {
      id: "s4-seguranca",
      title: "Tudo à vista",
      subtitle: "Senha e arquivo sem cifra",
      text: "Quem estiver no caminho leu a senha da Lia e o arquivo inteiro. O FTP é de 1985 e não tem cifra. Existem duas saídas: o FTPS, que põe TLS nas duas conexões, e o SFTP, que é outro protocolo, feito sobre o SSH e com uma conexão só. Hoje quase sempre se usa SFTP ou HTTPS para transferir arquivos.",
      facts: [
        ["Senha", "visível"],
        ["Alternativas", "SFTP (sobre SSH), FTPS (com TLS)"],
      ],
      highlight: ["gw"],
    },
    () => {
      c.note("gw", "senha e arquivo em claro", "bad", { dt: 1 });
      say(true, `QUIT${CRLF}`, "QUIT");
      say(false, `221 ate logo${CRLF}`, "221");
    },
  );

  return b.done({ pasv: PASV_PORT, file: FILE_SIZE, ativo: ativo ? 1 : 0 });
}

const lesson: LessonModule = {
  meta: {
    slug: "ftp",
    site: "redes",
    title: "FTP: duas conexões para um arquivo",
    summary:
      "A conexão de controle com comandos em texto, a conexão de dados de cada transferência e por que o modo passivo venceu.",
    area: "Aplicação",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 7,
        section: "7.3.1",
        note: "Visão geral da arquitetura da Web (outros protocolos)",
        verified: true,
      },
      { rfc: 959, note: "FTP" },
      { rfc: 1579, note: "FTP amigável a firewalls (PASV)" },
    ],
    simplifications: [
      "Sem os comandos TYPE e PWD que os clientes costumam mandar.",
      "O conteúdo do arquivo aparece como bytes desconhecidos.",
      "No modo ativo, a lição mostra uma tentativa só; o servidor costuma insistir antes do 425.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "modo",
        kind: "choice",
        label: "Modo da conexão de dados",
        options: [
          { value: "passivo", label: "Passivo (PASV)" },
          { value: "ativo", label: "Ativo (PORT)" },
        ],
      },
    ],
  },
  build,
  intro: {
    text: "O FTP é um dos protocolos mais antigos da internet ainda em uso, e tem um desenho incomum: uma conexão para conversar e outra, nova, para cada arquivo. Você vai baixar um arquivo com a Lia, ver como a porta de dados é combinada e descobrir por que o NAT quebra um dos modos.",
    facts: [
      ["Servidor", `${FTP_SRV.host} (${FTP_SRV.ip})`],
      ["Arquivo", "horarios.pdf"],
      ["Portas", "21 (controle) e uma porta de dados"],
    ],
  },
  outro: {
    title: "FTP em resumo",
    text: "O controle fica numa conexão na porta 21; cada transferência abre uma conexão de dados, combinada por PASV ou PORT. Sem cifra e com essa segunda conexão, ele perdeu espaço para SFTP e HTTPS.",
    facts: (run) => [
      ["Porta de dados (PASV)", String(run.stats.pasv)],
      ["Arquivo", `${run.stats.file} bytes`],
    ],
  },
  next: ["ssh", "nat"],
  practice,
};

export default lesson;
