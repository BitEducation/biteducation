import type { LessonModule } from "../../../contracts/types.ts";
import { type Action, type Event, ORDER, run, SIG, type SigName } from "../../../sim/os/signals.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { seqScene, talk } from "../../../sim/shared/seq.ts";

/**
 * UNIX signals: the editor installs handlers, gets a Ctrl+C, blocks SIGUSR1 while two arrive
 * (they merge into one), is asked politely to stop with SIGTERM, and finally receives SIGKILL,
 * which no handler can stop.
 */
const ACTIONS: Action[] = [
  { op: "handle", sig: "SIGINT", handler: "salvar rascunho" },
  { op: "handle", sig: "SIGUSR1", handler: "recarregar configuração" },
  { op: "send", sig: "SIGINT", from: "terminal" },
  { op: "block", sig: "SIGUSR1" },
  { op: "send", sig: "SIGUSR1", from: "admin" },
  { op: "send", sig: "SIGUSR1", from: "admin" },
  { op: "unblock", sig: "SIGUSR1" },
  { op: "handle", sig: "SIGTERM", handler: "salvar e fechar arquivos" },
  { op: "send", sig: "SIGTERM", from: "admin" },
  { op: "handle", sig: "SIGKILL", handler: "ignorar" },
  { op: "send", sig: "SIGKILL", from: "admin" },
];
const STEPS = [[0, 1, 2], [3, 4, 5], [6], [7, 8], [9, 10]];

const scene = seqScene(
  [
    { id: "terminal", kind: "laptop", label: "Terminal", sub: "Ctrl+C" },
    { id: "admin", kind: "process", label: "Outro processo", sub: "kill" },
    { id: "kernel", kind: "kernel", label: "Núcleo", sub: "pendentes e máscara" },
    { id: "editor", kind: "process", label: "Editor", sub: "PID 4242" },
    { id: "shell", kind: "process", label: "Shell", sub: "processo pai" },
  ],
  {
    height: 560,
    links: "none",
    widgets: [
      {
        kind: "table",
        id: "sinais",
        title: "O que o núcleo guarda para o editor",
        at: [40, 250],
        columns: ["Sinal", "Nº", "Pendente", "Bloqueado", "Ao chegar"],
        widths: [140, 60, 120, 120, 260],
        rows: ORDER.length,
      },
      { kind: "counter", id: "tratados", title: "Execuções de tratador", at: [780, 260] },
    ],
  },
);

export function build() {
  const b = lessonBuilder();
  const c = talk(b, {
    terminal: "Terminal",
    admin: "Outro processo",
    kernel: "Núcleo",
    editor: "Editor",
    shell: "Shell",
  });
  const ev = run(ACTIONS);
  const disp = new Map<SigName, string>();
  let handled = 0;
  const DEF: Record<SigName, string> = {
    SIGINT: "padrão: termina",
    SIGKILL: "sempre termina",
    SIGUSR1: "padrão: termina",
    SIGTERM: "padrão: termina",
    SIGCHLD: "padrão: ignora",
  };
  const table = (e: Event, touched: SigName | null) => {
    ORDER.forEach((s, i) => {
      if (touched && s !== touched) return;
      c.row(
        "sinais",
        i,
        [
          s,
          String(SIG[s]),
          e.pending.includes(s) ? "sim" : "",
          e.blocked.includes(s) ? "sim" : "",
          disp.get(s) ?? DEF[s],
        ],
        { dt: 0, ...(touched ? { mark: e.pending.includes(s) ? ("warn" as const) : ("new" as const) } : {}) },
      );
    });
  };
  const play = (i: number) => {
    const a = ACTIONS[i] as Action;
    const e = ev[i] as Event;
    const sig = "sig" in a ? a.sig : null;
    if (a.op === "handle") {
      if (!e.refused) disp.set(a.sig, `tratador: ${a.handler}`);
      c.send("editor", "kernel", `sigaction(${a.sig})`, {
        role: e.refused ? "bad" : "a",
        detail: e.refused ? "recusado: SIGKILL não aceita tratador" : `instala "${a.handler}"`,
      });
    } else if (a.op === "block" || a.op === "unblock") {
      c.send("editor", "kernel", `${a.op === "block" ? "bloqueia" : "desbloqueia"} ${a.sig}`, {
        role: "ctrl",
        detail: "sigprocmask",
      });
    } else if (a.op === "send") {
      c.send(a.from, "kernel", a.sig, {
        role: a.sig === "SIGKILL" ? "bad" : "b",
        detail: e.merged ? "já havia um pendente: os dois viram um" : "marcado como pendente",
      });
    }
    if (sig) table(e, sig);
    for (const d of e.delivered) {
      const viaHandler = d.result !== "termina";
      if (viaHandler) handled++;
      c.send("kernel", "editor", d.sig, {
        role: viaHandler ? "a" : "bad",
        detail: viaHandler
          ? `na volta ao modo usuário: roda "${d.result}"`
          : "ação padrão: o processo termina",
      });
      table(e, d.sig);
      if (viaHandler) c.count("tratados", String(handled), { role: "a", label: `${handled} tratadores` });
      else {
        c.state("editor", "terminado", { dt: 0, tone: "bad", label: "editor terminado" });
        c.send("kernel", "shell", "SIGCHLD", {
          role: "b",
          detail: "o filho terminou; fica zumbi até o wait()",
        });
      }
    }
  };
  const playStep = (k: number) => {
    for (const i of STEPS[k] as number[]) play(i);
  };
  const usr1 = ev.filter(
    (_e, i) => (ACTIONS[i] as Action).op === "send" && (ACTIONS[i] as { sig?: string }).sig === "SIGUSR1",
  ).length;
  const usr1Runs = ev.flatMap((e) => e.delivered).filter((d) => d.sig === "SIGUSR1").length;

  b.step(
    {
      id: "s1-ctrl-c",
      title: "Um aviso a qualquer hora",
      subtitle: "Ctrl+C vira SIGINT",
      text: "Um [[sinal]] é um aviso que o núcleo entrega a um processo sem que ele tenha pedido nada naquele momento. Ctrl+C no terminal manda SIGINT ao editor; a ação padrão é terminar. Mas o editor instalou, com sigaction(), um [[tratador-de-sinal]] que salva um rascunho. O núcleo marca o sinal como pendente e, quando o editor volta ao modo usuário, desvia a execução para o tratador; depois, o editor continua de onde parou.",
      facts: [
        ["Sinal", "SIGINT (2)"],
        ["Padrão", "termina"],
        ["Instalado", "salvar rascunho"],
      ],
      highlight: ["terminal", "kernel", "editor"],
    },
    () => {
      ORDER.forEach((s, i) => {
        c.row("sinais", i, [s, String(SIG[s]), "", "", DEF[s]], { dt: i === 0 ? 1 : 0, mark: "new" });
      });
      playStep(0);
    },
  );

  b.step(
    {
      id: "s2-bloqueio",
      title: "Bloquear não é ignorar",
      subtitle: `${usr1} SIGUSR1 enviados, 1 pendente`,
      text: `Enquanto relê a configuração, o editor não quer ser interrompido para relê-la de novo, e bloqueia SIGUSR1. O administrador manda SIGUSR1 duas vezes. Bloquear não descarta: o primeiro fica pendente. O segundo encontra o bit de pendente já ligado e se funde a ele, porque o núcleo guarda um bit por sinal, não uma fila. Para o editor, os ${usr1} envios agora são um só.`,
      facts: [
        ["Envios", String(usr1)],
        ["Pendentes", "1"],
        ["Guardado como", "um bit por sinal"],
      ],
      highlight: ["admin", "kernel"],
    },
    () => playStep(1),
  );

  b.step(
    {
      id: "s3-desbloqueio",
      title: "Desbloqueou, recebeu",
      subtitle: `O tratador roda ${usr1Runs} vez`,
      text: `Ao desbloquear SIGUSR1, o editor volta ao modo usuário com um sinal pendente e liberado, e o núcleo entrega na hora. O tratador de recarregar a configuração roda ${usr1Runs} vez, não ${usr1}. Por isso um programa não deve contar sinais para saber quantos eventos aconteceram: dois filhos que terminam juntos podem gerar um único SIGCHLD, e o pai precisa chamar wait() em laço.`,
      facts: [
        ["Envios", String(usr1)],
        ["Execuções do tratador", String(usr1Runs)],
        ["Lição", "sinais não contam"],
      ],
      highlight: ["kernel", "editor"],
      quiz: {
        kind: "number",
        prompt: `SIGUSR1 foi enviado ${usr1} vezes enquanto estava bloqueado. Quantas vezes o tratador roda depois do desbloqueio?`,
        answer: usr1Runs,
        explain:
          "O núcleo guarda só um bit de pendente por sinal; o segundo envio encontrou o bit ligado e se fundiu ao primeiro.",
      },
    },
    () => playStep(2),
  );

  b.step(
    {
      id: "s4-term",
      title: "Pedir antes de mandar",
      subtitle: "SIGTERM pode ser tratado",
      text: "O comando kill, sem opções, manda SIGTERM, número 15: um pedido para terminar. O editor instalou um tratador que salva o trabalho e fecha os arquivos, e continua vivo para decidir o que fazer. É assim que um sistema desliga: manda SIGTERM a todos, espera alguns segundos e só então manda SIGKILL a quem não saiu. Programas bem escritos tratam SIGTERM e terminam por conta própria.",
      facts: [
        ["Sinal", "SIGTERM (15)"],
        ["Tratável", "sim"],
        ["Ao desligar", "SIGTERM, espera, SIGKILL"],
      ],
      highlight: ["admin", "kernel", "editor"],
      quiz: {
        kind: "choice",
        prompt: "Por que o sistema manda SIGTERM e espera antes de mandar SIGKILL?",
        options: [
          "Para o processo salvar dados e fechar arquivos no próprio tratador",
          "Porque SIGKILL só funciona depois de um SIGTERM",
          "Porque SIGTERM é mais rápido de entregar que SIGKILL",
        ],
        answer: 0,
        explain:
          "SIGKILL termina sem rodar nada do processo. SIGTERM dá a chance de limpar antes; o SIGKILL fica para quem não responde.",
      },
    },
    () => playStep(3),
  );

  b.step(
    {
      id: "s5-kill",
      title: "SIGKILL não se trata",
      subtitle: "SIGKILL termina sempre",
      text: "O editor tenta instalar um tratador para SIGKILL, e o núcleo recusa: SIGKILL e SIGSTOP não podem ser tratados, ignorados nem bloqueados, para que sempre exista um jeito de parar um processo travado. Quando o SIGKILL chega, o editor termina sem rodar nada, nem o salvamento do rascunho. O núcleo avisa o pai com SIGCHLD, e o editor fica [[zumbi]] até o shell chamar wait().",
      facts: [
        ["Tratável", "não"],
        ["Bloqueável", "não"],
        ["Pai recebe", "SIGCHLD"],
      ],
      highlight: ["admin", "editor", "shell"],
    },
    () => playStep(4),
  );

  return b.done({ sent: usr1, usr1Runs, handled, alive: ev[ev.length - 1]?.alive ? "sim" : "não" });
}

const lesson: LessonModule = {
  meta: {
    slug: "sinais",
    site: "so",
    title: "Sinais: avisos que chegam a qualquer hora",
    summary:
      "SIGINT com tratador, dois SIGUSR1 bloqueados que viram um, o SIGTERM que pede para sair e o SIGKILL que nenhum tratador segura.",
    area: "Processos",
    refs: [
      {
        book: "tanenbaum-mos",
        chapter: 10,
        section: "10.3.2",
        note: "Processos no Linux: sinais, sigaction e SIGKILL",
        verified: true,
      },
      {
        url: "https://pubs.opengroup.org/onlinepubs/9799919799/functions/sigaction.html",
        title: "POSIX sigaction()",
      },
    ],
    simplifications: [
      "Só aparecem sinais padrão; os de tempo real (SIGRTMIN em diante) entram em fila e não se fundem.",
      "O núcleo entrega no retorno de cada chamada; também entrega ao voltar de uma interrupção.",
    ],
  },
  scene,
  params: { defaults: {} },
  build,
  intro: {
    text: "Ctrl+C, um filho que termina, um pedido para recarregar a configuração: avisos que chegam no meio de qualquer instrução. Você vai acompanhar o que o núcleo guarda para cada processo e quando ele interrompe o programa para entregar o aviso.",
    facts: [
      ["Processo", "editor"],
      ["Sinais", "SIGINT, SIGUSR1, SIGTERM, SIGKILL"],
      ["Guardado por sinal", "pendente, bloqueado, ação"],
    ],
  },
  outro: {
    title: "Sinais em resumo",
    text: "O núcleo marca um sinal como pendente e o entrega na volta ao modo usuário, rodando o tratador ou a ação padrão. Bloquear adia; sinais iguais pendentes se fundem; SIGTERM pede para sair, e SIGKILL termina o processo sem exceção.",
    facts: (run) => [
      ["SIGUSR1 enviados", String(run.stats.sent)],
      ["Tratador de SIGUSR1", `${run.stats.usr1Runs} vez`],
      ["Editor vivo no fim", String(run.stats.alive)],
    ],
  },
  next: ["fork-exec", "ipc"],
};

export default lesson;
