import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { AFTER_INNER, AFTER_MAIN, FACT, FRAME, factTrace, maxDepth, SP0 } from "../../../sim/arch/stack.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Procedure calls in RISC-V: jal saves the return address in ra, a recursive call would overwrite
 * it, so every activation saves ra and its argument in a 16-byte frame on a stack that grows down.
 */
export const DEFAULTS = { n: 4, pilha: 8192 };

const hx = (v: number) => `0x${v.toString(16).toUpperCase().padStart(4, "0")}`;
const num = (v: number) => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const CODE: [number, string][] = [
  [FACT, "addi sp, sp, -16"],
  [FACT + 4, "sw   ra, 12(sp)"],
  [FACT + 8, "sw   a0, 8(sp)"],
  [FACT + 12, "addi t0, x0, 1"],
  [FACT + 16, "bge  t0, a0, base"],
  [FACT + 20, "addi a0, a0, -1"],
  [FACT + 24, "jal  ra, fact"],
  [AFTER_INNER, "lw   t1, 8(sp)"],
  [FACT + 32, "mul  a0, a0, t1"],
  [FACT + 36, "jal  x0, fim"],
  [FACT + 40, "base: addi a0, x0, 1"],
  [FACT + 44, "fim: lw ra, 12(sp)"],
  [FACT + 48, "addi sp, sp, 16"],
  [FACT + 52, "jalr x0, 0(ra)"],
];
const REGS = ["sp", "ra", "a0", "pc"] as const;

function clamp(p: Params) {
  const n = Math.min(12, Math.max(1, Math.round(Number(p.n ?? DEFAULTS.n))));
  const kib = Math.min(8192, Math.max(1, Math.round(Number(p.pilha ?? DEFAULTS.pilha))));
  return { n, kib };
}

function scene(p: Params): SceneSpec {
  const { n } = clamp(p);
  return {
    viewBox: [960, 600],
    nodes: [],
    links: [],
    widgets: [
      {
        kind: "table",
        id: "codigo",
        title: "fact(n) em RISC-V",
        at: [40, 40],
        columns: ["End.", "Instrução"],
        widths: [64, 196],
        rows: CODE.length,
      },
      {
        kind: "table",
        id: "regs",
        title: "Registradores",
        at: [330, 40],
        columns: ["Reg", "Valor", "Papel"],
        widths: [44, 80, 150],
        rows: REGS.length,
      },
      {
        kind: "table",
        id: "pilha",
        title: `Pilha a partir de ${hx(SP0)}, crescendo para baixo`,
        at: [630, 40],
        columns: ["sp", "Moldura"],
        widths: [70, 220],
        rows: n,
      },
      { kind: "counter", id: "prof", title: "Profundidade", at: [330, 200] },
      { kind: "counter", id: "bytes", title: "Bytes de pilha", at: [480, 200] },
      { kind: "counter", id: "niveis", title: "Níveis que cabem", at: [330, 300] },
      {
        kind: "chart",
        id: "curva",
        title: "Profundidade a cada chamada e retorno",
        at: [40, 430],
        width: 760,
        height: 130,
        x: { label: "evento", max: 2 * n },
        y: { label: "molduras", max: n },
      },
    ],
  };
}

export function build(p: Params) {
  const { n, kib } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const tr = factTrace(n);
  const first = tr.frames[0];
  if (!first) throw new Error("fact always allocates a frame");
  const deepest = tr.frames[tr.frames.length - 1] ?? first;
  const levels = maxDepth(kib * 1024);
  const inner = tr.frames.length - 1;
  let x = 0;

  const reg = (i: number, v: string, role: string, mark = true) =>
    c.row("regs", i, [REGS[i] ?? "", v, role], mark ? { mark: "new", role: "a" } : { role: "b" });
  // Only the instruction being executed keeps a color; the previous one goes back to grey.
  let current = -1;
  const line = (i: number) => {
    const [a, txt] = CODE[i] ?? [0, ""];
    return [hx(a), txt];
  };
  const code = (addr: number, mark: "hit" | "new" = "hit") => {
    const i = CODE.findIndex(([a]) => a === addr);
    if (current >= 0 && current !== i) c.row("codigo", current, line(current), { role: "muted" });
    current = i;
    c.row("codigo", i, line(i), { mark, role: "ctrl", dt: 1 });
  };
  const frameText = (k: number, ra: number) => `fact(${k}): ra=${hx(ra)}, n=${k}`;

  b.step(
    {
      id: "s1-jal",
      title: "jal guarda o retorno",
      subtitle: `ra = ${hx(AFTER_MAIN)}`,
      text: `O main põe o argumento em a0 e executa jal ra, fact. A instrução faz duas coisas de uma vez: grava em ra o endereço da instrução seguinte, ${hx(AFTER_MAIN)}, e salta para ${hx(FACT)}. Esse é o [[endereco-de-retorno]]. Para voltar, a função executa jalr x0, 0(ra), o ret, e o [[pc]] retoma no main. Argumentos e resultado viajam em a0, por convenção.`,
      facts: [
        ["a0", String(n)],
        ["ra", hx(AFTER_MAIN)],
        ["pc", hx(FACT)],
      ],
      highlight: [],
    },
    () => {
      CODE.forEach(([a, txt], i) => {
        c.row("codigo", i, [hx(a), txt], { role: "muted" });
      });
      reg(0, hx(SP0), "topo da pilha", false);
      reg(2, String(n), "argumento n");
      c.row("regs", 1, ["ra", hx(AFTER_MAIN), "voltar ao main"], {
        mark: "new",
        role: "a",
        dt: 1,
        log: { who: "main", what: "jal ra, fact", detail: `ra = ${hx(AFTER_MAIN)}` },
      });
      reg(3, hx(FACT), "início de fact");
      c.count("prof", "0", { label: "nenhuma moldura" });
      c.count("bytes", "0", { label: "0 bytes" });
    },
  );

  b.step(
    {
      id: "s2-problema",
      title: "A recursão apagaria o ra",
      subtitle: `${hx(AFTER_MAIN)} seria perdido`,
      text: `fact(${n}) ${n > 1 ? `precisa chamar fact(${n - 1})` : "não chama ninguém, mas o código é o mesmo para qualquer n"}. O jal interno gravaria ${hx(AFTER_INNER)} em ra, e o ${hx(AFTER_MAIN)} do main sumiria: há um só registrador ra. O mesmo vale para n, que a0 perde ao virar o argumento seguinte. A saída é guardar esses valores na memória, numa [[pilha]]: a última chamada a começar é a primeira a terminar, a mesma ordem de entrar e sair de uma pilha.`,
      facts: [
        ["ra do main", hx(AFTER_MAIN)],
        ["ra interno", hx(AFTER_INNER)],
        ["Registradores ra", "1"],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: "Por que fact precisa salvar ra antes de chamar a si mesma?",
        options: ["O jal interno sobrescreve ra", "O ret apaga a pilha", "ra só guarda números pequenos"],
        answer: 0,
        explain: `O jal interno grava ${hx(AFTER_INNER)} em ra; sem cópia, o caminho de volta ao main se perde.`,
      },
    },
    () => {
      code(FACT + 24, "new");
      c.note("prof", `jal interno: ra = ${hx(AFTER_INNER)}`, "bad");
      c.row("regs", 1, ["ra", `${hx(AFTER_MAIN)}?`, "seria sobrescrito"], { mark: "bad", role: "bad" });
    },
  );

  b.step(
    {
      id: "s3-moldura",
      title: "O prólogo monta a moldura",
      subtitle: `sp: ${hx(SP0)} → ${hx(first.sp)}`,
      text: `As três primeiras instruções de fact reservam ${FRAME} bytes subtraindo de sp e guardam ra em sp+12 e n em sp+8. Esse bloco é a [[moldura-de-pilha]] da ativação. A pilha cresce para baixo: sp vai de ${hx(SP0)} para ${hx(first.sp)}. A convenção do RISC-V manda manter sp múltiplo de 16 ([[alinhamento]]), por isso os 8 bytes que sobram ficam livres. Agora o jal interno pode sobrescrever ra à vontade.`,
      facts: [
        ["Moldura", `${FRAME} bytes`],
        ["sp", hx(first.sp)],
        ["Guardado", `ra=${hx(first.ra)}, n=${n}`],
      ],
      highlight: [],
    },
    () => {
      code(FACT);
      reg(0, hx(first.sp), "topo da pilha");
      code(FACT + 4);
      code(FACT + 8);
      c.row("pilha", 0, [hx(first.sp), frameText(n, first.ra)], {
        mark: "new",
        role: "a",
        log: { who: `fact(${n})`, what: "prólogo", detail: `sp = ${hx(first.sp)}` },
      });
      x += 1;
      c.plot("curva", "profundidade", x, 1, { role: "a" });
      c.count("prof", "1", { label: "1 moldura" });
      c.count("bytes", String(FRAME), { label: `${FRAME} bytes` });
    },
  );

  b.step(
    {
      id: "s4-descer",
      title: "Descendo até o caso base",
      subtitle: `${tr.frames.length} ${tr.frames.length === 1 ? "moldura" : "molduras"}, ${tr.maxBytes} bytes`,
      text:
        inner > 0
          ? `Cada fact(k) com k maior que 1 decrementa a0 e chama fact(k−1), que monta a própria moldura logo abaixo. ${inner === 1 ? `É 1 chamada interna, com ra = ${hx(AFTER_INNER)}` : `São ${inner} chamadas internas, todas com ra = ${hx(AFTER_INNER)}`}, e cada moldura guarda o seu n. No caso base, fact(1), a pilha tem ${tr.frames.length} molduras e ${tr.maxBytes} bytes; sp está em ${hx(deepest.sp)}. Nenhum valor se perdeu: está tudo na memória, na ordem inversa em que vai ser usado.`
          : `Com n = 1, fact já está no caso base: o desvio bge vai direto para base, sem chamada interna. A pilha tem uma moldura, ${tr.maxBytes} bytes, e sp está em ${hx(deepest.sp)}. Escolha um n maior no laboratório para ver as molduras se empilharem, cada uma com o seu ra e o seu n.`,
      facts: [
        ["Molduras", String(tr.frames.length)],
        ["Bytes", String(tr.maxBytes)],
        ["sp mais baixo", hx(deepest.sp)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Quantos bytes de pilha fact(${n}) ocupa no ponto mais fundo da recursão?`,
        answer: tr.maxBytes,
        unit: "bytes",
        explain: `${tr.frames.length} molduras de ${FRAME} bytes: ${tr.maxBytes} bytes.`,
      },
    },
    () => {
      tr.frames.slice(1).forEach((f, i) => {
        code(FACT + 24);
        reg(1, hx(AFTER_INNER), "voltar a fact");
        reg(2, String(f.n), "argumento n");
        code(FACT);
        reg(0, hx(f.sp), "topo da pilha");
        c.row("pilha", i + 1, [hx(f.sp), frameText(f.n, f.ra)], {
          mark: "new",
          role: "b",
          log: { who: `fact(${f.n})`, what: "prólogo", detail: `sp = ${hx(f.sp)}` },
        });
        x += 1;
        c.plot("curva", "profundidade", x, f.depth, { role: "a" });
        c.count("prof", String(f.depth), { label: `${f.depth} molduras` });
        c.count("bytes", String(f.depth * FRAME), { label: `${f.depth * FRAME} bytes` });
      });
      code(FACT + 40, "new");
      reg(2, "1", "caso base");
    },
  );

  const returns = tr.events.filter((e) => e.kind === "return");
  b.step(
    {
      id: "s5-voltar",
      title: "O epílogo desfaz tudo",
      subtitle: `fact(${n}) = ${num(tr.result)}`,
      text: `Na volta, cada ativação lê o seu n com lw, multiplica pelo resultado em a0, recupera ra da moldura, devolve os ${FRAME} bytes somando a sp e executa o ret. ${inner === 0 ? "O único ret" : `${inner === 1 ? "O primeiro ret salta" : `Os ${inner} primeiros ret saltam`} para ${hx(AFTER_INNER)}, dentro de fact; o último`} usa o ${hx(AFTER_MAIN)} salvo lá no início e volta ao main com a0 = ${num(tr.result)}. sp termina em ${hx(SP0)}, exatamente onde começou.`,
      facts: [
        ["Resultado", num(tr.result)],
        ["Retornos internos", String(inner)],
        ["sp final", hx(SP0)],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: "De onde o último ret tira o endereço de volta ao main?",
        options: [
          "Da moldura mais alta, a primeira a ser criada",
          "Da moldura mais baixa",
          "Do registrador a0",
        ],
        answer: 0,
        explain: `fact(${n}) guardou ${hx(AFTER_MAIN)} na primeira moldura e só a lê no fim.`,
      },
    },
    () => {
      for (const e of returns) {
        if (e.kind !== "return") continue;
        const f = e.frame;
        code(FACT + 44);
        reg(1, hx(f.ra), f.ra === AFTER_MAIN ? "voltar ao main" : "voltar a fact");
        code(FACT + 48);
        reg(0, hx(f.sp + FRAME), "topo da pilha");
        reg(2, String(e.value), `fact(${f.n})`);
        c.row("pilha", f.depth - 1, [hx(f.sp), `livre: fact(${f.n}) devolveu ${e.value}`], {
          role: "muted",
          log: { who: `fact(${f.n})`, what: "ret", detail: `a0 = ${e.value}, pc = ${hx(f.ra)}` },
        });
        x += 1;
        c.plot("curva", "profundidade", x, f.depth - 1, { role: "a" });
        c.count("prof", String(f.depth - 1), { label: `${f.depth - 1} molduras` });
        c.count("bytes", String((f.depth - 1) * FRAME), { label: `${(f.depth - 1) * FRAME} bytes` });
      }
      reg(3, hx(AFTER_MAIN), "de volta ao main");
    },
  );

  const pct = (tr.frames.length / levels) * 100;
  b.step(
    {
      id: "s6-estouro",
      title: "Quando a pilha acaba",
      subtitle: `${num(levels)} níveis em ${num(kib)} KiB`,
      text: `Com ${num(kib)} KiB de pilha e molduras de ${FRAME} bytes, cabem ${num(levels)} chamadas aninhadas; fact(${n}) usou ${pct < 0.01 ? "menos de 0,01%" : `${pct.toFixed(2).replace(".", ",")}%`} disso. Uma recursão sem caso base desce até sp passar do limite. O SO deixa uma página sem permissão logo abaixo, e o acesso a ela termina o programa: é o [[estouro-de-pilha]]. Um laço com acumulador calcula o mesmo fatorial com uma moldura só.`,
      facts: [
        ["Pilha", `${num(kib)} KiB`],
        ["Níveis", num(levels)],
        ["Usados", String(tr.frames.length)],
      ],
      highlight: [],
    },
    () => {
      c.count("niveis", num(levels), { label: `${num(levels)} molduras de ${FRAME} bytes` });
      c.note("niveis", `fact(${n}) usou ${tr.frames.length}`, "info", { dt: 1 });
    },
  );

  return b.done({
    result: tr.result,
    frames: tr.frames.length,
    bytes: tr.maxBytes,
    minSp: hx(deepest.sp),
    inner,
    levels,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "pilha-chamadas",
    site: "arq",
    title: "A pilha de chamadas",
    summary:
      "Como uma função chama outra e volta: o jal que guarda o endereço de retorno, a moldura que o prólogo monta na pilha, a recursão descendo e subindo e o estouro quando a pilha acaba.",
    area: "ISA",
    refs: [
      { book: "tanenbaum-sco", chapter: 5, section: "5.6.2", note: "Procedimentos", verified: true },
      { book: "tanenbaum-sco", chapter: 4, section: "4.2.1", note: "Pilhas", verified: true },
      { book: "tanenbaum-sco", chapter: 5, section: "5.4.8", note: "Endereçamento de pilha", verified: true },
    ],
    simplifications: [
      "O código é o de um compilador sem otimização: até o caso base monta uma moldura.",
      "A pilha começa em 0x8000; num processo real ela fica no topo do espaço de endereçamento.",
      "n vai até 12 porque 13! já não cabe num inteiro de 32 bits.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "n", kind: "int", label: "n em fact(n)", min: 1, max: 12 },
      {
        key: "pilha",
        kind: "int",
        label: "Tamanho da pilha (KiB)",
        min: 1,
        max: 8192,
        help: "8.192 KiB (8 MiB) é o padrão de muitas distribuições Linux.",
      },
    ],
  },
  build,
  intro: {
    text: "Uma função recursiva chama a si mesma várias vezes, e cada chamada precisa saber para onde voltar. Onde fica essa informação? Você vai seguir fact(n) instrução por instrução, vendo a pilha descer e subir.",
    facts: [
      ["n", String(DEFAULTS.n)],
      ["Moldura", `${FRAME} bytes`],
      ["sp inicial", hx(SP0)],
    ],
  },
  outro: {
    title: "A pilha em resumo",
    text: "jal guarda o endereço de retorno em ra, e quem chama outra função precisa salvá-lo antes. O prólogo reserva uma moldura na pilha para ra e para os valores que devem sobreviver à chamada; o epílogo os recupera e devolve o espaço. A recursão empilha uma moldura por nível, e a pilha, finita, estoura se não houver caso base.",
    facts: (run) => [
      ["Resultado", num(Number(run.stats.result))],
      ["Molduras", String(run.stats.frames)],
      ["Níveis que cabem", num(Number(run.stats.levels))],
    ],
  },
  next: ["instrucao-riscv", "pipeline"],
};

export default lesson;
