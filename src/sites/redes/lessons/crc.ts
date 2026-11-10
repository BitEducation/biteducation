import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { type Bits, check, divide, encode, flip, invisible, str, toBits } from "../../../sim/net/crc.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { crc as practice } from "../practice.ts";

/**
 * CRC by hand: bits read as a polynomial, long division modulo 2 drawn row by row, the remainder
 * appended to the frame, the receiver's check, a flipped bit caught, and an error shaped like the
 * generator that slips through; then what CRC-32 guarantees in Ethernet.
 */
export const DEFAULTS = { dados: 859, erro: 5 };
const DATA_BITS = 10;
const GEN: Bits = [1, 0, 0, 1, 1];
const R = GEN.length - 1;
const FRAME = DATA_BITS + R;
const ROWS = DATA_BITS + 1;

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
/** "x⁹ + x⁸ + x + 1" from the bits, highest power first. */
export function poly(b: Bits): string {
  const terms = b.flatMap((x, i) => {
    const e = b.length - 1 - i;
    if (!x) return [];
    if (e === 0) return ["1"];
    if (e === 1) return ["x"];
    return [`x${[...String(e)].map((d) => SUP[Number(d)]).join("")}`];
  });
  return terms.length ? terms.join(" + ") : "0";
}

function clamp(p: Params) {
  const data = Math.min(1023, Math.max(1, Math.round(Number(p.dados ?? DEFAULTS.dados))));
  const err = Math.min(FRAME, Math.max(0, Math.round(Number(p.erro ?? DEFAULTS.erro))));
  return { data, err };
}

const scene: SceneSpec = {
  viewBox: [960, 640],
  nodes: [],
  links: [],
  widgets: [
    {
      kind: "grid",
      id: "divisao",
      title: `Divisão por ${str(GEN)}: dados, ${R} zeros e cada XOR`,
      at: [40, 60],
      cols: FRAME,
      rows: ROWS,
      cellW: 32,
      indexLabel: "none",
    },
    { kind: "counter", id: "resto", title: "Resto (o CRC)", at: [570, 60] },
    { kind: "counter", id: "quadro", title: "Quadro enviado", at: [760, 60] },
    {
      kind: "table",
      id: "receptor",
      title: "O receptor divide o que recebeu",
      at: [570, 170],
      columns: ["Caso", "Recebido", "Resto", "Decisão"],
      widths: [105, 135, 45, 95],
      rows: 3,
    },
    {
      kind: "table",
      id: "garantias",
      title: "O que o CRC-32 da Ethernet sempre pega",
      at: [570, 360],
      columns: ["Erro", "Pego?"],
      widths: [200, 180],
      rows: 4,
    },
  ],
};

export function build(p: Params) {
  const { data, err } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const d = toBits(data, DATA_BITS);
  const enc = encode(d, GEN);
  const dividend = [...d, ...Array(R).fill(0)];
  const rem = str(enc.remainder);
  const frame = enc.frame;
  const bad = err ? flip(frame, [err - 1]) : frame;
  const badRem = divide(bad, GEN).remainder;
  const caught = !check(bad, GEN);
  const ghost = invisible(FRAME, GEN, 1);
  const ghostFrame = flip(frame, ghost);
  const ghostPasses = check(ghostFrame, GEN);

  const drawRow = (row: number, bits: Bits, from: number, hot: number[], last = false) =>
    bits.forEach((x, i) => {
      const visible = i >= from;
      const isRem = last && i >= FRAME - R;
      c.cell("divisao", row * FRAME + i, visible ? String(x) : "", {
        dt: i === 0 ? 1 : 0,
        role: isRem ? "a" : hot.includes(i) ? "warn" : i >= DATA_BITS ? "muted" : "b",
        ...(isRem ? { mark: "hit" as const } : hot.includes(i) ? { mark: "new" as const } : {}),
        label: `linha ${row}, coluna ${i + 1}: ${visible ? x : "zerado"}`,
        ...(i === 0
          ? { log: { who: row === 0 ? "dividendo" : `XOR ${row}`, what: str(bits.slice(from)) } }
          : {}),
      });
    });

  b.step(
    {
      id: "s1-polinomio",
      title: "Bits como polinômio",
      subtitle: `${str(d)} = ${poly(d)}`,
      text: `O [[checksum]] soma os dados e deixa passar erros que se compensam. O [[crc]] faz uma conta mais forte: lê os bits como coeficientes de um polinômio, então ${str(d)} vira ${poly(d)}. Emissor e receptor combinam um gerador, aqui ${str(GEN)}, ou ${poly(GEN)}, de grau ${R}. O emissor acrescenta ${R} zeros aos dados, um por grau, e vai dividir esse número pelo gerador. O que importa no fim não é o quociente, e sim o resto.`,
      facts: [
        ["Dados", str(d)],
        ["Gerador", `${str(GEN)} (grau ${R})`],
        ["Dividendo", str(dividend)],
      ],
      highlight: [],
    },
    () => drawRow(0, dividend, 0, []),
  );

  b.step(
    {
      id: "s2-divisao",
      title: "Dividir sem emprestar",
      subtitle: `${enc.steps.length} XORs`,
      text: `A divisão é a do papel, com uma diferença: em módulo 2 não existe vai-um nem empresta-um, e subtrair é o mesmo que fazer XOR bit a bit. Toda vez que a linha começa com 1, o gerador ${str(GEN)} é alinhado embaixo desse 1 e os ${GEN.length} bits passam por XOR; com 0 na frente, só se anda uma casa. Cada linha da grade é o que sobra depois de um XOR, com as colunas mexidas em destaque. Aqui foram ${enc.steps.length} XORs até restarem só ${R} bits.`,
      facts: [
        ["Regra", "subtrair = XOR"],
        ["XORs", String(enc.steps.length)],
        ["Sobram", `${R} bits`],
      ],
      highlight: [],
    },
    () => {
      enc.steps.forEach((s, i) => {
        const hot = GEN.map((_, k) => s.at + k);
        drawRow(i + 1, s.after, Math.min(s.at + 1, FRAME - R), hot, i === enc.steps.length - 1);
      });
    },
  );

  const wrong = [str(enc.remainder.map((x) => x ^ 1)), str([...enc.remainder].reverse()), "0000"]
    .filter((x) => x !== rem)
    .filter((x, i, a) => a.indexOf(x) === i)
    .slice(0, 2);
  b.step(
    {
      id: "s3-resto",
      title: "O resto vai junto",
      subtitle: `CRC = ${rem}`,
      text: `Os últimos ${R} bits da última linha são o resto: ${rem}. O emissor troca os ${R} zeros por ele e manda ${str(frame)}. Esse quadro tem uma propriedade: dividido pelo gerador, dá resto zero, porque somar o resto em módulo 2 é o mesmo que subtraí-lo. É como acertar uma conta para que ela feche exata. O custo é pequeno: ${R} bits a mais para ${DATA_BITS} de dados; na Ethernet, 32 para até 12 000.`,
      facts: [
        ["Resto", rem],
        ["Quadro", str(frame)],
        ["Bits extras", String(R)],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: `Na grade, qual é o resto da divisão de ${str(dividend)} por ${str(GEN)}?`,
        options: [rem, ...wrong],
        answer: 0,
        explain: `São os ${R} bits finais da última linha: ${rem}. O quadro enviado é ${str(d)} seguido de ${rem}.`,
      },
    },
    () => {
      c.count("resto", rem, { role: "a", label: `resto ${rem}` });
      c.count("quadro", str(frame), { dt: 0, role: "b", label: `quadro ${str(frame)}` });
    },
  );

  b.step(
    {
      id: "s4-confere",
      title: "O receptor confere",
      subtitle: "Resto zero",
      text: `Quem recebe não precisa separar dados e CRC: divide o quadro inteiro, ${str(frame)}, pelo mesmo gerador. Se nada mudou no caminho, o resto é ${str(divide(frame, GEN).remainder)} e o quadro é aceito. Placas de rede fazem essa divisão em hardware, com um registrador de deslocamento e algumas portas XOR, enquanto os bits ainda estão chegando: quando o último bit entra, a resposta já está pronta.`,
      facts: [
        ["Recebido", str(frame)],
        ["Resto", str(divide(frame, GEN).remainder)],
        ["Decisão", "aceita"],
      ],
      highlight: [],
    },
    () => {
      c.row("receptor", 0, ["sem erro", str(frame), str(divide(frame, GEN).remainder), "aceita"], {
        dt: 1,
        mark: "hit",
        log: { who: "receptor", what: "resto zero", detail: "aceita" },
      });
    },
  );

  b.step(
    {
      id: "s5-erro",
      title: "Um bit trocado",
      subtitle: err ? `Bit ${err} invertido` : "Nenhum bit trocado",
      text: err
        ? `Agora o ruído inverte o bit ${err}, contando da esquerda, e chega ${str(bad)}. A divisão dá resto ${str(badRem)}: ${caught ? "diferente de zero, então o quadro é descartado e, se houver, a camada de cima pede de novo" : "zero, e o erro passa"}. Um bit trocado sempre aparece, porque um único termo xⁱ nunca é múltiplo de um gerador com mais de um termo. No Laboratório, troque a posição: todas são pegas.`
        : `Desta vez nada mudou no caminho, e o receptor aceita. No Laboratório, escolha uma posição de 1 a ${FRAME} para inverter um bit e veja o resto deixar de ser zero. Um bit trocado sempre aparece, porque um único termo xⁱ nunca é múltiplo de um gerador com mais de um termo, como ${str(GEN)}.`,
      facts: [
        ["Recebido", str(bad)],
        ["Resto", str(badRem)],
        ["Decisão", caught ? "descarta" : "aceita"],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: "Como o receptor percebe que um bit mudou, sem conhecer os dados originais?",
        options: [
          "Dividindo o quadro pelo gerador: o resto deixa de ser zero",
          "Comparando com uma cópia que o emissor manda depois",
          "Contando os uns do quadro",
        ],
        answer: 0,
        explain: `O quadro certo é múltiplo do gerador. Com o bit trocado, o resto vira ${str(badRem)}${err ? "" : " no caso escolhido no Laboratório"}.`,
      },
    },
    () => {
      c.row(
        "receptor",
        1,
        [err ? `bit ${err}` : "nenhum", str(bad), str(badRem), caught ? "descarta" : "aceita"],
        {
          dt: 1,
          mark: caught ? "bad" : "hit",
          log: { who: "receptor", what: `resto ${str(badRem)}`, detail: caught ? "descarta" : "aceita" },
        },
      );
    },
  );

  b.step(
    {
      id: "s6-limites",
      title: "O erro que passa",
      subtitle: "Com a forma do gerador",
      text: `Nenhum código pega tudo. Se o ruído inverter exatamente os bits ${ghost.map((i) => i + 1).join(", ")}, o padrão de erro é o próprio gerador deslocado, e um múltiplo do gerador não muda o resto: chega ${str(ghostFrame)} e a divisão dá zero. ${ghostPasses ? "O quadro errado é aceito." : ""} Com o CRC-32 da Ethernet, isso exige uma combinação bem específica de pelo menos 4 bits: rajadas de até 32 bits e erros de 1, 2 ou 3 bits são sempre pegos, e um quadro com ruído aleatório escapa com chance de 1 em 4 bilhões.`,
      facts: [
        ["Erro invisível", ghost.map((i) => i + 1).join(", ")],
        ["Rajada pega", "até 32 bits"],
        ["Escapa ao acaso", "1 em 2³²"],
      ],
      highlight: [],
    },
    () => {
      c.row(
        "receptor",
        2,
        [
          "forma do gerador",
          str(ghostFrame),
          str(divide(ghostFrame, GEN).remainder),
          ghostPasses ? "aceita (errado)" : "descarta",
        ],
        {
          dt: 1,
          mark: "warn",
          log: { who: "receptor", what: "erro múltiplo do gerador", detail: "passa" },
        },
      );
      const rows: [string, string][] = [
        ["1 bit trocado", "sempre"],
        ["2 ou 3 bits, quadro até 1500 bytes", "sempre"],
        ["rajada de até 32 bits", "sempre"],
        ["ruído aleatório maior", "quase sempre: 1 − 2⁻³²"],
      ];
      rows.forEach(([e, ok], i) => {
        c.row("garantias", i, [e, ok], { dt: 1, mark: i === 3 ? "warn" : "hit" });
      });
    },
  );

  return b.done({
    remainder: rem,
    frame: str(frame),
    xors: enc.steps.length,
    caught: caught ? "sim" : "não",
    ghost: ghost.map((i) => i + 1).join(","),
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "crc",
    site: "redes",
    title: "CRC: a divisão que detecta erros",
    summary:
      "Bits lidos como polinômio, a divisão em módulo 2 feita linha a linha, o resto que vai no fim do quadro, a conferência do receptor, um bit trocado que é pego e o erro com a forma do gerador que passa.",
    area: "Enlace",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 3,
        section: "3.2.2",
        note: "Códigos de detecção de erros: CRC",
        verified: true,
      },
    ],
    simplifications: [
      `Gerador de grau ${R} e ${DATA_BITS} bits de dados; a Ethernet usa um de grau 32.`,
      "O CRC-32 real começa com o registrador em uns e inverte o resultado; isso não muda a ideia da divisão.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "dados", kind: "int", label: `Dados (${DATA_BITS} bits, em decimal)`, min: 1, max: 1023 },
      {
        key: "erro",
        kind: "int",
        label: `Bit invertido no caminho (0 = nenhum, 1 a ${FRAME})`,
        min: 0,
        max: FRAME,
      },
    ],
  },
  build,
  intro: {
    text: "Cada quadro Ethernet termina com 32 bits que permitem ao receptor perceber se algum bit mudou no caminho. Você vai fazer essa conta à mão, numa versão de 4 bits: uma divisão em que subtrair é XOR, e cujo resto denuncia o erro.",
    facts: [
      ["Dados", toBits(DEFAULTS.dados, DATA_BITS).join("")],
      ["Gerador", str(GEN)],
      ["Bit trocado", String(DEFAULTS.erro)],
    ],
  },
  outro: {
    title: "CRC em resumo",
    text: "O emissor acrescenta zeros aos dados, divide pelo gerador em módulo 2, usando XOR, e manda o resto no lugar dos zeros. O quadro fica múltiplo do gerador, e o receptor só precisa conferir que a divisão dá resto zero. Bits isolados e rajadas curtas são sempre pegos; só passa o erro que tem a forma de um múltiplo do gerador, algo raríssimo com 32 bits.",
    facts: (run) => [
      ["Resto", String(run.stats.remainder)],
      ["Quadro", String(run.stats.frame)],
      ["Erro pego", String(run.stats.caught)],
    ],
  },
  next: ["switch-vlan", "aloha-csma"],
  practice,
};

export default lesson;
