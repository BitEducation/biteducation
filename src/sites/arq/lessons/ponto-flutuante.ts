import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import { BIAS, binaryDigits, f32Bits, fields, fromBits, ulp } from "../../../sim/arch/float.ts";
import { hexOf } from "../../../sim/arch/ints.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { pontoFlutuante as practice } from "../practice.ts";

/**
 * IEEE 754 single precision: binary scientific notation, sign, biased exponent, fraction with the
 * hidden bit, rounding of 0.1, the growing gap between neighbours and the special values.
 */
export const DEFAULTS = { valor: "-6,375" };
const FALLBACK = -6.375;

const scene: SceneSpec = {
  viewBox: [960, 560],
  nodes: [],
  links: [],
  widgets: [
    {
      kind: "grid",
      id: "bits",
      title: "32 bits · sinal, expoente (8), fração (23)",
      at: [48, 50],
      cols: 32,
      rows: 1,
      cellW: 23,
      indexLabel: "bit",
    },
    {
      kind: "table",
      id: "conta",
      title: "Do decimal ao padrão",
      at: [48, 140],
      columns: ["Etapa", "Valor"],
      widths: [130, 330],
      rows: 4,
    },
    {
      kind: "table",
      id: "campos",
      title: "Os três campos",
      at: [530, 140],
      columns: ["Campo", "Bits", "Vale"],
      widths: [80, 230, 110],
      rows: 3,
    },
    {
      kind: "table",
      id: "tabela",
      title: "Casos que pedem cuidado",
      at: [48, 330],
      columns: ["Número", "Padrão", "Observação"],
      widths: [250, 130, 482],
      rows: 5,
    },
  ],
};

const SUP: Record<string, string> = {
  "-": "⁻",
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};
const sup = (n: number) => [...String(n)].map((ch) => SUP[ch] ?? ch).join("");
/** pt-BR decimal comma. */
const dec = (n: number) => String(n).replace(".", ",").replace("-", "−");
/** a × 10ⁿ with three significant digits, for tiny errors and gaps. */
function sci(n: number): string {
  if (n === 0) return "0";
  const e = Math.floor(Math.log10(Math.abs(n)));
  if (e >= -3 && e <= 6) return dec(Number(n.toPrecision(3)));
  return `${dec(Number((n / 10 ** e).toPrecision(3)))} × 10${sup(e)}`;
}

export function parseValue(raw: unknown): number {
  const x = Number(String(raw ?? "").replace(",", "."));
  // Zero and huge values have their own step; the walk-through needs a normal float32.
  if (!Number.isFinite(x) || x === 0 || Math.abs(x) > 3e38 || Math.abs(x) < 1e-8) return FALLBACK;
  return x;
}

const ROLE: Record<"s" | "e" | "f", Role> = { s: "s3", e: "b", f: "a" };
const part = (i: number) => (i === 0 ? "s" : i < 9 ? "e" : "f");
const grp = (bits: readonly number[]) => bits.join("").replace(/(.{4})(?=.)/g, "$1 ");

export function build(p: Params) {
  const x = parseValue(p.valor);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => `${t}`);
  const X = dec(x);
  const bits = f32Bits(x);
  const fl = fields(bits);
  const stored = fromBits(bits);
  const exact = stored === x;
  const digits = binaryDigits(x);
  const allDigits = (digits.int + digits.frac).replace(/^0+/, "");
  const mant = allDigits.slice(1);
  const MAXM = 14;
  const mantShown = mant.length > MAXM ? `${mant.slice(0, MAXM)}…` : mant || "0";
  const binShown =
    digits.frac.length > MAXM
      ? `${digits.int},${digits.frac.slice(0, MAXM)}…`
      : digits.frac
        ? `${digits.int},${digits.frac}`
        : digits.int;
  const norm = `1,${mantShown} × 2${sup(digits.exp)}`;
  const expBits = bits.slice(1, 9);
  const fracBits = bits.slice(9);
  const lastOne = fracBits.lastIndexOf(1);
  const fracShort = lastOne < 0 ? "0" : fracBits.slice(0, lastOne + 1).join("");

  const draw = (bs: readonly number[], from: number, to: number, what: string, mark = true) => {
    for (let i = from; i < to; i++)
      c.cell("bits", i, String(bs[i]), {
        dt: i === from ? 1 : 0,
        role: ROLE[part(i)],
        ...(mark ? { mark: "new" as const } : {}),
        label: `${what}: bit ${31 - i} = ${bs[i]}`,
        ...(i === from ? { log: { who: "float32", what, detail: grp(bs.slice(from, to)) } } : {}),
      });
  };
  const drawAll = (bs: readonly number[], what: string) => draw(bs, 0, 32, what, false);

  b.step(
    {
      id: "s1-cientifica",
      title: "Notação científica binária",
      subtitle: `${X} na base 2`,
      text: `Um registrador não tem vírgula. Para guardar ${X}, o [[ponto-flutuante]] usa notação científica na base 2. Em binário, ${X} é ${x < 0 ? "−" : ""}${binShown}. Deslocando a vírgula até sobrar um único 1 antes dela, fica ${x < 0 ? "−" : ""}${norm}. Todo número diferente de zero normalizado assim começa com 1. O padrão [[ieee-754]] aproveita isso e nem guarda esse 1.`,
      facts: [
        ["Decimal", X],
        ["Binário", `${x < 0 ? "−" : ""}${binShown}`],
        ["Normalizado", `${x < 0 ? "−" : ""}${norm}`],
      ],
      highlight: [],
    },
    () => {
      for (let i = 0; i < 32; i++)
        c.cell("bits", i, "", { dt: i === 0 ? 1 : 0, role: ROLE[part(i)], label: "vazio" });
      c.row("conta", 0, ["Decimal", X]);
      c.row("conta", 1, ["Binário", `${x < 0 ? "−" : ""}${binShown}`]);
      c.row("conta", 2, ["Normalizado", `${x < 0 ? "−" : ""}${norm}`], {
        log: { who: "normaliza", what: `expoente ${dec(digits.exp)}`, detail: norm },
      });
    },
  );

  b.step(
    {
      id: "s2-sinal-expoente",
      title: "Sinal e expoente",
      subtitle: `Expoente ${dec(fl.exp)} com viés ${BIAS}`,
      text: `O bit 31 é o sinal: ${fl.sign}, porque o número é ${x < 0 ? "negativo" : "positivo"}. Os 8 bits seguintes guardam o expoente com [[vies]]: em vez de ${dec(fl.exp)}, vai ${dec(fl.exp)} + ${BIAS} = ${fl.stored}, ou ${grp(expBits)}. Assim o campo nunca é negativo, e dois números positivos podem ser comparados como inteiros comuns: quem tem o padrão maior é o maior.`,
      facts: [
        ["Sinal", String(fl.sign)],
        ["Expoente real", dec(fl.exp)],
        ["Campo", `${fl.stored} = ${grp(expBits)}`],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `O expoente de ${X} normalizado é ${dec(fl.exp)}. Que número, em decimal, vai no campo de 8 bits do expoente?`,
        answer: fl.stored,
        explain: `O campo guarda o expoente somado ao viés: ${dec(fl.exp)} + ${BIAS} = ${fl.stored}, que em binário é ${grp(expBits)}.`,
      },
    },
    () => {
      draw(bits, 0, 1, "sinal");
      draw(bits, 1, 9, `expoente ${fl.stored}`);
      c.row("campos", 0, ["Sinal", String(fl.sign), x < 0 ? "negativo" : "positivo"]);
      c.row("campos", 1, ["Expoente", grp(expBits), `${fl.stored} − ${BIAS} = ${dec(fl.exp)}`]);
    },
  );

  b.step(
    {
      id: "s3-fracao",
      title: "A fração",
      subtitle: `0x${hexOf(bits)}`,
      text: `Os 23 bits finais recebem os dígitos depois do 1 escondido: ${fracShort}${exact ? ", completados com zeros" : ", arredondados para o vizinho mais próximo porque não cabem todos"}. Com o 1 implícito, são 24 bits de precisão. Os 32 bits juntos formam 0x${hexOf(bits)}. Para ler de volta: (−1)^sinal × 1,fração × 2^(expoente − ${BIAS}).${exact ? ` O resultado é exatamente ${X}.` : ` O valor guardado é ${dec(Number(stored.toPrecision(9)))}, não ${X}.`}`,
      facts: [
        ["Fração", fracShort],
        ["Hexadecimal", `0x${hexOf(bits)}`],
        ["Guardado", exact ? `${X} (exato)` : dec(Number(stored.toPrecision(9)))],
      ],
      highlight: [],
    },
    () => {
      draw(bits, 9, 32, "fração");
      c.row("campos", 2, [
        "Fração",
        `${fracShort.slice(0, 22)}${fracShort.length > 22 ? "…" : ""}`,
        "1, implícito",
      ]);
      c.row("conta", 3, ["Hexadecimal", `0x${hexOf(bits)}`], {
        mark: exact ? "hit" : "warn",
        log: { who: "float32", what: `0x${hexOf(bits)}`, detail: exact ? "exato" : "arredondado" },
      });
    },
  );

  const tenth = f32Bits(0.1);
  const tenthV = fromBits(tenth);
  const err = tenthV - 0.1;
  const d = binaryDigits(0.1, 16);
  b.step(
    {
      id: "s4-arredonda",
      title: "Nem tudo cabe",
      subtitle: "O caso de 0,1",
      text: `Em binário, 0,1 é ${d.int},${d.frac}…, com o bloco 0011 repetindo para sempre, como 1/3 em decimal. Com 24 bits de precisão, a dízima é cortada e arredondada: o que fica guardado é ${dec(Number(tenthV.toPrecision(12)))}, um erro de ${sci(err)}. Erros assim se somam: em precisão dupla, 0,1 + 0,2 dá ${dec(0.1 + 0.2)}. Por isso não se compara ponto flutuante com igualdade exata.`,
      facts: [
        ["Pedido", "0,1"],
        ["Guardado", dec(Number(tenthV.toPrecision(12)))],
        ["Erro", sci(err)],
      ],
      highlight: [],
    },
    () => {
      drawAll(tenth, "0,1");
      c.row("tabela", 0, ["0,1", `0x${hexOf(tenth)}`, `guarda ${dec(Number(tenthV.toPrecision(12)))}`], {
        mark: "warn",
        log: { who: "arredonda", what: "0,1", detail: `erro ${sci(err)}` },
      });
      c.row("tabela", 1, ["0,1 + 0,2 (dupla)", "—", `dá ${dec(0.1 + 0.2)}`], { mark: "warn" });
    },
  );

  const big = 2 ** 24;
  const bigPlus = Math.fround(big + 1);
  const gaps = [1, 1000, big].map((v) => ({ v, g: ulp(v) }));
  b.step(
    {
      id: "s5-vizinhos",
      title: "Vizinhos cada vez mais longe",
      subtitle: "A distância cresce com o expoente",
      text: `Com 24 bits de precisão, entre duas potências de 2 cabem sempre 2²³ números. Quanto maior o expoente, mais espaçados eles ficam: perto de 1 a distância é ${sci(gaps[0]?.g ?? 0)}; perto de 1000, ${sci(gaps[1]?.g ?? 0)}; a partir de 2²⁴ = ${big}, é ${gaps[2]?.g}. Ali, somar 1 não muda nada. Para ${X}, o próximo número representável está a ${sci(ulp(x))} de distância.`,
      facts: [
        ["Perto de 1", sci(gaps[0]?.g ?? 0)],
        ["Perto de 1000", sci(gaps[1]?.g ?? 0)],
        [`Perto de ${big}`, String(gaps[2]?.g)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Em float32, quanto vale ${big} + 1 depois de arredondado?`,
        answer: bigPlus,
        explain: `Acima de 2²⁴ os números representáveis vão de ${gaps[2]?.g} em ${gaps[2]?.g}. ${big + 1} fica no meio, e o empate é desfeito para o vizinho de fração par: ${bigPlus}.`,
      },
    },
    () => {
      drawAll(f32Bits(big), String(big));
      gaps.forEach(({ v, g }, i) => {
        c.row("tabela", 2 + i, [String(v), `0x${hexOf(f32Bits(v))}`, `próximo vizinho a ${sci(g)}`], {
          ...(i === 2 ? { mark: "bad" as const } : {}),
          log: { who: "ulp", what: String(v), detail: sci(g) },
        });
      });
    },
  );

  const specials: { name: string; v: number; note: string; role?: "bad" | "warn" }[] = [
    { name: "+0", v: 0, note: "expoente e fração zerados" },
    { name: "−0", v: -0, note: "só o sinal muda; compara igual a +0" },
    { name: "menor subnormal, 2⁻¹⁴⁹", v: 2 ** -149, note: "expoente 0: sem o 1 escondido" },
    { name: "+∞", v: Number.POSITIVE_INFINITY, note: "expoente 255, fração 0", role: "warn" },
    { name: "NaN", v: Number.NaN, note: "expoente 255, fração ≠ 0", role: "bad" },
  ];
  const inf = f32Bits(Number.POSITIVE_INFINITY);
  b.step(
    {
      id: "s6-especiais",
      title: "Zero, infinito e NaN",
      subtitle: "Os expoentes 0 e 255",
      text: `Dois valores do expoente são reservados. Com o campo todo em 0 ficam o zero, que tem sinal, e os [[subnormal|subnormais]]: sem o 1 escondido, eles preenchem aos poucos o vão perto de zero. Com o campo todo em 1 ficam o infinito, de contas que estouram a faixa, como 3,4 × 10³⁸ × 10, e o [[nan]], de contas como 0/0. NaN é diferente de tudo, até de si mesmo.`,
      facts: [
        ["Expoente 0", "zero e subnormais"],
        ["Expoente 255", "infinito e NaN"],
        ["+∞", `0x${hexOf(inf)}`],
      ],
      highlight: [],
    },
    () => {
      drawAll(inf, "+∞");
      specials.forEach((s, i) => {
        const bs = f32Bits(s.v);
        c.row("tabela", i, [s.name, `0x${hexOf(bs)}`, s.note], {
          ...(s.role ? { mark: s.role } : {}),
          ...(i === 0 ? { log: { who: "especiais", what: "expoentes reservados", detail: "0 e 255" } } : {}),
        });
      });
    },
  );

  return b.done({
    hex: hexOf(bits),
    stored: fl.stored,
    tenth: hexOf(tenth),
    gap: gaps[2]?.g ?? 0,
    plus1: bigPlus,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "ponto-flutuante",
    site: "arq",
    title: "Ponto flutuante IEEE 754",
    summary:
      "Um número com vírgula em 32 bits: notação científica binária, sinal, expoente com viés, fração com o 1 escondido, arredondamento e valores especiais.",
    area: "Representação",
    refs: [
      {
        book: "tanenbaum-sco",
        chapter: "B",
        section: "B.1",
        note: "Princípios de ponto flutuante",
        verified: true,
      },
      {
        book: "tanenbaum-sco",
        chapter: "B",
        section: "B.2",
        note: "Padrão de ponto flutuante IEEE 754",
        verified: true,
      },
    ],
    simplifications: [
      "Só precisão simples (32 bits); a dupla (64 bits) usa 11 bits de expoente, viés 1023 e 52 de fração.",
      "O arredondamento mostrado é o padrão (ao mais próximo, empate para o par); o IEEE 754 define outros modos.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "valor",
        kind: "text",
        label: "Número decimal",
        maxLength: 18,
        pattern: "-?[0-9]{1,8}([.,][0-9]{1,8})?",
        placeholder: "-6,375",
        help: "Diferente de zero. Experimente 0,1, 0,5 ou 1000,25.",
      },
    ],
  },
  build,
  intro: {
    text: "Inteiros cobrem só uma faixa estreita e não têm vírgula. Para medir distâncias de átomos e de galáxias com os mesmos 32 bits, o processador guarda números em notação científica binária. Você vai montar um número campo a campo, ver por que 0,1 não é exato e onde a precisão acaba.",
    facts: [
      ["Largura", "32 bits"],
      ["Número", DEFAULTS.valor],
      ["Padrão", "IEEE 754"],
    ],
  },
  outro: {
    title: "Ponto flutuante em resumo",
    text: "Um float32 é sinal, expoente com viés de 127 e 23 bits de fração depois de um 1 implícito. Frações que não terminam em binário são arredondadas, e a distância entre vizinhos cresce com o tamanho do número. Os expoentes extremos guardam zero, subnormais, infinito e NaN.",
    facts: (run) => [
      ["Seu número", `0x${run.stats.hex}`],
      ["0,1", `0x${run.stats.tenth}`],
      ["2²⁴ + 1", String(run.stats.plus1)],
    ],
  },
  next: ["inteiros", "instrucao-riscv"],
  practice,
};

export default lesson;
