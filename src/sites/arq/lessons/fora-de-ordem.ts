import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import { type Instr, type OooPolicy, type OooRun, renamed, schedule } from "../../../sim/arch/ooo.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Out-of-order execution on six instructions after a slow load: in order, every instruction waits
 * behind the load; a scoreboard lets independent ones pass but is held back by WAR and WAW
 * conflicts; register renaming removes those, leaving only true dependencies; a reorder buffer
 * retires results in program order, which keeps exceptions precise.
 */
export const DEFAULTS = { latencia: 5 };
const ROLES: Role[] = ["a", "b", "s3", "s4", "s5", "s6"];
const POLICIES: OooPolicy[] = ["inorder", "scoreboard", "rename"];
const NAME: Record<OooPolicy, string> = {
  inorder: "em ordem",
  scoreboard: "fora de ordem, sem renomear",
  rename: "fora de ordem, renomeando",
};
const GANTT_W = 560;
const cycles = (n: number) => (n === 1 ? "1 ciclo" : `${n} ciclos`);
/** "I3", "I3 e I4", "I3, I4 e I5". */
const list = (xs: number[]) => {
  const names = xs.map((i) => `I${i + 1}`);
  return names.length < 2
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
};

type Op = { op: string; dst: string; srcs: string[]; lat: number };
const fmt = (o: { op: string; dst: string; srcs: string[] }) =>
  o.op === "lw"
    ? `lw ${o.dst}, 0(${o.srcs[0]})`
    : o.op === "addi"
      ? `addi ${o.dst}, ${o.srcs[0]}, 1`
      : `${o.op} ${o.dst}, ${o.srcs.join(", ")}`;

function program(load: number): (Instr & { op: string })[] {
  const ops: Op[] = [
    { op: "lw", dst: "x1", srcs: ["x10"], lat: load },
    { op: "add", dst: "x2", srcs: ["x1", "x3"], lat: 1 },
    { op: "mul", dst: "x3", srcs: ["x4", "x5"], lat: 3 },
    { op: "add", dst: "x6", srcs: ["x4", "x5"], lat: 1 },
    { op: "sub", dst: "x2", srcs: ["x6", "x4"], lat: 1 },
    { op: "addi", dst: "x7", srcs: ["x7"], lat: 1 },
  ];
  return ops.map((o) => ({ ...o, text: fmt(o) }));
}
const DEPS = ["–", "x1 de I1 (RAW)", "x3, que I2 lê (WAR)", "–", "x6 de I4 (RAW); x2 (WAW)", "–"];
const lanes = (prog: Instr[]) => prog.map((p, i) => `I${i + 1} ${p.text.split(" ")[0]}`);

function clamp(p: Params) {
  return { load: Math.min(10, Math.max(1, Math.round(Number(p.latencia ?? DEFAULTS.latencia)))) };
}

function scene(p: Params): SceneSpec {
  const { load } = clamp(p);
  const prog = program(load);
  const span = schedule(prog, "inorder").end + 1;
  const gantt = (id: string, title: string, y: number) => ({
    kind: "gantt" as const,
    id,
    title,
    at: [20, y] as const,
    lanes: lanes(prog),
    span,
    width: GANTT_W,
  });
  return {
    viewBox: [960, 720],
    nodes: [],
    links: [],
    widgets: [
      gantt("ordem", "Em ordem: cada barra vai do início ao resultado pronto", 40),
      gantt("placar", "Fora de ordem, sem renomear", 265),
      gantt("renome", "Fora de ordem, com renomeação", 490),
      {
        kind: "table",
        id: "prog",
        title: "O programa",
        at: [600, 40],
        columns: ["Instrução", "Lat.", "Depende de"],
        widths: [130, 40, 170],
        rows: prog.length,
      },
      {
        kind: "table",
        id: "rob",
        title: "Depois de renomear (P = registrador físico)",
        at: [600, 265],
        columns: ["Instrução", "Pronta", "Retira"],
        widths: [170, 80, 90],
        rows: prog.length,
      },
      {
        kind: "table",
        id: "cmp",
        title: "Último resultado retirado",
        at: [600, 490],
        columns: ["Política", "Ciclo"],
        widths: [250, 90],
        rows: POLICIES.length,
      },
    ],
  };
}

export function build(p: Params) {
  const { load } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const prog = program(load);
  const r = Object.fromEntries(POLICIES.map((x) => [x, schedule(prog, x)])) as Record<OooPolicy, OooRun>;
  const span = r.inorder.end + 1;
  const scale = (GANTT_W - 92) / span;
  const ln = lanes(prog);
  const io = r.inorder;
  const sb = r.scoreboard;
  const rn = r.rename;
  const rnProg = renamed(prog).map((x, i) => fmt({ op: prog[i]?.op ?? "", ...x }));
  const waited = (io.start[1] ?? 1) - 1;
  const ahead = [...prog.keys()].filter((i) => i > 1 && (sb.start[i] ?? 0) < (sb.start[1] ?? 0));
  const war = sb.blocked[2];
  const waw = sb.blocked[4];
  const widgetOf: Record<OooPolicy, string> = { inorder: "ordem", scoreboard: "placar", rename: "renome" };

  const draw = (x: OooPolicy) => {
    prog.forEach((ins, i) => {
      const from = r[x].start[i] ?? 0;
      const to = r[x].done[i] ?? 0;
      const t = c.t + 1;
      c.at(t);
      b.ev({
        t,
        kind: "gantt",
        lane: ln[i] ?? "",
        from,
        to,
        item: (to - from) * scale >= 34 ? `I${i + 1}` : "",
        itemRole: ROLES[i] ?? "a",
        role: ROLES[i] ?? "a",
        label: `${NAME[x]}: I${i + 1} ${ins.text} executa do ciclo ${from} ao ${to}`,
        gantt: widgetOf[x],
        row: { cols: { t: `${from}–${to}`, who: `I${i + 1}`, what: ins.text, detail: NAME[x] } },
      });
    });
  };
  const result = (x: OooPolicy, i: number, mark: "bad" | "warn" | "hit") =>
    c.row("cmp", i, [NAME[x], `ciclo ${r[x].end}`], { dt: 1, mark });

  b.step(
    {
      id: "s1-programa",
      title: "Seis instruções e um load",
      subtitle: `lw leva ${cycles(load)}`,
      text: `O programa começa com um lw que ${load > 2 ? `não achou o dado na [[cache]] e leva ${cycles(load)}` : `leva ${cycles(load)}`}. O processador começa uma instrução por ciclo e tem unidades de sobra. Só I2 depende de verdade do load, porque lê x1. I3 escreve x3, que I2 ainda vai ler, e I5 escreve x2, como I2. Esses dois últimos conflitos não são de dados: só aparecem porque as instruções reaproveitam o mesmo nome de registrador.`,
      facts: [
        ["Instruções", String(prog.length)],
        ["Latência do lw", cycles(load)],
        ["Dependência real do lw", "só I2"],
      ],
      highlight: ["prog"],
    },
    () => {
      prog.forEach((ins, i) => {
        c.row("prog", i, [`I${i + 1} ${ins.text}`, String(ins.lat), DEPS[i] ?? ""], {
          dt: 1,
          mark: i === 0 ? "warn" : "new",
          role: ROLES[i] ?? "a",
        });
      });
    },
  );

  b.step(
    {
      id: "s2-ordem",
      title: "Uma atrás da outra",
      subtitle: `Último resultado no ciclo ${io.end}`,
      text: `${waited > 0 ? `Em ordem, I2 espera ${cycles(waited)} pelo x1, e todas as que vêm depois esperam junto, mesmo sem precisar do load.` : "Com o load rápido, I2 não espera, e as instruções saem uma por ciclo."} O último resultado fica pronto no ciclo ${io.end}. É assim no [[pipeline]] simples: uma instrução parada segura a fila inteira, como um carro quebrado numa rua de mão única.`,
      facts: [
        ["I2 espera", cycles(waited)],
        ["Último resultado", `ciclo ${io.end}`],
        ["Quem segura a fila", "I2"],
      ],
      highlight: ["ordem", "cmp"],
    },
    () => {
      draw("inorder");
      result("inorder", 0, "bad");
    },
  );

  b.step(
    {
      id: "s3-placar",
      title: "Quem estiver pronto vai",
      subtitle: `Último resultado no ciclo ${sb.end}`,
      text: [
        "Agora o processador olha adiante e começa qualquer instrução cujos operandos já estão prontos.",
        ahead.length
          ? `${list(ahead)} ${ahead.length === 1 ? "passa" : "passam"} na frente de I2.`
          : "Com o load rápido, ninguém precisa passar na frente de I2.",
        war ? "Mas I3 não pode começar: escreveria x3 antes de I2 ler o valor antigo (WAR)." : "",
        waw ? "E I5 tem de esperar I2 terminar, senão o x2 final ficaria errado (WAW)." : "",
        `O último resultado sai no ciclo ${sb.end}.`,
      ]
        .filter(Boolean)
        .join(" "),
      facts: [
        ["Passam na frente", ahead.length ? list(ahead) : "nenhuma"],
        ["Barrada por WAR", war ? "I3" : "nenhuma"],
        ["Barrada por WAW", waw ? "I5" : "nenhuma"],
      ],
      highlight: ["placar", "cmp"],
      quiz: {
        kind: "choice",
        prompt:
          "Sem renomear, por que mul x3, x4, x5 (I3) não começa logo no ciclo 1, se x4 e x5 estão prontos?",
        options: [
          "Escreveria x3 antes de add x2, x1, x3 (I2) ler o valor antigo de x3",
          "Precisa do x1 que o lw ainda está buscando",
          "A unidade de multiplicação está ocupada pelo lw",
        ],
        answer: 0,
        explain:
          "I3 não lê nada do load, mas sobrescreve x3, que I2 ainda vai ler. Se I3 terminasse antes, I2 leria o valor novo: é a dependência falsa WAR.",
      },
    },
    () => {
      draw("scoreboard");
      result("scoreboard", 1, "warn");
    },
  );

  b.step(
    {
      id: "s4-renomear",
      title: "Nomes novos para cada resultado",
      subtitle: `Último resultado no ciclo ${rn.done.reduce((a, x) => Math.max(a, x), 0)}`,
      text: `A [[renomeacao-de-registradores]] dá a cada resultado um registrador físico novo, P1 a P${prog.length}. I3 escreve em P3 enquanto I2 continua lendo o x3 antigo, e I5 escreve em P5, sem disputar com o P2 de I2. Sobram só as dependências verdadeiras: I2 espera o P1 do load e I5 espera o P4 de I4. Todo o resto roda enquanto o load busca o dado, e o último resultado fica pronto no ciclo ${rn.done.reduce((a, x) => Math.max(a, x), 0)}.`,
      facts: [
        ["Registradores físicos", `P1 a P${prog.length}`],
        ["Dependências que sobram", "só RAW"],
        ["Último resultado", `ciclo ${rn.done.reduce((a, x) => Math.max(a, x), 0)}`],
      ],
      highlight: ["renome", "rob"],
      quiz: {
        kind: "number",
        prompt: `Com renomeação, em que ciclo fica pronto o resultado de add x2, x1, x3 (I2), se o lw leva ${cycles(load)}?`,
        answer: rn.done[1] ?? 0,
        explain: `I2 só depende do lw, que fica pronto no ciclo ${rn.done[0]}. Ela começa nesse ciclo e leva 1: pronta no ${rn.done[1]}.`,
      },
    },
    () => {
      draw("rename");
      rnProg.forEach((txt, i) => {
        c.row("rob", i, [txt, `ciclo ${rn.done[i]}`, ""], { dt: 1, mark: "new", role: ROLES[i] ?? "a" });
      });
    },
  );

  const early = [...prog.keys()].filter((i) => i > 0 && (rn.done[i] ?? 0) < (rn.done[0] ?? 0));
  b.step(
    {
      id: "s5-retirar",
      title: "Retirar em ordem",
      subtitle: `Tudo retirado no ciclo ${rn.end}`,
      text: `Os resultados ficam prontos fora de ordem, mas só valem quando saem do [[reorder-buffer]], na ordem do programa. ${early.length ? `${list(early)} ${early.length === 1 ? "fica pronta" : "ficam prontas"} antes do load e ${early.length === 1 ? "espera" : "esperam"} por ele.` : "Aqui nenhuma fica pronta antes do load."} Se o lw causasse uma falta de página, tudo o que veio depois seria descartado, e o sistema veria o programa parado exatamente no lw: é a exceção precisa. O último retira no ciclo ${rn.end}.`,
      facts: [
        ["Prontas antes do lw", early.length ? list(early) : "nenhuma"],
        ["Retira", "na ordem do programa"],
        ["Último retirado", `ciclo ${rn.end}`],
      ],
      highlight: ["rob", "cmp"],
    },
    () => {
      rnProg.forEach((txt, i) => {
        c.row("rob", i, [txt, `ciclo ${rn.done[i]}`, `ciclo ${rn.commit[i]}`], {
          dt: 1,
          mark: (rn.commit[i] ?? 0) > (rn.done[i] ?? 0) ? "warn" : "hit",
          role: ROLES[i] ?? "a",
        });
      });
      result("rename", 2, "hit");
    },
  );

  b.step(
    {
      id: "s6-custo",
      title: "O preço da janela",
      subtitle: `${io.end} contra ${rn.end} ciclos`,
      text: `${io.end > rn.end ? `Aqui o ganho foi de ${cycles(io.end - rn.end)} em ${io.end}.` : "Com o load rápido, não houve ganho: nada precisava esperar."} Num processador real, uma falta que vai até a DRAM custa centenas de ciclos, e para esconder isso ele precisa enxergar centenas de instruções adiante: um reorder buffer com centenas de entradas, centenas de registradores físicos e uma lógica que compara todos os operandos a cada ciclo. Para olhar tão longe, também precisa adivinhar os desvios: é a execução especulativa, que depende da [[preditor-de-desvio|previsão de desvio]].`,
      facts: [
        ["Ganho aqui", cycles(io.end - rn.end)],
        ["Janela real", "centenas de instruções"],
        ["Depende de", "previsão de desvio"],
      ],
      highlight: ["cmp"],
    },
    () => {
      result("inorder", 0, "bad");
    },
  );

  return b.done({
    inorder: io.end,
    scoreboard: sb.end,
    rename: rn.end,
    waited,
    blocked: [war ? "I3:WAR" : "", waw ? "I5:WAW" : ""].filter(Boolean).join(","),
    commit: rn.commit.join(","),
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "fora-de-ordem",
    site: "arq",
    title: "Execução fora de ordem e renomeação de registradores",
    summary:
      "Um load lento segura todo o programa em ordem. Fora de ordem, as independentes passam na frente, mas WAR e WAW atrapalham; renomeando, sobram só as dependências reais, e o reorder buffer retira tudo em ordem.",
    area: "Microarquitetura",
    refs: [
      {
        book: "tanenbaum-sco",
        chapter: 4,
        section: "4.5.3",
        note: "Execução fora de ordem e renomeação de registrador",
        verified: true,
      },
      { book: "tanenbaum-sco", chapter: 4, section: "4.5.4", note: "Execução especulativa", verified: true },
    ],
    simplifications: [
      "Uma instrução começa por ciclo, e há unidades funcionais de sobra.",
      "O resultado pode ser usado no mesmo ciclo em que fica pronto.",
      "O reorder buffer retira quantas instruções prontas houver no mesmo ciclo.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [{ key: "latencia", kind: "int", label: "Latência do lw (ciclos)", min: 1, max: 10 }],
  },
  build,
  intro: {
    text: "Um processador moderno não executa as instruções na ordem em que você as escreveu. Você vai seguir seis instruções atrás de um load lento, em ordem, fora de ordem e com renomeação de registradores, e ver como o resultado final continua saindo na ordem certa.",
    facts: [
      ["Instruções", "6"],
      ["Latência do lw", cycles(DEFAULTS.latencia)],
      ["Começa por ciclo", "1 instrução"],
    ],
  },
  outro: {
    title: "Fora de ordem em resumo",
    text: "Executar fora de ordem deixa as instruções independentes andarem enquanto uma espera. Os conflitos WAR e WAW vêm só do reaproveitamento de nomes, e a renomeação os elimina, deixando apenas as dependências verdadeiras. O reorder buffer retira tudo na ordem do programa, então uma exceção sempre parece ter acontecido no lugar certo.",
    facts: (run) => [
      ["Em ordem", `ciclo ${run.stats.inorder}`],
      ["Sem renomear", `ciclo ${run.stats.scoreboard}`],
      ["Renomeando", `ciclo ${run.stats.rename}`],
    ],
  },
  next: ["pipeline", "previsao-desvio", "cache-direta"],
};

export default lesson;
