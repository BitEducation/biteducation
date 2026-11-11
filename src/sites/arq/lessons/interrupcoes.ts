import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import { spreadRow } from "../../../scene/geometry.ts";
import {
  EVENTS,
  HANDLE,
  HORIZON,
  irqRun,
  mean,
  pollRun,
  type Slice,
  type SliceKind,
} from "../../../sim/arch/interrupts.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { num } from "../../shared/practice-kit.ts";

/**
 * Interrupts from the hardware side: polling wastes checks and adds latency, an interrupt line
 * lets the device call the CPU, which finishes the instruction, saves PC and flags, jumps through
 * the vector table and returns. Then priorities and masking, and exceptions as the synchronous case.
 */
export const DEFAULTS = { periodo: 10 };
const ROLE: Record<SliceKind, Role> = {
  programa: "muted",
  consulta: "warn",
  tratamento: "a",
  contexto: "ctrl",
};
const SHORT: Record<SliceKind, string> = {
  programa: "prog",
  consulta: "?",
  tratamento: "trat",
  contexto: "ctx",
};

function clamp(p: Params) {
  return Math.min(40, Math.max(2, Math.round(Number(p.periodo ?? DEFAULTS.periodo))));
}

function scene(): SceneSpec {
  return {
    viewBox: [960, 600],
    nodes: [
      ...spreadRow(
        [
          { id: "dev", kind: "device", label: "Teclado", sub: "fica pronto às vezes", at: [0, 0], w: 170 },
          { id: "timer", kind: "timer", label: "Temporizador", sub: "a cada fatia", at: [0, 0], w: 170 },
          { id: "ctrl", kind: "box", label: "Controlador", sub: "de interrupções", at: [0, 0], w: 190 },
          { id: "cpu", kind: "cpu", label: "CPU", sub: "roda um programa", at: [0, 0], w: 170 },
        ],
        { x0: 20, x1: 940, y: 70, rowGap: 0 },
      ).nodes,
    ],
    links: [
      { id: "l-d", from: "dev", to: "ctrl" },
      { id: "l-t", from: "timer", to: "ctrl" },
      { id: "l-c", from: "ctrl", to: "cpu" },
    ],
    widgets: [
      {
        kind: "gantt",
        id: "cpu-t",
        title: `O que a CPU faz em ${HORIZON} ticks · ? = consulta, ctx = salvar ou restaurar`,
        at: [40, 170],
        lanes: ["Polling", "Interrupção"],
        span: HORIZON,
        width: 860,
      },
      {
        kind: "table",
        id: "passos",
        title: "Atender uma interrupção",
        at: [40, 330],
        columns: ["#", "O hardware faz"],
        widths: [50, 420],
        rows: 5,
      },
      {
        kind: "table",
        id: "cmp",
        title: `${EVENTS.length} eventos do teclado`,
        at: [540, 330],
        columns: ["Forma", "Ticks gastos", "Espera média", "Consultas à toa"],
        widths: [100, 90, 100, 110],
        rows: 2,
      },
    ],
  };
}

export function build(p: Params) {
  const period = clamp(p);
  const poll = pollRun(period);
  const irq = irqRun();
  const b = lessonBuilder();
  const c = talk(
    b,
    { dev: "teclado", timer: "temporizador", ctrl: "controlador", cpu: "CPU" },
    (t) => `t${t}`,
  );
  const draw = (lane: string, slices: Slice[]) => {
    for (const s of slices) {
      const t = c.t + 1;
      c.at(t);
      const w = s.to - s.from;
      b.ev({
        t,
        kind: "gantt",
        gantt: "cpu-t",
        lane,
        from: s.from,
        to: s.to,
        item: s.kind === "programa" ? (w >= 6 ? "prog" : "") : w * 8.6 >= 18 ? SHORT[s.kind] : "",
        itemRole: ROLE[s.kind],
        role: ROLE[s.kind],
        label: `${lane}: ${s.kind}, ticks ${s.from} a ${s.to}`,
        row: { cols: { t: `${s.from}–${s.to}`, who: lane, what: s.kind, detail: "" } },
      });
    }
  };
  const pollMean = mean(poll.latency);
  const lat = (x: number) => `${num(x, 1)} ticks`;

  b.step(
    {
      id: "s1-espera",
      title: "Um dispositivo sem hora marcada",
      subtitle: `Prontos nos ticks ${EVENTS.join(", ")}`,
      text: `A CPU roda um programa, e o teclado fica pronto em momentos que ninguém sabe de antemão: nos ticks ${EVENTS.join(", ")}. Cada vez, alguém precisa ler o código da tecla antes que chegue a próxima. A pergunta é como a CPU descobre que o teclado está pronto sem parar tudo para esperar por ele.`,
      facts: [
        ["Eventos", String(EVENTS.length)],
        ["Janela", `${HORIZON} ticks`],
        ["Tratar um evento", `${HANDLE} ticks`],
      ],
      highlight: ["dev", "cpu"],
    },
    () => {
      for (const e of EVENTS) c.state("dev", `pronto no tick ${e}`, { tone: "warn" });
    },
  );

  b.step(
    {
      id: "s2-polling",
      title: "Perguntar de tempos em tempos",
      subtitle: `A cada ${period} ticks`,
      text: `No [[polling|polling]], o programa para a cada ${period} ticks para ler o registrador de estado do teclado. Foram ${poll.checks} consultas, ${poll.wasted} delas à toa, sem nada pronto. E cada tecla espera até a próxima consulta: em média ${lat(pollMean)}. Consultar mais vezes reduz a espera e aumenta o desperdício; consultar menos, o contrário.`,
      facts: [
        ["Consultas", String(poll.checks)],
        ["À toa", String(poll.wasted)],
        ["Espera média", lat(pollMean)],
      ],
      highlight: ["cpu-t"],
      quiz: {
        kind: "number",
        prompt: `Com consultas a cada ${period} ticks, ${poll.checks} consultas e ${poll.handled} eventos encontrados, quantas consultas foram à toa?`,
        answer: poll.wasted,
        explain: `Cada consulta que encontrou alguma coisa atendeu os eventos prontos; ${poll.checks - poll.wasted} encontraram algo, então ${poll.checks} − ${poll.checks - poll.wasted} = ${poll.wasted} foram desperdício.`,
      },
    },
    () => draw("Polling", poll.slices),
  );

  b.step(
    {
      id: "s3-linha",
      title: "O dispositivo chama",
      subtitle: "Uma linha de interrupção",
      text: `Com [[interrupcao|interrupções]], o teclado avisa: liga uma linha ao controlador, que a repassa à CPU. A CPU confere essa linha no fim de cada instrução, em hardware, sem gastar nada. Enquanto ninguém chama, o programa roda direto. Quando a linha sobe, a CPU termina a instrução em andamento e vai atender: a espera é de ${irq.latency[0]} tick.`,
      facts: [
        ["Consultas", "0"],
        ["Espera", `${irq.latency[0]} tick`],
        ["Quem confere", "o hardware, a cada instrução"],
      ],
      highlight: ["ctrl", "cpu"],
    },
    () => {
      for (const e of EVENTS) {
        c.send("dev", "ctrl", "IRQ", { what: "interrupção", detail: `tick ${e}` });
        c.send("ctrl", "cpu", "IRQ 1", { what: "sinal", detail: "linha ativa" });
      }
      draw("Interrupção", irq.slices);
    },
  );

  b.step(
    {
      id: "s4-tratamento",
      title: "O que a CPU faz",
      subtitle: "Do sinal ao retorno",
      text: `Atender é uma sequência fixa. A CPU termina a instrução atual, salva o contador de programa e as flags, recebe do controlador o número da interrupção e o usa como índice na [[tabela-de-vetores|tabela de vetores]], que diz onde começa o [[tratador-de-interrupcao|tratador]]. O tratador lê a tecla, e uma instrução especial de retorno restaura o que foi salvo. O programa nem percebe.`,
      facts: [
        ["Salva", "PC e flags"],
        ["Endereço do tratador", "tabela de vetores"],
        ["Ticks por evento", String(irq.overhead / EVENTS.length)],
      ],
      highlight: ["passos"],
      quiz: {
        kind: "choice",
        prompt: "Por que a CPU salva o contador de programa antes de pular para o tratador?",
        options: [
          "Para voltar exatamente à instrução seguinte do programa interrompido",
          "Para o tratador saber qual tecla foi apertada",
          "Para que o controlador saiba que a interrupção foi atendida",
        ],
        answer: 0,
        explain:
          "O programa foi interrompido em qualquer ponto. Sem o PC e as flags salvos, não haveria como retomá-lo como se nada tivesse acontecido.",
      },
    },
    () => {
      const steps = [
        "termina a instrução em andamento",
        "salva PC e flags e passa ao modo privilegiado",
        "lê o número da interrupção no controlador",
        "busca o endereço do tratador na tabela de vetores",
        "ao fim do tratador, restaura PC e flags",
      ];
      steps.forEach((s, i) => {
        c.row("passos", i, [String(i + 1), s], { dt: 1, mark: "new" });
      });
    },
  );

  b.step(
    {
      id: "s5-prioridade",
      title: "Duas ao mesmo tempo",
      subtitle: "Prioridade e máscara",
      text: `O temporizador também interrompe, a cada fatia de tempo do escalonador. Se ele e o teclado chamam juntos, o controlador entrega primeiro a de maior prioridade e segura a outra. E o próprio núcleo pode mascarar interrupções por alguns instantes, enquanto mexe numa estrutura que um tratador também usa; ao desmascarar, as pendentes são atendidas.`,
      facts: [
        ["Quem decide a ordem", "o controlador"],
        ["Máscara", "adia, não perde"],
        ["Temporizador", "fatias do escalonador"],
      ],
      highlight: ["ctrl", "timer"],
    },
    () => {
      c.send("timer", "ctrl", "IRQ 0", { what: "interrupção", detail: "temporizador" });
      c.send("dev", "ctrl", "IRQ 1", { what: "interrupção", detail: "teclado", dt: 0 });
      c.state("ctrl", "entrega IRQ 0, segura IRQ 1", { tone: "active" });
      c.send("ctrl", "cpu", "IRQ 0", { what: "sinal", detail: "maior prioridade" });
      c.send("ctrl", "cpu", "IRQ 1", { what: "sinal", detail: "em seguida" });
    },
  );

  b.step(
    {
      id: "s6-excecoes",
      title: "Exceções: de dentro",
      subtitle: "O mesmo mecanismo",
      text: `Nem toda interrupção vem de fora. Uma divisão por zero, um acesso a página ausente ou uma instrução inválida causam uma [[excecao|exceção]]: síncrona, provocada pela própria instrução. A chamada de sistema também entra por esse caminho, com uma instrução feita para isso. O mecanismo é o mesmo, com salvar o estado e consultar a tabela de vetores; muda só quem dispara.`,
      facts: [
        ["Interrupção", "assíncrona, de fora"],
        ["Exceção", "síncrona, da instrução"],
        ["Mecanismo", "o mesmo"],
      ],
      highlight: ["cpu"],
      quiz: {
        kind: "choice",
        prompt: "Qual destes eventos é uma exceção, e não uma interrupção de dispositivo?",
        options: [
          "O programa acessa uma página que não está na memória",
          "O disco termina de ler um bloco",
          "Chega um pacote pela placa de rede",
        ],
        answer: 0,
        explain:
          "A falta de página é causada pela instrução que está rodando e acontece sempre no mesmo ponto. Disco e rede avisam em momentos que não têm relação com a instrução atual.",
      },
    },
    () => {
      c.state("cpu", "divisão por zero: exceção 0", { tone: "bad" });
    },
  );

  b.step(
    {
      id: "s7-comparar",
      title: "Quando cada uma ganha",
      subtitle: `${poll.overhead} contra ${irq.overhead} ticks`,
      text: `Com consulta a cada ${period} ticks, o polling gastou ${poll.overhead} ticks e cada tecla esperou ${lat(pollMean)} em média; as interrupções gastaram ${irq.overhead} e a espera foi de ${lat(mean(irq.latency))}. Com eventos raros, interrupções ganham com folga. Com milhões de pacotes por segundo, interromper a cada um custa caro, e placas de rede rápidas alternam: interrompem uma vez e depois consultam enquanto houver tráfego.`,
      facts: [
        ["Polling", `${poll.overhead} ticks`],
        ["Interrupção", `${irq.overhead} ticks`],
        ["Muito tráfego", "híbrido"],
      ],
      highlight: ["cmp"],
    },
    () => {
      c.row("cmp", 0, ["Polling", String(poll.overhead), lat(pollMean), String(poll.wasted)], {
        dt: 1,
        mark: poll.overhead > irq.overhead ? "warn" : "hit",
      });
      c.row("cmp", 1, ["Interrupção", String(irq.overhead), lat(mean(irq.latency)), "0"], {
        dt: 1,
        mark: "hit",
      });
    },
  );

  return b.done({
    checks: poll.checks,
    wasted: poll.wasted,
    pollOverhead: poll.overhead,
    irqOverhead: irq.overhead,
    pollMean: Math.round(pollMean * 100) / 100,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "interrupcoes",
    site: "arq",
    title: "Interrupções e exceções",
    summary:
      "Polling gasta consultas e atrasa a resposta; com interrupções, o dispositivo chama e a CPU salva o estado, consulta a tabela de vetores e volta. Prioridades, máscara e exceções usam o mesmo mecanismo.",
    area: "Sistema",
    refs: [
      { book: "tanenbaum-sco", chapter: 5, section: "5.6.5", note: "Interrupções", verified: true },
      { book: "tanenbaum-sco", chapter: 5, section: "5.6.4", note: "Exceções", verified: true },
      {
        book: "tanenbaum-mos",
        chapter: 5,
        section: "5.1.5",
        note: "Interrupções revisitadas",
        verified: true,
      },
    ],
    simplifications: [
      "Salvar e restaurar o contexto custam um tick cada; na prática, depende do processador.",
      "Um só dispositivo gera eventos na comparação; o temporizador aparece só no passo de prioridade.",
      "A espera conta do evento até o início do tratamento.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [{ key: "periodo", kind: "int", label: "Polling: consulta a cada (ticks)", min: 2, max: 40 }],
  },
  build,
  intro: {
    text: "Teclado, disco e rede ficam prontos quando querem, e a CPU tem mais o que fazer do que esperar por eles. Você vai comparar perguntar de tempos em tempos com deixar o dispositivo chamar, e ver o que o hardware faz ao ser interrompido.",
    facts: [
      ["Eventos", String(EVENTS.length)],
      ["Formas", "polling e interrupção"],
      ["Janela", `${HORIZON} ticks`],
    ],
  },
  outro: {
    title: "Interrupções em resumo",
    text: "Polling consulta o dispositivo periodicamente e paga em consultas à toa e em espera. Com interrupções, o dispositivo sinaliza, a CPU termina a instrução, salva PC e flags, salta pela tabela de vetores e depois restaura tudo. O controlador ordena por prioridade, o núcleo pode mascarar, e exceções usam o mesmo caminho.",
    facts: (r) => [
      ["Polling", `${r.stats.pollOverhead} ticks`],
      ["Interrupção", `${r.stats.irqOverhead} ticks`],
      ["Consultas à toa", String(r.stats.wasted)],
    ],
  },
  next: ["barramentos", "pipeline", "pilha-chamadas"],
};

export default lesson;
