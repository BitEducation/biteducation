import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { copies, type Message, pipeRun, receiveOrder } from "../../../sim/os/ipc.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { ipc as practice } from "../practice.ts";

/**
 * Inter-process communication: `ls | grep` through a pipe (bounded buffer, blocking on both
 * ends, EOF when the writer closes), a message queue with priorities, and shared memory, which
 * skips the copies but leaves synchronization to the processes.
 */
export const DEFAULTS = { blocos: 8, capacidade: 4, leitura: 3 };
const CHUNK_KIB = 4;
const MESSAGES: Message[] = [
  { text: "log", prio: 1 },
  { text: "pedido", prio: 5 },
  { text: "alarme", prio: 9 },
];

function clamp(p: Params) {
  const n = (k: keyof typeof DEFAULTS, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, Math.round(Number(p[k] ?? DEFAULTS[k]))));
  return { chunks: n("blocos", 6, 12), cap: n("capacidade", 2, 6), every: n("leitura", 2, 4) };
}

function scene(p: Params): SceneSpec {
  const { cap } = clamp(p);
  return {
    viewBox: [960, 560],
    zones: [{ id: "k", title: "Kernel", rect: { x: 300, y: 30, w: 360, h: 230 }, tone: "kernel" }],
    nodes: [
      { id: "ls", kind: "process", label: "ls", sub: "escreve no fd 1", at: [130, 110], w: 160 },
      { id: "pipe", kind: "kernel", label: "Pipe", sub: "buffer no kernel", at: [480, 90], w: 170 },
      { id: "grep", kind: "process", label: "grep .txt", sub: "lê do fd 0", at: [830, 110], w: 160 },
    ],
    links: [
      { id: "l1", from: "ls", to: "pipe" },
      { id: "l2", from: "pipe", to: "grep" },
    ],
    widgets: [
      {
        kind: "queue",
        id: "buf",
        title: `Buffer: ${cap} blocos de ${CHUNK_KIB} KiB`,
        at: [330, 160],
        capacity: cap,
      },
      { kind: "counter", id: "copiados", title: "KiB copiados entre usuário e kernel", at: [40, 200] },
      {
        kind: "table",
        id: "cmp",
        title: "Três jeitos de passar dados",
        at: [40, 310],
        columns: ["Mecanismo", "Cópias por dado", "Fronteiras", "Sincronização"],
        widths: [190, 200, 220, 260],
        rows: 3,
      },
    ],
  };
}

export function build(p: Params) {
  const { chunks, cap, every } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, { ls: "ls", grep: "grep", pipe: "pipe" }, (t) => `t${t}`);
  const ticks = pipeRun(chunks, cap, every);
  const firstBlock = ticks.find((x) => x.writerBlocked)?.t ?? 0;
  const closeAt = ticks.find((x) => x.closed)?.t ?? 0;
  const end = ticks[ticks.length - 1]?.t ?? 0;
  const blockedTicks = ticks.filter((x) => x.writerBlocked).length;
  const kib = chunks * CHUNK_KIB;
  let copied = 0;

  const play = (from: number, to: number) => {
    const span = ticks.filter((k) => k.t >= from && k.t <= to);
    for (const x of span) {
      c.at(x.t - 1);
      if (x.wrote) {
        c.send("ls", "pipe", `bloco ${x.wrote}`, { detail: `write(): ${CHUNK_KIB} KiB para o kernel` });
        b.ev({
          t: c.t,
          kind: "enqueue",
          queue: "buf",
          item: `b${x.wrote}`,
          itemRole: "a",
          role: "a",
          label: `bloco ${x.wrote} no buffer`,
        });
        copied += CHUNK_KIB;
      }
      if (x.writerBlocked) c.state("ls", "bloqueado: buffer cheio", { tone: "bad", dt: x.wrote ? 0 : 1 });
      if (x.read) {
        b.ev({
          t: c.t,
          kind: "dequeue",
          queue: "buf",
          item: `b${x.read}`,
          role: "b",
          label: `bloco ${x.read} sai`,
        });
        c.send("pipe", "grep", `bloco ${x.read}`, {
          role: "b",
          dt: 0,
          detail: `read(): ${CHUNK_KIB} KiB para o grep`,
        });
        copied += CHUNK_KIB;
      }
      if (x.readerBlocked) c.state("grep", "bloqueado: buffer vazio", { tone: "warn", dt: 0 });
      if (x.closed) c.state("ls", "terminou: fecha o fd 1", { tone: "good", dt: 0 });
      if (x.eof) c.state("grep", "read() devolve 0: fim", { tone: "good", dt: x.read ? 0 : 1 });
      c.count("copiados", String(copied), { label: `${copied} KiB copiados` });
    }
    return span.length;
  };

  b.step(
    {
      id: "s1-shell",
      title: "Um cano entre dois",
      subtitle: "ls | grep .txt",
      text: `Ao ler \`ls | grep .txt\`, o shell chama [[pipe|pipe()]] antes de criar os filhos. O kernel devolve dois descritores: uma ponta de escrita e uma de leitura, ligadas a um buffer dentro do kernel. Depois do [[fork]], o ls troca a sua saída padrão pela ponta de escrita e o grep troca a entrada padrão pela de leitura. Nenhum dos dois sabe que fala com outro programa: cada um só usa write() e read().`,
      facts: [
        ["Comando", "ls | grep .txt"],
        ["Buffer", `${cap} blocos de ${CHUNK_KIB} KiB`],
        ["Saída do ls", `${chunks} blocos`],
      ],
      highlight: ["pipe", "buf"],
    },
    () => {
      c.state("pipe", "criado: fd 3 lê, fd 4 escreve", { tone: "active" });
      c.state("ls", "fd 1 = ponta de escrita", { dt: 0 });
      c.state("grep", "fd 0 = ponta de leitura", { dt: 0 });
    },
  );

  b.step(
    {
      id: "s2-enche",
      title: "O buffer enche",
      subtitle: firstBlock ? `ls bloqueia em t${firstBlock}` : "o grep acompanha",
      text: firstBlock
        ? `O ls escreve um bloco por tick; o grep só consegue ler um a cada ${every}. Os blocos se acumulam no buffer, e em t${firstBlock} ele está cheio. O write() seguinte não falha nem descarta nada: o kernel põe o ls para dormir até haver espaço. É o mesmo [[buffer-limitado]] do produtor e consumidor, só que a sincronização vem pronta.`
        : `O ls escreve um bloco por tick; o grep lê um a cada ${every}. Os blocos se acumulam, mas com ${cap} vagas e só ${chunks} blocos o buffer não chega a encher: o ls termina sem esperar. Diminua a capacidade no Laboratório para ver o kernel pôr o ls para dormir quando o [[buffer-limitado]] enche.`,
      facts: [
        ["Escrita", "1 bloco por tick"],
        ["Leitura", `1 bloco a cada ${every} ticks`],
        ["Cheio em", firstBlock ? `t${firstBlock}` : "nunca"],
      ],
      highlight: ["buf", "ls"],
      quiz: {
        kind: "choice",
        prompt: "O buffer do pipe está cheio e o ls quer escrever mais um bloco. O que acontece?",
        options: [
          "O ls dorme até o grep ler e abrir espaço",
          "O kernel descarta o bloco mais antigo",
          "O write() falha e o ls termina com erro",
        ],
        answer: 0,
        explain:
          "Num pipe, o escritor bloqueia quando o buffer enche e o leitor bloqueia quando ele esvazia. Nada se perde: o mais rápido espera o mais lento.",
      },
    },
    () => play(1, firstBlock || closeAt),
  );

  b.step(
    {
      id: "s3-ritmo",
      title: "No ritmo do mais lento",
      subtitle: `${blockedTicks} ticks de espera`,
      text: `${blockedTicks ? `Cada leitura do grep abre uma vaga, o kernel acorda o ls, e ele escreve mais um bloco. O ls passa ${blockedTicks} ticks dormindo, sem gastar CPU.` : "O ls nunca precisou dormir: o buffer absorveu toda a diferença de ritmo."} Repare nas cópias: cada bloco é copiado do ls para o kernel no write() e do kernel para o grep no read(). Para ${kib} KiB, o contador termina em ${copies("pipe", kib)} KiB copiados.`,
      facts: [
        ["ls dormindo", `${blockedTicks} ticks`],
        ["Termina de escrever", `t${closeAt}`],
        ["Cópias", "duas por bloco"],
      ],
      highlight: ["ls", "grep", "copiados"],
    },
    () => {
      if (!play((firstBlock || closeAt) + 1, closeAt)) {
        c.at(closeAt);
        c.state("ls", "já terminou de escrever", { tone: "good" });
      }
    },
  );

  b.step(
    {
      id: "s4-fim",
      title: "Fim de arquivo",
      subtitle: `read() devolve 0 em t${end}`,
      text: `Em t${closeAt} o ls escreve o último bloco, termina, e a ponta de escrita é fechada. O grep continua lendo o que sobrou no buffer. Quando ele esvazia, o read() não bloqueia mais: devolve 0 bytes, o sinal de fim de arquivo, porque ninguém mais pode escrever. Se o shell tivesse esquecido uma ponta de escrita aberta, o grep esperaria para sempre.`,
      facts: [
        ["Último bloco lido", `t${end - every}`],
        ["Fim visto em", `t${end}`],
        ["Copiado", `${copies("pipe", kib)} KiB`],
      ],
      highlight: ["grep", "buf"],
      quiz: {
        kind: "choice",
        prompt:
          "O ls já fechou a ponta de escrita e o buffer esvaziou. O que o próximo read() do grep devolve?",
        options: [
          "0 bytes: fim de arquivo",
          "Nada: o grep bloqueia esperando mais dados",
          "Um erro, porque o ls não existe mais",
        ],
        answer: 0,
        explain:
          "Com todas as pontas de escrita fechadas, o kernel sabe que nada mais virá. O read() devolve 0, e o grep termina normalmente.",
      },
    },
    () => play(closeAt + 1, end),
  );

  const order = receiveOrder(MESSAGES);
  b.step(
    {
      id: "s5-fila",
      title: "Mensagens com prioridade",
      subtitle: "Uma fila de mensagens",
      text: `O pipe é um fluxo de bytes: duas escritas de 10 bytes podem chegar como uma leitura de 20. Uma [[fila-de-mensagens]] guarda mensagens inteiras, cada uma com a sua fronteira, e pode ter prioridade. O monitor manda "${MESSAGES.map((m) => m.text).join('", "')}", com prioridades ${MESSAGES.map((m) => m.prio).join(", ")}. O receptor tira primeiro a mais urgente: ${order.map((m) => m.text).join(", ")}. As cópias continuam duas por mensagem.`,
      facts: [
        ["Enviadas", MESSAGES.map((m) => m.text).join(", ")],
        ["Recebidas", order.map((m) => m.text).join(", ")],
        ["Fronteiras", "preservadas"],
      ],
      highlight: ["cmp"],
      quiz: {
        kind: "choice",
        prompt: `A fila recebeu "log" (prioridade 1), "pedido" (5) e "alarme" (9), nesta ordem. Qual sai primeiro?`,
        options: ["alarme", "log", "pedido"],
        answer: 0,
        explain:
          "A fila entrega a maior prioridade primeiro; entre iguais, a mais antiga. A ordem de chegada só desempata.",
      },
    },
    () => {
      c.at(end + 1);
      c.row("cmp", 0, ["pipe", "2 (write e read)", "não: fluxo de bytes", "o kernel bloqueia"], {
        mark: "new",
        dt: 1,
      });
      c.row(
        "cmp",
        1,
        ["fila de mensagens", "2 (send e receive)", "sim, com prioridade", "o kernel bloqueia"],
        {
          mark: "new",
          dt: 1,
          log: { who: "fila", what: "recebe", detail: order.map((m) => `${m.text} (${m.prio})`).join(", ") },
        },
      );
    },
  );

  b.step(
    {
      id: "s6-compartilhada",
      title: "Memória compartilhada",
      subtitle: "Zero cópias, sincronia por sua conta",
      text: `Na [[memoria-compartilhada]], o kernel mapeia os mesmos quadros físicos no espaço de endereçamento dos dois processos. Depois disso, escrever um dado é uma instrução comum: nenhuma chamada de sistema e nenhuma cópia, 0 KiB contra ${copies("pipe", kib)} no pipe. É o mecanismo mais rápido para grandes volumes. O preço é que ninguém mais bloqueia por você: os processos precisam de [[semaforo|semáforos]] ou travas para não ler um dado pela metade.`,
      facts: [
        ["Cópias", "0"],
        ["Chamadas por dado", "nenhuma"],
        ["Sincronização", "do programador"],
      ],
      highlight: ["cmp"],
    },
    () => {
      c.row("cmp", 2, ["memória compartilhada", "0", "o programa decide", "semáforos, por conta própria"], {
        mark: "hit",
        dt: 1,
        log: { who: "kernel", what: "mapeia a mesma página", detail: "nos dois processos" },
      });
    },
  );

  return b.done({
    firstBlock,
    closeAt,
    end,
    blocked: blockedTicks,
    copied: copies("pipe", kib),
    order: order.map((m) => m.text).join(","),
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "ipc",
    site: "so",
    title: "Comunicação entre processos: pipe, fila e memória compartilhada",
    summary:
      "O pipe de ls | grep bloqueia quem escreve e quem lê, sinaliza o fim com read() igual a 0 e copia tudo duas vezes. A fila de mensagens guarda fronteiras e prioridades; a memória compartilhada não copia nada, mas exige sincronização.",
    area: "Processos",
    refs: [
      { book: "maziero-so", chapter: 9, section: "9.1", note: "Pipes", verified: true },
      { book: "maziero-so", chapter: 9, section: "9.2", note: "Filas de mensagens", verified: true },
      { book: "maziero-so", chapter: 9, section: "9.3", note: "Memória compartilhada", verified: true },
      { book: "tanenbaum-mos", chapter: 2, section: "2.3.8", note: "Troca de mensagens", verified: true },
    ],
    simplifications: [
      "O tempo anda em ticks inteiros, e cada write() e read() move exatamente um bloco.",
      `O buffer tem poucos blocos; no Linux um pipe guarda 64 KiB por padrão.`,
      "A fila de mensagens segue o modelo POSIX (prioridade maior primeiro); a fila System V escolhe por tipo.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "blocos", kind: "int", label: "Blocos que o ls escreve", min: 6, max: 12 },
      { key: "capacidade", kind: "int", label: "Capacidade do buffer (blocos)", min: 2, max: 6 },
      { key: "leitura", kind: "int", label: "O grep lê um bloco a cada (ticks)", min: 2, max: 4 },
    ],
  },
  build,
  intro: {
    text: "Processos não enxergam a memória uns dos outros. Para cooperar, eles pedem ao kernel um canal. Você vai seguir os blocos de um `ls | grep` por dentro de um pipe e comparar com uma fila de mensagens e com memória compartilhada.",
    facts: [
      ["Comando", "ls | grep .txt"],
      ["Buffer", `${DEFAULTS.capacidade} blocos`],
      ["Mecanismos", "pipe, fila, memória compartilhada"],
    ],
  },
  outro: {
    title: "IPC em resumo",
    text: "Um pipe é um buffer limitado no kernel: quem escreve dorme quando ele enche, quem lê dorme quando ele esvazia, e o fim chega como read() igual a 0. Filas de mensagens preservam fronteiras e prioridades. Pipe e fila copiam cada dado duas vezes; a memória compartilhada não copia nada, mas deixa a sincronização para os processos.",
    facts: (run) => [
      ["ls dormindo", `${run.stats.blocked} ticks`],
      ["Fim de arquivo", `t${run.stats.end}`],
      ["Copiado pelo pipe", `${run.stats.copied} KiB`],
    ],
  },
  next: ["produtor-consumidor", "monitores", "mmap"],
  practice,
};

export default lesson;
