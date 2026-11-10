import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { barrel, bits, decoder, gates, mux } from "../../../sim/arch/combinational.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { combinacionais as practice } from "../practice.ts";

/**
 * Decoder, multiplexer and barrel shifter with 3 control bits and 8 data bits: the blocks the
 * ALU and the register file are built from, computed bit by bit with their gate counts.
 */
export const DEFAULTS = { selecao: 5, dados: 178, deslocamento: 3 };
const N = 3;
const W = 8;

function clamp(p: Params) {
  const selecao = Math.min(7, Math.max(0, Math.round(Number(p.selecao ?? DEFAULTS.selecao))));
  const dados = Math.min(255, Math.max(0, Math.round(Number(p.dados ?? DEFAULTS.dados))));
  const deslocamento = Math.min(7, Math.max(0, Math.round(Number(p.deslocamento ?? DEFAULTS.deslocamento))));
  return { selecao, dados, deslocamento };
}

const scene: SceneSpec = {
  viewBox: [960, 600],
  nodes: [],
  links: [],
  widgets: [
    {
      kind: "grid",
      id: "controle",
      title: "Controle (3 bits)",
      at: [40, 40],
      cols: N,
      rows: 1,
      cellW: 44,
      indexLabel: "bit",
    },
    {
      kind: "grid",
      id: "linhas",
      title: "Saídas do decodificador",
      at: [260, 40],
      cols: W,
      rows: 1,
      cellW: 44,
      indexLabel: "dec",
    },
    {
      kind: "grid",
      id: "dados",
      title: "Entradas de dados D7…D0",
      at: [260, 160],
      cols: W,
      rows: 1,
      cellW: 44,
      indexLabel: "bit",
    },
    { kind: "counter", id: "saida", title: "Saída do multiplexador", at: [700, 160] },
    {
      kind: "grid",
      id: "barril",
      title: "Deslocador: entrada, após 1, após 2, após 4",
      at: [260, 280],
      cols: W,
      rows: 4,
      cellW: 44,
      indexLabel: "bit",
    },
    {
      kind: "table",
      id: "portas",
      title: "Quanto custa em portas",
      at: [40, 470],
      columns: ["Bloco", "Portas"],
      widths: [380, 120],
      rows: 3,
    },
  ],
};

const bin = (v: number, n: number) => v.toString(2).padStart(n, "0");

export function build(p: Params) {
  const { selecao, dados, deslocamento } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const lines = decoder(selecao, N);
  const data = bits(dados, W);
  // data[i] is D(7-i); the mux numbers inputs by D index
  const byIndex = Array.from({ length: W }, (_, i) => data[W - 1 - i] as number);
  const out = mux(byIndex, selecao, N);
  const stages = barrel(dados, deslocamento, W);
  const g = gates(N);
  const final = stages[stages.length - 1] as number;

  b.step(
    {
      id: "s1-decodificador",
      title: "Um número escolhe uma linha",
      subtitle: `${bin(selecao, N)} liga a saída ${selecao}`,
      text: `Um [[decodificador]] de 3 entradas tem 8 saídas e liga exatamente uma, a de número igual à entrada. Com ${bin(selecao, N)} na entrada, só a saída ${selecao} vai a 1. Por dentro, cada saída é uma porta AND de três entradas, ligada aos bits ou aos seus inversos: a saída ${selecao} recebe ${bits(
        selecao,
        N,
      )
        .map((x, i) => (x ? `C${N - 1 - i}` : `NOT C${N - 1 - i}`))
        .join(", ")}. São ${g.decoder} portas ao todo.`,
      facts: [
        ["Entrada", bin(selecao, N)],
        ["Saída ligada", String(selecao)],
        ["Portas", String(g.decoder)],
      ],
      highlight: [],
    },
    () => {
      bits(selecao, N).forEach((v, i) => {
        c.cell("controle", i, String(v), { dt: i === 0 ? 1 : 0, mark: "new" });
      });
      lines.forEach((v, i) => {
        c.cell("linhas", i, String(v), {
          dt: i === 0 ? 1 : 0,
          ...(v ? { mark: "hit" as const } : {}),
          ...(v ? { log: { who: "decodificador", what: `saída ${i} = 1` } } : {}),
        });
      });
    },
  );

  b.step(
    {
      id: "s2-multiplexador",
      title: "Escolher uma entrada",
      subtitle: `Passa D${selecao} = ${out}`,
      text: `Um [[multiplexador]] de 8 para 1 usa esse decodificador como chave. Cada entrada de dados D0 a D7 entra numa AND junto com a sua linha do decodificador; uma OR final junta as oito. Só a AND da linha ${selecao} pode dar 1, então a saída copia D${selecao}. Com os dados ${bin(dados, W)}, D${selecao} vale ${out}. São ${g.mux} portas, e é assim que a ULA escolhe qual resultado sai.`,
      facts: [
        ["Dados", bin(dados, W)],
        ["Seleção", String(selecao)],
        ["Saída", `D${selecao} = ${out}`],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: `Com a seleção ${bin(selecao, N)}, qual entrada chega à saída do multiplexador?`,
        options: [`D${selecao}`, `D${7 - selecao}`, "Todas, combinadas pela OR"],
        answer: 0,
        explain: `O decodificador liga só a linha ${selecao}; as outras ANDs dão 0 e a OR deixa passar D${selecao}.`,
      },
    },
    () => {
      data.forEach((v, i) => {
        c.cell("dados", i, String(v), {
          dt: i === 0 ? 1 : 0,
          ...(W - 1 - i === selecao ? { mark: "hit" as const } : {}),
        });
      });
      c.count("saida", String(out), { dt: 1, role: "a", label: `saída D${selecao} = ${out}` });
    },
  );

  b.step(
    {
      id: "s3-deslocador",
      title: "Deslocar em estágios",
      subtitle: `${bin(dados, W)} << ${deslocamento} = ${bin(final, W)}`,
      text: `Um [[deslocador-em-barril]] desloca por qualquer quantidade num ciclo. São 3 estágios de 8 multiplexadores de 2 entradas: o primeiro desloca 1 posição se o bit 0 da quantidade for 1, o segundo 2 posições, o terceiro 4. Para deslocar ${deslocamento} = ${bin(deslocamento, N)}, ${[1, 2, 4].filter((_, k) => (deslocamento >> k) & 1).join(" e ") || "nenhum"} ${[1, 2, 4].filter((_, k) => (deslocamento >> k) & 1).length === 1 ? "estágio age" : "estágios agem"}, e ${bin(dados, W)} vira ${bin(final, W)}. Os bits que saem pela esquerda se perdem.`,
      facts: [
        ["Quantidade", `${deslocamento} = ${bin(deslocamento, N)}`],
        ["Resultado", bin(final, W)],
        ["Multiplexadores", String(g.barrelMuxes)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Quanto vale, em decimal, ${bin(dados, W)} deslocado ${deslocamento} ${deslocamento === 1 ? "posição" : "posições"} para a esquerda em 8 bits?`,
        answer: final,
        tolerance: 0,
        explain: `Deslocar k posições multiplica por 2^k e descarta o que passa de 8 bits: ${dados} × ${2 ** deslocamento} = ${dados * 2 ** deslocamento}, e ${dados * 2 ** deslocamento} mod 256 = ${final}, ou ${bin(final, W)}.`,
      },
    },
    () => {
      stages.forEach((v, row) => {
        bits(v, W).forEach((x, i) => {
          c.cell("barril", row * W + i, String(x), {
            dt: i === 0 ? 1 : 0,
            ...(row > 0 && v !== stages[row - 1] ? { mark: "new" as const } : {}),
            ...(i === 0 ? { log: { who: row === 0 ? "entrada" : `estágio ${row}`, what: bin(v, W) } } : {}),
          });
        });
      });
    },
  );

  b.step(
    {
      id: "s4-custo",
      title: "Contar portas",
      subtitle: `${g.decoder}, ${g.mux} e ${g.barrel}`,
      text: `Em [[circuito-combinacional|circuitos combinacionais]], a saída depende só das entradas do momento, sem memória. O custo cresce com a largura: o decodificador usa ${g.decoder} portas, o multiplexador ${g.mux}, e o deslocador de 8 bits ${g.barrel}, contando cada multiplexador de 2 entradas como duas ANDs e uma OR. Um deslocador de 64 bits teria 6 estágios de 64 multiplexadores: é por isso que ele ocupa uma área considerável do processador.`,
      facts: [
        ["Decodificador 3 → 8", `${g.decoder} portas`],
        ["Multiplexador 8 → 1", `${g.mux} portas`],
        ["Deslocador 8 bits", `${g.barrel} portas`],
      ],
      highlight: [],
    },
    () => {
      c.row("portas", 0, ["Decodificador 3 → 8", String(g.decoder)], { dt: 1, mark: "new" });
      c.row("portas", 1, ["Multiplexador 8 → 1", String(g.mux)], { dt: 1, mark: "new" });
      c.row("portas", 2, ["Deslocador em barril de 8 bits", String(g.barrel)], { dt: 1, mark: "new" });
    },
  );

  b.step(
    {
      id: "s5-processador",
      title: "Onde eles aparecem",
      subtitle: "Registradores, ULA e memória",
      text: "Esses três blocos estão por toda parte. O campo rs1 de uma instrução entra num multiplexador de 32 entradas que escolhe o registrador a ler; o campo rd vai a um decodificador que liga a escrita de um só registrador. A ULA calcula soma, AND e deslocamento ao mesmo tempo e um multiplexador escolhe qual resultado vale. Na memória, decodificadores escolhem a linha a partir do endereço.",
      facts: [
        ["Ler registrador", "multiplexador de 32"],
        ["Escrever registrador", "decodificador de 5 bits"],
        ["ULA", "multiplexador no resultado"],
      ],
      highlight: [],
    },
    () => {
      c.count("saida", String(out), { dt: 1, label: `D${selecao}` });
    },
  );

  return b.done({
    line: selecao,
    out,
    shifted: bin(final, W),
    decoder: g.decoder,
    mux: g.mux,
    barrel: g.barrel,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "combinacionais",
    site: "arq",
    title: "Decodificador, multiplexador e deslocador",
    summary:
      "Três blocos combinacionais com 3 bits de controle e 8 de dados: qual linha liga, qual entrada passa, como se desloca em estágios e quantas portas custa.",
    area: "Lógica digital",
    refs: [
      {
        book: "tanenbaum-sco",
        chapter: 3,
        section: "3.2.2",
        note: "Circuitos combinacionais: multiplexadores, decodificadores, comparadores",
        verified: true,
      },
      {
        book: "tanenbaum-sco",
        chapter: 3,
        section: "3.2.3",
        note: "Circuitos aritméticos: deslocadores",
        verified: true,
      },
    ],
    simplifications: [
      "As portas AND e OR têm quantas entradas forem precisas; na prática, viram árvores de portas menores.",
      "O deslocador só desloca à esquerda, preenchendo com zeros.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "selecao", kind: "int", label: "Seleção (0 a 7)", min: 0, max: 7 },
      { key: "dados", kind: "int", label: "Dados (0 a 255)", min: 0, max: 255 },
      { key: "deslocamento", kind: "int", label: "Deslocamento (0 a 7)", min: 0, max: 7 },
    ],
  },
  build,
  intro: {
    text: "Além de somar, o processador precisa escolher: qual registrador ler, qual resultado da ULA usar, qual linha da memória acender. Três circuitos sem memória fazem quase todas essas escolhas, e você vai montá-los bit a bit.",
    facts: [
      ["Bits de controle", "3"],
      ["Bits de dados", "8"],
      ["Blocos", "decodificador, multiplexador, deslocador"],
    ],
  },
  outro: {
    title: "Blocos combinacionais em resumo",
    text: "O decodificador transforma um número numa linha ligada, o multiplexador usa essa linha para escolher uma entrada e o deslocador em barril combina multiplexadores em estágios. Com eles se montam a ULA, o banco de registradores e a decodificação da memória.",
    facts: (run) => [
      ["Saída do multiplexador", String(run.stats.out)],
      ["Deslocado", String(run.stats.shifted)],
      ["Portas do deslocador", String(run.stats.barrel)],
    ],
  },
  next: ["portas-logicas", "flip-flops"],
  practice,
};

export default lesson;
