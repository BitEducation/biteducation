import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { type Call, type Outcome, serve } from "../../../sim/net/sockets.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { seqScene, talk } from "../../../sim/shared/seq.ts";

/**
 * Berkeley sockets: the library server prepares a listening socket (backlog 2), blocks in
 * accept, gets Lia, then three clients arrive while it is busy and the third is ignored.
 */
const DEFAULTS = { backlog: 2 };
const LATE = ["Malu", "Caio", "Rui"];

function backlogOf(p: Params): number {
  return Math.min(3, Math.max(1, Math.round(Number(p.backlog ?? DEFAULTS.backlog))));
}

const calls = (backlog: number): Call[] => [
  { op: "listen", backlog },
  { op: "accept" },
  { op: "connect", client: "Lia" },
  { op: "connect", client: "Malu" },
  { op: "connect", client: "Caio" },
  { op: "connect", client: "Rui" },
  { op: "accept" },
];

function scene(p: Params): SceneSpec {
  const BACKLOG = backlogOf(p);
  return seqScene(
    [
      { id: "lia", kind: "laptop", label: "Lia", sub: "cliente" },
      { id: "outros", kind: "laptop", label: "Malu, Caio, Rui", sub: "clientes" },
      { id: "kernel", kind: "kernel", label: "Núcleo do servidor", sub: "TCP, porta 8080" },
      { id: "app", kind: "process", label: "Programa servidor", sub: "biblioteca" },
    ],
    {
      height: 600,
      widgets: [
        {
          kind: "table",
          id: "chamadas",
          title: "Chamadas do programa servidor",
          at: [40, 240],
          columns: ["Chamada", "O que faz", "Retorna"],
          widths: [190, 330, 150],
          rows: 6,
        },
        {
          kind: "table",
          id: "fila",
          title: `Prontas (backlog ${BACKLOG})`,
          at: [740, 240],
          columns: ["Cliente"],
          widths: [180],
          rows: BACKLOG,
        },
        { kind: "counter", id: "socks", title: "Sockets no servidor", at: [740, 400] },
      ],
    },
  );
}

export function build(p: Params = DEFAULTS) {
  const BACKLOG = backlogOf(p);
  const b = lessonBuilder();
  const c = talk(b, { lia: "Lia", outros: "Clientes", kernel: "Núcleo", app: "Servidor" });
  const out = serve(calls(BACKLOG));
  const o = (i: number) => out[i] as Outcome;
  const fila = (q: string[]) => {
    for (let i = 0; i < BACKLOG; i++)
      c.row("fila", i, [q[i] ?? ""], { dt: 0, ...(q[i] ? { mark: "new" as const } : {}) });
  };
  const socks = (n: number) => c.count("socks", String(n), { dt: 0, label: `${n} sockets` });
  const ignored = out.filter((x) => x.result === "ignored").map((x) => (x.call as { client: string }).client);
  const lastFd = o(6).fd ?? 0;
  const queued = LATE.filter((n) => !ignored.includes(n));
  const list = (xs: string[]) =>
    xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`;
  const lostText = ignored.length
    ? `${list(ignored)} ${ignored.length > 1 ? "encontram" : "encontra"} a fila cheia e o SYN é ignorado; o TCP do cliente tenta de novo em um segundo.`
    : "Todos cabem, e ninguém é ignorado.";

  b.step(
    {
      id: "s1-preparar",
      title: "Preparar a escuta",
      subtitle: "socket, bind, listen",
      text: `Um [[socket]] é a ponta de uma conexão vista pelo programa. O servidor da biblioteca cria um com socket(), prende-o à porta 8080 com bind() e chama listen(), dizendo ao núcleo que aceite conexões e guarde até ${BACKLOG} já prontas numa fila, o [[backlog]]. Nenhuma dessas chamadas espera nada: elas só configuram o núcleo. A partir daqui o núcleo responde sozinho aos handshakes que chegarem na porta 8080.`,
      facts: [
        ["socket()", "cria a ponta"],
        ["bind()", "porta 8080"],
        ["listen()", `fila de ${BACKLOG}`],
      ],
      highlight: ["kernel", "app"],
    },
    () => {
      c.send("app", "kernel", "socket()", { role: "ctrl", detail: "descritor 3" });
      c.row("chamadas", 0, ["socket()", "cria um socket TCP", "descritor 3"], { dt: 0, mark: "new" });
      c.send("app", "kernel", "bind(8080)", { role: "ctrl" });
      c.row("chamadas", 1, ["bind(3, porta 8080)", "associa à porta", "0, sucesso"], { dt: 0, mark: "new" });
      c.send("app", "kernel", `listen(${BACKLOG})`, { role: "ctrl" });
      c.row("chamadas", 2, [`listen(3, ${BACKLOG})`, "passa a aceitar conexões", "0, sucesso"], {
        dt: 0,
        mark: "new",
      });
      socks(o(0).sockets);
    },
  );

  b.step(
    {
      id: "s2-accept",
      title: "accept espera",
      subtitle: "Ninguém chegou ainda",
      text: "O servidor chama accept(), que pega a próxima conexão pronta da fila. A fila está vazia, então o núcleo bloqueia o processo: ele dorme, sem gastar CPU, até alguém conectar. Do outro lado, Lia cria o próprio socket e chama connect() para a porta 8080. O núcleo de Lia e o do servidor fazem o [[handshake]] de três vias sem que o programa servidor execute uma única instrução.",
      facts: [
        ["accept()", "bloqueia"],
        ["Fila", "vazia"],
        ["Handshake", "feito pelos núcleos"],
      ],
      highlight: ["lia", "kernel"],
    },
    () => {
      c.send("app", "kernel", "accept()", { role: "ctrl", detail: "fila vazia: dorme" });
      c.state("app", "bloqueado em accept()", { tone: "warn", label: "dormindo" });
      c.send("lia", "kernel", "SYN", { role: "a", detail: "connect(8080)" });
      c.send("kernel", "lia", "SYN-ACK", { role: "b" });
      c.send("lia", "kernel", "ACK", { role: "a" });
    },
  );

  b.step(
    {
      id: "s3-novo-socket",
      title: "Um socket por conexão",
      subtitle: `accept devolve o descritor ${o(2).fd}`,
      text: `Com o handshake completo, o núcleo acorda o servidor, e accept() devolve um socket novo, o descritor ${o(2).fd}, ligado só a Lia. O socket 3 continua escutando a porta 8080. É assim que um servidor atende muitos clientes na mesma porta: cada conexão tem o seu socket, identificado pelos dois endereços e pelas duas portas. Agora são ${o(2).sockets} sockets no servidor.`,
      facts: [
        ["Socket de escuta", "3"],
        ["Socket de Lia", String(o(2).fd)],
        ["Sockets", String(o(2).sockets)],
      ],
      highlight: ["kernel", "app"],
      quiz: {
        kind: "choice",
        prompt: "Depois do accept(), por qual socket o servidor fala com Lia?",
        options: [
          `Pelo novo, descritor ${o(2).fd}`,
          "Pelo socket 3, o de escuta",
          "Por um socket que Lia envia",
        ],
        answer: 0,
        explain: `accept() cria um socket para cada conexão; o 3 só recebe conexões novas. Por isso o servidor tem ${o(2).sockets} sockets.`,
      },
    },
    () => {
      c.send("kernel", "app", `accept() = ${o(2).fd}`, { role: "b", detail: "conexão com Lia" });
      c.row("chamadas", 3, ["accept(3)", "pega a próxima conexão", `descritor ${o(2).fd}`], {
        dt: 0,
        mark: "hit",
      });
      socks(o(2).sockets);
    },
  );

  b.step(
    {
      id: "s4-fila",
      title: "A fila tem tamanho",
      subtitle: ignored.length ? `${list(ignored)} sem resposta` : "Todos cabem na fila",
      text: `Enquanto o servidor atende Lia, chegam Malu, Caio e Rui. O núcleo completa os handshakes de ${list(queued)} e os guarda na fila de ${BACKLOG}. ${lostText} Quando o servidor chama accept() outra vez, recebe ${queued[0]} no descritor ${lastFd}, sem esperar, e abre uma vaga na fila.`,
      facts: [
        ["Na fila", queued.join(", ")],
        ["Ignorados", ignored.length ? ignored.join(", ") : "nenhum"],
        ["Próximo accept()", `descritor ${lastFd}`],
      ],
      highlight: ["outros", "kernel"],
      quiz: {
        kind: "number",
        prompt: `Com backlog ${BACKLOG}, quantos dos três clientes que chegam enquanto Lia é atendida têm o SYN ignorado?`,
        answer: ignored.length,
        tolerance: 0,
        explain: `O servidor está ocupado com Lia, então só a fila recebe conexões: cabem ${BACKLOG}, e ${ignored.length} ${ignored.length === 1 ? "fica" : "ficam"} de fora.`,
      },
    },
    () => {
      for (const i of [3, 4, 5]) {
        const x = o(i);
        const who = (x.call as { client: string }).client;
        c.send("outros", "kernel", `SYN de ${who}`, {
          role: x.result === "ignored" ? "bad" : "a",
          detail: x.result === "ignored" ? "fila cheia: ignorado" : "na fila",
          ...(x.result === "ignored" ? { lost: true } : {}),
        });
        fila(x.queue);
      }
      c.send("app", "kernel", "accept()", { role: "ctrl" });
      c.send("kernel", "app", `accept() = ${lastFd}`, { role: "b", detail: `${queued[0]}, sem esperar` });
      c.row("chamadas", 4, ["accept(3)", "fila não vazia: não espera", `descritor ${lastFd}`], {
        dt: 0,
        mark: "hit",
      });
      fila(o(6).queue);
      socks(o(6).sockets);
    },
  );

  b.step(
    {
      id: "s5-dados",
      title: "Ler, escrever, fechar",
      subtitle: "recv devolve 0 no fim",
      text: "Com o socket da conexão, o servidor usa recv() e send(), ou read() e write(), como se fosse um arquivo. recv() também bloqueia quando ainda não chegou nada. Quando Lia termina, chama close(); o núcleo dela manda FIN, e o recv() do servidor devolve 0, o sinal de fim. O servidor fecha o seu lado, e o socket de escuta segue pronto para os próximos.",
      facts: [
        ["Ler", "recv() ou read()"],
        ["Fim", "recv() devolve 0"],
        ["Escuta", "continua aberta"],
      ],
      highlight: ["lia", "app"],
    },
    () => {
      c.send("lia", "kernel", "GET /livros", { role: "a", detail: "send()" });
      c.send("kernel", "app", "recv()", { role: "a" });
      c.send("app", "lia", "200 OK", { role: "b", detail: "send()" });
      c.send("lia", "kernel", "FIN", { role: "ctrl", detail: "close()" });
      c.row("chamadas", 5, ["recv(4)", "Lia fechou", "0, fim"], { dt: 0, mark: "new" });
    },
  );

  return b.done(
    { ignored: ignored.join(",") || "nenhum", sockets: o(6).sockets, lastFd },
    BACKLOG === DEFAULTS.backlog
      ? []
      : [
          `Com backlog ${BACKLOG}, ${ignored.length ? `${list(ignored)} ${ignored.length > 1 ? "ficam" : "fica"} sem resposta na primeira tentativa` : "os três clientes cabem na fila"}.`,
        ],
  );
}

const lesson: LessonModule = {
  meta: {
    slug: "sockets",
    site: "redes",
    title: "Sockets: a interface do programa com a rede",
    summary:
      "socket, bind, listen, accept e connect; a fila de conexões prontas e um socket novo por cliente.",
    area: "Transporte",
    refs: [
      { book: "tanenbaum-cn", chapter: 6, section: "6.1.3", note: "Soquetes de Berkeley", verified: true },
      {
        url: "https://pubs.opengroup.org/onlinepubs/9799919799/functions/listen.html",
        title: "POSIX listen()",
      },
    ],
    simplifications: [
      "O backlog é exato; no Linux ele é ajustado e há uma fila separada para handshakes incompletos.",
      "O servidor atende um cliente por vez; servidores reais usam threads ou E/S assíncrona.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [{ key: "backlog", kind: "int", label: "Backlog do listen()", min: 1, max: 3 }],
  },
  build,
  intro: {
    text: "Um programa não fala TCP sozinho: ele pede ao núcleo por meio de sockets. Você vai acompanhar as chamadas do servidor da biblioteca, ver quais delas fazem o programa esperar e o que acontece quando chegam mais clientes do que a fila comporta.",
    facts: [
      ["Porta", "8080"],
      ["Backlog", String(DEFAULTS.backlog)],
      ["Clientes", "4"],
    ],
  },
  outro: {
    title: "Sockets em resumo",
    text: "O servidor prepara um socket de escuta e chama accept(), que devolve um socket novo por conexão. O núcleo faz os handshakes e guarda as conexões prontas numa fila limitada; quem chega com a fila cheia tenta de novo.",
    facts: (run) => [
      ["Sockets no servidor", String(run.stats.sockets)],
      ["Ignorado com a fila cheia", String(run.stats.ignored)],
      ["Último descritor", String(run.stats.lastFd)],
    ],
  },
  next: ["tcp-conexao", "syn-flood"],
};

export default lesson;
