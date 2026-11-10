import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { decrypt, encrypt, factor, keys, toyHash } from "../../../sim/net/rsa.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { rsa as practice } from "../practice.ts";

/**
 * Public-key cryptography with toy primes: building an RSA key pair, encrypting with the public key,
 * decrypting with the private one, signing a digest with the private key and verifying it with the
 * public one, a tampered message caught, and factoring n to show why real keys are huge.
 */
export const DEFAULTS = { primos: "5x11", mensagem: 9 };
const PAIRS: Record<string, [number, number]> = {
  "5x11": [5, 11],
  "7x13": [7, 13],
  "11x17": [11, 17],
  "17x19": [17, 19],
};
const ORDER = "PAGAR 10";
const FORGED = "PAGAR 90";

function clamp(p: Params) {
  const key = String(p.primos ?? DEFAULTS.primos);
  const [pp, qq] = PAIRS[key] ?? PAIRS["5x11"] ?? [5, 11];
  const k = keys(pp, qq);
  const m = Math.min(k.n - 1, Math.max(2, Math.round(Number(p.mensagem ?? DEFAULTS.mensagem))));
  return { k, m };
}

const KEY_ROWS = ["p e q", "n = p × q", "φ = (p − 1)(q − 1)", "e (público)", "d (privado)"];

const scene: SceneSpec = {
  viewBox: [960, 640],
  nodes: [
    { id: "ana", kind: "server", label: "Ana", sub: "dona do par de chaves", at: [130, 100] },
    { id: "bruno", kind: "laptop", label: "Bruno", sub: "só sabe a chave pública", at: [820, 100] },
    { id: "eva", kind: "attacker", label: "Eva", sub: "lê e tenta alterar", at: [475, 220] },
  ],
  links: [
    { id: "l-ab", from: "ana", to: "bruno" },
    { id: "l-e", from: "eva", to: "bruno", style: "dashed" },
  ],
  widgets: [
    {
      kind: "table",
      id: "chaves",
      title: "O par de chaves de Ana",
      at: [40, 300],
      columns: ["Valor", "Conta", "Quem sabe"],
      widths: [170, 150, 140],
      rows: KEY_ROWS.length,
    },
    {
      kind: "table",
      id: "contas",
      title: "Operações",
      at: [520, 300],
      columns: ["Operação", "Conta", "Resultado"],
      widths: [130, 170, 110],
      rows: 5,
    },
    { kind: "counter", id: "fatora", title: "Divisões para fatorar n", at: [40, 520] },
  ],
};

export function build(p: Params) {
  const { k, m } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, { ana: "Ana", bruno: "Bruno", eva: "Eva" }, (t) => String(t));
  const ct = encrypt(m, k.e, k.n);
  const back = decrypt(ct, k.d, k.n);
  const h = toyHash(ORDER, k.n);
  const sig = decrypt(h, k.d, k.n);
  const check = encrypt(sig, k.e, k.n);
  const hForged = toyHash(FORGED, k.n);
  const f = factor(k.n);
  const keyRow = (i: number, conta: string, who: string, mark: "new" | "hit" | "warn") =>
    c.row("chaves", i, [KEY_ROWS[i] ?? "", conta, who], {
      dt: 1,
      mark,
      log: { who: KEY_ROWS[i] ?? "", what: conta, detail: who },
    });
  const op = (i: number, cells: string[], mark: "new" | "hit" | "bad") =>
    c.row("contas", i, cells, {
      dt: 1,
      mark,
      log: { who: cells[0] ?? "", what: cells[2] ?? "", detail: cells[1] ?? "" },
    });

  b.step(
    {
      id: "s1-cadeado",
      title: "Duas chaves diferentes",
      subtitle: "Pública e privada",
      text: `No Diffie-Hellman, os dois lados combinam um segredo. Na [[criptografia-de-chave-publica]], cada pessoa tem um par: a chave pública, que pode ir para qualquer um, e a privada, que nunca sai de casa. O que uma chave faz, só a outra desfaz. Funciona como um cadeado aberto que Ana distribui: qualquer um pode fechar uma caixa com ele, mas só ela tem a chave que abre. O [[rsa]] é o exemplo clássico, e aqui ele roda com números pequenos.`,
      facts: [
        ["Chave pública", "todos podem ter"],
        ["Chave privada", "só Ana"],
        ["Regra", "uma desfaz a outra"],
      ],
      highlight: ["ana", "bruno"],
    },
    () => {
      c.send("ana", "bruno", "chave pública", { role: "a", what: "Ana publica (n, e)" });
      c.state("eva", "copia", { role: "bad", tone: "warn", label: "Eva também vê a chave pública" });
    },
  );

  b.step(
    {
      id: "s2-gerar",
      title: "Montar o par",
      subtitle: `n = ${k.n}, e = ${k.e}, d = ${k.d}`,
      text: `Ana sorteia dois primos, p = ${k.p} e q = ${k.q}, e multiplica: n = ${k.n}. Ela calcula φ = (p − 1)(q − 1) = ${k.phi} e escolhe e = ${k.e}, sem divisor em comum com ${k.phi}. Por fim acha d tal que e × d deixa resto 1 na divisão por φ: ${k.e} × ${k.d} = ${k.e * k.d} = ${Math.floor((k.e * k.d) / k.phi)} × ${k.phi} + 1. A chave pública é o par (n, e) = (${k.n}, ${k.e}); a privada é d = ${k.d}. Os primos p e q são jogados fora, ou guardados com o mesmo cuidado que d.`,
      facts: [
        ["Pública", `(${k.n}, ${k.e})`],
        ["Privada", String(k.d)],
        ["Conferência", `${k.e} × ${k.d} mod ${k.phi} = 1`],
      ],
      highlight: ["ana"],
    },
    () => {
      keyRow(0, `${k.p} e ${k.q}`, "só Ana", "warn");
      keyRow(1, `${k.p} × ${k.q} = ${k.n}`, "todos", "new");
      keyRow(2, `${k.p - 1} × ${k.q - 1} = ${k.phi}`, "só Ana", "warn");
      keyRow(3, String(k.e), "todos", "new");
      keyRow(4, `${k.e} × d ≡ 1 → ${k.d}`, "só Ana", "hit");
    },
  );

  b.step(
    {
      id: "s3-cifrar",
      title: "Bruno fecha o cadeado",
      subtitle: `${m}^${k.e} mod ${k.n} = ${ct}`,
      text: `Bruno quer mandar a Ana o número ${m}, que poderia ser uma chave de sessão. Ele usa a chave pública dela: c = m^e mod n = ${m}^${k.e} mod ${k.n} = ${ct}. Eva vê ${ct} passar e conhece n e e, mas para voltar de ${ct} a ${m} precisaria de d. Repare que nem Bruno consegue desfazer a conta: depois de cifrar, só a dona da chave privada lê.`,
      facts: [
        ["Mensagem", String(m)],
        ["Cifrado", String(ct)],
        ["Usou", `pública (${k.n}, ${k.e})`],
      ],
      highlight: ["bruno", "eva"],
      quiz: {
        kind: "number",
        prompt: `Com a chave pública (n, e) = (${k.n}, ${k.e}), quanto vale ${m} cifrado, ou seja, ${m}^${k.e} mod ${k.n}?`,
        answer: ct,
        explain: `${m}^${k.e} = ${m ** k.e}; o resto da divisão por ${k.n} é ${ct}.`,
      },
    },
    () => {
      c.send("bruno", "ana", `c = ${ct}`, {
        role: "crypto",
        what: `${m} cifrado`,
        detail: `${m}^${k.e} mod ${k.n}`,
      });
      c.state("eva", `vê ${ct}`, { dt: 0, role: "bad", tone: "warn", label: "Eva vê só o cifrado" });
      op(0, ["Cifrar", `${m}^${k.e} mod ${k.n}`, String(ct)], "new");
    },
  );

  b.step(
    {
      id: "s4-decifrar",
      title: "Só Ana abre",
      subtitle: `${ct}^${k.d} mod ${k.n} = ${back}`,
      text: `Ana eleva o cifrado à chave privada: ${ct}^${k.d} mod ${k.n} = ${back}, a mensagem original. Funciona porque e × d deixa resto 1 na divisão por φ, e um teorema de Euler garante que elevar a esse expoente devolve o próprio número. Para achar d, Eva precisaria de φ, e para ter φ precisaria separar ${k.n} em ${k.p} × ${k.q}. Com números deste tamanho, isso leva ${f.tries} ${f.tries === 1 ? "divisão" : "divisões"}.`,
      facts: [
        ["Decifrado", String(back)],
        ["Usou", `privada ${k.d}`],
        ["Eva precisaria de", "fatorar n"],
      ],
      highlight: ["ana"],
    },
    () => {
      op(1, ["Decifrar", `${ct}^${k.d} mod ${k.n}`, String(back)], "hit");
      c.state("ana", `lê ${back}`, { role: "a", tone: "good", label: `Ana recupera ${back}` });
      c.count("fatora", String(f.tries), {
        dt: 0,
        role: "bad",
        label: `${k.n} = ${f.factor} × ${k.n / f.factor}`,
      });
    },
  );

  b.step(
    {
      id: "s5-assinar",
      title: "Assinar ao contrário",
      subtitle: `"${ORDER}" assinado`,
      text: `As chaves também servem no sentido inverso. Ana resume a ordem "${ORDER}" num [[hash]], aqui ${h}, e o eleva à chave privada: a [[assinatura-digital]] é ${h}^${k.d} mod ${k.n} = ${sig}. Bruno, com a chave pública, calcula ${sig}^${k.e} mod ${k.n} = ${check} e confere com o hash da ordem: bate, então só pode ter vindo de Ana. Se Eva trocar o texto para "${FORGED}", o hash vira ${hForged} e a assinatura não confere mais.`,
      facts: [
        ["Hash", String(h)],
        ["Assinatura", String(sig)],
        ["Hash alterado", String(hForged)],
      ],
      highlight: ["ana", "bruno", "eva"],
      quiz: {
        kind: "choice",
        prompt: "Que chave Ana usa para assinar, e que chave Bruno usa para conferir?",
        options: [
          "Ana assina com a privada; Bruno confere com a pública dela",
          "Ana assina com a pública; Bruno confere com a privada dela",
          "Os dois usam a mesma chave secreta",
        ],
        answer: 0,
        explain: `Só Ana tem d = ${k.d}, então só ela produz ${sig}. Qualquer um com (${k.n}, ${k.e}) confere que ${sig}^${k.e} mod ${k.n} = ${check}.`,
      },
    },
    () => {
      c.send("ana", "bruno", `"${ORDER}" + ${sig}`, { role: "crypto", what: "ordem assinada" });
      op(2, ["Assinar", `${h}^${k.d} mod ${k.n}`, String(sig)], "new");
      op(3, ["Conferir", `${sig}^${k.e} mod ${k.n}`, `${check} = ${h} ✓`], "hit");
      c.send("eva", "bruno", `"${FORGED}" + ${sig}`, { role: "bad", what: "Eva troca o texto" });
      op(4, ["Ordem trocada", `hash "${FORGED}"`, `${hForged} ≠ ${check}`], "bad");
    },
  );

  b.step(
    {
      id: "s6-tamanho",
      title: "Por que números enormes",
      subtitle: `${k.n} cai em ${f.tries} ${f.tries === 1 ? "divisão" : "divisões"}`,
      text: `Toda a segurança vem de ninguém conseguir fatorar n. ${k.n} se fatora tentando divisores pequenos; um n de 2048 bits tem mais de 600 dígitos, e nenhum método conhecido o fatora em tempo útil. Mesmo grande, o RSA é lento, então não cifra conversas inteiras: assina, como no [[certificado]] e no CertificateVerify do [[tls]], ou protege uma chave simétrica que faz o resto. Na prática, o hash é um SHA-256, não uma soma de letras.`,
      facts: [
        ["n de verdade", "2048 bits ou mais"],
        ["Uso", "assinar e trocar chaves"],
        ["Hash de verdade", "SHA-256"],
      ],
      highlight: [],
    },
    () => {
      c.note("ana", "segurança = ninguém fatorar n", "info", { dt: 1 });
    },
  );

  return b.done({
    n: k.n,
    e: k.e,
    d: k.d,
    cipher: ct,
    plain: back,
    hash: h,
    signature: sig,
    forged: hForged,
    tries: f.tries,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "rsa",
    site: "redes",
    title: "RSA e assinaturas: a chave que todo mundo pode ter",
    summary:
      "Com primos pequenos: montar o par de chaves, cifrar com a pública, decifrar com a privada, assinar um hash com a privada, conferir com a pública e pegar uma ordem alterada.",
    area: "Segurança",
    refs: [
      { book: "tanenbaum-cn", chapter: 8, section: "8.6.1", note: "RSA", verified: true },
      {
        book: "tanenbaum-cn",
        chapter: 8,
        section: "8.7.2",
        note: "Assinaturas de chave pública",
        verified: true,
      },
      { book: "tanenbaum-cn", chapter: 8, section: "8.7.3", note: "Sumário de mensagens", verified: true },
    ],
    simplifications: [
      "Primos de um ou dois dígitos, para as contas caberem de cabeça.",
      "O hash é a soma dos códigos das letras; os reais, como SHA-256, são feitos para não colidir.",
      "Sem preenchimento (padding): o RSA real sempre embaralha a mensagem antes de cifrar ou assinar.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "primos",
        kind: "choice",
        label: "Primos p × q",
        options: Object.keys(PAIRS).map((x) => ({ value: x, label: x.replace("x", " × ") })),
      },
      { key: "mensagem", kind: "int", label: "Mensagem (número menor que n)", min: 2, max: 322 },
    ],
  },
  build,
  intro: {
    text: "Dá para mandar um segredo a alguém usando uma chave que todo mundo conhece, e provar quem escreveu uma mensagem sem revelar nada. Você vai montar um par de chaves RSA com primos pequenos, cifrar, decifrar, assinar e ver uma ordem adulterada ser recusada.",
    facts: [
      ["Primos", "5 × 11"],
      ["Mensagem", String(DEFAULTS.mensagem)],
      ["Ordem assinada", ORDER],
    ],
  },
  outro: {
    title: "RSA em resumo",
    text: "O par de chaves sai de dois primos: a pública (n, e) cifra e confere assinaturas, a privada d decifra e assina. A segurança depende de não se conseguir fatorar n, por isso as chaves reais têm milhares de bits. Na prática, o RSA assina hashes e protege chaves de sessão, enquanto cifras simétricas carregam os dados.",
    facts: (run) => [
      ["Chave pública", `(${run.stats.n}, ${run.stats.e})`],
      ["Cifrado", String(run.stats.cipher)],
      ["Assinatura", String(run.stats.signature)],
    ],
  },
  next: ["diffie-hellman", "tls13"],
  practice,
};

export default lesson;
