import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import {
  bitStuff,
  bitUnstuff,
  byteStuff,
  byteUnstuff,
  cutByCount,
  ESC,
  FLAG,
  hex,
  parseHex,
} from "../../../sim/net/framing.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { enquadramento as practice } from "../practice.ts";

/**
 * Framing: a byte count that loses sync after one error, PPP flags with byte stuffing, HDLC bit
 * stuffing, and what the receiver undoes. The default data contain the flag on purpose.
 */
export const DEFAULTS = { dados: "41 7E 42 7D 43", bits: "011011111111111111110010" };
/** Four frames by byte count (CN 3.1.2): lengths 5, 5, 8, 8. */
const COUNTED = [5, 1, 2, 3, 4, 5, 5, 6, 7, 8, 8, 9, 0, 1, 2, 3, 4, 5, 8, 6, 7, 8, 9, 0, 1, 2];
const BAD_AT = 5;
const BAD = 7;

function clamp(p: Params) {
  const data = parseHex(String(p.dados ?? DEFAULTS.dados)).slice(0, 12);
  const bits = String(p.bits ?? DEFAULTS.bits)
    .replace(/[^01]/g, "")
    .slice(0, 32);
  return { data: data.length ? data : parseHex(DEFAULTS.dados), bits: bits || DEFAULTS.bits };
}

const scene: SceneSpec = {
  viewBox: [960, 640],
  nodes: [],
  links: [],
  widgets: [
    {
      kind: "table",
      id: "contagem",
      title: "Quadros por contagem: o primeiro byte é o tamanho",
      at: [40, 30],
      columns: ["Quadro", "Correto", "Com um erro no 2º tamanho"],
      widths: [90, 250, 300],
      rows: 4,
    },
    { kind: "counter", id: "extra", title: "Bytes ou bits a mais", at: [720, 30] },
    {
      kind: "table",
      id: "bytes",
      title: "Enquadramento por bytes (PPP)",
      at: [40, 220],
      columns: ["Etapa", "Bytes (hexadecimal)"],
      widths: [220, 420],
      rows: 4,
    },
    {
      kind: "table",
      id: "bits",
      title: "Enquadramento por bits (HDLC)",
      at: [40, 440],
      columns: ["Etapa", "Bits"],
      widths: [220, 420],
      rows: 3,
    },
  ],
};

export function build(p: Params) {
  const { data, bits } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const good = cutByCount(COUNTED);
  const broken = [...COUNTED];
  broken[BAD_AT] = BAD;
  const bad = cutByCount(broken);
  const stuffed = byteStuff(data);
  const frame = [FLAG, ...stuffed, FLAG];
  const back = byteUnstuff(stuffed);
  const bs = bitStuff(bits);
  const bback = bitUnstuff(bs.out);
  const extraBytes = stuffed.length - data.length;
  const flags = data.filter((x) => x === FLAG).length;
  const escs = data.filter((x) => x === ESC).length;
  const flagStuffed = hex(byteStuff([FLAG]));
  const tenOnes = bitStuff("1111111111").out.length;
  const notes: string[] = [];
  if (flags + escs === 0)
    notes.push("Os dados não têm 7E nem 7D: o corpo PPP sai igual aos dados, sem bytes a mais.");
  if (bs.inserted.length === 0)
    notes.push("Os bits nunca têm cinco 1 seguidos: o HDLC não insere nenhum zero.");

  b.step(
    {
      id: "s1-limites",
      title: "Onde o quadro termina",
      subtitle: "Contar bytes parece bastar",
      text: `A camada física entrega uma sequência de bits; a de enlace precisa achar o começo e o fim de cada [[quadro]]. A ideia mais simples é pôr o tamanho no primeiro byte. A tabela mostra ${good.frames.length} quadros assim, de ${good.frames.map((f) => f.length).join(", ")} bytes: o receptor lê o tamanho, separa esse número de bytes e o byte seguinte é o tamanho do próximo quadro.`,
      facts: [
        ["Método", "contagem de bytes"],
        ["Quadros", String(good.frames.length)],
        ["Tamanhos", good.frames.map((f) => f.length).join(", ")],
      ],
      highlight: [],
    },
    () => {
      good.frames.forEach((f, i) => {
        c.row("contagem", i, [String(i + 1), f.join(" "), ""], { dt: i === 0 ? 1 : 0, mark: "new" });
      });
    },
  );

  b.step(
    {
      id: "s2-desalinha",
      title: "Um erro, todos perdidos",
      subtitle: `${bad.frames.length - 1} quadros lidos errado`,
      text: `Agora um ruído troca o tamanho do segundo quadro de 5 para ${BAD}. O receptor separa ${BAD} bytes, engolindo o começo do terceiro quadro, e passa a ler bytes de dados como se fossem tamanhos. Mesmo que o CRC acuse o erro, ele não sabe onde recomeçar: não há nada nos bytes que marque o início de um quadro. Por isso os protocolos marcam o limite com um padrão especial, a [[flag]].`,
      facts: [
        ["Tamanho errado", `5 → ${BAD}`],
        ["Quadros lidos", String(bad.frames.length)],
        ["Sincronismo", bad.lost ? "perdido" : "mantido"],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: "Depois que o receptor perde o sincronismo na contagem de bytes, o que o reencontra?",
        options: [
          "Nada nos próprios bytes; é preciso um marcador",
          "O CRC do quadro seguinte",
          "O próximo byte com valor 5",
        ],
        answer: 0,
        explain:
          "O CRC só diz que algo deu errado. Sem um padrão que só apareça nos limites, qualquer byte pode ser tomado por um tamanho.",
      },
    },
    () => {
      for (let i = 0; i < 4; i++) {
        const f = bad.frames[i];
        c.row(
          "contagem",
          i,
          [String(i + 1), (good.frames[i] as number[]).join(" "), f ? f.join(" ") : "perdido"],
          {
            dt: i === 0 ? 1 : 0,
            mark: i === 0 ? "hit" : "bad",
          },
        );
      }
    },
  );

  b.step(
    {
      id: "s3-bytes",
      title: "Escapar o marcador",
      subtitle: `${extraBytes} bytes a mais`,
      text: `O PPP marca o começo e o fim com o byte 7E. Os dados aqui têm ${flags} byte 7E e ${escs} byte 7D. O transmissor faz o [[insercao-de-bytes|enchimento de bytes]]: troca cada 7E por 7D seguido do byte com o bit 5 invertido, e faz o mesmo com o próprio 7D. Os ${data.length} bytes de dados viram ${stuffed.length}, e entre as duas flags nunca aparece um 7E.`,
      facts: [
        ["Flag", "7E"],
        ["Escape", "7D"],
        ["Dados → corpo", `${data.length} → ${stuffed.length} bytes`],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: "Como o byte 7E viaja dentro do corpo de um quadro PPP?",
        options: [flagStuffed, "7E 7E", "7D 7E"],
        answer: 0,
        explain: `O escape 7D vem antes, e o byte vai com o bit 5 invertido: 7E XOR 20 = 5E, então ${flagStuffed}.`,
      },
    },
    () => {
      c.row("bytes", 0, ["Dados", hex(data)], {
        dt: 1,
        mark: "new",
        log: { what: "dados", detail: hex(data) },
      });
      c.row("bytes", 1, ["Corpo com escapes", hex(stuffed)], { dt: 1, mark: "warn" });
      c.row("bytes", 2, ["Quadro com flags", hex(frame)], { dt: 1, mark: "new" });
      c.count("extra", String(extraBytes), { label: `${extraBytes} bytes a mais` });
    },
  );

  b.step(
    {
      id: "s4-bits",
      title: "O mesmo, com bits",
      subtitle: `${bs.inserted.length} zeros inseridos`,
      text: `O HDLC trabalha com bits e usa a flag 01111110: seis uns seguidos. Para que os dados nunca a imitem, o transmissor faz o [[insercao-de-bits|enchimento de bits]]: depois de cinco uns seguidos, insere um 0, haja o que houver depois. Os ${bits.length} bits do exemplo ganham ${bs.inserted.length} zeros e ficam com ${bs.out.length}. O custo não depende de bytes inteiros, só de quantas vezes aparecem cinco uns seguidos.`,
      facts: [
        ["Flag", "01111110"],
        ["Regra", "cinco 1 → insere 0"],
        ["Bits", `${bits.length} → ${bs.out.length}`],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: "Os dados são dez bits 1 seguidos. Quantos bits o HDLC envia entre as flags?",
        answer: tenOnes,
        explain: `Depois do quinto 1 entra um 0, e depois do décimo, outro: 10 + 2 = ${tenOnes} bits.`,
      },
    },
    () => {
      c.row("bits", 0, ["Dados", bits], { dt: 1, mark: "new" });
      c.row("bits", 1, ["Com zeros inseridos", bs.out], { dt: 1, mark: bs.inserted.length ? "warn" : "new" });
      c.count("extra", String(bs.inserted.length), { label: `${bs.inserted.length} bits a mais` });
    },
  );

  b.step(
    {
      id: "s5-receptor",
      title: "O receptor desfaz",
      subtitle: "Os dados voltam iguais",
      text: `O receptor faz o caminho inverso. No PPP, ao ver 7D, descarta-o e inverte o bit 5 do byte seguinte; os ${stuffed.length} bytes voltam a ser ${back.length}, iguais aos originais. No HDLC, depois de cinco uns, descarta o 0 que vier; se vier um sexto 1, é uma flag. Agora um erro estraga só um quadro: o receptor espera a próxima flag e continua. No pior caso, só 7E e 7D, o PPP dobra o tamanho; o HDLC perde no máximo um bit em cada seis.`,
      facts: [
        ["PPP de volta", `${back.length} bytes`],
        ["HDLC de volta", `${bback.length} bits`],
        ["Depois de um erro", "espera a próxima flag"],
      ],
      highlight: [],
    },
    () => {
      c.row("bytes", 3, ["Recebido, sem escapes", hex(back)], { dt: 1, mark: "hit" });
      c.row("bits", 2, ["Recebido, sem zeros", bback], { dt: 1, mark: "hit" });
    },
  );

  return b.done(
    {
      stuffed: hex(stuffed),
      extraBytes,
      bits: bs.out,
      inserted: bs.inserted.length,
      badFrames: bad.frames.length,
      ok: back.join() === data.join() && bback === bits ? "sim" : "não",
    },
    notes,
  );
}

const lesson: LessonModule = {
  meta: {
    slug: "enquadramento",
    site: "redes",
    title: "Enquadramento: onde começa e termina um quadro",
    summary:
      "Contagem de bytes que perde o sincronismo, flag com enchimento de bytes no PPP e enchimento de bits no HDLC.",
    area: "Enlace",
    refs: [
      { book: "tanenbaum-cn", chapter: 3, section: "3.1.2", note: "Enquadramento", verified: true },
      { rfc: 1662, section: "4.2", note: "PPP em HDLC: transparência por octetos" },
    ],
    simplifications: [
      "O quadro não tem endereço, controle nem CRC; só o corpo entre as flags.",
      "No PPP real, o transmissor também pode escapar bytes de controle negociados (ACCM).",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "dados",
        kind: "text",
        label: "Dados (bytes em hexadecimal)",
        maxLength: 36,
        pattern: "\\s*[0-9A-Fa-f]{2}(\\s+[0-9A-Fa-f]{2}){0,11}\\s*",
        placeholder: DEFAULTS.dados,
        help: "Até 12 bytes separados por espaço. Experimente vários 7E e 7D seguidos.",
      },
      {
        key: "bits",
        kind: "text",
        label: "Dados em bits (HDLC)",
        maxLength: 32,
        pattern: "[01]{1,32}",
        placeholder: DEFAULTS.bits,
        help: "Até 32 bits. Só sequências de cinco 1 seguidos ganham zeros.",
      },
    ],
  },
  build,
  intro: {
    text: "Num cabo só passam bits, um atrás do outro. Para separar um quadro do seguinte, o enlace precisa de um marcador que os dados nunca imitem. Você vai ver por que contar bytes falha e como o PPP e o HDLC garantem um marcador único, mesmo com dados que o contêm.",
    facts: [
      ["Dados", DEFAULTS.dados],
      ["Flag PPP", "7E"],
      ["Flag HDLC", "01111110"],
    ],
  },
  outro: {
    title: "Enquadramento em resumo",
    text: "Contar bytes perde o sincronismo no primeiro erro. Uma flag marca o começo e o fim; o enchimento de bytes ou de bits garante que ela não apareça dentro dos dados, e o receptor desfaz o enchimento para recuperar o original.",
    facts: (run) => [
      ["Corpo PPP", String(run.stats.stuffed)],
      ["Zeros inseridos", String(run.stats.inserted)],
      ["Dados recuperados", String(run.stats.ok)],
    ],
  },
  next: ["crc", "switch-vlan"],
  practice,
};

export default lesson;
