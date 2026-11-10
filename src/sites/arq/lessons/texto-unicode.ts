import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { hex2, textRun, uplus } from "../../../sim/arch/text.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { textoUnicode as practice } from "../practice.ts";

/**
 * How text becomes bytes: ASCII's 128 codes, 8-bit code pages that disagree, Unicode code points,
 * UTF-8's variable length with prefix bits, the "Ã¡" that appears when UTF-8 is read as
 * Windows-1252, and UTF-16, where one emoji counts as two units.
 */
export const TEXTS = ["Olá €😀", "ação", "naïve", "日本"];
export const DEFAULTS = { texto: TEXTS[0] as string };
const MAXB = 12;

function clamp(p: Params) {
  return TEXTS.includes(String(p.texto)) ? String(p.texto) : (TEXTS[0] as string);
}

function scene(): SceneSpec {
  return {
    viewBox: [960, 560],
    nodes: [],
    links: [],
    widgets: [
      {
        kind: "grid",
        id: "cps",
        title: "Caracteres e pontos de código",
        at: [40, 40],
        cols: 6,
        rows: 1,
        cellW: 140,
        indexLabel: "none",
      },
      {
        kind: "grid",
        id: "bytes",
        title: "Bytes na memória (hexadecimal)",
        at: [40, 150],
        cols: MAXB,
        rows: 1,
        cellW: 70,
        indexLabel: "dec",
      },
      {
        kind: "table",
        id: "tam",
        title: "Quanto mede o texto",
        at: [40, 280],
        columns: ["Medida", "Valor", "Quem conta assim"],
        widths: [260, 120, 400],
        rows: 4,
      },
    ],
  };
}

export function build(p: Params) {
  const s = clamp(p);
  const r = textRun(s);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => `t${t}`);
  const pl = (k: number, one: string, many: string) => (k === 1 ? one : many);
  const first = r.cps.findIndex((x) => x >= 0x80);
  const ch = r.chars[first] ?? "";
  const cp = r.cps[first] ?? 0;
  const enc = r.u8[first] ?? [];
  const payload = enc.length === 2 ? 11 : enc.length === 3 ? 16 : 21;
  const bits = cp.toString(2).padStart(payload, "0");
  const byteBits = enc.map((x) => x.toString(2).padStart(8, "0"));
  const nonAscii = r.chars.filter((_, i) => (r.cps[i] ?? 0) >= 0x80);
  const astral = r.chars.filter((_, i) => (r.cps[i] ?? 0) >= 0x10000);
  const showBytes = (mark?: "new" | "miss") => {
    for (let i = 0; i < MAXB; i++) {
      const v = r.bytes[i];
      c.cell("bytes", i, v === undefined ? "" : hex2(v), {
        dt: 0,
        ...(v !== undefined && mark ? { mark } : {}),
      });
    }
  };

  b.step(
    {
      id: "s1-ascii",
      title: "ASCII: 128 códigos",
      subtitle: `"${s}"`,
      text: `Para o computador, texto é uma sequência de números. O [[ascii|ASCII]], de 1963, define 128 deles, em 7 bits: letras sem acento, dígitos, pontuação e controles. O "O" é 4F e o espaço é 20, em hexadecimal. ${r.ascii ? `O texto "${s}" cabe todo em ASCII.` : `Mas o texto "${s}" tem ${nonAscii.length} ${pl(nonAscii.length, "caractere", "caracteres")} que o ASCII não tem: ${nonAscii.join(" ")}.`}`,
      facts: [
        ["Códigos ASCII", "128"],
        ["Bits", "7"],
        ["Fora do ASCII", String(nonAscii.length)],
      ],
      highlight: ["cps"],
    },
    () => {
      r.chars.forEach((x, i) => {
        const v = r.cps[i] ?? 0;
        c.cell("cps", i, v < 0x80 ? `${x === " " ? "espaço" : x} = ${hex2(v)}` : `${x} = ?`, {
          mark: v < 0x80 ? "new" : "miss",
        });
      });
    },
  );

  b.step(
    {
      id: "s2-paginas",
      title: "Páginas de código",
      subtitle: "O mesmo byte, letras diferentes",
      text: `Para caber acentos, cada região usou o oitavo bit de um jeito: as [[pagina-de-codigo|páginas de código]]. No Latin-1, o byte E1 é "á"; no padrão russo KOI8-R, o mesmo E1 é "А", em cirílico. Um arquivo não diz qual tabela usou, e quem abre com a tabela errada vê outras letras. Era impossível misturar português e russo no mesmo texto.`,
      facts: [
        ["E1 no Latin-1", "á"],
        ["E1 no KOI8-R", "А"],
        ["Códigos por tabela", "256"],
      ],
      highlight: ["cps"],
    },
    () => {
      c.note("cps", "E1 = á no Latin-1, А no KOI8-R", "warn", { dt: 1 });
    },
  );

  b.step(
    {
      id: "s3-unicode",
      title: "Um número por caractere",
      subtitle: `${r.cps.length} pontos de código`,
      text: `O [[unicode|Unicode]] dá um número único a cada caractere de todas as escritas, o ponto de código, escrito U+ e hexadecimal. ${r.chars
        .slice(0, 3)
        .map((x, i) => `"${x === " " ? "espaço" : x}" é ${uplus(r.cps[i] ?? 0)}`)
        .join(
          ", ",
        )}. Os primeiros 128 são os do ASCII, e o espaço vai até U+10FFFF, mais de um milhão de posições. Mas um número não é um byte: falta decidir como gravá-lo.`,
      facts: [
        ["Pontos de código", String(r.cps.length)],
        ["Maior aqui", uplus(Math.max(...r.cps))],
        ["Limite", "U+10FFFF"],
      ],
      highlight: ["cps"],
      quiz: {
        kind: "number",
        prompt: `Quantos pontos de código tem o texto "${s}" (contando espaços)?`,
        answer: r.cps.length,
        explain: `Um por caractere visível: ${r.chars.map((x) => (x === " " ? "espaço" : x)).join(", ")}. São ${r.cps.length}.`,
      },
    },
    () => {
      r.chars.forEach((x, i) => {
        c.cell("cps", i, `${x === " " ? "espaço" : x} ${uplus(r.cps[i] ?? 0)}`, { mark: "new" });
      });
    },
  );

  b.step(
    {
      id: "s4-utf8",
      title: "UTF-8: tamanho variável",
      subtitle: `${r.utf8Len} bytes`,
      text:
        first >= 0
          ? `O [[utf-8|UTF-8]] grava ASCII em um byte, igual a antes, e o resto em 2, 3 ou 4. Os primeiros bits dizem o tamanho: 110 abre dois bytes, 1110 abre três, 11110 abre quatro, e 10 marca continuação. "${ch}" é ${uplus(cp)}, ${bits} em binário, e vira ${byteBits.join(" ")}: ${enc.map(hex2).join(" ")}. O texto inteiro ocupa ${r.utf8Len} bytes.`
          : `O [[utf-8|UTF-8]] grava ASCII em um byte, igual a antes, e o resto em 2, 3 ou 4, com os primeiros bits indicando o tamanho: 110 abre dois bytes, 1110 abre três, 11110 abre quatro, e 10 marca continuação. Como "${s}" é todo ASCII, cada caractere ocupa um byte: ${r.utf8Len} no total.`,
      facts: [
        ["Bytes UTF-8", String(r.utf8Len)],
        ["Caracteres", String(r.chars.length)],
        [first >= 0 ? `"${ch}"` : "ASCII", first >= 0 ? enc.map(hex2).join(" ") : "1 byte cada"],
      ],
      highlight: ["bytes"],
      quiz: {
        kind: "number",
        prompt: `Quantos bytes o texto "${s}" ocupa em UTF-8?`,
        answer: r.utf8Len,
        unit: "bytes",
        explain: `${r.chars.map((x, i) => `${x === " " ? "espaço" : x}: ${(r.u8[i] ?? []).length}`).join(", ")}. Somando, ${r.utf8Len} bytes.`,
      },
    },
    () => showBytes("new"),
  );

  b.step(
    {
      id: "s5-mojibake",
      title: "Quando aparece Ã¡",
      subtitle: "UTF-8 lido como Windows-1252",
      text: r.ascii
        ? `Um defeito comum é gravar em UTF-8 e ler com uma página de código antiga, como a Windows-1252. Para "${s}", que é todo ASCII, nada muda: os dois concordam nos primeiros 128 códigos. Com acentos, cada byte do UTF-8 viraria uma letra estranha. Troque o texto no Laboratório para ver.`
        : `Um defeito comum é gravar em UTF-8 e ler com uma página de código antiga, como a Windows-1252. Cada byte vira uma letra: os ${enc.length} bytes de "${ch}" aparecem como "${enc.map((x) => r.mojibake[r.bytes.indexOf(x)] ?? "").join("")}". O texto inteiro sai "${r.mojibake}". Ver Ã no lugar de acentos é o sinal de UTF-8 lido com a tabela errada.`,
      facts: [
        ["Gravado", "UTF-8"],
        ["Lido como", "Windows-1252"],
        ["Resultado", r.mojibake],
      ],
      highlight: ["bytes"],
      quiz: {
        kind: "choice",
        prompt: 'Um site mostra "aÃ§Ã£o" no lugar de "ação". O que aconteceu?',
        options: [
          "O texto foi gravado em UTF-8 e lido como Latin-1 ou Windows-1252",
          "O texto foi gravado em ASCII, que não tem ç",
          "O arquivo foi corrompido no disco",
        ],
        answer: 0,
        explain:
          'Em UTF-8, "ç" é C3 A7. Lidos um a um numa tabela de 8 bits, C3 é "Ã" e A7 é "§". O conteúdo está certo; a leitura, não.',
      },
    },
    () => {
      r.bytes.forEach((x, i) => {
        c.cell("bytes", i, `${hex2(x)} ${r.mojibake[i] === " " ? "␠" : r.mojibake[i]}`, {
          mark: x >= 0x80 ? "miss" : "hit",
        });
      });
    },
  );

  b.step(
    {
      id: "s6-medidas",
      title: "Quanto mede um texto",
      subtitle: "Caracteres, bytes e unidades",
      text: `Java, JavaScript e Windows guardam texto em [[utf-16|UTF-16]], em unidades de 16 bits. Caracteres até U+FFFF usam uma unidade; acima disso, como emojis, usam duas, um par substituto. ${astral.length ? `Por isso o JavaScript diz que "${s}" tem ${r.utf16Units} de comprimento, embora tenha ${r.chars.length} caracteres.` : `Em "${s}" não há nada acima de U+FFFF, então unidades e caracteres coincidem: ${r.utf16Units}.`} Antes de cortar ou contar texto, decida qual medida importa.`,
      facts: [
        ["Caracteres", String(r.chars.length)],
        ["Bytes UTF-8", String(r.utf8Len)],
        ["Unidades UTF-16", String(r.utf16Units)],
      ],
      highlight: ["tam"],
    },
    () => {
      showBytes();
      c.row("tam", 0, ["Caracteres que a pessoa vê", String(r.chars.length), "quem lê"], {
        dt: 1,
        mark: "new",
      });
      c.row("tam", 1, ["Pontos de código", String(r.cps.length), "Python (len)"], { dt: 1, mark: "new" });
      c.row("tam", 2, ["Bytes em UTF-8", String(r.utf8Len), "arquivos, rede, banco de dados"], {
        dt: 1,
        mark: "new",
      });
      c.row("tam", 3, ["Unidades UTF-16", String(r.utf16Units), "JavaScript e Java (length)"], {
        dt: 1,
        mark: r.utf16Units !== r.cps.length ? "warn" : "new",
      });
    },
  );

  return b.done({ chars: r.chars.length, utf8: r.utf8Len, utf16: r.utf16Units, mojibake: r.mojibake });
}

const lesson: LessonModule = {
  meta: {
    slug: "texto-unicode",
    site: "arq",
    title: "Texto: ASCII, Unicode e UTF-8",
    summary:
      "Como letras viram bytes: os 128 códigos do ASCII, páginas de código que não concordam, os pontos de código do Unicode, os 1 a 4 bytes do UTF-8, o Ã¡ de uma leitura errada e o emoji que conta dois no JavaScript.",
    area: "Representação",
    refs: [
      { book: "tanenbaum-sco", chapter: 2, section: "2.4.8", note: "Códigos de caracteres", verified: true },
    ],
    simplifications: [
      "Caracteres compostos, como letra mais acento separado, ficam de fora: cada caractere aqui é um ponto de código.",
      "A comparação de páginas de código usa só Latin-1, Windows-1252 e KOI8-R.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "texto", kind: "choice", label: "Texto", options: TEXTS.map((t) => ({ value: t, label: t })) },
    ],
  },
  build,
  practice,
  intro: {
    text: "Por que alguns sites mostram Ã¡ no lugar de á, e por que um emoji conta como dois caracteres em JavaScript? Você vai transformar um texto curto em números e bytes, passo a passo, do ASCII ao UTF-8.",
    facts: [
      ["Texto", TEXTS[0] as string],
      ["Codificações", "ASCII, UTF-8, UTF-16"],
      ["Bytes", "em hexadecimal"],
    ],
  },
  outro: {
    title: "Texto em resumo",
    text: "O Unicode dá um número a cada caractere; as codificações decidem como gravá-lo. O UTF-8 é compatível com ASCII, usa de 1 a 4 bytes e domina arquivos e a web. O UTF-16 usa unidades de 16 bits e pares para o que passa de U+FFFF. Letras estranhas como Ã quase sempre são UTF-8 lido com a tabela errada.",
    facts: (rr) => [
      ["Caracteres", String(rr.stats.chars)],
      ["Bytes UTF-8", String(rr.stats.utf8)],
      ["Unidades UTF-16", String(rr.stats.utf16)],
    ],
  },
  next: ["inteiros", "ordem-dos-bytes", "ponto-flutuante"],
};

export default lesson;
