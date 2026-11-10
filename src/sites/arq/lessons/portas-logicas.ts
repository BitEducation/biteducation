import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { type Bit, type FullAdder, fullAdder, ripple } from "../../../sim/arch/logic.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { portasLogicas as practice } from "../practice.ts";

/**
 * From gates to an ALU: truth tables, NAND as a universal gate, half and full adders drawn as a
 * circuit, a 4-bit ripple-carry chain with its gate delays, and subtraction with the same adder.
 */
export const DEFAULTS = { a: 11, b: 6 };
const W = 4;

const G = { w: 64, h: 36 } as const;
const scene: SceneSpec = {
  viewBox: [960, 720],
  nodes: [
    { id: "A", kind: "box", label: "A", at: [70, 120], w: 56, h: 34 },
    { id: "B", kind: "box", label: "B", at: [70, 200], w: 56, h: 34 },
    { id: "Cin", kind: "box", label: "Cin", at: [70, 380], w: 56, h: 34 },
    { id: "X1", kind: "box", label: "XOR", at: [280, 120], ...G },
    { id: "N1", kind: "box", label: "AND", at: [280, 290], ...G },
    { id: "X2", kind: "box", label: "XOR", at: [500, 160], ...G },
    { id: "N2", kind: "box", label: "AND", at: [500, 330], ...G },
    { id: "OR", kind: "box", label: "OR", at: [700, 290], ...G },
    { id: "S", kind: "box", label: "S", at: [860, 160], w: 56, h: 34 },
    { id: "Cout", kind: "box", label: "Cout", at: [860, 290], w: 64, h: 34 },
  ],
  links: [
    { id: "w-a-x1", from: "A", to: "X1" },
    { id: "w-b-x1", from: "B", to: "X1", via: [[280, 200]] },
    {
      id: "w-a-n1",
      from: "A",
      to: "N1",
      via: [
        [150, 120],
        [150, 290],
      ],
    },
    {
      id: "w-b-n1",
      from: "B",
      to: "N1",
      via: [
        [220, 200],
        [220, 330],
        [280, 330],
      ],
    },
    {
      id: "w-x1-x2",
      from: "X1",
      to: "X2",
      via: [
        [390, 120],
        [390, 160],
      ],
    },
    {
      id: "w-x1-n2",
      from: "X1",
      to: "N2",
      via: [
        [390, 120],
        [390, 330],
      ],
    },
    {
      id: "w-c-x2",
      from: "Cin",
      to: "X2",
      via: [
        [430, 380],
        [430, 210],
        [500, 210],
      ],
    },
    { id: "w-c-n2", from: "Cin", to: "N2", via: [[500, 380]] },
    { id: "w-x2-s", from: "X2", to: "S" },
    { id: "w-n1-or", from: "N1", to: "OR" },
    { id: "w-n2-or", from: "N2", to: "OR", via: [[700, 330]] },
    { id: "w-or-c", from: "OR", to: "Cout" },
  ],
  widgets: [
    {
      kind: "grid",
      id: "soma",
      title: "Vai-um, A, B e soma",
      at: [60, 450],
      cols: 4,
      rows: 4,
      cellW: 46,
      indexLabel: "none",
    },
    {
      kind: "table",
      id: "verdade",
      title: "Tabela-verdade",
      at: [340, 450],
      columns: ["A", "B", "AND", "OR", "XOR", "NAND"],
      widths: [50, 50, 64, 64, 64, 64],
      rows: 4,
    },
    { kind: "counter", id: "atraso", title: "Atrasos de porta", at: [740, 450] },
    {
      kind: "table",
      id: "ula",
      title: "A mesma ULA, quatro operações",
      at: [340, 590],
      columns: ["Operação", "Bits", "Valor"],
      widths: [140, 120, 120],
      rows: 4,
    },
  ],
};

const SIGNALS: { id: string; links: string[]; val: (f: FullAdder) => Bit; name: string }[] = [
  { id: "A", links: ["w-a-x1", "w-a-n1"], val: (f) => f.a, name: "A" },
  { id: "B", links: ["w-b-x1", "w-b-n1"], val: (f) => f.b, name: "B" },
  { id: "Cin", links: ["w-c-x2", "w-c-n2"], val: (f) => f.cin, name: "Cin" },
  { id: "X1", links: ["w-x1-x2", "w-x1-n2"], val: (f) => f.x1, name: "A XOR B" },
  { id: "N1", links: ["w-n1-or"], val: (f) => f.n1, name: "A AND B" },
  { id: "X2", links: ["w-x2-s"], val: (f) => f.s, name: "soma" },
  { id: "N2", links: ["w-n2-or"], val: (f) => f.n2, name: "(A XOR B) AND Cin" },
  { id: "OR", links: ["w-or-c"], val: (f) => f.cout, name: "vai-um" },
  { id: "S", links: [], val: (f) => f.s, name: "S" },
  { id: "Cout", links: [], val: (f) => f.cout, name: "Cout" },
];

const bin = (v: number, n = W) => (v & (2 ** n - 1)).toString(2).padStart(n, "0");

export function build(p: Params) {
  const a = Math.min(15, Math.max(0, Math.round(Number(p.a ?? DEFAULTS.a))));
  const bv = Math.min(15, Math.max(0, Math.round(Number(p.b ?? DEFAULTS.b))));
  const b = lessonBuilder();
  const c = talk(b, { X1: "XOR 1", N1: "AND 1", X2: "XOR 2", N2: "AND 2" }, (t) => `${t}`);
  const rip = ripple(a, bv, W);

  // state events without a log line: wires and idle gates would flood the event table
  const quiet = (target: string, tone: "none" | "active", label: string) =>
    b.ev({ t: c.t, kind: "state", target, text: "", tone, role: "a", label });
  const wire = (id: string, v: Bit | null) => quiet(id, v ? "active" : "none", `fio ${id}: ${v ?? "—"}`);
  const setNode = (id: string, v: Bit | null, name: string, dt = 0) =>
    c.state(id, v === null ? "" : `= ${v}`, {
      tone: v === null ? "none" : v ? "active" : "none",
      label: v === null ? `${name}: inativo` : `${name} = ${v}`,
      dt,
    });
  const idle = (ids: string[]) => {
    for (const s of SIGNALS.filter((x) => ids.includes(x.id))) {
      quiet(s.id, "none", `${s.id} inativo`);
      for (const l of s.links) wire(l, null);
    }
  };
  const drive = (f: FullAdder, ids: string[]) => {
    for (const s of SIGNALS.filter((x) => ids.includes(x.id))) {
      const v = s.val(f);
      setNode(s.id, v, s.name, 1);
      for (const l of s.links) wire(l, v);
    }
  };

  const truth: [Bit, Bit][] = [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ];
  b.step(
    {
      id: "s1-portas",
      title: "Portas lógicas",
      subtitle: "AND, OR, XOR e NAND",
      text: `Dentro do chip, transistores funcionam como chaves, e poucas chaves formam uma [[porta-logica]]: um circuito cuja saída depende só das entradas naquele instante. AND dá 1 quando as duas entradas valem 1; OR, quando pelo menos uma vale; XOR, quando são diferentes. NAND é um AND invertido. Com quatro combinações de entrada, a tabela-verdade descreve cada porta por inteiro.`,
      facts: [
        ["AND", "1 só com 1 e 1"],
        ["OR", "1 se alguma for 1"],
        ["XOR", "1 se forem diferentes"],
      ],
      highlight: [],
    },
    () => {
      idle(SIGNALS.map((s) => s.id));
      truth.forEach(([x, y], i) => {
        c.row(
          "verdade",
          i,
          [String(x), String(y), String(x & y), String(x | y), String(x ^ y), String(1 - (x & y))],
          {
            dt: 1,
            mark: "new",
            log: { who: "tabela", what: `A=${x}, B=${y}`, detail: `AND ${x & y}, OR ${x | y}, XOR ${x ^ y}` },
          },
        );
      });
    },
  );

  b.step(
    {
      id: "s2-nand",
      title: "Tudo com NAND",
      subtitle: "Uma porta universal",
      text: `A NAND sozinha constrói qualquer circuito. Ligando as duas entradas juntas, ela vira um NOT. Uma NAND seguida de um NOT dá o AND. E, pela lei de De Morgan, A OR B é igual a (NOT A) NAND (NOT B). Por isso fábricas de chips podem usar blocos de um tipo só. A [[algebra-booleana]] permite trocar um circuito por outro equivalente, com menos portas ou mais rápido.`,
      facts: [
        ["NOT A", "A NAND A"],
        ["A AND B", "NOT (A NAND B)"],
        ["A OR B", "(NOT A) NAND (NOT B)"],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: "Quantas portas NAND são necessárias para montar um OR de duas entradas?",
        options: ["1", "2", "3", "4"],
        answer: 2,
        explain:
          "Duas NANDs viram NOTs, uma para cada entrada, e uma terceira NAND junta as duas: (NOT A) NAND (NOT B) = A OR B.",
      },
    },
    () => {
      const lines: [string, string][] = [
        ["NOT A", "1 porta: A NAND A"],
        ["A AND B", "2 portas: NAND e depois NOT"],
        ["A OR B", "3 portas: dois NOT e uma NAND"],
      ];
      lines.forEach(([what, detail], i) => {
        const [x, y] = truth[i + 1] ?? [0, 0];
        c.row(
          "verdade",
          i + 1,
          [String(x), String(y), String(x & y), String(x | y), String(x ^ y), String(1 - (x & y))],
          {
            dt: 1,
            mark: "hit",
            log: { who: "NAND", what, detail },
          },
        );
      });
    },
  );

  const c0 = rip.cols[0] as FullAdder;
  const half = fullAdder(c0.a, c0.b, 0);
  b.step(
    {
      id: "s3-meio-somador",
      title: "O meio-somador",
      subtitle: `${half.a} + ${half.b}`,
      text: `Somar dois bits dá um bit de soma e um vai-um. Olhando a tabela, a soma é exatamente o XOR, e o vai-um é o AND: 1 + 1 = 10 em binário. Duas portas formam o [[meio-somador]]. Com os bits menos significativos de A = ${a} e B = ${bv}, ${half.a} + ${half.b} dá soma ${half.x1} e vai-um ${half.n1}. Falta uma coisa: ele não recebe o vai-um da coluna anterior.`,
      facts: [
        ["Entradas", `${half.a} e ${half.b}`],
        ["Soma (XOR)", String(half.x1)],
        ["Vai-um (AND)", String(half.n1)],
      ],
      highlight: ["X1", "N1"],
    },
    () => {
      idle(["Cin", "X2", "N2", "OR", "S", "Cout"]);
      drive(half, ["A", "B", "X1", "N1"]);
    },
  );

  // the most instructive column: the first one that receives a carry, else column 1
  const withCarry = rip.cols.findIndex((f) => f.cin === 1);
  const col = withCarry >= 0 ? withCarry : 1;
  const fa = rip.cols[col] as FullAdder;
  b.step(
    {
      id: "s4-somador-completo",
      title: "O somador completo",
      subtitle: `Coluna ${col}: ${fa.a} + ${fa.b} + ${fa.cin}`,
      text: `O [[somador-completo]] junta dois meio-somadores e um OR para aceitar o vai-um de entrada. Na coluna ${col} de ${a} + ${bv}, entram A = ${fa.a}, B = ${fa.b} e Cin = ${fa.cin}. O primeiro XOR dá ${fa.x1}; o segundo, com Cin, dá a soma ${fa.s}. O vai-um sai ${fa.cout}: ${fa.n1 ? "o primeiro AND já viu A e B em 1" : fa.n2 ? "veio pelo segundo AND, porque A XOR B e Cin valem 1" : "nenhum dos dois AND ligou"}.`,
      facts: [
        ["Entradas", `A ${fa.a}, B ${fa.b}, Cin ${fa.cin}`],
        ["Soma", String(fa.s)],
        ["Vai-um", String(fa.cout)],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: `Com A = ${fa.a}, B = ${fa.b} e vai-um de entrada ${fa.cin}, qual é o vai-um de saída?`,
        options: ["0", "1"],
        answer: fa.cout,
        explain: `${fa.a} + ${fa.b} + ${fa.cin} = ${fa.a + fa.b + fa.cin}, que em binário é ${(fa.a + fa.b + fa.cin).toString(2).padStart(2, "0")}: soma ${fa.s}, vai-um ${fa.cout}.`,
      },
    },
    () => {
      drive(fa, ["A", "B", "Cin", "X1", "N1", "X2", "N2", "OR", "S", "Cout"]);
    },
  );

  b.step(
    {
      id: "s5-cascata",
      title: "Quatro somadores em fila",
      subtitle: `${a} + ${bv} em 4 bits`,
      text: `Encadeando quatro somadores completos, o vai-um de cada coluna entra na seguinte: ${bin(a)} + ${bin(bv)} = ${rip.carryOut ? "1" : ""}${rip.sum.slice().reverse().join("")}${rip.carryOut ? `, e o vai-um final mostra que ${a + bv} não cabe em 4 bits` : ""}. O custo é o tempo. Cada porta leva um instante para responder, e o vai-um pode ter de atravessar duas portas por coluna, então o circuito espera o pior caso: ${rip.settle} [[atraso-de-porta|atrasos]]. Com 64 bits seriam ${2 * 64 + 1}, por isso CPUs calculam o vai-um antecipado.`,
      facts: [
        ["A + B", `${a} + ${bv} = ${a + bv}`],
        ["Em 4 bits", `${rip.sum.slice().reverse().join("")}, vai-um ${rip.carryOut}`],
        ["Atrasos", String(rip.settle)],
      ],
      highlight: [],
    },
    () => {
      for (let i = 0; i < W; i++) {
        const f = rip.cols[W - 1 - i] as FullAdder;
        c.cell("soma", 4 + i, String(f.a), { dt: i === 0 ? 1 : 0, role: "a", label: `A bit ${W - 1 - i}` });
        c.cell("soma", 8 + i, String(f.b), { role: "b", label: `B bit ${W - 1 - i}` });
        c.cell("soma", i, "", { role: "muted", label: "limpa" });
        c.cell("soma", 12 + i, "", { role: "muted", label: "limpa" });
      }
      for (let j = 0; j < W; j++) {
        const f = rip.cols[j] as FullAdder;
        const pos = W - 1 - j;
        c.cell("soma", pos, f.cin ? "1" : "0", { dt: 1, role: "muted", label: `vai-um para a coluna ${j}` });
        c.cell("soma", 12 + pos, String(f.s), {
          mark: "new",
          role: "s4",
          label: `soma, bit ${j}`,
          log: {
            who: `coluna ${j}`,
            what: `${f.a} + ${f.b} + ${f.cin}`,
            detail: `soma ${f.s}, vai-um ${f.cout}, pronta após ${rip.sumAt[j]} atrasos`,
          },
        });
        c.count("atraso", String(rip.carryAt[j]), {
          label: `vai-um da coluna ${j} pronto em ${rip.carryAt[j]}`,
        });
      }
    },
  );

  const sub = ripple(a, ~bv & 0xf, W, 1);
  const subVal = Number.parseInt(sub.sum.slice().reverse().join(""), 2);
  // read as unsigned when the true difference is not negative, as two's complement otherwise
  const diff = a - bv;
  const signedSub = diff >= 0 ? subVal : subVal >= 8 ? subVal - 16 : subVal;
  const minus = (n: number) => String(n).replace("-", "−");
  const ops: [string, number][] = [
    ["A + B", (a + bv) & 0xf],
    ["A − B", subVal],
    ["A AND B", a & bv],
    ["A OR B", a | bv],
  ];
  b.step(
    {
      id: "s6-ula",
      title: "Da soma à ULA",
      subtitle: `${a} − ${bv} com o mesmo somador`,
      text: `Para subtrair, a [[ula]] inverte os bits de B e liga o vai-um de entrada da primeira coluna: A + NOT B + 1 é A − B em complemento de dois. ${a} − ${bv} vira ${bin(a)} + ${bin(~bv & 0xf)} + 1 = ${bin(subVal)}${diff >= 0 ? `, ou ${subVal}` : `, que em complemento de dois vale ${minus(signedSub)}`}${diff !== signedSub ? `, e não ${minus(diff)}: em 4 bits com sinal só cabe de −8 a 7` : ""}. Portas AND e OR calculam as outras operações ao lado, e um multiplexador escolhe qual resultado sai, conforme o código da instrução.`,
      facts: [
        ["NOT B", bin(~bv & 0xf)],
        ["A − B", `${bin(subVal)} = ${minus(signedSub)}`],
        ["Seletor", "multiplexador"],
      ],
      highlight: [],
    },
    () => {
      ops.forEach(([name, v], i) => {
        c.row("ula", i, [name, bin(v), name === "A − B" ? minus(signedSub) : String(v)], {
          dt: 1,
          ...(i === 1 ? { mark: "new" as const } : {}),
          log: { who: "ULA", what: name, detail: bin(v) },
        });
      });
    },
  );

  return b.done({
    half: `${half.x1}${half.n1}`,
    col,
    cout: fa.cout,
    sum: rip.sum.slice().reverse().join(""),
    carry: rip.carryOut,
    settle: rip.settle,
    sub: signedSub,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "portas-logicas",
    site: "arq",
    title: "Das portas lógicas ao somador",
    summary:
      "Tabelas-verdade, a NAND como porta universal, meio-somador e somador completo num circuito aceso fio a fio, a soma de 4 bits com seus atrasos e a subtração pela mesma ULA.",
    area: "Lógica digital",
    refs: [
      {
        book: "tanenbaum-sco",
        chapter: 3,
        section: "3.1",
        note: "Portas e álgebra booleana",
        verified: true,
      },
      {
        book: "tanenbaum-sco",
        chapter: 3,
        section: "3.2.3",
        note: "Circuitos aritméticos",
        verified: true,
      },
    ],
    simplifications: [
      "Toda porta leva o mesmo tempo para responder; na prática XOR costuma ser mais lenta que NAND.",
      "Somador de 4 bits; os de 32 e 64 bits usam vai-um antecipado em vez de uma fila simples.",
      "O multiplexador que escolhe a operação da ULA aparece só no texto.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "a", kind: "int", label: "Número A", min: 0, max: 15, help: "4 bits, de 0 a 15." },
      { key: "b", kind: "int", label: "Número B", min: 0, max: 15 },
    ],
  },
  build,
  intro: {
    text: "Toda conta da CPU acaba em portas lógicas, circuitos de poucos transistores que só sabem combinar zeros e uns. Você vai partir das tabelas-verdade, montar um somador acendendo fio a fio, encadear quatro deles e ver a mesma peça subtrair.",
    facts: [
      ["A", String(DEFAULTS.a)],
      ["B", String(DEFAULTS.b)],
      ["Largura", "4 bits"],
    ],
  },
  outro: {
    title: "Portas lógicas em resumo",
    text: "Portas combinam bits; com NAND dá para montar todas. Um XOR e um AND somam dois bits; dois desses e um OR formam o somador completo. Em fila, os somadores fazem contas de n bits, ao custo de esperar o vai-um atravessar tudo. Invertendo B e ligando o vai-um inicial, o mesmo circuito subtrai.",
    facts: (run) => [
      ["Soma em 4 bits", String(run.stats.sum)],
      ["Atrasos", String(run.stats.settle)],
      ["A − B", String(run.stats.sub)],
    ],
  },
  next: ["inteiros", "pipeline"],
  practice,
};

export default lesson;
