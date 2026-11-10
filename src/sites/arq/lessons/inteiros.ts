import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { addBits, bitsOf, hexOf, signed, unsigned } from "../../../sim/arch/ints.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { inteiros as practice } from "../practice.ts";

/**
 * 8-bit integers: binary weights, hex, two's complement of a negative, one adder for both signs,
 * overflow and sign extension to 16 bits.
 */
export const DEFAULTS = { a: 77, b: 100 };
const W = 8;

const scene: SceneSpec = {
  viewBox: [960, 570],
  nodes: [],
  links: [],
  widgets: [
    {
      kind: "grid",
      id: "bits",
      title: "Um registrador de 8 bits",
      at: [60, 50],
      cols: 8,
      rows: 1,
      cellW: 50,
      indexLabel: "bit",
    },
    {
      kind: "table",
      id: "leitura",
      title: "O mesmo padrão lido de vários jeitos",
      at: [560, 40],
      columns: ["Leitura", "Valor"],
      widths: [140, 200],
      rows: 4,
    },
    {
      kind: "grid",
      id: "soma",
      title: "Soma coluna a coluna · linhas: vai-um, A, B, resultado",
      at: [60, 200],
      cols: 8,
      rows: 4,
      cellW: 50,
      indexLabel: "none",
    },
    {
      kind: "table",
      id: "flags",
      title: "Sinalizadores da ULA",
      at: [560, 210],
      columns: ["Sinal", "Valor", "Quer dizer"],
      widths: [70, 60, 210],
      rows: 2,
    },
    {
      kind: "grid",
      id: "ext",
      title: "O mesmo número em 16 bits",
      at: [60, 450],
      cols: 16,
      rows: 1,
      cellW: 44,
      indexLabel: "bit",
    },
  ],
};

export function build(p: Params) {
  const a = Math.min(127, Math.max(1, Number(p.a ?? DEFAULTS.a)));
  const bv = Math.min(127, Math.max(-128, Number(p.b ?? DEFAULTS.b)));
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => `${t}`);
  const A = bitsOf(a, W);
  const inv = A.map((x) => 1 - x);
  const N = bitsOf(-a, W);
  const B = bitsOf(bv, W);
  const weights = A.map((x, i) => (x ? 2 ** (W - 1 - i) : 0)).filter(Boolean);
  const nib = (bits: readonly number[]) => `${bits.slice(0, 4).join("")} ${bits.slice(4).join("")}`;

  const showBits = (bits: readonly number[], what: string, mark?: "new" | "hit") =>
    bits.forEach((x, i) => {
      c.cell("bits", i, String(x), {
        dt: i === 0 ? 1 : 0,
        ...(mark && x ? { mark } : {}),
        role: x ? "a" : "muted",
        label: `${what}: bit ${W - 1 - i} = ${x}`,
        ...(i === 0 ? { log: { who: "registrador", what, detail: nib(bits) } } : {}),
      });
    });
  const readings = (bits: readonly number[]) => {
    c.row("leitura", 0, ["Binário", nib(bits)]);
    c.row("leitura", 1, ["Hexadecimal", `0x${hexOf(bits)}`]);
    c.row("leitura", 2, ["Sem sinal", String(unsigned(bits))]);
    c.row("leitura", 3, ["Com sinal", String(signed(bits))], {
      log: {
        who: "leitura",
        what: `0x${hexOf(bits)}`,
        detail: `${unsigned(bits)} sem sinal, ${signed(bits)} com sinal`,
      },
    });
  };

  b.step(
    {
      id: "s1-binario",
      title: "Pesos de dois",
      subtitle: `${a} em 8 bits`,
      text: `Um registrador guarda só [[bit|bits]]. Cada posição vale o dobro da vizinha da direita: 1, 2, 4, até 128 no bit 7. Para escrever ${a}, ligamos os bits cujos pesos somam ${a}: ${weights.join(" + ")}. O resultado é ${nib(A)}. Lido sem sinal, um padrão de 8 bits vai de 0 a 255.`,
      facts: [
        ["Decimal", String(a)],
        ["Soma dos pesos", weights.join(" + ")],
        ["Binário", nib(A)],
      ],
      highlight: [],
    },
    () => {
      showBits(A, `${a}`, "new");
      c.row("leitura", 0, ["Binário", nib(A)]);
      c.row("leitura", 2, ["Sem sinal", String(a)]);
    },
  );

  b.step(
    {
      id: "s2-hex",
      title: "Quatro bits, um dígito",
      subtitle: "Hexadecimal",
      text: `Ler sequências longas de zeros e uns cansa e provoca erros. Como 16 = 2⁴, cada grupo de 4 bits vira exatamente um dígito [[hexadecimal]], de 0 a F. ${nib(A)} se lê ${hexOf(A.slice(0, 4))} e ${hexOf(A.slice(4))}: 0x${hexOf(A)}. Por isso endereços, cores e conteúdos de memória aparecem em hexadecimal nos depuradores.`,
      facts: [
        ["Primeiro grupo", `${A.slice(0, 4).join("")} = ${hexOf(A.slice(0, 4))}`],
        ["Segundo grupo", `${A.slice(4).join("")} = ${hexOf(A.slice(4))}`],
        ["Hexadecimal", `0x${hexOf(A)}`],
      ],
      highlight: [],
    },
    () => {
      readings(A);
    },
  );

  const rest = N.slice(1).reduce((n, x, i) => n + (x ? 2 ** (W - 2 - i) : 0), 0);
  b.step(
    {
      id: "s3-negativo",
      quiz: {
        kind: "number",
        prompt: "Em 8 bits, −1 vira 1111 1111 em complemento de dois. Lido sem sinal, que número é esse?",
        answer: 255,
        explain:
          "Sem sinal, os oito pesos somam 128 + 64 + … + 1 = 255. Com sinal, o bit 7 vale −128 e o resto soma 127: −128 + 127 = −1. Mesmo padrão, duas leituras.",
      },
      title: "Guardando um negativo",
      subtitle: `−${a} em complemento de dois`,
      text: `Para −${a}, o [[complemento-de-dois]] inverte todos os bits (${nib(inv)}) e soma 1: ${nib(N)}. O truque é que o bit 7 passa a valer −128: −128 + ${rest} = −${a}. Assim existe um único zero e a faixa vai de −128 a 127. O mesmo padrão, lido sem sinal, é ${unsigned(N)}: os bits não dizem qual leitura é a certa, a instrução é que diz.`,
      facts: [
        ["Invertido", nib(inv)],
        ["Mais 1", nib(N)],
        ["Peso do bit 7", "−128"],
      ],
      highlight: [],
    },
    () => {
      showBits(inv, "invertido");
      showBits(N, `−${a}`, "new");
      readings(N);
    },
  );

  const sub = addBits(B, N);
  const subOk = !sub.overflow;
  const fillSum = (x: readonly number[], y: readonly number[], r: ReturnType<typeof addBits>) => {
    for (let i = 0; i < W; i++) {
      c.cell("soma", i, "", { dt: i === 0 ? 1 : 0, role: "muted", label: "Limpa" });
      c.cell("soma", 8 + i, String(x[i]), { role: "a", label: `A bit ${W - 1 - i}` });
      c.cell("soma", 16 + i, String(y[i]), { role: "b", label: `B bit ${W - 1 - i}` });
      c.cell("soma", 24 + i, "", { role: "muted", label: "Limpa" });
    }
    for (let i = W - 1; i >= 0; i--) {
      c.cell("soma", i, r.carries[i] ? "1" : "", {
        dt: 1,
        role: "muted",
        label: `vai-um para a coluna ${W - 1 - i}`,
      });
      const cin = r.carries[i] ?? 0;
      const total = (x[i] ?? 0) + (y[i] ?? 0) + cin;
      c.cell("soma", 24 + i, String(r.sum[i]), {
        mark: "new",
        role: "s4",
        label: `Resultado, bit ${W - 1 - i}`,
        log: {
          who: `bit ${W - 1 - i}`,
          what: `${x[i]} + ${y[i]} + ${cin} = ${total}`,
          detail: `fica ${total % 2}, vai ${total >= 2 ? 1 : 0}`,
        },
      });
    }
    c.row("flags", 0, [
      "C",
      String(r.carryOut),
      r.carryOut ? "saiu um vai-um do bit 7" : "nada saiu do bit 7",
    ]);
    c.row(
      "flags",
      1,
      [
        "V",
        r.overflow ? "1" : "0",
        r.overflow ? "o resultado com sinal não cabe" : "o resultado com sinal cabe",
      ],
      {
        ...(r.overflow ? { mark: "bad" as const } : {}),
      },
    );
  };
  b.step(
    {
      id: "s4-soma",
      title: "Um somador para tudo",
      subtitle: `${bv} + (−${a})`,
      text: `A grande vantagem do complemento de dois: a mesma [[ula]] soma números com e sem sinal. Para ${bv} − ${a}, basta somar ${bv} com o padrão de −${a}, coluna a coluna, com o vai-um. ${subOk ? `O resultado é ${signed(sub.sum)}.` : `Mas ${bv - a} não cabe em 8 bits com sinal: aparece ${signed(sub.sum)}.`} ${sub.carryOut ? "O vai-um que sai do bit 7 é descartado; ele não indica erro numa soma com sinal." : "Nenhum vai-um sai do bit 7."}`,
      facts: [
        ["Conta", `${bv} + (−${a})`],
        ["Resultado", `${nib(sub.sum)} = ${signed(sub.sum)}`],
        ["Vai-um final", String(sub.carryOut)],
      ],
      highlight: [],
    },
    () => fillSum(B, N, sub),
  );

  const add = addBits(A, B);
  b.step(
    {
      id: "s5-overflow",
      title: "Quando não cabe",
      subtitle: `${a} + ${bv}`,
      text: add.overflow
        ? `Agora ${a} + ${bv} = ${a + bv}, que passa de 127. A ULA soma do mesmo jeito e o bit 7 liga: lido com sinal, o resultado vira ${signed(add.sum)}. É o [[overflow]]. A ULA percebe porque o vai-um que entra no bit 7 é diferente do que sai dele, e liga o sinalizador V. Cabe ao programa, ou à linguagem, verificar.`
        : `Agora ${a} + ${bv} = ${a + bv}, que cabe entre −128 e 127: o resultado sai certo e V fica em 0. Quando não cabe, a ULA percebe porque o vai-um que entra no bit 7 é diferente do que sai dele, e liga V: é o [[overflow]]. No Laboratório, tente um B que leve a soma acima de 127.`,
      facts: [
        ["Conta", `${a} + ${bv} = ${a + bv}`],
        ["Em 8 bits, com sinal", String(signed(add.sum))],
        ["V", add.overflow ? "1 (overflow)" : "0"],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Somando ${a} e ${bv} em 8 bits, que valor com sinal o registrador vai mostrar?`,
        answer: signed(add.sum),
        explain: `O padrão resultante é ${nib(add.sum)}. Com o bit 7 valendo −128, ele é lido como ${signed(add.sum)}${add.overflow ? `, e não ${a + bv}: faltou bit` : ""}.`,
      },
    },
    () => fillSum(A, B, add),
  );

  const ext = bitsOf(-a, 16);
  b.step(
    {
      id: "s6-extensao",
      title: "Mais bits, mesmo valor",
      subtitle: "Extensão de sinal",
      text: `Ao copiar −${a} para um registrador de 16 bits, não dá para encher a parte de cima com zeros: 0x00${hexOf(N)} seria ${unsigned(N)}. A [[extensao-de-sinal]] repete o bit 7 em todos os bits novos: 0x${hexOf(ext)}, que continua valendo −${a}. É o que uma instrução de carga com sinal faz ao trazer um byte da memória.`,
      facts: [
        ["8 bits", `0x${hexOf(N)}`],
        ["Com zeros", `0x00${hexOf(N)} = ${unsigned(N)}`],
        ["Com sinal", `0x${hexOf(ext)} = ${signed(ext)}`],
      ],
      highlight: [],
    },
    () => {
      ext.forEach((x, i) => {
        c.cell("ext", i, String(x), {
          dt: i === 0 ? 1 : 0,
          ...(i < 8 ? { mark: "new" as const } : {}),
          role: i < 8 ? "s4" : x ? "a" : "muted",
          label: i < 8 ? "cópia do bit de sinal" : `bit ${15 - i}`,
          ...(i === 0 ? { log: { who: "16 bits", what: "estende o sinal", detail: `0x${hexOf(ext)}` } } : {}),
        });
      });
    },
  );

  return b.done({
    neg: hexOf(N),
    sub: signed(sub.sum),
    add: signed(add.sum),
    v: add.overflow ? 1 : 0,
    ext: hexOf(ext),
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "inteiros",
    site: "arq",
    title: "Inteiros em binário: pesos, hexadecimal e complemento de dois",
    summary:
      "Um número em 8 bits, o mesmo padrão lido com e sem sinal, uma soma que serve para os dois, o overflow e a extensão de sinal.",
    area: "Representação",
    refs: [
      {
        book: "tanenbaum-sco",
        chapter: "A",
        section: "A.2",
        note: "Sistemas de números de base",
        verified: true,
      },
      {
        book: "tanenbaum-sco",
        chapter: "A",
        section: "A.4",
        note: "Números binários negativos",
        verified: true,
      },
      { book: "tanenbaum-sco", chapter: "A", section: "A.5", note: "Aritmética binária", verified: true },
    ],
    simplifications: [
      "Registradores de 8 bits; os de verdade têm 32 ou 64, com a mesma lógica.",
      "O sinalizador C aparece só como saída do bit 7; em subtrações algumas arquiteturas o invertem.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "a", kind: "int", label: "Número A (positivo)", min: 1, max: 127 },
      {
        key: "b",
        kind: "int",
        label: "Número B",
        min: -128,
        max: 127,
        help: "Usado nas somas dos passos 4 e 5.",
      },
    ],
  },
  build,
  intro: {
    text: "Dentro do processador não existem sinais de menos nem dígitos de 0 a 9, só bits. Você vai montar um número em 8 bits, ver o mesmo padrão significar coisas diferentes e entender por que quase todo computador usa complemento de dois: uma única soma serve para positivos e negativos.",
    facts: [
      ["Largura", "8 bits"],
      ["A", String(DEFAULTS.a)],
      ["B", String(DEFAULTS.b)],
    ],
  },
  outro: {
    title: "Inteiros em resumo",
    text: "Cada bit tem um peso de dois; o hexadecimal agrupa de 4 em 4. No complemento de dois o bit mais alto tem peso negativo, e a mesma soma serve para qualquer sinal. Quando o resultado não cabe, a ULA liga o sinalizador de overflow; ao ampliar a largura, o bit de sinal é repetido.",
    facts: (run) => [
      ["−A em 8 bits", `0x${run.stats.neg}`],
      ["A + B em 8 bits", String(run.stats.add)],
      ["−A em 16 bits", `0x${run.stats.ext}`],
    ],
  },
  next: ["instrucao-riscv", "cache-direta"],
  practice,
};

export default lesson;
