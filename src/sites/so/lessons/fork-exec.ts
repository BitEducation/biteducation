import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { boot, exec, exit, fork, type Kernel, reap, spawn, usedFrames, write } from "../../../sim/os/proc.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * How a shell runs ls: fork with copy-on-write, a few writes by the child, exec, exit, the zombie
 * and wait; then the orphan case, where init adopts the child.
 */
export const DEFAULTS = { escritas: 1, paginasLs: 3 };
const NFRAMES = 10;
const SHELL = 100;
const PAGE_NAMES = ["código", "dados", "heap", "pilha"];
/** The child writes the stack first, then heap and data; code is read-only. */
const WRITE_ORDER = [3, 2, 1];

const scene: SceneSpec = {
  viewBox: [960, 560],
  zones: [
    { id: "user", title: "Espaço do usuário", rect: { x: 20, y: 20, w: 920, h: 130 }, tone: "user" },
    { id: "kernel", title: "Kernel", rect: { x: 20, y: 165, w: 920, h: 90 }, tone: "kernel" },
  ],
  nodes: [
    { id: "init", kind: "process", label: "init", sub: "PID 1", at: [110, 85], w: 130 },
    { id: "shell", kind: "process", label: "shell", sub: `PID ${SHELL}`, at: [360, 85], w: 150 },
    { id: "filho", kind: "process", label: "filho", sub: "PID 101", at: [700, 85], w: 150, hidden: true },
    {
      id: "kern",
      kind: "kernel",
      label: "Gerência de processos",
      sub: "tabela + memória",
      at: [480, 210],
      w: 230,
    },
  ],
  links: [
    { id: "l-sh", from: "shell", to: "kern" },
    { id: "l-fi", from: "filho", to: "kern" },
    { id: "l-in", from: "init", to: "kern" },
  ],
  widgets: [
    {
      kind: "table",
      id: "procs",
      title: "Tabela de processos",
      at: [40, 290],
      columns: ["PID", "PPID", "Programa", "Estado"],
      widths: [70, 70, 120, 120],
      rows: 4,
    },
    { kind: "counter", id: "usados", title: "Quadros ocupados", at: [500, 300] },
    {
      kind: "grid",
      id: "ram",
      title: "Memória física: quadro → página (× referências)",
      at: [40, 450],
      cols: NFRAMES,
      rows: 1,
      cellW: 84,
      indexLabel: "dec",
    },
  ],
};

/** "sh:3′" → "sh:pilha′": shell pages by area, ls pages by number. */
function nice(label: string): string {
  const [prog = "", rest = ""] = label.split(":");
  const copy = rest.endsWith("′") ? "′" : "";
  const n = Number(rest.replace("′", ""));
  return prog === "sh" ? `sh:${PAGE_NAMES[n] ?? n}${copy}` : `${prog}:${n}${copy}`;
}

function clamp(p: Params) {
  const escritas = Math.min(3, Math.max(0, Math.round(Number(p.escritas ?? DEFAULTS.escritas))));
  const paginasLs = Math.min(5, Math.max(1, Math.round(Number(p.paginasLs ?? DEFAULTS.paginasLs))));
  return { escritas, paginasLs };
}

export function build(p: Params) {
  const { escritas, paginasLs } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, { kern: "kernel", shell: "shell", filho: "filho" }, (t) => `${t}`);
  const k: Kernel = boot(NFRAMES);
  spawn(k, 1, 0, "init", 0);
  spawn(k, SHELL, 1, "sh", 4);

  const ram = (what: string, kk: Kernel = k) => {
    kk.frames.forEach((fr, i) => {
      const name = fr ? nice(fr.label) : "";
      c.cell("ram", i, fr ? `${name}${fr.refs > 1 ? ` ×${fr.refs}` : ""}` : "", {
        dt: i === 0 ? 1 : 0,
        ...(fr && fr.refs > 1 ? { mark: "dirty" as const } : {}),
        role: fr ? (fr.label.startsWith("sh") ? "a" : fr.label.startsWith("ls") ? "b" : "muted") : "muted",
        label: fr ? `quadro ${i}: ${name}, ${fr.refs} referência(s)` : `quadro ${i} livre`,
      });
    });
    c.count("usados", String(usedFrames(kk)), { label: `${what}: ${usedFrames(kk)} quadros ocupados` });
  };
  const table = () => {
    const rows = [...k.procs.values()].filter((x) => x.pid !== 0);
    for (let i = 0; i < 4; i++) {
      const x = rows[i];
      c.row("procs", i, x ? [String(x.pid), String(x.ppid), x.prog, x.state] : ["", "", "", ""], {
        ...(x?.state === "zumbi" ? { mark: "warn" as const } : {}),
      });
    }
  };

  b.step(
    {
      id: "s1-processo",
      title: "Um processo",
      subtitle: `O shell, PID ${SHELL}`,
      text: `Um [[processo]] é um programa em execução: código, dados, heap e pilha num espaço de endereçamento próprio, mais uma entrada na tabela de processos com o [[pcb]]. O shell, PID ${SHELL}, é filho do init (PID 1) e ocupa 4 quadros de memória física. Para rodar ls sem deixar de existir, o shell precisa de um processo novo.`,
      facts: [
        ["PID", String(SHELL)],
        ["Pai", "init, PID 1"],
        ["Quadros", "4"],
      ],
      highlight: ["shell"],
    },
    () => {
      table();
      ram("shell carregado");
    },
  );

  const child = fork(k, SHELL);
  b.step(
    {
      id: "s2-fork",
      title: "fork: um vira dois",
      subtitle: `Filho PID ${child}`,
      text: `A chamada [[fork]] cria uma cópia do processo: mesmo código, mesmas variáveis, mesmos arquivos abertos. Os dois continuam da linha seguinte ao fork. A única diferença é o valor de retorno: o pai recebe o PID do filho, ${child}, e o filho recebe 0. É assim que o código decide quem faz o quê. O filho tem PPID ${SHELL}.`,
      facts: [
        ["Retorno no pai", String(child)],
        ["Retorno no filho", "0"],
        ["PPID do filho", String(SHELL)],
      ],
      highlight: ["filho"],
      quiz: {
        kind: "choice",
        prompt: "Que valor a chamada fork() devolve dentro do processo filho?",
        options: ["0", String(SHELL), String(child), "−1"],
        answer: 0,
        explain: `O filho recebe 0; o pai recebe o PID do filho (${child}). −1 só aparece no pai, se o fork falhar.`,
      },
    },
    () => {
      c.send("shell", "kern", "fork()", { what: "fork()", detail: "pede uma cópia" });
      c.show(["filho"]);
      c.send("kern", "filho", "retorna 0", { role: "b", what: "retorno", detail: "0 no filho" });
      c.send("kern", "shell", `retorna ${child}`, { what: "retorno", detail: `${child} no pai` });
      table();
      ram("depois do fork");
    },
  );

  const copies: { page: number; from: number; to: number }[] = [];
  for (const pg of WRITE_ORDER.slice(0, escritas)) {
    const r = write(k, child, pg);
    if (r.copied) copies.push({ page: pg, from: r.from, to: r.to });
  }
  const afterCow = usedFrames(k);
  b.step(
    {
      id: "s3-cow",
      title: "Cópia só na escrita",
      subtitle: `${copies.length} ${copies.length === 1 ? "página copiada" : "páginas copiadas"}`,
      text: `Copiar os 4 quadros no fork seria desperdício, porque logo o filho vai trocar de programa. Com [[copia-na-escrita]], pai e filho apontam para os mesmos quadros, marcados como só leitura. ${copies.length ? `Quando o filho escreve ${copies.map((x) => `na ${PAGE_NAMES[x.page]}`).join(", ")}, a MMU gera uma falta, e só então o kernel copia ${copies.length === 1 ? "aquela página" : "aquelas páginas"}.` : "Como o filho não escreveu nada, nenhuma página foi copiada."} Ocupados agora: ${afterCow} quadros.`,
      facts: [
        ["Compartilhados no fork", "4"],
        ["Copiados", String(copies.length)],
        ["Quadros ocupados", String(afterCow)],
      ],
      highlight: [],
    },
    () => {
      for (const x of copies)
        c.send("filho", "kern", `escreve ${PAGE_NAMES[x.page]}`, {
          role: "b",
          what: "falta de COW",
          detail: `quadro ${x.from} copiado para ${x.to}`,
        });
      ram("depois das escritas");
    },
  );

  exec(k, child, "ls", paginasLs);
  const afterExec = usedFrames(k);
  b.step(
    {
      id: "s4-exec",
      title: "exec: troca o programa",
      subtitle: `O filho vira ls`,
      text: `O filho chama [[exec]] com /bin/ls. O kernel descarta a imagem antiga: cada quadro compartilhado perde uma referência e as cópias do filho são liberadas. Em seguida carrega ls em ${paginasLs} ${paginasLs === 1 ? "quadro novo" : "quadros novos"}. O PID continua ${child}, e os arquivos abertos também, o que permite ao shell redirecionar a saída antes do exec. Ocupados: ${afterExec} quadros.`,
      facts: [
        ["PID", `${child} (o mesmo)`],
        ["Programa", "ls"],
        ["Quadros ocupados", String(afterExec)],
      ],
      highlight: ["filho"],
      quiz: {
        kind: "number",
        prompt: `Depois do exec, quantos quadros de memória física estão ocupados no total?`,
        answer: afterExec,
        explain: `O shell continua com seus 4 quadros, agora só dele. As cópias do filho voltam para a lista livre, e ls ocupa ${paginasLs}: 4 + ${paginasLs} = ${afterExec}.`,
      },
    },
    () => {
      c.send("filho", "kern", 'exec("/bin/ls")', {
        role: "b",
        what: "exec",
        detail: `${paginasLs} páginas novas`,
      });
      c.state("filho", "ls", { tone: "active", label: "filho agora roda ls", role: "b" });
      table();
      ram("depois do exec");
    },
  );

  const shellP = k.procs.get(SHELL);
  if (shellP) shellP.state = "bloqueado";
  exit(k, child, 0);
  const zombieFrames = usedFrames(k);
  b.step(
    {
      id: "s5-wait",
      title: "exit, zumbi e wait",
      subtitle: "O pai recolhe o filho",
      text: `O shell chama wait e fica bloqueado. Quando ls termina com exit(0), a memória dele volta para o kernel na hora, mas a entrada na tabela fica: o processo vira [[zumbi]], guardando só o código de saída. Ao acordar, o shell recolhe esse código e a entrada some. Um pai que nunca chama wait acumula zumbis e gasta PIDs.`,
      facts: [
        ["Código de saída", "0"],
        ["Estado intermediário", "zumbi"],
        ["Quadros ocupados", String(zombieFrames)],
      ],
      highlight: [],
    },
    () => {
      c.send("shell", "kern", "wait()", { what: "wait", detail: "shell bloqueia" });
      table();
      c.send("filho", "kern", "exit(0)", { role: "b", what: "exit", detail: "ls termina" });
      c.state("filho", "zumbi", { tone: "warn", role: "b" });
      table();
      ram("depois do exit");
      const got = reap(k, SHELL);
      if (shellP) shellP.state = "pronto";
      c.send("kern", "shell", `filho ${got?.pid} saiu com ${got?.code}`, {
        what: "wait retorna",
        detail: "entrada removida",
      });
      c.hide(["filho"]);
      table();
    },
  );

  // the orphan case, on a fresh kernel
  const k2 = boot(NFRAMES);
  spawn(k2, 1, 0, "init", 0);
  spawn(k2, SHELL, 1, "sh", 4);
  const ch2 = fork(k2, SHELL);
  exec(k2, ch2, "ls", paginasLs);
  exit(k2, SHELL, 1);
  const adopted = k2.procs.get(ch2)?.ppid ?? -1;
  reap(k2, 1);
  b.step(
    {
      id: "s6-orfao",
      title: "Quando o pai morre antes",
      subtitle: "init adota o órfão",
      text: `Se o shell terminar enquanto ls ainda roda, o filho fica [[orfao|órfão]]. O kernel não deixa ninguém sem pai: ls passa a ter PPID ${adopted}, o init, que chama wait em laço justamente para recolher esses filhos adotados. Já o shell morto vira zumbi até o init recolhê-lo também. É por isso que a árvore de processos sempre termina no PID 1.`,
      facts: [
        ["PPID do órfão", String(adopted)],
        ["Quem recolhe", "init"],
        ["Raiz da árvore", "PID 1"],
      ],
      highlight: ["init"],
    },
    () => {
      c.show(["filho"]);
      c.state("filho", "ls, órfão", { tone: "warn", role: "b" });
      c.state("shell", "terminou", { tone: "bad" });
      c.row("procs", 0, ["1", "0", "init", "pronto"]);
      c.row("procs", 1, [String(SHELL), "1", "sh", "zumbi"], { mark: "warn" });
      c.row("procs", 2, [String(ch2), String(adopted), "ls", "pronto"], {
        mark: "new",
        log: { who: "kernel", what: "reparenta", detail: `PPID de ${ch2} vira ${adopted}` },
      });
      c.send("init", "kern", "wait()", { role: "s3", what: "init recolhe", detail: `shell ${SHELL}` });
      ram("shell morto, ls órfão", k2);
    },
  );

  return b.done({ child, copies: copies.length, afterCow, afterExec, zombieFrames, adopted });
}

const lesson: LessonModule = {
  meta: {
    slug: "fork-exec",
    site: "so",
    title: "Processos: fork, exec e wait",
    summary:
      "Como um shell roda um programa: fork com cópia na escrita, exec, exit, o processo zumbi, wait e o órfão adotado pelo init.",
    area: "Processos",
    refs: [
      { book: "tanenbaum-mos", chapter: 2, section: "2.1.2", note: "Criação de processos", verified: true },
      { book: "tanenbaum-mos", chapter: 2, section: "2.1.3", note: "Término de processos", verified: true },
      { book: "maziero-so", chapter: 5, section: "5.3", note: "Processos", verified: true },
      { book: "maziero-so", chapter: 18, section: "18.2", note: "Copy-on-write (COW)", verified: true },
    ],
    simplifications: [
      "Cada área do processo ocupa uma página; programas reais têm milhares.",
      "Os PIDs são sequenciais a partir de 100; o Linux usa o próximo livre.",
      "O init aparece sem páginas próprias, só como pai de todos.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "escritas",
        kind: "int",
        label: "Páginas que o filho escreve antes do exec",
        min: 0,
        max: 3,
        help: "Pilha, depois heap, depois dados. O código é só leitura.",
      },
      { key: "paginasLs", kind: "int", label: "Páginas do programa ls", min: 1, max: 5 },
    ],
  },
  build,
  intro: {
    text: "Toda vez que você digita um comando, o shell cria um processo novo e troca o programa dele. Você vai acompanhar o fork, ver a memória ser compartilhada até alguém escrever, o exec trocar a imagem, e o que acontece com um processo que termina antes ou depois do pai.",
    facts: [
      ["Shell", `PID ${SHELL}`],
      ["Comando", "ls"],
      ["Quadros", String(NFRAMES)],
    ],
  },
  outro: {
    title: "Processos em resumo",
    text: "fork duplica o processo e devolve 0 ao filho e o PID do filho ao pai. Com cópia na escrita, só as páginas alteradas são copiadas. exec troca o programa mantendo o PID. Quem termina vira zumbi até o pai chamar wait; órfãos são adotados pelo init.",
    facts: (run) => [
      ["Páginas copiadas", String(run.stats.copies)],
      ["Quadros após exec", String(run.stats.afterExec)],
      ["Pai do órfão", `PID ${run.stats.adopted}`],
    ],
  },
  next: ["chamada-de-sistema", "escalonamento"],
};

export default lesson;
