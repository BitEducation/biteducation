import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import {
  checkBits,
  covers,
  DATA_POS,
  decodeData,
  encode,
  PARITY_POS,
  syndrome,
} from "../../../sim/arch/hamming.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { hamming as practice } from "../practice.ts";

/**
 * Error-correcting codes: one parity bit detects, Hamming(7,4) locates and corrects a single flipped
 * bit through its syndrome, two flips fool it, and an overall parity bit (SECDED) catches that.
 */
export const DEFAULTS = { dados: 13, erro: 6 };

const scene: SceneSpec = {
  viewBox: [960, 560],
  nodes: [],
  links: [],
  widgets: [
    {
      kind: "grid",
      id: "palavra",
      title: "Posições 1 a 7 · linhas: enviado, recebido, corrigido",
      at: [60, 50],
      cols: 7,
      rows: 3,
      cellW: 60,
      indexLabel: "none",
    },
    {
      kind: "table",
      id: "checks",
      title: "As três verificações",
      at: [560, 50],
      columns: ["Paridade", "Cobre", "Soma dos bits", "Resultado"],
      widths: [80, 110, 110, 90],
      rows: 3,
    },
    { kind: "counter", id: "sindrome", title: "Síndrome (posição do erro)", at: [560, 190] },
    {
      kind: "table",
      id: "custo",
      title: "Quanto custa proteger",
      at: [60, 290],
      columns: ["Caso", "Bits de dados", "Bits extras", "O que faz"],
      widths: [210, 110, 110, 400],
      rows: 5,
    },
  ],
};

const ROW = 7;
const role = (pos: number) => (PARITY_POS.includes(pos as 1 | 2 | 4) ? "b" : "a");

export function build(p: Params) {
  const data = Math.min(15, Math.max(0, Math.round(Number(p.dados ?? DEFAULTS.dados))));
  const err = Math.min(7, Math.max(0, Math.round(Number(p.erro ?? DEFAULTS.erro))));
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => `${t}`);
  const bits = data.toString(2).padStart(4, "0");
  const sent = encode(data);
  const word = (w: readonly number[]) => w.slice(1).join("");
  const recv = [...sent];
  if (err) recv[err] = 1 - (recv[err] ?? 0);
  const syn = syndrome(recv);
  const fixed = [...recv];
  if (syn.pos) fixed[syn.pos] = 1 - (fixed[syn.pos] ?? 0);

  const drawRow = (
    r: number,
    w: readonly number[],
    what: string,
    mark?: (pos: number) => "new" | "miss" | "hit" | undefined,
  ) => {
    for (let pos = 1; pos <= 7; pos++) {
      const m = mark?.(pos);
      c.cell(
        "palavra",
        r * ROW + pos - 1,
        `${PARITY_POS.includes(pos as 1 | 2 | 4) ? "p" : "d"}${pos}=${w[pos]}`,
        {
          dt: pos === 1 ? 1 : 0,
          role: role(pos),
          ...(m ? { mark: m } : {}),
          label: `${what}, posição ${pos}: ${w[pos]}`,
          ...(pos === 1 ? { log: { who: what, what: word(w), detail: "posições 1 a 7" } } : {}),
        },
      );
    }
  };

  // 1. a single parity bit
  const ones = [...bits].filter((x) => x === "1").length;
  b.step(
    {
      id: "s1-paridade",
      title: "Um bit de paridade",
      subtitle: `${bits} + ${ones % 2}`,
      text: `Na memória, um bit pode virar sozinho por radiação ou ruído. O jeito mais simples de perceber é um [[bit-de-paridade]]: guardar junto um bit que deixa a quantidade de uns par. Para ${bits}, com ${ones} ${ones === 1 ? "um" : "uns"}, a paridade é ${ones % 2}. Se um bit mudar, a contagem fica ímpar e o erro aparece. Mas não dá para saber qual bit foi, nem corrigir.`,
      facts: [
        ["Dados", bits],
        ["Paridade par", String(ones % 2)],
        ["Detecta", "1 bit trocado"],
      ],
      highlight: [],
    },
    () => {
      c.row("custo", 0, ["Paridade simples", "4", "1", "detecta 1 erro, não corrige"], {
        mark: "new",
        log: { who: "paridade", what: `${bits} → ${ones % 2}`, detail: `${ones} uns` },
      });
    },
  );

  // 2. Hamming layout
  b.step(
    {
      id: "s2-posicoes",
      title: "Várias paridades cruzadas",
      subtitle: "Hamming(7,4)",
      text: `O [[codigo-de-hamming]] usa três bits de paridade nas posições 1, 2 e 4 e põe os dados em 3, 5, 6 e 7. Cada paridade cuida das posições cujo número, em binário, tem o seu bit ligado: p1 cobre 1, 3, 5 e 7; p2 cobre 2, 3, 6 e 7; p4 cobre 4, 5, 6 e 7. Cada posição cai numa combinação única de verificações, e é isso que vai permitir apontar o erro.`,
      facts: [
        ["p1", covers(1).join(", ")],
        ["p2", covers(2).join(", ")],
        ["p4", covers(4).join(", ")],
      ],
      highlight: [],
    },
    () => {
      for (const pp of PARITY_POS)
        c.row("checks", PARITY_POS.indexOf(pp), [`p${pp}`, covers(pp).join(" "), "", ""], {
          dt: 1,
          log: { who: `p${pp}`, what: "cobre", detail: covers(pp).join(", ") },
        });
    },
  );

  // 3. encode
  b.step(
    {
      id: "s3-codifica",
      title: "Calculando as paridades",
      subtitle: `${bits} vira ${word(sent)}`,
      text: `Os dados ${bits} vão para as posições ${DATA_POS.join(", ")}. Cada paridade é escolhida para deixar par a soma das posições que ela cobre: p1 = ${sent[1]}, p2 = ${sent[2]} e p4 = ${sent[4]}. A palavra guardada tem 7 bits: ${word(sent)}. São 3 bits extras para 4 de dados, um custo alto aqui que cai bastante em palavras maiores.`,
      facts: [
        ["Dados", bits],
        ["Paridades", `p1 ${sent[1]}, p2 ${sent[2]}, p4 ${sent[4]}`],
        ["Palavra", word(sent)],
      ],
      highlight: [],
    },
    () => {
      drawRow(0, sent, "enviado", (pos) => (PARITY_POS.includes(pos as 1 | 2 | 4) ? "new" : undefined));
      c.row("custo", 1, ["Hamming(7,4)", "4", "3", "corrige 1 erro"], { mark: "new" });
    },
  );

  // 4. an error
  b.step(
    {
      id: "s4-erro",
      title: "Um bit vira",
      subtitle: err ? `Erro na posição ${err}` : "Sem erro",
      text: err
        ? `Enquanto a palavra está na memória, o bit da posição ${err} troca de ${sent[err]} para ${recv[err]}. Quem lê recebe ${word(recv)} e não sabe, a princípio, se algo mudou. No Laboratório dá para escolher qualquer posição, inclusive a de um bit de paridade, ou nenhuma.`
        : `Desta vez nada mudou: quem lê recebe ${word(recv)}, igual ao enviado. No Laboratório, escolha uma posição de 1 a 7 para ver o código encontrar e corrigir o erro.`,
      facts: [
        ["Enviado", word(sent)],
        ["Recebido", word(recv)],
        ["Posição trocada", err ? String(err) : "nenhuma"],
      ],
      highlight: [],
    },
    () => drawRow(1, recv, "recebido", (pos) => (pos === err ? "miss" : undefined)),
  );

  // 5. syndrome
  b.step(
    {
      id: "s5-sindrome",
      title: "A síndrome aponta",
      subtitle: syn.pos ? `Posição ${syn.pos}` : "Tudo certo",
      text: `Quem lê refaz as três verificações. ${syn.checks.map((x) => `p${x.p} ${x.ok ? "confere" : "falha"}`).join(", ")}. Somando os números das verificações que falharam, sai a [[sindrome]]: ${syn.pos}. ${syn.pos ? `É exatamente a posição do bit trocado, porque só ela é coberta por essa combinação de verificações.` : "Zero quer dizer que nenhuma falhou: a palavra está íntegra."}`,
      facts: syn.checks.map((x) => [`p${x.p}`, x.ok ? "confere" : "falha"] as [string, string]),
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Recebido ${word(recv)}. Qual é a síndrome, ou seja, a soma dos números das paridades que falham?`,
        answer: syn.pos,
        explain: `${syn.checks.map((x) => `p${x.p} ${x.ok ? "confere" : "falha"}`).join(", ")}. ${
          syn.pos
            ? `Falham ${syn.checks
                .filter((x) => !x.ok)
                .map((x) => x.p)
                .join(" + ")} = ${syn.pos}.`
            : "Nenhuma falha: 0."
        }`,
      },
    },
    () => {
      for (const x of syn.checks) {
        const sum = covers(x.p).reduce((s, i) => s + (recv[i] ?? 0), 0);
        c.row(
          "checks",
          PARITY_POS.indexOf(x.p as 1 | 2 | 4),
          [`p${x.p}`, covers(x.p).join(" "), String(sum), x.ok ? "par: ok" : "ímpar: falha"],
          {
            dt: 1,
            mark: x.ok ? "hit" : "bad",
            log: { who: `p${x.p}`, what: x.ok ? "confere" : "falha", detail: `soma ${sum}` },
          },
        );
      }
      c.count("sindrome", String(syn.pos), { label: `síndrome ${syn.pos}`, role: syn.pos ? "bad" : "a" });
    },
  );

  // 6. correct, and the double error
  const two = [...sent];
  two[3] = 1 - (two[3] ?? 0);
  two[5] = 1 - (two[5] ?? 0);
  const syn2 = syndrome(two);
  const ecc = checkBits(64) + 1;
  b.step(
    {
      id: "s6-corrige",
      quiz: {
        kind: "choice",
        prompt:
          "Dois bits trocam na mesma palavra e o código só tem as três paridades. O que acontece ao ler?",
        options: [
          "A síndrome aponta uma terceira posição, e ele inverte um bit certo",
          "Ele corrige os dois bits",
          "A síndrome dá zero e ele avisa que há dois erros",
        ],
        answer: 0,
        explain:
          'Com dois erros, as verificações que falham somam a posição de outro bit, e a "correção" cria um terceiro erro. Um bit de paridade geral (SECDED) separa os casos: um erro muda a paridade total, dois não.',
      },
      title: "Corrigir e desconfiar",
      subtitle: `Dados recuperados: ${decodeData(fixed).toString(2).padStart(4, "0")}`,
      text: `${syn.pos ? `Invertendo a posição ${syn.pos}, a palavra volta a ${word(fixed)} e os dados ${decodeData(fixed).toString(2).padStart(4, "0")} saem intactos.` : `Sem nada a corrigir, os dados ${bits} saem como entraram.`} Com dois erros, porém, o código se engana: trocar 3 e 5 dá síndrome ${syn2.pos} e ele "corrige" o bit errado. Um bit de paridade geral a mais resolve: com ele (SECDED), dois erros são detectados. Pentes de memória com [[ecc]] guardam 64 bits de dados com ${ecc} extras.`,
      facts: [
        ["Corrigido", word(fixed)],
        ["Erros em 3 e 5", `síndrome ${syn2.pos}, engana`],
        ["ECC de memória", `64 + ${ecc} bits`],
      ],
      highlight: [],
    },
    () => {
      drawRow(2, fixed, "corrigido", (pos) => (pos === syn.pos ? "hit" : undefined));
      c.row(
        "custo",
        2,
        ["Hamming, 2 erros (3 e 5)", "4", "3", `síndrome ${syn2.pos}: corrige o bit errado`],
        { mark: "bad" },
      );
      c.row("custo", 3, ["SECDED (7,4) + paridade geral", "4", "4", "corrige 1 erro, detecta 2"], {
        mark: "new",
      });
      c.row("custo", 4, ["ECC de memória", "64", String(ecc), "corrige 1, detecta 2, custo de 12,5%"], {
        mark: "new",
        log: { who: "ECC", what: "64 bits", detail: `${ecc} extras` },
      });
    },
  );

  return b.done({
    sent: word(sent),
    recv: word(recv),
    syndrome: syn.pos,
    fixed: decodeData(fixed),
    double: syn2.pos,
    ecc,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "hamming",
    site: "arq",
    title: "Código de Hamming: achar e corrigir um bit errado",
    summary:
      "Da paridade simples ao Hamming(7,4): três paridades cruzadas, a síndrome que aponta a posição do erro, o engano com dois erros e o ECC das memórias.",
    area: "Representação",
    refs: [
      {
        book: "tanenbaum-sco",
        chapter: 2,
        section: "2.2.4",
        note: "Códigos de correção de erro",
        verified: true,
      },
    ],
    simplifications: [
      "Palavras de 4 bits de dados; a memória real protege 64 bits por vez.",
      "Os erros são escolhidos à mão; na prática são raros e aleatórios.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "dados", kind: "int", label: "Dados (4 bits)", min: 0, max: 15 },
      { key: "erro", kind: "int", label: "Posição que troca (0 = nenhuma)", min: 0, max: 7 },
    ],
  },
  build,
  intro: {
    text: "Bits de memória às vezes trocam sozinhos. Servidores não podem confiar na sorte: guardam bits a mais que permitem descobrir qual bit mudou e desfazer o erro. Você vai montar um código de Hamming, estragar um bit e ver a síndrome apontar exatamente onde.",
    facts: [
      ["Dados", DEFAULTS.dados.toString(2).padStart(4, "0")],
      ["Bit estragado", `posição ${DEFAULTS.erro}`],
      ["Código", "Hamming(7,4)"],
    ],
  },
  outro: {
    title: "Hamming em resumo",
    text: "Uma paridade detecta um erro; várias paridades cruzadas o localizam. No Hamming(7,4), cada posição é coberta por uma combinação única de verificações, e a soma das que falham dá a posição do erro. Dois erros enganam o código, por isso a memória ECC acrescenta uma paridade geral para ao menos detectá-los.",
    facts: (run) => [
      ["Palavra", String(run.stats.sent)],
      ["Síndrome", String(run.stats.syndrome)],
      ["ECC de 64 bits", `+${run.stats.ecc}`],
    ],
  },
  next: ["inteiros", "cache-direta"],
  practice,
};

export default lesson;
