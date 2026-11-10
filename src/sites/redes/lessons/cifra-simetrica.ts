import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { aesBlock, bitsDiff, cbc, ecb, fromHex, gcm, gcmCheck, hexOf } from "../../../sim/net/aes.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Symmetric encryption with real AES-128: one shared key, ten rounds, the avalanche of a single
 * flipped bit, ECB leaking the shape of an image, CBC hiding it, and GCM rejecting a ciphertext
 * whose bit was flipped in transit, which plain counter mode would have accepted.
 */
export const KEY = fromHex("2b7e151628aed2a6abf7158809cf4f3c");
export const PLAIN = fromHex("3243f6a8885a308d313198a2e0370734");
const IV16 = fromHex("000102030405060708090a0b0c0d0e0f");
const IV12 = fromHex("cafebabefacedbaddecaf888");
const COLS = 8;
const HEART = ["01100110", "11111111", "11111111", "01111110", "00011000"];
const BLOCKS = HEART.join("")
  .split("")
  .map((x) => Array<number>(16).fill(x === "1" ? 0xff : 0x00));
export const MSG = "pagar R$ 100,00.";
const MSG_BYTES = [...MSG].map((ch) => ch.charCodeAt(0));
const DIGIT = MSG.indexOf("1");
export const DEFAULTS = { bit: 0 };

function clamp(p: Params) {
  return Math.min(127, Math.max(0, Math.round(Number(p.bit ?? DEFAULTS.bit))));
}

const scene: SceneSpec = {
  viewBox: [960, 640],
  nodes: [
    { id: "ana", kind: "laptop", label: "Ana", sub: "cifra", at: [110, 70] },
    { id: "rede", kind: "cloud", label: "Rede", sub: "qualquer um copia", at: [480, 70], w: 180 },
    { id: "beto", kind: "server", label: "Beto", sub: "decifra", at: [850, 70] },
  ],
  links: [
    { id: "l-a", from: "ana", to: "rede" },
    { id: "l-b", from: "rede", to: "beto" },
  ],
  widgets: [
    {
      kind: "grid",
      id: "rodadas",
      title: "AES-128: dois primeiros bytes do estado após cada rodada",
      at: [40, 160],
      cols: 11,
      rows: 1,
      cellW: 78,
      indexLabel: "dec",
    },
    {
      kind: "grid",
      id: "img",
      title: `Imagem de ${HEART.length * COLS} blocos de 16 bytes: cor = blocos cifrados iguais`,
      at: [40, 270],
      cols: COLS,
      rows: HEART.length,
      cellW: 80,
      indexLabel: "none",
    },
    { kind: "counter", id: "bits", title: "Bits que mudaram (de 128)", at: [720, 280] },
    {
      kind: "table",
      id: "modos",
      title: "Modos de operação",
      at: [40, 500],
      columns: ["Modo", "Esconde padrões", "Detecta alteração", "Paraleliza cifrar"],
      widths: [140, 230, 230, 230],
      rows: 3,
    },
  ],
};

export function build(p: Params) {
  const bit = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, { ana: "Ana", rede: "rede", beto: "Beto" }, (t) => `t${t}`);
  const { out, rounds } = aesBlock(KEY, PLAIN);
  const flipped = [...PLAIN];
  flipped[bit >> 3] = (flipped[bit >> 3] as number) ^ (0x80 >> (bit & 7));
  const out2 = aesBlock(KEY, flipped).out;
  const diff = bitsDiff(out, out2);
  const e = ecb(KEY, BLOCKS);
  const cb = cbc(KEY, IV16, BLOCKS);
  const distinct = (xs: number[][]) => new Set(xs.map(hexOf)).size;
  const paint = (cts: number[][]) => {
    const first = hexOf(cts[0] ?? []);
    const second = cts.map(hexOf).find((h) => h !== first);
    cts.forEach((ct, i) => {
      const h = hexOf(ct);
      c.cell("img", i, h.slice(0, 4), {
        mark: h === first ? "new" : h === second && distinct(cts) <= 2 ? "dirty" : "hit",
        dt: 0,
      });
    });
  };
  // Counter mode without a tag versus GCM: flip the bits that turn '1' into '9'.
  const g = gcm(KEY, IV12, MSG_BYTES);
  const tampered = [...g.c];
  tampered[DIGIT] = (tampered[DIGIT] as number) ^ (0x31 ^ 0x39);
  const check = gcmCheck(KEY, IV12, tampered, g.tag);
  const ctrPlain = String.fromCharCode(...check.plain);

  b.step(
    {
      id: "s1-chave",
      title: "Uma chave, dois lados",
      subtitle: "Cifra simétrica",
      text: `Na [[cifra-simetrica|cifra simétrica]], a mesma chave cifra e decifra. Ana e Beto têm a mesma chave de 128 bits; quem copia a mensagem na rede vê só bytes sem sentido. É rápida: processadores atuais cifram gigabytes por segundo com instruções próprias. O problema é combinar a chave sem que ninguém a veja, e é para isso que existem [[diffie-hellman|Diffie-Hellman]] e RSA.`,
      facts: [
        ["Chave", "128 bits, a mesma nos dois"],
        ["Velocidade", "gigabytes por segundo"],
        ["Para combinar a chave", "Diffie-Hellman"],
      ],
      highlight: ["ana", "beto"],
    },
    () => {
      c.send("ana", "rede", hexOf(out).slice(0, 8), { what: "cifrado", detail: "bytes sem sentido" });
      c.send("rede", "beto", hexOf(out).slice(0, 8), { what: "cifrado", detail: "Beto decifra" });
    },
  );

  b.step(
    {
      id: "s2-aes",
      title: "Dez rodadas do AES",
      subtitle: "Bloco de 16 bytes",
      text: `O [[aes|AES]] cifra blocos de 16 bytes. Com chave de 128 bits, são 10 rodadas, cada uma com quatro operações: troca cada byte por outro numa tabela fixa, desloca as linhas do bloco, mistura as colunas e combina com uma chave de rodada derivada da chave principal. A cena mostra o exemplo oficial da norma: o bloco ${hexOf(PLAIN).slice(0, 8)}… vira ${hexOf(out)}.`,
      facts: [
        ["Rodadas", "10"],
        ["Bloco", "16 bytes"],
        ["Saída", `${hexOf(out).slice(0, 8)}…`],
      ],
      highlight: ["rodadas"],
      quiz: {
        kind: "number",
        prompt: "Quantas rodadas o AES faz com uma chave de 128 bits?",
        answer: 10,
        explain:
          "AES-128 usa 10 rodadas; AES-192 usa 12 e AES-256, 14. A última rodada não mistura as colunas.",
      },
    },
    () => {
      rounds.forEach((r, i) => {
        c.cell("rodadas", i, hexOf(r.slice(0, 2)), { mark: i === 10 ? "hit" : "new" });
      });
    },
  );

  b.step(
    {
      id: "s3-avalanche",
      title: "Um bit muda metade",
      subtitle: `Bit ${bit} trocado`,
      text: `Agora Ana troca um único bit da entrada, o bit ${bit}, e cifra de novo com a mesma chave. Dos 128 bits da saída, ${diff} mudaram. É o [[efeito-avalanche|efeito avalanche]]: cada rodada espalha a diferença por todo o bloco, e depois de dez rodadas a saída nova não tem relação visível com a antiga. Quem compara os dois blocos cifrados não descobre qual bit mudou.`,
      facts: [
        ["Bit trocado", String(bit)],
        ["Bits que mudaram", `${diff} de 128`],
        ["Esperado", "cerca de 64"],
      ],
      highlight: ["bits"],
      quiz: {
        kind: "choice",
        prompt: "Trocando um bit da entrada do AES, quantos bits da saída mudam, tipicamente?",
        options: ["Cerca de metade, 64 de 128", "Só um, o da mesma posição", "Todos os 128"],
        answer: 0,
        explain: `Cada bit da saída depende de todos os da entrada; mudar um faz cada bit da saída virar com chance de ½. Aqui foram ${diff}.`,
      },
    },
    () => {
      c.count("bits", String(diff), { label: `${diff} de 128` });
      c.cell("rodadas", 10, hexOf(out2.slice(0, 2)), { mark: "dirty" });
    },
  );

  b.step(
    {
      id: "s4-ecb",
      title: "ECB mostra o desenho",
      subtitle: `${distinct(e)} blocos cifrados diferentes`,
      text: `Para cifrar mais que 16 bytes é preciso um [[modo-de-operacao|modo de operação]]. O mais ingênuo, ECB, cifra cada bloco sozinho. Esta imagem tem só dois tipos de bloco, claro e escuro, e com ECB blocos iguais dão cifrados iguais: são só ${distinct(e)} valores diferentes em ${e.length}. Pintando os iguais da mesma cor, o coração aparece inteiro, sem decifrar nada.`,
      facts: [
        ["Blocos", String(e.length)],
        ["Cifrados diferentes", String(distinct(e))],
        ["Padrão", "visível"],
      ],
      highlight: ["img"],
      quiz: {
        kind: "choice",
        prompt: "Por que o desenho aparece na imagem cifrada com ECB, se o AES é seguro?",
        options: [
          "Blocos iguais viram cifrados iguais, então a repetição da entrada aparece na saída",
          "Porque o ECB usa uma chave mais curta",
          "Porque o AES não cifra bytes 00 e FF",
        ],
        answer: 0,
        explain:
          "Cada bloco é cifrado de forma segura, mas sempre da mesma forma. Quem não sabe a chave ainda vê onde os blocos se repetem, e isso revela a estrutura.",
      },
    },
    () => paint(e),
  );

  b.step(
    {
      id: "s5-cbc",
      title: "CBC encadeia os blocos",
      subtitle: `${distinct(cb)} cifrados diferentes`,
      text: `No modo CBC, cada bloco é combinado por XOR com o cifrado anterior antes de passar pelo AES; o primeiro usa um vetor de inicialização, o IV. Agora blocos iguais na entrada dão cifrados diferentes: ${distinct(cb)} valores em ${cb.length}, e o desenho some. Mas o CBC não percebe se alguém alterou o cifrado, e cifrar exige ir um bloco depois do outro.`,
      facts: [
        ["Cifrados diferentes", String(distinct(cb))],
        ["IV", "aleatório, nunca repetido"],
        ["Detecta alteração", "não"],
      ],
      highlight: ["img"],
    },
    () => paint(cb),
  );

  b.step(
    {
      id: "s6-gcm",
      title: "GCM: cifra e confere",
      subtitle: "A etiqueta de autenticação",
      text: `Ana manda "${MSG}" no modo contador, que cifra com XOR, e alguém no meio troca alguns bits do cifrado. Sem verificação, Beto decifraria "${ctrPlain}": um 1 virou 9, sem a chave. O [[gcm|GCM]] junta o modo contador a uma etiqueta de 16 bytes calculada sobre o cifrado. Beto recalcula, a etiqueta não confere e a mensagem é descartada. É o modo usado no TLS e no WPA3.`,
      facts: [
        ["Sem etiqueta", ctrPlain],
        ["Com GCM", check.ok ? "aceita" : "rejeitada"],
        ["Etiqueta", `${hexOf(g.tag).slice(0, 8)}…`],
      ],
      highlight: ["rede", "beto", "modos"],
    },
    () => {
      c.send("ana", "rede", "cifrado + etiqueta", { what: "GCM", detail: `${hexOf(g.c).slice(0, 8)}…` });
      c.state("rede", "troca bits do cifrado", { tone: "bad" });
      c.send("rede", "beto", "cifrado alterado", { what: "GCM", detail: "mesma etiqueta" });
      c.state("beto", check.ok ? "aceita" : "etiqueta não confere: descarta", {
        tone: check.ok ? "warn" : "good",
      });
      c.row("modos", 0, ["ECB", "não", "não", "sim"], { dt: 1, mark: "bad" });
      c.row("modos", 1, ["CBC", "sim", "não", "não"], { dt: 1, mark: "warn" });
      c.row("modos", 2, ["GCM", "sim", "sim", "sim"], { dt: 1, mark: "hit" });
    },
  );

  return b.done({
    out: hexOf(out),
    diff,
    ecb: distinct(e),
    cbc: distinct(cb),
    gcmOk: check.ok ? 1 : 0,
    ctr: ctrPlain,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "cifra-simetrica",
    site: "redes",
    title: "Cifra simétrica: AES e modos",
    summary:
      "AES-128 de verdade: dez rodadas, um bit trocado mudando metade da saída, o modo ECB revelando o desenho de uma imagem, o CBC escondendo e o GCM rejeitando um cifrado alterado no caminho.",
    area: "Segurança",
    refs: [
      { book: "tanenbaum-cn", chapter: 8, section: "8.5.2", note: "AES", verified: true },
      { book: "tanenbaum-cn", chapter: 8, section: "8.5.3", note: "Modos de cifra", verified: true },
    ],
    simplifications: [
      "O AES aqui é real, mas não protege nada: não é de tempo constante.",
      "A imagem tem um bloco de 16 bytes por pixel, de uma cor só.",
      "O GCM roda sem dados associados e com IV de 96 bits fixo, só para a demonstração.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [{ key: "bit", kind: "int", label: "Bit trocado na entrada (0 a 127)", min: 0, max: 127 }],
  },
  build,
  intro: {
    text: "Quase todo tráfego cifrado da internet usa AES depois que as partes combinam uma chave. Você vai cifrar com o AES de verdade, ver por que um bit muda tudo e por que o jeito de encadear blocos importa tanto quanto a cifra.",
    facts: [
      ["Cifra", "AES-128"],
      ["Modos", "ECB, CBC, GCM"],
      ["Exemplo", "o da norma FIPS-197"],
    ],
  },
  outro: {
    title: "Cifra simétrica em resumo",
    text: "Uma chave compartilhada cifra e decifra. O AES embaralha blocos de 16 bytes em rodadas, e um bit trocado muda metade da saída. O modo de operação decide o resto: ECB revela repetições, CBC as esconde mas não detecta alterações, e GCM cifra e autentica ao mesmo tempo.",
    facts: (r) => [
      ["Bits mudados", `${r.stats.diff} de 128`],
      ["Cifrados no ECB", String(r.stats.ecb)],
      ["GCM com alteração", r.stats.gcmOk === 1 ? "aceito" : "rejeitado"],
    ],
  },
  next: ["diffie-hellman", "tls13", "wpa"],
};

export default lesson;
