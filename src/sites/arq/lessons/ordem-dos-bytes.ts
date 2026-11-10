import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import { bySize, type Field, fromBytes, layout, toBytes, wordsTouched } from "../../../sim/arch/bytes.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { ordemDosBytes as practice } from "../practice.ts";

/**
 * Multi-byte values in byte-addressed memory: little against big endian, the network's byte order
 * and the classic forgotten conversion, aligned and misaligned accesses, and struct padding.
 */
export const DEFAULTS = { valor: "0A0B0C0D", porta: 443, endereco: 2 };
const BASE = 0x100;
const FIELDS: Field[] = [
  { name: "a", type: "char", size: 1 },
  { name: "b", type: "int", size: 4 },
  { name: "c", type: "char", size: 1 },
  { name: "d", type: "short", size: 2 },
];
const ROLE: Record<string, Role> = { a: "a", b: "b", c: "crypto", d: "warn" };
const COUNT = 1000;

const h2 = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");
const hx = (n: number, w = 3) => `0x${n.toString(16).toUpperCase().padStart(w, "0")}`;

function clamp(p: Params) {
  const raw = String(p.valor ?? DEFAULTS.valor).replace(/^0x/i, "");
  const value = /^[0-9a-fA-F]{1,8}$/.test(raw)
    ? Number.parseInt(raw, 16)
    : Number.parseInt(DEFAULTS.valor, 16);
  const port = Math.min(65535, Math.max(1, Math.round(Number(p.porta ?? DEFAULTS.porta))));
  const addr = Math.min(12, Math.max(0, Math.round(Number(p.endereco ?? DEFAULTS.endereco))));
  return { value, port, addr };
}

function scene(p: Params): SceneSpec {
  const { value, port } = clamp(p);
  const g = (
    id: string,
    title: string,
    at: readonly [number, number],
    cols: number,
    cellW: number,
    idx: "dec" | "none" | "hex",
  ) => ({
    kind: "grid" as const,
    id,
    title,
    at,
    cols,
    rows: 1,
    cellW,
    indexLabel: idx,
  });
  return {
    viewBox: [960, 600],
    nodes: [],
    links: [],
    widgets: [
      g(
        "valor",
        `Valor 0x${value.toString(16).toUpperCase().padStart(8, "0")}, do byte mais significativo ao menos`,
        [40, 50],
        4,
        54,
        "none",
      ),
      g("little", `Little-endian: ${hx(BASE)} + i`, [40, 140], 4, 54, "dec"),
      g("big", `Big-endian: ${hx(BASE)} + i`, [320, 140], 4, 54, "dec"),
      {
        kind: "table",
        id: "rede",
        title: `Porta ${port} pela rede`,
        at: [600, 50],
        columns: ["Etapa", "Bytes", "Valor lido"],
        widths: [130, 70, 90],
        rows: 3,
      },
      g(
        "palavras",
        `Memória de ${hx(BASE)} a ${hx(BASE + 15)}, em palavras de 4 bytes`,
        [40, 250],
        16,
        40,
        "hex",
      ),
      { kind: "counter", id: "acessos", title: "Acessos ao barramento", at: [760, 250] },
      g("s1", "struct { char a; int b; char c; short d; }", [40, 370], 12, 40, "dec"),
      g("s2", "Mesmos campos, maiores primeiro", [40, 460], 12, 40, "dec"),
      { kind: "counter", id: "tamanho", title: "sizeof", at: [600, 370] },
      { kind: "counter", id: "vetor", title: `Vetor de ${COUNT}`, at: [760, 370] },
    ],
  };
}

export function build(p: Params) {
  const { value, port, addr } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const big = toBytes(value, 4, "big");
  const little = toBytes(value, 4, "little");
  const portBig = toBytes(port, 2, "big");
  const wrong = fromBytes(portBig, "little");
  const touched = wordsTouched(addr, 4);
  const s1 = layout(FIELDS);
  const s2 = layout(bySize(FIELDS));
  const vh = `0x${value.toString(16).toUpperCase().padStart(8, "0")}`;

  b.step(
    {
      id: "s1-bytes",
      title: "Um número, quatro bytes",
      subtitle: vh,
      text: `A memória é endereçada por byte: cada endereço guarda 8 [[bit|bits]]. Um inteiro de 32 bits ocupa quatro endereços seguidos, e alguém precisa decidir qual byte vai em qual. Em ${vh}, o byte mais significativo é ${h2(big[0] ?? 0)} e o menos significativo é ${h2(big[3] ?? 0)}. A escolha não muda o valor, só a ordem em que os bytes aparecem na memória.`,
      facts: [
        ["Tamanho", "4 bytes"],
        ["Mais significativo", h2(big[0] ?? 0)],
        ["Menos significativo", h2(big[3] ?? 0)],
      ],
      highlight: [],
    },
    () => {
      big.forEach((x, i) => {
        c.cell("valor", i, h2(x), {
          dt: 1,
          mark: "new",
          role: i === 0 ? "b" : i === 3 ? "a" : "muted",
          log: { who: "valor", what: `byte ${3 - i}`, detail: `0x${h2(x)}` },
        });
      });
    },
  );

  b.step(
    {
      id: "s2-ordem",
      title: "Little e big-endian",
      subtitle: `${hx(BASE)} guarda ${h2(little[0] ?? 0)} ou ${h2(big[0] ?? 0)}`,
      text: `Na ordem [[little-endian]], usada por x86, ARM e RISC-V, o byte menos significativo fica no menor endereço: ${little.map(h2).join(" ")}. Na big-endian, o mais significativo vem primeiro, na ordem em que escrevemos: ${big.map(h2).join(" ")}. ${little.join() === big.join() ? "Neste valor os bytes são simétricos e as duas ordens coincidem; tente outro no laboratório. " : ""}Dentro de uma máquina, ninguém percebe. O problema aparece quando bytes saem dela, para um arquivo ou para a rede, e outra máquina os lê.`,
      facts: [
        ["Little-endian", little.map(h2).join(" ")],
        ["Big-endian", big.map(h2).join(" ")],
        ["Mesmo valor", vh],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Numa máquina little-endian, que byte fica no endereço ${hx(BASE)}? Responda em decimal.`,
        answer: little[0] ?? 0,
        explain: `O menos significativo vai primeiro: 0x${h2(little[0] ?? 0)} = ${little[0]}.`,
      },
    },
    () => {
      little.forEach((x, i) => {
        c.cell("little", i, h2(x), {
          dt: 1,
          mark: "new",
          role: i === 0 ? "a" : i === 3 ? "b" : "muted",
          log: { who: "little-endian", what: hx(BASE + i), detail: `0x${h2(x)}` },
        });
      });
      big.forEach((x, i) => {
        c.cell("big", i, h2(x), {
          dt: i === 0 ? 1 : 0,
          mark: "new",
          role: i === 0 ? "b" : i === 3 ? "a" : "muted",
        });
      });
    },
  );

  b.step(
    {
      id: "s3-rede",
      title: "A ordem da rede",
      subtitle: `${port} vira ${wrong}`,
      text: `Os protocolos da Internet escrevem números em big-endian, a ordem de rede. A porta ${port} viaja como ${portBig.map(h2).join(" ")}. Uma máquina little-endian que copia esses bytes direto para a memória e lê um inteiro de 16 bits obtém ${wrong}${wrong === port ? ", que por coincidência é o mesmo número, porque os dois bytes são iguais" : ", outro número"}. Por isso o código de rede converte explicitamente, com funções como htons e ntohs.`,
      facts: [
        ["Porta", String(port)],
        ["Na rede", portBig.map(h2).join(" ")],
        ["Lida sem converter", String(wrong)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Os bytes ${portBig.map(h2).join(" ")} chegam da rede. Lidos como inteiro little-endian sem conversão, que número dão?`,
        answer: wrong,
        explain: `Little-endian toma o primeiro byte como o menos significativo: 0x${h2(portBig[1] ?? 0)}${h2(portBig[0] ?? 0)} = ${wrong}.`,
      },
    },
    () => {
      c.row("rede", 0, ["Envia (big)", portBig.map(h2).join(" "), String(port)], {
        dt: 1,
        mark: "new",
        log: { who: "rede", what: "envia", detail: portBig.map(h2).join(" ") },
      });
      c.row("rede", 1, ["Lê sem converter", portBig.map(h2).join(" "), String(wrong)], {
        dt: 1,
        ...(wrong !== port ? { mark: "bad" as const } : {}),
      });
      c.row("rede", 2, ["Lê com ntohs", portBig.map(h2).join(" "), String(port)], { dt: 1, mark: "hit" });
    },
  );

  b.step(
    {
      id: "s4-alinhamento",
      title: "Endereços alinhados",
      subtitle: `${hx(BASE + addr)}: ${touched} ${touched === 1 ? "acesso" : "acessos"}`,
      text: `A memória entrega palavras inteiras, aqui de 4 bytes, sempre a partir de um endereço múltiplo de 4. Um inteiro [[alinhamento|alinhado]] cabe numa palavra só. Em ${hx(BASE + addr)}, ${touched === 1 ? "o inteiro está alinhado e sai num único acesso" : `o inteiro atravessa a fronteira entre duas palavras, e a CPU precisa de ${touched} acessos e de juntar os pedaços`}. Algumas arquiteturas recusam o acesso desalinhado e geram uma exceção.`,
      facts: [
        ["Endereço", hx(BASE + addr)],
        ["Resto por 4", String((BASE + addr) % 4)],
        ["Acessos", String(touched)],
      ],
      highlight: [],
    },
    () => {
      for (let i = 0; i < 16; i++) {
        const inside = i >= addr && i < addr + 4;
        c.cell("palavras", i, inside ? h2(little[i - addr] ?? 0) : "·", {
          dt: i === 0 ? 1 : 0,
          role: inside ? "b" : Math.floor(i / 4) % 2 === 0 ? "muted" : "s3",
          ...(inside ? { mark: touched > 1 ? ("miss" as const) : ("hit" as const) } : {}),
          ...(i === addr
            ? {
                log: {
                  who: "CPU",
                  what: `lê 4 bytes em ${hx(BASE + addr)}`,
                  detail: `${touched} ${touched === 1 ? "palavra" : "palavras"}`,
                },
              }
            : {}),
        });
      }
      c.count("acessos", String(touched), { label: `${touched} ${touched === 1 ? "acesso" : "acessos"}` });
    },
  );

  const drawStruct = (grid: string, l: ReturnType<typeof layout>) => {
    for (let i = 0; i < 12; i++) {
      const f = l.placed.find((x) => i >= x.offset && i < x.offset + x.size);
      if (i >= l.size) continue;
      c.cell(grid, i, f ? f.name : "·", {
        dt: i === 0 ? 1 : 0,
        role: f ? (ROLE[f.name] ?? "a") : "muted",
        ...(f ? {} : { mark: "bubble" as const }),
        ...(f && f.offset === i
          ? {
              log: {
                who: grid === "s1" ? "original" : "reordenada",
                what: `${f.type} ${f.name}`,
                detail: `deslocamento ${i}`,
              },
            }
          : {}),
      });
    }
  };

  b.step(
    {
      id: "s5-struct",
      title: "O preenchimento das structs",
      subtitle: `sizeof = ${s1.size}`,
      text: `Para manter cada campo alinhado, o compilador insere bytes vazios, o [[preenchimento]]. Nesta struct, a ocupa o byte 0, mas b, de 4 bytes, só pode começar no 4: três bytes perdidos. c fica no 8, d precisa de endereço par e vai para o 10. Os dados somam ${FIELDS.reduce((s, f) => s + f.size, 0)} bytes, mas a struct ocupa ${s1.size}, e o tamanho total também é arredondado para que um vetor delas continue alinhado.`,
      facts: [
        ["Dados", `${FIELDS.reduce((s, f) => s + f.size, 0)} bytes`],
        ["Preenchimento", `${s1.padding} bytes`],
        ["sizeof", `${s1.size} bytes`],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: "Quantos bytes ocupa a struct { char a; int b; char c; short d; } com alinhamento natural?",
        answer: s1.size,
        explain: `a em 0, b em 4, c em 8, d em 10: ${s1.placed.map((f) => `${f.name}@${f.offset}`).join(", ")}, total ${s1.size}.`,
      },
    },
    () => {
      drawStruct("s1", s1);
      c.count("tamanho", String(s1.size), { label: `sizeof = ${s1.size}` });
      c.count("vetor", `${s1.size * COUNT} B`, { label: `${COUNT} structs: ${s1.size * COUNT} bytes` });
    },
  );

  b.step(
    {
      id: "s6-reordenar",
      title: "Maiores primeiro",
      subtitle: `${s1.size} → ${s2.size} bytes`,
      text: `Reordenando os campos do maior para o menor, b, d, a e c se encaixam sem buracos: ${s2.size} bytes. Num vetor de ${COUNT} structs, são ${(s1.size - s2.size) * COUNT} bytes a menos, e mais elementos cabem em cada linha de [[cache]]. Linguagens como Rust podem reordenar sozinhas; em C, a ordem declarada é respeitada, porque o formato na memória faz parte do contrato com arquivos, hardware e outros programas.`,
      facts: [
        ["Original", `${s1.size} bytes`],
        ["Reordenada", `${s2.size} bytes`],
        [`Economia em ${COUNT}`, `${(s1.size - s2.size) * COUNT} bytes`],
      ],
      highlight: [],
    },
    () => {
      drawStruct("s2", s2);
      c.count("tamanho", String(s2.size), { label: `sizeof = ${s2.size}` });
      c.count("vetor", `${s2.size * COUNT} B`, { label: `${COUNT} structs: ${s2.size * COUNT} bytes` });
    },
  );

  return b.done({
    little: little.map(h2).join(" "),
    first: little[0] ?? 0,
    wrong,
    touched,
    size: s1.size,
    sorted: s2.size,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "ordem-dos-bytes",
    site: "arq",
    title: "Ordem dos bytes e alinhamento",
    summary:
      "Como um número de vários bytes fica na memória: little e big-endian, a ordem de rede e a conversão esquecida, acessos alinhados e desalinhados e o preenchimento que o compilador põe nas structs.",
    area: "Representação",
    refs: [
      { book: "tanenbaum-sco", chapter: 2, section: "2.2.3", note: "Ordenação de bytes", verified: true },
      { book: "tanenbaum-sco", chapter: 2, section: "2.2.2", note: "Endereços de memória", verified: true },
    ],
    simplifications: [
      "A memória entrega palavras de 4 bytes; processadores reais leem linhas de cache inteiras.",
      "O alinhamento de cada tipo é igual ao seu tamanho, como na maioria das ABIs de 32 e 64 bits.",
      "Acessos desalinhados custam um acesso a mais; em algumas arquiteturas eles geram exceção.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "valor",
        kind: "text",
        label: "Inteiro de 32 bits (hexadecimal)",
        maxLength: 10,
        pattern: "^(0x)?[0-9a-fA-F]{1,8}$",
        placeholder: DEFAULTS.valor,
      },
      { key: "porta", kind: "int", label: "Porta enviada pela rede", min: 1, max: 65535 },
      {
        key: "endereco",
        kind: "int",
        label: "Deslocamento do inteiro a partir de 0x100",
        min: 0,
        max: 12,
        help: "Múltiplos de 4 ficam alinhados.",
      },
    ],
  },
  build,
  intro: {
    text: "Um inteiro de 4 bytes ocupa quatro endereços. Em que ordem? E por que o compilador às vezes deixa bytes vazios entre os campos de uma struct? Você vai ver os bytes na memória, um por um.",
    facts: [
      ["Valor", `0x${DEFAULTS.valor}`],
      ["Porta", String(DEFAULTS.porta)],
      ["Endereço", hx(BASE + DEFAULTS.endereco)],
    ],
  },
  outro: {
    title: "Ordem dos bytes em resumo",
    text: "Little-endian põe o byte menos significativo no menor endereço, big-endian o mais significativo. A rede usa big-endian, e quem esquece de converter lê outro número. Valores alinhados saem num acesso só, e o compilador preenche structs para garantir isso; ordenar os campos do maior para o menor reduz o desperdício.",
    facts: (run) => [
      ["Little-endian", String(run.stats.little)],
      ["Porta lida errada", String(run.stats.wrong)],
      ["sizeof", `${run.stats.size} → ${run.stats.sorted}`],
    ],
  },
  next: ["inteiros", "cache-direta"],
  practice,
};

export default lesson;
