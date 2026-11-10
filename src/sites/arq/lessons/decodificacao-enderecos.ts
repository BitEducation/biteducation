import type { LessonModule, SceneSpec } from "../../../contracts/types.ts";
import {
  aliases,
  comparedBits,
  DEVICES,
  type Device,
  full,
  offset,
  partial,
} from "../../../sim/arch/addrdecode.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { decodificacaoEnderecos as practice } from "../practice.ts";

/**
 * Address decoding: EPROM, RAM and a parallel I/O chip on a 16-bit bus. Full decoding gives each
 * chip one place; partial decoding saves gates and makes every chip answer at many addresses.
 */
const ACCESSES = [0x0010, 0x0810, 0x8004, 0x9004, 0xfffd, 0xc001];
const hex = (a: number) => `0x${a.toString(16).toUpperCase().padStart(4, "0")}`;
const [EPROM, RAM, PIO] = DEVICES as [Device, Device, Device];

const scene: SceneSpec = {
  viewBox: [960, 600],
  nodes: [],
  links: [],
  widgets: [
    {
      kind: "table",
      id: "mapa",
      title: "Mapa de 64 KiB",
      at: [30, 40],
      columns: ["Chip", "Faixa", "Tamanho", "Bits comparados", "Cópias (parcial)"],
      widths: [140, 160, 100, 150, 150],
      rows: 3,
    },
    {
      kind: "table",
      id: "acessos",
      title: "Quem responde a cada endereço",
      at: [30, 250],
      columns: ["Endereço", "Completa", "Parcial (A15, A14)"],
      widths: [120, 220, 260],
      rows: ACCESSES.length,
    },
    { kind: "counter", id: "fantasmas", title: "Endereços fantasma", at: [720, 260] },
  ],
};

export function build() {
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const who = (d: Device | null, a: number) => (d ? `${d.name}, posição ${offset(d, a)}` : "ninguém");
  const ghosts = ACCESSES.filter((a) => !full(a) && partial(a));
  const al = { eprom: aliases(EPROM), ram: aliases(RAM), pio: aliases(PIO) };
  const bitsOf = { eprom: comparedBits(EPROM), ram: comparedBits(RAM), pio: comparedBits(PIO) };
  const access = (a: number, i: number, which: "full" | "both") => {
    const f = full(a);
    const p = partial(a);
    c.row("acessos", i, [hex(a), who(f, a), which === "full" ? "" : who(p, a)], {
      dt: 1,
      mark: which === "both" && !f && p ? "bad" : "new",
      log: {
        who: hex(a),
        what: which === "full" ? who(f, a) : who(p, a),
        detail: which === "full" ? "decodificação completa" : "decodificação parcial",
      },
    });
  };

  b.step(
    {
      id: "s1-mapa",
      title: "Três chips, um barramento",
      subtitle: "EPROM, RAM e E/S em 64 KiB",
      text: `Um computador pequeno tem 16 linhas de endereço, 64 KiB. Nelas penduram-se três chips: uma EPROM de ${EPROM.size / 1024} KiB com o programa, em ${hex(EPROM.base)}; uma RAM de ${RAM.size / 1024} KiB, em ${hex(RAM.base)}; e um chip de [[e-s-mapeada-em-memoria|E/S mapeada em memória]] com ${PIO.size} registradores, em ${hex(PIO.base)}. Cada chip só olha para os seus bits baixos; alguém precisa decidir qual deles responde. Esse alguém liga o pino CS (chip select) de um chip só.`,
      facts: [
        ["Linhas de endereço", "16"],
        ["EPROM", `${hex(EPROM.base)}, ${EPROM.size / 1024} KiB`],
        ["E/S", `${hex(PIO.base)}, ${PIO.size} bytes`],
      ],
      highlight: [],
    },
    () => {
      DEVICES.forEach((d, i) => {
        c.row("mapa", i, [d.name, `${hex(d.base)}–${hex(d.base + d.size - 1)}`, `${d.size} bytes`, "", ""], {
          dt: 1,
          mark: "new",
        });
      });
    },
  );

  b.step(
    {
      id: "s2-completa",
      title: "Decodificação completa",
      subtitle: "Cada chip num lugar só",
      text: `Na [[decodificacao-de-enderecos]] completa, o CS de cada chip compara todos os bits acima dos seus: ${bitsOf.eprom.full} bits para a EPROM e a RAM, ${bitsOf.pio.full} para a E/S. Assim cada chip aparece numa única faixa. ${hex(ACCESSES[0] as number)} vai à EPROM e ${hex(ACCESSES[2] as number)} à RAM; ${hex(ACCESSES[1] as number)} e ${hex(ACCESSES[3] as number)} não ligam nenhum CS, e uma leitura ali devolve lixo do barramento.`,
      facts: [
        ["EPROM e RAM", `${bitsOf.eprom.full} bits comparados`],
        ["E/S", `${bitsOf.pio.full} bits comparados`],
        ["Endereços sem dono", "não ligam nenhum chip"],
      ],
      highlight: [],
    },
    () => {
      DEVICES.forEach((d, i) => {
        const k = bitsOf[d.id as keyof typeof bitsOf];
        c.row(
          "mapa",
          i,
          [
            d.name,
            `${hex(d.base)}–${hex(d.base + d.size - 1)}`,
            `${d.size} bytes`,
            `${k.full} → ${k.partial}`,
            "",
          ],
          {
            dt: i === 0 ? 1 : 0,
            mark: "new",
          },
        );
      });
      ACCESSES.forEach((a, i) => {
        access(a, i, "full");
      });
    },
  );

  b.step(
    {
      id: "s3-parcial",
      title: "Decodificação parcial",
      subtitle: "Só A15 e A14",
      text: `Comparar 14 bits custa portas. Como só há três chips, olhar A15 e A14 basta para separá-los: A15 = 0 é a EPROM, 10 é a RAM, 11 é a E/S. O circuito encolhe para um inversor e duas ANDs. O efeito colateral: os bits ignorados não importam, e cada chip passa a responder em vários lugares. A EPROM aparece ${al.eprom} vezes, a RAM ${al.ram} e os registradores de E/S ${al.pio}.`,
      facts: [
        ["Cópias da EPROM", String(al.eprom)],
        ["Cópias da RAM", String(al.ram)],
        ["Cópias da E/S", String(al.pio)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: "Com decodificação só por A15, quantas vezes a EPROM de 2 KiB aparece nos 32 KiB de baixo?",
        answer: al.eprom,
        explain: `Ela responde a todo endereço com A15 = 0: 32 KiB ÷ 2 KiB = ${al.eprom} cópias, todas mostrando os mesmos bytes.`,
      },
    },
    () => {
      DEVICES.forEach((d, i) => {
        const k = bitsOf[d.id as keyof typeof bitsOf];
        c.row(
          "mapa",
          i,
          [
            d.name,
            `${hex(d.base)}–${hex(d.base + d.size - 1)}`,
            `${d.size} bytes`,
            `${k.full} → ${k.partial}`,
            String(al[d.id as keyof typeof al]),
          ],
          { dt: i === 0 ? 1 : 0, mark: "hit" },
        );
      });
      ACCESSES.forEach((a, i) => {
        access(a, i, "both");
      });
      c.count("fantasmas", String(ghosts.length), {
        role: "bad",
        label: `${ghosts.length} endereços fantasma`,
      });
    },
  );

  b.step(
    {
      id: "s4-fantasma",
      title: "O endereço fantasma",
      subtitle: `${hex(ACCESSES[3] as number)} escreve na RAM`,
      text: `Dos ${ACCESSES.length} acessos da tabela, ${ghosts.length} mudam de dono com a decodificação parcial. ${hex(ACCESSES[3] as number)} não devia existir, mas agora liga a RAM na posição ${offset(RAM, ACCESSES[3] as number)}, a mesma de ${hex(ACCESSES[2] as number)}. Um ponteiro errado que escreva ali corrompe um dado válido sem nenhum erro. Por isso a decodificação parcial é aceitável em placas pequenas e fechadas, mas não onde o mapa pode crescer.`,
      facts: [
        ["Mesma posição", `${hex(ACCESSES[2] as number)} e ${hex(ACCESSES[3] as number)}`],
        ["Erro detectado", "nenhum"],
        ["Endereços fantasma", String(ghosts.length)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `A RAM tem ${RAM.size / 1024} KiB e, na decodificação parcial, responde sempre que A15 A14 = 10. Quantas cópias dela aparecem nos 64 KiB?`,
        answer: al.ram,
        tolerance: 0,
        unit: "cópias",
        explain: `A15 A14 = 10 marca 16 KiB do mapa. A RAM usa ${Math.log2(RAM.size)} bits de posição, ${RAM.size / 1024} KiB; os outros ${16 - 2 - Math.log2(RAM.size)} bits não são olhados, então ela se repete 16 / ${RAM.size / 1024} = ${al.ram} vezes.`,
      },
    },
    () => {
      access(ACCESSES[3] as number, 3, "both");
    },
  );

  b.step(
    {
      id: "s5-hoje",
      title: "No computador de hoje",
      subtitle: "Faixas configuradas na partida",
      text: "Num PC, o mesmo papel é do chipset e do controlador de memória. Na partida, o firmware pergunta a cada dispositivo PCI Express quanto espaço ele quer e escreve a faixa escolhida nos registradores de base do dispositivo. Daí em diante, uma leitura nessa faixa vai ao dispositivo em vez da RAM. É a E/S mapeada em memória: o driver conversa com a placa lendo e escrevendo endereços.",
      facts: [
        ["Quem decodifica", "chipset e PCIe"],
        ["Quem escolhe as faixas", "o firmware, na partida"],
        ["Driver", "lê e escreve endereços"],
      ],
      highlight: [],
    },
    () => {
      c.count("fantasmas", String(ghosts.length), { dt: 1, label: "fantasmas" });
    },
  );

  return b.done({ eprom: al.eprom, ram: al.ram, pio: al.pio, ghosts: ghosts.length });
}

const lesson: LessonModule = {
  meta: {
    slug: "decodificacao-enderecos",
    site: "arq",
    title: "Decodificação de endereços: quem responde a cada endereço",
    summary:
      "EPROM, RAM e um chip de E/S num barramento de 16 bits: decodificação completa, parcial e os endereços fantasma que ela cria.",
    area: "Sistema",
    refs: [
      {
        book: "tanenbaum-sco",
        chapter: 3,
        section: "3.7.2",
        note: "Decodificação de endereço",
        verified: true,
      },
    ],
    simplifications: [
      "Um endereço sem dono devolve um valor indefinido; alguns barramentos geram um erro.",
      "O chip de E/S tem só quatro registradores, um por endereço.",
    ],
  },
  scene,
  params: { defaults: {} },
  build,
  intro: {
    text: "Memória e dispositivos de E/S dividem o mesmo barramento de endereços. Quando o processador lê um endereço, exatamente um chip precisa responder. Você vai ver o circuito que decide isso e o que acontece quando ele economiza portas.",
    facts: [
      ["Barramento", "16 bits de endereço"],
      ["Chips", "EPROM, RAM, E/S"],
      ["Acessos", String(ACCESSES.length)],
    ],
  },
  outro: {
    title: "Decodificação em resumo",
    text: "Os bits altos do endereço escolhem o chip e os baixos, a posição dentro dele. Decodificar todos os bits dá a cada chip um lugar só; decodificar poucos economiza portas e cria cópias que um ponteiro errado alcança.",
    facts: (run) => [
      ["Cópias da EPROM", String(run.stats.eprom)],
      ["Cópias da RAM", String(run.stats.ram)],
      ["Fantasmas", String(run.stats.ghosts)],
    ],
  },
  next: ["barramentos", "interrupcoes"],
  practice,
};

export default lesson;
