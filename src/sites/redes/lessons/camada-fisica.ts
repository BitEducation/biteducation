import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import {
  FOUR_B_FIVE_B,
  type Level,
  longestFlat,
  manchester,
  nrz,
  nrzi,
  nyquist,
  shannon,
  snrLinear,
  usefulLevels,
  zeroRun,
} from "../../../sim/net/physical.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { camadaFisica as practice } from "../practice.ts";

/**
 * How many bits fit in a wire: a band of B hertz carries at most 2B symbols per second (Nyquist),
 * more levels per symbol help until noise blurs them (Shannon), and line codes trade bandwidth for
 * the transitions the receiver needs to keep its clock.
 */
export const DEFAULTS = { banda: 3, ruido: 30, bits: 2 };
const BITS = "10110000";
const LEVEL_BITS = [1, 2, 3, 4, 6];
const HIGH = "▀";
const LOW = "▄";

function clamp(p: Params) {
  const khz = Math.min(1000, Math.max(1, Math.round(Number(p.banda ?? DEFAULTS.banda))));
  const db = Math.min(60, Math.max(0, Math.round(Number(p.ruido ?? DEFAULTS.ruido))));
  const k = Math.min(6, Math.max(1, Math.round(Number(p.bits ?? DEFAULTS.bits))));
  return { hz: khz * 1000, khz, db, k, v: 2 ** k };
}

const dec = (x: number, d = 1) => String(Math.round(x * 10 ** d) / 10 ** d).replace(".", ",");
const grp = (x: number) => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export const rate = (bps: number) =>
  bps >= 1e6 ? `${dec(bps / 1e6)} Mbit/s` : bps >= 1000 ? `${dec(bps / 1000)} kbit/s` : `${dec(bps)} bit/s`;

const scene: SceneSpec = {
  viewBox: [960, 620],
  nodes: [],
  links: [],
  widgets: [
    {
      kind: "table",
      id: "taxas",
      title: "Mais níveis por símbolo, na mesma banda",
      at: [40, 50],
      columns: ["Níveis", "Bits/símbolo", "Nyquist", "Abaixo de Shannon?"],
      widths: [70, 110, 130, 170],
      rows: LEVEL_BITS.length,
    },
    { kind: "counter", id: "nyquist", title: "Nyquist (sem ruído)", at: [580, 50] },
    { kind: "counter", id: "shannon", title: "Shannon (com ruído)", at: [770, 50] },
    { kind: "counter", id: "snr", title: "Sinal ÷ ruído", at: [580, 140] },
    { kind: "counter", id: "plano", title: "Maior trecho sem transição", at: [770, 140] },
    {
      kind: "grid",
      id: "ondas",
      title: `Os bits ${BITS} em três códigos (meio bit por célula)`,
      at: [40, 260],
      cols: BITS.length * 2,
      rows: 4,
      cellW: 44,
      indexLabel: "none",
    },
    {
      kind: "table",
      id: "quatro",
      title: "4B/5B: cada 4 bits viram 5",
      at: [40, 480],
      columns: ["Dados", "Enviado", "Maior sequência de zeros"],
      widths: [100, 100, 220],
      rows: 2,
    },
  ],
};

export function build(p: Params) {
  const { hz, khz, db, k, v } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const ny = nyquist(hz, v);
  const sh = shannon(hz, db);
  const ratio = snrLinear(db);
  const useful = usefulLevels(db);
  const bits = [...BITS].map((x) => Number(x) as Level);
  const codes: [string, Level[]][] = [
    ["NRZ", nrz(bits)],
    ["NRZI", nrzi(bits)],
    ["Manchester", manchester(bits)],
  ];
  const flatNrz = longestFlat(codes[0]?.[1] ?? []) / 2;
  const flatMan = longestFlat(codes[2]?.[1] ?? []) / 2;
  const nibbles = [BITS.slice(0, 4), BITS.slice(4)];
  const sent = nibbles.map((n) => FOUR_B_FIVE_B[n] ?? "");
  const nivel = (n: number) => (n === 1 ? "1 nível" : `${n} níveis`);

  const wave = (row: number, levels: Level[], name: string) =>
    levels.forEach((l, i) => {
      c.cell("ondas", row * BITS.length * 2 + i, l ? HIGH : LOW, {
        dt: i === 0 ? 1 : 0,
        role: l ? "a" : "b",
        ...(i > 0 && levels[i - 1] !== l ? { mark: "new" as const } : {}),
        label: `${name}, meio bit ${i + 1}: ${l ? "alto" : "baixo"}`,
        ...(i === 0 ? { log: { who: name, what: levels.map((x) => (x ? "A" : "b")).join("") } } : {}),
      });
    });

  b.step(
    {
      id: "s1-banda",
      title: "Um fio filtra",
      subtitle: `Banda de ${grp(hz)} Hz`,
      text: `Todo meio físico deixa passar bem só uma faixa de frequências, a [[largura-de-banda]]. Uma linha telefônica, por exemplo, passa cerca de ${grp(hz)} Hz. Um sinal que muda de nível depressa demais tem frequências fora da faixa, e chega do outro lado arredondado, sem degraus nítidos. Então a pergunta da camada física é: com essa banda, quantas vezes por segundo dá para mudar o sinal, e quantos bits cabem em cada mudança?`,
      facts: [
        ["Banda", `${grp(hz)} Hz`],
        ["Muda o sinal", "símbolo a símbolo"],
        ["Pergunta", "quantos bits por segundo"],
      ],
      highlight: [],
    },
    () => {
      bits.forEach((x, i) => {
        c.cell("ondas", 2 * i, String(x), {
          dt: i === 0 ? 1 : 0,
          role: "muted",
          label: `bit ${i + 1}: ${x}`,
        });
      });
    },
  );

  b.step(
    {
      id: "s2-nyquist",
      title: "O limite sem ruído",
      subtitle: `2 × ${grp(hz)} × log₂ ${v}`,
      text: `Nyquist mostrou que uma banda de B hertz comporta no máximo 2B símbolos por segundo: ${grp(2 * hz)} aqui. Cada [[simbolo]] pode ter mais de dois níveis. Com ${nivel(v)}, um símbolo carrega log₂ ${v} = ${k} ${k === 1 ? "bit" : "bits"}, e a taxa máxima fica 2 × ${grp(hz)} × ${k} = ${rate(ny)}. A tabela mostra o salto: dobrar os bits por símbolo dobra a taxa, sem mexer na banda. Só que isso vale para um fio sem ruído nenhum.`,
      facts: [
        ["Símbolos por segundo", grp(2 * hz)],
        ["Bits por símbolo", String(k)],
        ["Nyquist", rate(ny)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Com banda de ${grp(hz)} Hz e ${nivel(v)} por símbolo, qual é a taxa máxima de Nyquist, em kbit/s?`,
        answer: Math.round(ny / 100) / 10,
        tolerance: 0.05,
        unit: "kbit/s",
        explain: `2 × ${grp(hz)} = ${grp(2 * hz)} símbolos por segundo, × log₂ ${v} = ${k}: ${grp(ny)} bit/s, ou ${rate(ny)}.`,
      },
    },
    () => {
      LEVEL_BITS.forEach((kb, i) => {
        const r = nyquist(hz, 2 ** kb);
        c.row("taxas", i, [String(2 ** kb), String(kb), rate(r), ""], {
          dt: 1,
          ...(kb === k ? { mark: "hit" as const } : {}),
          log: { who: nivel(2 ** kb), what: rate(r) },
        });
      });
      c.count("nyquist", rate(ny), { dt: 0, role: "a", label: `Nyquist ${rate(ny)}` });
    },
  );

  b.step(
    {
      id: "s3-shannon",
      title: "O ruído decide",
      subtitle: `${db} dB: ${rate(sh)}`,
      text: `Com mais níveis, eles ficam mais próximos, e o ruído do fio passa a fazer um nível parecer o vizinho. Shannon calculou o teto que nenhum código supera: B × log₂(1 + S/N). Uma relação sinal-ruído de ${db} dB quer dizer que o sinal é ${grp(ratio)} vezes mais forte que o ruído, e a [[capacidade-de-shannon]] fica ${grp(hz)} × log₂(${grp(1 + ratio)}) = ${rate(sh)}. É por isso que os modems discados pararam perto de 30 a 56 kbit/s.`,
      facts: [
        ["S/N", `${db} dB = ${grp(ratio)}×`],
        ["Shannon", rate(sh)],
        ["Níveis úteis", `até uns ${dec(useful, 0)}`],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: `Com ${db} dB de relação sinal-ruído, adianta usar 64 níveis por símbolo nessa banda?`,
        options:
          nyquist(hz, 64) > sh
            ? [
                `Não: 64 níveis prometem ${rate(nyquist(hz, 64))}, acima do limite de Shannon, e o ruído confunde os níveis`,
                "Sim: mais níveis sempre dão mais bits por segundo",
                "Sim, desde que a banda seja dobrada também",
              ]
            : [
                `Sim: ${rate(nyquist(hz, 64))} ainda fica abaixo do limite de Shannon, de ${rate(sh)}`,
                "Não: mais de dois níveis nunca funcionam com ruído",
                "Não: Nyquist proíbe mais de 16 níveis",
              ],
        answer: 0,
        explain: `O limite de Shannon é ${rate(sh)}; com 64 níveis, Nyquist daria ${rate(nyquist(hz, 64))}. Níveis acima de uns ${dec(useful, 0)} ficam mais próximos que o ruído.`,
      },
    },
    () => {
      LEVEL_BITS.forEach((kb, i) => {
        const r = nyquist(hz, 2 ** kb);
        const ok = r <= sh;
        c.row("taxas", i, [String(2 ** kb), String(kb), rate(r), ok ? "sim" : "não: ruído"], {
          dt: 1,
          mark: ok ? "hit" : "bad",
        });
      });
      c.count("shannon", rate(sh), { dt: 0, role: "warn", label: `Shannon ${rate(sh)}` });
      c.count("snr", `${grp(ratio)}×`, { dt: 0, role: "b", label: `S/N ${grp(ratio)}` });
    },
  );

  b.step(
    {
      id: "s4-relogio",
      title: "Zeros demais",
      subtitle: `NRZ: ${flatNrz} bits sem mudar`,
      text: `Falta pôr os bits no fio. No [[nrz]], 1 é nível alto e 0 é baixo. Nos bits ${BITS}, os zeros finais viram ${flatNrz} tempos de bit sem nenhuma mudança, e o receptor, que conta o tempo pelo próprio relógio, pode perder a conta de quantos zeros passaram. O NRZI muda o nível a cada 1 e resolve sequências de uns, mas não as de zeros. O receptor precisa de transições para acertar o passo do relógio dele com o do emissor.`,
      facts: [
        ["NRZ", "1 alto, 0 baixo"],
        ["NRZI", "1 muda o nível"],
        ["Sem transição", `${flatNrz} bits`],
      ],
      highlight: [],
    },
    () => {
      wave(1, codes[0]?.[1] ?? [], "NRZ");
      wave(2, codes[1]?.[1] ?? [], "NRZI");
      c.count("plano", `${flatNrz} bits`, {
        dt: 0,
        role: "bad",
        label: `NRZ fica ${flatNrz} bits sem mudar`,
      });
    },
  );

  b.step(
    {
      id: "s5-manchester",
      title: "Uma transição por bit",
      subtitle: "Manchester",
      text: `O código [[manchester]], da Ethernet de 10 Mbit/s, divide cada bit em duas metades e sempre muda no meio: 0 é alto-baixo, 1 é baixo-alto. O maior trecho sem mudança cai para ${flatMan} tempo de bit, e o relógio do receptor se acerta a cada bit. O preço é a banda: o sinal muda até duas vezes por bit, então precisa do dobro de símbolos por segundo para a mesma taxa. Com ${grp(hz)} Hz, Manchester daria só ${rate(hz)}.`,
      facts: [
        ["0", "alto, depois baixo"],
        ["1", "baixo, depois alto"],
        ["Custo", "dobro de banda"],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: "Por que a Ethernet de 10 Mbit/s usava Manchester, se ele gasta o dobro de banda?",
        options: [
          "Para garantir uma transição em todo bit e manter o relógio do receptor acertado",
          "Para mandar dois bits por símbolo",
          "Para detectar erros como um CRC",
        ],
        answer: 0,
        explain: `No NRZ, os bits ${BITS} passam ${flatNrz} tempos de bit sem mudar; em Manchester, nunca mais que ${flatMan}.`,
      },
    },
    () => {
      wave(3, codes[2]?.[1] ?? [], "Manchester");
      c.count("plano", `${flatMan} bit`, { dt: 0, role: "a", label: `Manchester: ${flatMan} bit sem mudar` });
    },
  );

  b.step(
    {
      id: "s6-4b5b",
      title: "Cinco bits por quatro",
      subtitle: "4B/5B: 25% a mais",
      text: `Um meio-termo é trocar cada grupo de 4 bits por um de 5, escolhido numa tabela feita para que, mesmo emendando códigos, nunca apareçam mais de três zeros seguidos. Os bits ${nibbles.join(" ")} saem como ${sent.join(" ")}: a maior sequência de zeros cai de ${zeroRun(BITS)} para ${zeroRun(sent.join(""))}. Com NRZI por cima, há transição frequente gastando 25% a mais, em vez de 100%. A Fast Ethernet usa 4B/5B; enlaces mais rápidos usam 8b/10b e 64b/66b.`,
      facts: [
        ["Entrada", nibbles.join(" ")],
        ["Saída", sent.join(" ")],
        ["Custo", "25% de banda"],
      ],
      highlight: [],
    },
    () => {
      nibbles.forEach((n, i) => {
        c.row("quatro", i, [n, sent[i] ?? "", `${zeroRun(n)} → ${zeroRun(sent[i] ?? "")}`], {
          dt: 1,
          mark: "new",
          log: { who: "4B/5B", what: `${n} → ${sent[i]}` },
        });
      });
    },
  );

  return b.done({
    nyquist: rate(ny),
    shannon: rate(sh),
    snr: grp(ratio),
    useful: dec(useful, 0),
    flatNrz,
    flatMan,
    khz,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "camada-fisica",
    site: "redes",
    title: "Camada física: Nyquist, Shannon e códigos de linha",
    summary:
      "Quantos bits cabem numa banda: o limite de Nyquist sem ruído, o de Shannon com ruído, e como NRZ, NRZI, Manchester e 4B/5B põem bits no fio sem o receptor perder o relógio.",
    area: "Fundamentos",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 2,
        section: "2.1",
        note: "Base teórica: Nyquist e Shannon",
        verified: true,
      },
      {
        book: "tanenbaum-cn",
        chapter: 2,
        section: "2.4",
        note: "De formas de onda a bits: códigos de linha",
        verified: true,
      },
    ],
    simplifications: [
      "O ruído é tratado como branco e gaussiano, a hipótese da fórmula de Shannon.",
      "As ondas aparecem como degraus ideais, meio bit por célula.",
      "Nos códigos de linha, a banda necessária é estimada pelas mudanças por segundo.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "banda", kind: "int", label: "Banda (kHz)", min: 1, max: 1000 },
      { key: "ruido", kind: "int", label: "Sinal ÷ ruído (dB)", min: 0, max: 60 },
      { key: "bits", kind: "int", label: "Bits por símbolo", min: 1, max: 6 },
    ],
  },
  build,
  intro: {
    text: "Antes de qualquer protocolo, os bits precisam virar um sinal num fio, e o fio tem limites. Você vai calcular quantos bits por segundo cabem numa linha telefônica com e sem ruído, e ver por que a Ethernet não manda os bits do jeito mais óbvio.",
    facts: [
      ["Banda", `${DEFAULTS.banda} kHz`],
      ["Sinal ÷ ruído", `${DEFAULTS.ruido} dB`],
      ["Bits", BITS],
    ],
  },
  outro: {
    title: "Camada física em resumo",
    text: "Uma banda de B hertz comporta 2B símbolos por segundo, e mais níveis por símbolo aumentam a taxa até o ruído confundir os níveis: o teto real é a capacidade de Shannon, B × log₂(1 + S/N). Para o receptor manter o relógio, os códigos de linha garantem transições: Manchester a cada bit, ao custo do dobro de banda; 4B/5B com 25% a mais.",
    facts: (run) => [
      ["Nyquist", String(run.stats.nyquist)],
      ["Shannon", String(run.stats.shannon)],
      ["NRZ sem mudar", `${run.stats.flatNrz} bits`],
    ],
  },
  next: ["encapsulamento", "crc"],
  practice,
};

export default lesson;
