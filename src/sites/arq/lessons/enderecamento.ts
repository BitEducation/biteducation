import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { BASE, LAST, MEMORY, type Mode, operand, POINTER, STEP, walk } from "../../../sim/arch/addressing.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Addressing modes: the same `load r1, ...` takes its operand from the instruction, from a register,
 * from memory at a fixed address, through a register, at base + displacement, or through a pointer
 * in memory; each mode costs a different number of memory reads.
 */
export const DEFAULTS = { r2: 100, desloc: 8 };
const MODES: Mode[] = [
  "imediato",
  "direto",
  "registrador",
  "indireto-registrador",
  "base-deslocamento",
  "indireto",
];
const NAMES: Record<Mode, string> = {
  imediato: "Imediato",
  direto: "Direto",
  registrador: "Registrador",
  "indireto-registrador": "Indireto por registrador",
  "base-deslocamento": "Base + deslocamento",
  indireto: "Indireto pela memória",
};

function clamp(p: Params) {
  const snap = (v: number) => Math.round(v / STEP) * STEP;
  const r2 = Math.min(LAST, Math.max(BASE, snap(Number(p.r2 ?? DEFAULTS.r2))));
  const disp = Math.min(LAST - r2, Math.max(0, snap(Number(p.desloc ?? DEFAULTS.desloc))));
  return { r2, disp };
}

const scene: SceneSpec = {
  viewBox: [960, 600],
  nodes: [],
  links: [],
  widgets: [
    {
      kind: "table",
      id: "memoria",
      title: "Memória (palavras)",
      at: [30, 50],
      columns: ["Endereço", "Valor"],
      widths: [100, 80],
      rows: MEMORY.length,
    },
    {
      kind: "table",
      id: "modos",
      title: "load r1, ... em cada modo",
      at: [260, 50],
      columns: ["Modo", "Escrito", "De onde vem", "r1", "Leituras"],
      widths: [190, 130, 170, 60, 80],
      rows: MODES.length,
    },
    { kind: "counter", id: "r2", title: "r2", at: [30, 350] },
    { kind: "counter", id: "r1", title: "r1 recebe", at: [260, 300] },
    { kind: "counter", id: "leituras", title: "Leituras de dados", at: [460, 300] },
    {
      kind: "table",
      id: "vetor",
      title: "Percorrendo um vetor a partir de r2",
      at: [260, 400],
      columns: ["i", "Deslocamento", "Endereço", "Valor", "Soma"],
      widths: [50, 120, 100, 80, 80],
      rows: 4,
    },
  ],
};

export function build(p: Params) {
  const { r2, disp } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const ops = Object.fromEntries(MODES.map((m) => [m, operand(m, r2, disp)])) as Record<
    Mode,
    ReturnType<typeof operand>
  >;
  const count = Math.min(4, (LAST - r2) / STEP + 1);
  const vec = walk(r2, count);
  const sum = vec[vec.length - 1]?.sum ?? 0;
  const memRow = (addr: number) => (addr - BASE) / STEP;
  const leitura = (n: number) => (n === 1 ? "1 leitura" : `${n} leituras`);

  const touch = (addrs: number[], dt = 1) =>
    addrs.forEach((a, i) => {
      c.row("memoria", memRow(a), [String(a), String(MEMORY[memRow(a)])], {
        dt: i === 0 ? dt : 0,
        mark: "hit",
        log: { who: "memória", what: `lê ${a}`, detail: String(MEMORY[memRow(a)]) },
      });
    });
  const show = (m: Mode, mark: "new" | "hit" = "new") => {
    const o = ops[m];
    c.row("modos", MODES.indexOf(m), [NAMES[m], o.syntax, o.path, String(o.value), String(o.reads)], {
      dt: 1,
      mark,
      log: { who: NAMES[m], what: `r1 = ${o.value}`, detail: leitura(o.reads) },
    });
    c.count("r1", String(o.value), { dt: 0, role: "a", label: `r1 = ${o.value}` });
    c.count("leituras", String(o.reads), { dt: 0, label: leitura(o.reads) });
  };

  b.step(
    {
      id: "s1-campo",
      title: "O número na instrução",
      subtitle: "Imediato e direto",
      text: `Toda instrução de carga precisa dizer onde está o operando, e o [[modo-de-enderecamento]] é a regra que interpreta o campo. No modo imediato, #${POINTER} é o próprio valor: r1 recebe ${ops.imediato.value} sem tocar a memória. No direto, ${POINTER} é um endereço e r1 recebe o que está lá, ${ops.direto.value}, com ${leitura(ops.direto.reads)}. O direto tem um custo escondido: o endereço inteiro precisa caber dentro da instrução.`,
      facts: [
        ["Imediato", `r1 = ${ops.imediato.value}`],
        ["Direto", `r1 = M[${POINTER}] = ${ops.direto.value}`],
        ["Leituras", `${ops.imediato.reads} e ${ops.direto.reads}`],
      ],
      highlight: [],
    },
    () => {
      MEMORY.forEach((v, i) => {
        c.row("memoria", i, [String(BASE + i * STEP), String(v)], { dt: i === 0 ? 1 : 0 });
      });
      c.count("r2", String(r2), { dt: 0, role: "b", label: `r2 = ${r2}` });
      show("imediato");
      show("direto");
      touch([POINTER], 0);
    },
  );

  b.step(
    {
      id: "s2-registrador",
      title: "O endereço num registrador",
      subtitle: `r2 = ${r2}`,
      text: `No modo registrador, o operando é o conteúdo de r2: ${ops.registrador.value}, sem memória. No indireto por registrador, escrito (r2), esse ${r2} é tratado como endereço, e r1 recebe ${ops["indireto-registrador"].value}. É assim que um ponteiro é seguido: o endereço foi calculado antes e mora num registrador. A instrução só precisa de poucos bits para dizer qual registrador, em vez de um endereço inteiro.`,
      facts: [
        ["Registrador", `r1 = ${ops.registrador.value}`],
        ["(r2)", `r1 = M[${r2}] = ${ops["indireto-registrador"].value}`],
        ["Campo", "5 bits para 32 registradores"],
      ],
      highlight: [],
    },
    () => {
      show("registrador");
      show("indireto-registrador");
      touch([r2], 0);
    },
  );

  b.step(
    {
      id: "s3-base",
      title: "Base mais deslocamento",
      subtitle: `${disp}(r2)`,
      text: `O modo mais usado soma uma constante pequena a um registrador: ${disp}(r2) lê o endereço ${r2} + ${disp} = ${r2 + disp}, e r1 recebe ${ops["base-deslocamento"].value}. Ele serve para campos de uma estrutura, em que r2 aponta o início e o deslocamento escolhe o campo, e para variáveis locais, contadas a partir do ponteiro de pilha. O deslocamento cabe em poucos bits porque costuma ser pequeno.`,
      facts: [
        ["Base", `r2 = ${r2}`],
        ["Deslocamento", String(disp)],
        ["Endereço lido", String(r2 + disp)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Com r2 = ${r2}, que valor load r1, ${disp}(r2) coloca em r1?`,
        answer: ops["base-deslocamento"].value,
        explain: `O endereço é ${r2} + ${disp} = ${r2 + disp}, e a memória guarda ${ops["base-deslocamento"].value} nele.`,
      },
    },
    () => {
      show("base-deslocamento", "hit");
      touch([r2 + disp], 0);
    },
  );

  const mid = MEMORY[memRow(POINTER)] ?? 0;
  b.step(
    {
      id: "s4-indireto",
      title: "Um ponteiro na memória",
      subtitle: `@${POINTER}`,
      text: `No indireto pela memória, o endereço ${POINTER} guarda outro endereço. A CPU lê ${POINTER} e acha ${mid}; lê ${mid} e acha ${ops.indireto.value}, que vai para r1. São ${leitura(ops.indireto.reads)} de dados para um só operando, e cada uma pode faltar na cache. Máquinas antigas tinham esse modo porque tinham poucos registradores; hoje o ponteiro costuma ser carregado num registrador e seguido com (r2).`,
      facts: [
        ["1ª leitura", `M[${POINTER}] = ${mid}`],
        ["2ª leitura", `M[${mid}] = ${ops.indireto.value}`],
        ["r1", String(ops.indireto.value)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Quantas leituras de memória, além da busca da instrução, load r1, @${POINTER} faz?`,
        answer: ops.indireto.reads,
        explain: `Uma em ${POINTER}, que dá o endereço ${mid}, e outra em ${mid}, que dá o valor: ${ops.indireto.reads}.`,
      },
    },
    () => {
      show("indireto", "hit");
      touch([POINTER, mid], 0);
    },
  );

  b.step(
    {
      id: "s5-vetor",
      title: "Andar por um vetor",
      subtitle: `${count === 1 ? "1 palavra" : `${count} palavras`} a partir de ${r2}`,
      text: `Um laço que soma um vetor usa base mais deslocamento com o deslocamento crescendo de ${STEP} em ${STEP}, o tamanho de uma palavra: ${vec.map((x) => `${x.disp}(r2)`).join(", ")}. Cada volta é ${leitura(1)}, ${count === 1 ? `mas a partir de ${r2} só resta uma palavra, e a soma é ${sum}` : `e a soma das ${count} palavras dá ${sum}`}. Na prática o compilador costuma somar ${STEP} ao próprio registrador a cada volta, e algumas arquiteturas têm um modo de autoincremento que faz isso na mesma instrução.`,
      facts: [
        ["Palavras", String(count)],
        ["Passo", `${STEP} bytes`],
        ["Soma", String(sum)],
      ],
      highlight: [],
    },
    () => {
      for (const x of vec) {
        c.row("vetor", x.i, [String(x.i), String(x.disp), String(x.addr), String(x.value), String(x.sum)], {
          dt: 1,
          mark: "new",
          log: { who: `volta ${x.i}`, what: `${x.disp}(r2)`, detail: `soma ${x.sum}` },
        });
        touch([x.addr], 0);
      }
    },
  );

  b.step(
    {
      id: "s6-riscv",
      title: "Poucos modos bastam",
      subtitle: "O que o RISC-V oferece",
      text: `O [[risc-v]] só tem três modos: imediato, registrador e base mais deslocamento, este com uma constante de 12 bits, de −2048 a 2047. Os outros saem de sequências: o direto vira lui mais lw, montando o endereço aos pedaços; o indireto pela memória vira dois lw seguidos. Com poucos modos, todas as instruções têm o mesmo tamanho e a decodificação fica simples, o que ajuda o [[pipeline]]. O x86 faz o caminho oposto e aceita muitas combinações numa só instrução.`,
      facts: [
        ["Modos do RISC-V", "3"],
        ["Deslocamento", "12 bits"],
        ["Indireto", "2 × lw"],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: `Como um RISC-V carrega o valor apontado pelo ponteiro guardado em ${POINTER}?`,
        options: [
          "Com dois lw: o primeiro traz o endereço, o segundo traz o valor",
          "Com um lw só, num modo indireto especial",
          "Não consegue: precisa de uma chamada de sistema",
        ],
        answer: 0,
        explain: `Sem modo indireto, o primeiro lw põe ${mid} num registrador e o segundo lê ${mid}, com base mais deslocamento 0.`,
      },
    },
    () => {
      for (const m of ["direto", "indireto-registrador", "indireto"] as Mode[])
        c.row(
          "modos",
          MODES.indexOf(m),
          [NAMES[m], ops[m].syntax, ops[m].path, String(ops[m].value), String(ops[m].reads)],
          { dt: 1, mark: "warn", log: { who: "RISC-V", what: NAMES[m], detail: "sem modo próprio" } },
        );
    },
  );

  return b.done({
    direct: ops.direto.value,
    viaReg: ops["indireto-registrador"].value,
    based: ops["base-deslocamento"].value,
    indirect: ops.indireto.value,
    reads: MODES.map((m) => ops[m].reads).join(","),
    sum,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "enderecamento",
    site: "arq",
    title: "Modos de endereçamento: onde está o operando",
    summary:
      "A mesma carga lê o operando da instrução, de um registrador, de um endereço fixo, através de um registrador, por base mais deslocamento ou por um ponteiro na memória, cada modo com seu custo.",
    area: "ISA",
    refs: [
      {
        book: "tanenbaum-sco",
        chapter: 5,
        section: "5.4",
        note: "Endereçamento",
        verified: true,
      },
    ],
    simplifications: [
      "Memória de oito palavras com endereços em bytes, de 4 em 4.",
      "A sintaxe dos modos é genérica; cada montador usa a sua.",
      "Só conta leituras de dados; a busca da instrução fica de fora.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "r2", kind: "int", label: "Valor de r2", min: BASE, max: LAST, step: STEP },
      { key: "desloc", kind: "int", label: "Deslocamento", min: 0, max: LAST - BASE, step: STEP },
    ],
  },
  build,
  intro: {
    text: "Uma instrução de carga diz de onde vem o valor, mas há vários jeitos de dizer. Você vai executar a mesma carga em seis modos sobre uma memória pequena e contar quantas vezes cada um precisa ir à memória.",
    facts: [
      ["Memória", `${MEMORY.length} palavras`],
      ["r2", String(DEFAULTS.r2)],
      ["Modos", String(MODES.length)],
    ],
  },
  outro: {
    title: "Endereçamento em resumo",
    text: "Imediato e registrador não tocam a memória; direto e indireto por registrador fazem uma leitura; base mais deslocamento, também uma, e é o modo de estruturas, pilha e vetores; o indireto pela memória faz duas. Arquiteturas RISC ficam com poucos modos e compõem os outros com sequências de instruções.",
    facts: (run) => [
      ["Base + desloc.", String(run.stats.based)],
      ["Indireto", String(run.stats.indirect)],
      ["Soma do vetor", String(run.stats.sum)],
    ],
  },
  next: ["instrucao-riscv", "pilha-chamadas"],
};

export default lesson;
