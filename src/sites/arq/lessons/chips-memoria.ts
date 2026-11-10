import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { layout, type Org, split } from "../../../sim/arch/memorg.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { chipsMemoria as practice } from "../practice.ts";

/**
 * Memory chips: 16 MiB on a 32-bit bus out of 4 Mbit chips, organized 4M × 1, 1M × 4 or
 * 512K × 8; ranks, the address split into rank, row and column, and the ROM family.
 */
const TOTAL = 16 * 2 ** 20;
const BUS = 32;
const CHIP = 4 * 2 ** 20;
const ADDR = 0xa35f26;
const ORGS: Record<string, Org & { name: string }> = {
  x1: { depth: 4 * 2 ** 20, width: 1, name: "4M × 1" },
  x4: { depth: 2 ** 20, width: 4, name: "1M × 4" },
  x8: { depth: 512 * 1024, width: 8, name: "512K × 8" },
};
export const DEFAULTS = { organizacao: "x8" };

const pick = (p: Params) => ORGS[String(p.organizacao)] ?? (ORGS.x8 as Org & { name: string });

const scene: SceneSpec = {
  viewBox: [960, 600],
  nodes: [],
  links: [],
  widgets: [
    {
      kind: "table",
      id: "formatos",
      title: "Um chip de 4 Mbit, três formatos",
      at: [30, 40],
      columns: ["Formato", "Bits de endereço", "Pinos (RAS/CAS)", "Chips por banco", "Bancos"],
      widths: [130, 150, 150, 150, 90],
      rows: 3,
    },
    { kind: "counter", id: "chips", title: "Chips para 16 MiB", at: [720, 40] },
    { kind: "counter", id: "bancos", title: "Bancos", at: [720, 140] },
    {
      kind: "table",
      id: "endereco",
      title: "O endereço 0xA35F26, campo a campo",
      at: [30, 250],
      columns: ["Campo", "Bits", "Valor"],
      widths: [260, 90, 110],
      rows: 4,
    },
    {
      kind: "table",
      id: "rom",
      title: "Memórias que guardam sem energia",
      at: [520, 250],
      columns: ["Tipo", "Como se grava"],
      widths: [110, 300],
      rows: 5,
    },
  ],
};

export function build(p: Params) {
  const org = pick(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const l = layout(TOTAL, BUS, CHIP, org);
  const all = Object.values(ORGS).map((o) => ({ o, l: layout(TOTAL, BUS, CHIP, o) }));
  const parts = split(ADDR, l);
  const rankBytes = (org.depth * BUS) / 8 / 2 ** 20;

  b.step(
    {
      id: "s1-formatos",
      title: "Os mesmos bits, outra forma",
      subtitle: "4 Mbit = 4M × 1 = 1M × 4 = 512K × 8",
      text: `Um chip de 4 Mbit guarda 4.194.304 bits, mas pode entregá-los de formas diferentes: 1 bit por endereço, 4 ou 8. Quanto mais largo, menos endereços: ${all.map((x) => `${x.o.name} precisa de ${x.l.chipAddrBits} bits de endereço`).join(", ")}. Para economizar pinos, a [[dram]] recebe o endereço em duas metades pelos mesmos fios, primeiro a linha (RAS) e depois a coluna (CAS).`,
      facts: [
        ["Bits no chip", "4.194.304"],
        ["Formato escolhido", org.name],
        ["Pinos de endereço", String(l.pins)],
      ],
      highlight: [],
    },
    () => {
      all.forEach((x, i) => {
        c.row("formatos", i, [x.o.name, String(x.l.chipAddrBits), String(x.l.pins), "", ""], {
          dt: 1,
          mark: x.o === org ? "hit" : "new",
          log: { who: x.o.name, what: `${x.l.chipAddrBits} bits de endereço`, detail: `${x.l.pins} pinos` },
        });
      });
    },
  );

  b.step(
    {
      id: "s2-banco",
      title: "Lado a lado",
      subtitle: `${l.perRank} chips de ${org.width} ${org.width === 1 ? "bit" : "bits"} = ${BUS} bits`,
      text: `O barramento entrega ${BUS} bits por acesso. Com chips ${org.name}, cada um fornece ${org.width} ${org.width === 1 ? "bit" : "bits"}, então ${l.perRank} chips ficam lado a lado, todos com o mesmo endereço, cada um cuidando de uma fatia da palavra. Esse grupo é um [[banco-de-chips]] (rank) e guarda ${org.depth / 1024}K palavras de ${BUS} bits, ${rankBytes} MiB.`,
      facts: [
        ["Chips por banco", String(l.perRank)],
        ["Bits por chip por acesso", String(org.width)],
        ["Capacidade do banco", `${rankBytes} MiB`],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Com chips ${org.name} num barramento de ${BUS} bits, quantos chips ficam lado a lado em cada banco?`,
        answer: l.perRank,
        tolerance: 0,
        unit: "chips",
        explain: `Cada chip entrega ${org.width} ${org.width === 1 ? "bit" : "bits"} por acesso; para encher ${BUS} bits, ${BUS} / ${org.width} = ${l.perRank} chips.`,
      },
    },
    () => {
      all.forEach((x, i) => {
        c.row(
          "formatos",
          i,
          [x.o.name, String(x.l.chipAddrBits), String(x.l.pins), String(x.l.perRank), ""],
          {
            dt: i === 0 ? 1 : 0,
            mark: x.o === org ? "hit" : "new",
          },
        );
      });
    },
  );

  b.step(
    {
      id: "s3-bancos",
      title: "Bancos empilhados",
      subtitle: `${l.ranks} ${l.ranks === 1 ? "banco" : "bancos"}, ${l.chips} chips`,
      text: `Para chegar a 16 MiB ${l.ranks === 1 ? "basta um banco" : `são ${l.ranks} bancos de ${rankBytes} MiB`}. ${l.ranks === 1 ? "Não há bancos a escolher." : `Os ${l.rankBits} bits mais altos do endereço vão a um decodificador, que ativa um banco por vez.`} Repare na tabela: com qualquer formato, o total é de ${l.chips} chips, porque 128 Mbit ÷ 4 Mbit = 32. O formato muda só a montagem: chips estreitos dão bancos largos; chips largos, mais bancos.`,
      facts: [
        ["Bancos", String(l.ranks)],
        ["Bits que escolhem o banco", String(l.rankBits)],
        ["Chips", String(l.chips)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: "Quantos chips de 4 Mbit são necessários para 16 MiB, em qualquer formato?",
        answer: l.chips,
        explain: `16 MiB = 128 Mbit; 128 ÷ 4 = ${l.chips}. Só muda como eles se agrupam em bancos.`,
      },
    },
    () => {
      all.forEach((x, i) => {
        c.row(
          "formatos",
          i,
          [x.o.name, String(x.l.chipAddrBits), String(x.l.pins), String(x.l.perRank), String(x.l.ranks)],
          { dt: i === 0 ? 1 : 0, mark: x.o === org ? "hit" : "new" },
        );
      });
      c.count("chips", String(l.chips), { role: "a", label: `${l.chips} chips` });
      c.count("bancos", String(l.ranks), { role: "b", label: `${l.ranks} bancos` });
    },
  );

  b.step(
    {
      id: "s4-endereco",
      title: "O endereço dividido",
      subtitle: `0xA35F26 → banco ${parts.rank}, linha ${parts.row}`,
      text: `Um acesso a 0xA35F26 percorre os 24 bits do endereço de cima para baixo. ${l.rankBits ? `Os ${l.rankBits} mais altos escolhem o banco ${parts.rank}; ` : ""}os ${l.rowBits} seguintes, a linha ${parts.row}, enviada com RAS; depois ${l.colBits} bits de coluna, ${parts.col}, com CAS. Os ${l.byteBits} últimos, que valem ${parts.byte}, escolhem o byte dentro da palavra de ${BUS} bits e nem chegam aos chips.`,
      facts: [
        ["Banco", String(parts.rank)],
        ["Linha", String(parts.row)],
        ["Coluna", String(parts.col)],
      ],
      highlight: [],
    },
    () => {
      const rows: [string, number, number][] = [
        ["Banco (decodificador)", l.rankBits, parts.rank],
        ["Linha (RAS)", l.rowBits, parts.row],
        ["Coluna (CAS)", l.colBits, parts.col],
        ["Byte na palavra", l.byteBits, parts.byte],
      ];
      rows.forEach(([n, bitsN, v], i) => {
        c.row("endereco", i, [n, String(bitsN), String(v)], {
          dt: 1,
          mark: "new",
          log: { who: n, what: String(v), detail: `${bitsN} bits` },
        });
      });
    },
  );

  b.step(
    {
      id: "s5-rom",
      title: "Memórias que não esquecem",
      subtitle: "ROM, PROM, EPROM, EEPROM, flash",
      text: "A RAM perde tudo sem energia, mas o código que liga o computador precisa estar lá antes de qualquer disco. Para isso existe a [[rom]], gravada na fábrica. Depois vieram versões graváveis: a PROM, uma vez só, queimando fusíveis; a EPROM, apagada com luz ultravioleta; a EEPROM, apagada por pulsos elétricos, byte a byte; e a flash, apagada em blocos grandes, a memória dos SSDs e pen drives.",
      facts: [
        ["ROM", "gravada na fábrica"],
        ["EPROM", "apagada com ultravioleta"],
        ["Flash", "apagada em blocos"],
      ],
      highlight: [],
    },
    () => {
      const rom: [string, string][] = [
        ["ROM", "máscara na fábrica, nunca muda"],
        ["PROM", "fusíveis queimados, uma vez"],
        ["EPROM", "luz ultravioleta apaga tudo"],
        ["EEPROM", "pulsos elétricos, byte a byte"],
        ["Flash", "pulsos elétricos, por bloco"],
      ];
      rom.forEach(([t, h], i) => {
        c.row("rom", i, [t, h], { dt: 1, mark: "new" });
      });
    },
  );

  return b.done({
    chips: l.chips,
    perRank: l.perRank,
    ranks: l.ranks,
    rank: parts.rank,
    row: parts.row,
    col: parts.col,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "chips-memoria",
    site: "arq",
    title: "Chips de memória: largura, bancos e ROM",
    summary:
      "16 MiB num barramento de 32 bits com chips de 4 Mbit em três formatos: chips por banco, bancos, o endereço dividido em linha e coluna e a família das ROMs.",
    area: "Memória",
    refs: [
      { book: "tanenbaum-sco", chapter: 3, section: "3.3.5", note: "Chips de memória", verified: true },
      { book: "tanenbaum-sco", chapter: 3, section: "3.3.6", note: "RAMs e ROMs", verified: true },
    ],
    simplifications: [
      "A linha e a coluna dividem o endereço do chip ao meio; chips reais têm divisões fixas de fábrica.",
      "Não há bancos internos ao chip nem intercalação entre bancos.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "organizacao",
        kind: "choice",
        label: "Formato do chip",
        options: Object.entries(ORGS).map(([value, o]) => ({ value, label: o.name })),
      },
    ],
  },
  build,
  intro: {
    text: "Um pente de memória é uma fileira de chips iguais. Você vai montar 16 MiB a partir de chips de 4 Mbit e ver como o formato do chip decide quantos ficam lado a lado, quantos bancos existem e como o endereço se divide.",
    facts: [
      ["Memória", "16 MiB"],
      ["Barramento", `${BUS} bits`],
      ["Chip", "4 Mbit"],
    ],
  },
  outro: {
    title: "Chips de memória em resumo",
    text: "Chips lado a lado formam a largura do barramento; bancos empilhados formam a capacidade. O endereço se divide em banco, linha e coluna, e as ROMs guardam o que precisa sobreviver sem energia.",
    facts: (run) => [
      ["Chips", String(run.stats.chips)],
      ["Por banco", String(run.stats.perRank)],
      ["Bancos", String(run.stats.ranks)],
    ],
  },
  next: ["dram", "decodificacao-enderecos"],
  practice,
};

export default lesson;
