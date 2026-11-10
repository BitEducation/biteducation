import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { discreteLog, G, P, powers, share, shared } from "../../../sim/net/dh.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { diffieHellman as practice } from "../practice.ts";

/**
 * Agreeing on a key in public: p and g are known, each side keeps an exponent, the exchanged shares
 * give the same key on both ends, the eavesdropper faces a discrete log (trivial at p = 23,
 * hopeless at 2048 bits), and an active middle shows why the shares must be authenticated.
 */
export const DEFAULTS = { a: 6, b: 15 };
/** The middle's own exponent in the last step. */
const EVA = 3;

function clamp(p: Params) {
  const pick = (v: unknown, d: number) => Math.min(P - 2, Math.max(2, Math.round(Number(v ?? d))));
  return { a: pick(p.a, DEFAULTS.a), b: pick(p.b, DEFAULTS.b) };
}

const ROWS = [
  "p (primo)",
  "g (gerador)",
  "a (segredo de Ana)",
  "b (segredo de Bruno)",
  "A = gᵃ mod p",
  "B = gᵇ mod p",
  "chave",
];

const scene: SceneSpec = {
  viewBox: [960, 680],
  nodes: [
    { id: "ana", kind: "laptop", label: "Ana", sub: "cliente", at: [130, 110] },
    { id: "bruno", kind: "server", label: "Bruno", sub: "servidor", at: [820, 110] },
    { id: "eva", kind: "attacker", label: "Eva", sub: "no caminho", at: [475, 230] },
  ],
  links: [
    { id: "l-ab", from: "ana", to: "bruno" },
    { id: "l-ea", from: "eva", to: "ana", style: "dashed" },
    { id: "l-eb", from: "eva", to: "bruno", style: "dashed" },
  ],
  widgets: [
    {
      kind: "table",
      id: "quem",
      title: "Quem conhece cada valor",
      at: [40, 320],
      columns: ["Valor", "Ana", "Bruno", "Eva"],
      widths: [210, 100, 100, 100],
      rows: ROWS.length,
    },
    { kind: "counter", id: "kAna", title: "Chave de Ana", at: [620, 320] },
    { kind: "counter", id: "kBruno", title: "Chave de Bruno", at: [800, 320] },
    { kind: "counter", id: "tentativas", title: "Tentativas de Eva", at: [620, 420] },
    {
      kind: "grid",
      id: "potencias",
      title: `Potências de ${G} mod ${P}: g¹, g², ..., g²²`,
      at: [40, 590],
      cols: P - 1,
      rows: 1,
      cellW: 38,
      indexLabel: "none",
    },
  ],
};

export function build(p: Params) {
  const { a, b } = clamp(p);
  const bl = lessonBuilder();
  const c = talk(bl, { ana: "Ana", bruno: "Bruno", eva: "Eva" }, (t) => String(t));
  const A = share(a);
  const B = share(b);
  const kA = shared(B, a);
  const kB = shared(A, b);
  const dlog = discreteLog(A);
  const pw = powers();
  const E = share(EVA);
  const kAE = shared(E, a);
  const kBE = shared(E, b);
  const row = (i: number, cells: string[], mark?: "new" | "hit" | "bad" | "warn") =>
    c.row("quem", i, [ROWS[i] ?? "", ...cells], {
      dt: 1,
      ...(mark ? { mark } : {}),
      log: { who: ROWS[i] ?? "", what: cells.join(" · ") },
    });

  bl.step(
    {
      id: "s1-problema",
      title: "Combinar um segredo em público",
      subtitle: "Eva escuta tudo",
      text: `Ana e Bruno querem cifrar a conversa, e para isso precisam da mesma chave. Só que nunca se encontraram, e tudo que trocam passa por uma rede onde Eva lê cada pacote. Mandar a chave seria entregá-la a Eva. O acordo de [[diffie-hellman]] resolve isso: os dois trocam números em aberto e, no fim, cada um calcula a mesma chave, que nunca passou pela rede. Aqui com números pequenos, para dar para conferir à mão.`,
      facts: [
        ["Canal", "aberto, Eva lê tudo"],
        ["Objetivo", "a mesma chave nos dois lados"],
        ["Chave na rede", "nunca"],
      ],
      highlight: ["eva"],
    },
    () => {
      c.send("ana", "bruno", "olá", { what: "mensagem em claro" });
      c.state("eva", "lê", { role: "bad", tone: "bad", label: "Eva copia tudo que passa" });
    },
  );

  bl.step(
    {
      id: "s2-publico",
      title: "Os números públicos",
      subtitle: `p = ${P}, g = ${G}`,
      text: `Primeiro, os dois combinam um primo p = ${P} e um gerador g = ${G}, sem segredo nenhum: Eva também os conhece. Gerador quer dizer que as potências de ${G}, sempre tomando o resto da divisão por ${P}, passam por todos os valores de 1 a ${P - 1} antes de repetir, como na linha de baixo. Cada um sorteia em segredo um expoente: Ana fica com a = ${a}, Bruno com b = ${b}. Esses dois nunca saem de casa.`,
      facts: [
        ["Público", `p = ${P}, g = ${G}`],
        ["Segredo de Ana", `a = ${a}`],
        ["Segredo de Bruno", `b = ${b}`],
      ],
      highlight: ["ana", "bruno"],
    },
    () => {
      row(0, [String(P), String(P), String(P)], "new");
      row(1, [String(G), String(G), String(G)], "new");
      row(2, [String(a), "?", "?"], "hit");
      row(3, ["?", String(b), "?"], "hit");
      pw.forEach((v, i) => {
        c.cell("potencias", i, String(v), {
          dt: i === 0 ? 1 : 0,
          role: "muted",
          label: `${G}^${i + 1} mod ${P} = ${v}`,
        });
      });
    },
  );

  bl.step(
    {
      id: "s3-meias",
      title: "Trocar as metades",
      subtitle: `A = ${A}, B = ${B}`,
      text: `Ana calcula A = ${G}^${a} mod ${P} = ${A} e manda para Bruno. Bruno calcula B = ${G}^${b} mod ${P} = ${B} e manda para Ana. Os dois números passam pela rede, e Eva os copia. A conta é rápida para quem tem o expoente, porque dá para elevar ao quadrado repetidas vezes e tirar o resto a cada passo. O caminho contrário, de ${A} de volta ao ${a}, é que é difícil, como o próximo passo mostra.`,
      facts: [
        ["A", `${G}^${a} mod ${P} = ${A}`],
        ["B", `${G}^${b} mod ${P} = ${B}`],
        ["Eva viu", `${A} e ${B}`],
      ],
      highlight: ["ana", "bruno", "eva"],
      quiz: {
        kind: "number",
        prompt: `Com p = ${P}, g = ${G} e segredo a = ${a}, que valor Ana manda, A = gᵃ mod p?`,
        answer: A,
        explain: `${G}^${a} = ${G ** a}, e o resto da divisão por ${P} é ${A}. Na linha de potências, é a ${a}ª célula.`,
      },
    },
    () => {
      c.send("ana", "bruno", `A = ${A}`, { role: "a", what: `A = ${A}`, detail: "em aberto" });
      c.send("bruno", "ana", `B = ${B}`, { role: "b", what: `B = ${B}`, detail: "em aberto" });
      row(4, [String(A), String(A), String(A)], "warn");
      row(5, [String(B), String(B), String(B)], "warn");
      c.cell("potencias", a - 1, String(A), {
        dt: 0,
        mark: "new",
        role: "a",
        label: `${G}^${a} = ${A}: o A de Ana`,
      });
      c.cell("potencias", b - 1, String(B), {
        dt: 0,
        mark: "new",
        role: "b",
        label: `${G}^${b} = ${B}: o B de Bruno`,
      });
    },
  );

  bl.step(
    {
      id: "s4-chave",
      title: "A mesma chave nos dois",
      subtitle: `${kA} = ${kB}`,
      text: `Ana eleva o B que recebeu ao seu segredo: ${B}^${a} mod ${P} = ${kA}. Bruno faz o mesmo com A: ${A}^${b} mod ${P} = ${kB}. Os dois chegam a ${kA} porque ambos calcularam g elevado a a × b = ${a * b}, só que em ordens diferentes. Eva tem A e B, mas para chegar a esse número precisaria de a ou de b. A chave combinada vira a semente das chaves da cifra simétrica que protege o resto da conversa.`,
      facts: [
        ["Ana", `${B}^${a} mod ${P} = ${kA}`],
        ["Bruno", `${A}^${b} mod ${P} = ${kB}`],
        ["Expoente comum", `a × b = ${a * b}`],
      ],
      highlight: ["ana", "bruno"],
      quiz: {
        kind: "number",
        prompt: `Ana recebeu B = ${B} e tem a = ${a}. Qual é a chave, Bᵃ mod ${P}?`,
        answer: kA,
        explain: `${B}^${a} mod ${P} = ${kA}; Bruno confere com ${A}^${b} mod ${P} = ${kB}. Ambos valem ${G}^${a * b} mod ${P}.`,
      },
    },
    () => {
      row(6, [String(kA), String(kB), "?"], "hit");
      c.count("kAna", String(kA), { dt: 0, role: "a", label: `Ana: ${kA}` });
      c.count("kBruno", String(kB), { dt: 0, role: "b", label: `Bruno: ${kB}` });
    },
  );

  bl.step(
    {
      id: "s5-logaritmo",
      title: "O trabalho de Eva",
      subtitle: `${dlog.tries} tentativas aqui`,
      text: `Para achar a, Eva precisa descobrir qual potência de ${G} dá ${A}: é o [[logaritmo-discreto]]. Com p = ${P}, basta testar ${G}¹, ${G}², ... e na tentativa ${dlog.tries} ela acha a = ${dlog.x}. Por isso o p de verdade tem 2048 bits ou mais, e o número de expoentes possíveis passa de 10⁶⁰⁰. Os melhores algoritmos conhecidos são bem mais espertos que testar um por um, mas ainda assim inviáveis nesse tamanho.`,
      facts: [
        ["Tentativas com p = 23", String(dlog.tries)],
        ["p real", "2048 bits ou mais"],
        ["Alternativa atual", "curvas elípticas, X25519"],
      ],
      highlight: ["eva"],
    },
    () => {
      for (let x = 1; x <= dlog.tries; x++)
        c.cell("potencias", x - 1, String(pw[x - 1]), {
          dt: 1,
          mark: x === dlog.tries ? "hit" : "miss",
          role: x === dlog.tries ? "bad" : "muted",
          label: `Eva testa ${G}^${x} = ${pw[x - 1]}`,
        });
      c.count("tentativas", String(dlog.tries), { dt: 0, role: "bad", label: `${dlog.tries} tentativas` });
    },
  );

  bl.step(
    {
      id: "s6-meio",
      title: "Se Eva não só escutar",
      subtitle: kAE === kBE ? "Eva no meio" : `Duas chaves: ${kAE} e ${kBE}`,
      text: `O acordo sozinho não diz com quem se está falando. Se Eva intercepta e troca os números, mandando o seu ${E} para os dois, ela faz um acordo com Ana, chave ${kAE}, e outro com Bruno, chave ${kBE}, e repassa tudo decifrando no meio. ${kAE !== kBE ? "O sinal é que as chaves de Ana e Bruno diferem, e qualquer comparação de impressão digital falha." : "Aqui as duas até coincidem, mas Eva conhece ambas, e conferir a identidade de quem mandou a metade revela a troca."} A defesa é assinar a metade enviada: no [[tls]], o servidor assina com a chave do seu [[certificado]].`,
      facts: [
        ["Ana com Eva", String(kAE)],
        ["Bruno com Eva", String(kBE)],
        ["Defesa", "assinar a metade"],
      ],
      highlight: ["eva"],
      tags: ["signals", "defense"],
    },
    () => {
      c.send("ana", "eva", `A = ${A}`, { role: "a", what: "Eva segura o A" });
      c.send("eva", "bruno", `E = ${E}`, { role: "bad", what: "Eva manda o seu" });
      c.send("eva", "ana", `E = ${E}`, { dt: 0, role: "bad", what: "e para Ana também" });
      c.count("kAna", String(kAE), { role: "bad", label: `Ana agora tem ${kAE}` });
      c.count("kBruno", String(kBE), { dt: 0, role: "bad", label: `Bruno agora tem ${kBE}` });
      c.note("quem", "Assinar a metade impede a troca", "good", { dt: 1 });
    },
  );

  return bl.done({
    A,
    B,
    key: kA,
    sameKey: kA === kB ? "sim" : "não",
    tries: dlog.tries,
    middle: `${kAE}/${kBE}`,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "diffie-hellman",
    site: "redes",
    title: "Diffie-Hellman: uma chave combinada em público",
    summary:
      "Com números pequenos: o primo e o gerador públicos, os expoentes secretos, as metades trocadas, a mesma chave dos dois lados, o logaritmo discreto que protege tudo e por que as metades precisam de assinatura.",
    area: "Segurança",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 8,
        section: "8.9.2",
        note: "A troca de chaves de Diffie-Hellman",
        verified: true,
      },
      { rfc: 7748, note: "Curvas elípticas X25519 e X448" },
    ],
    simplifications: [
      `p = ${P} e g = ${G} cabem em contas de cabeça; na prática p tem milhares de bits ou se usam curvas elípticas.`,
      "A chave combinada é usada direto; protocolos reais a passam por uma função de derivação.",
      "Eva ataca com força bruta; os algoritmos reais de logaritmo discreto são mais rápidos, mas não o bastante.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "a", kind: "int", label: "Segredo de Ana (a)", min: 2, max: P - 2 },
      { key: "b", kind: "int", label: "Segredo de Bruno (b)", min: 2, max: P - 2 },
    ],
  },
  build,
  intro: {
    text: "Duas pessoas que nunca se viram precisam combinar uma chave secreta falando por uma rede que qualquer um escuta. Você vai fazer o acordo de Diffie-Hellman com números pequenos, conferir que os dois chegam à mesma chave e ver o que impede, e o que não impede, quem está no caminho.",
    facts: [
      ["Primo", String(P)],
      ["Gerador", String(G)],
      ["Segredos", `a = ${DEFAULTS.a}, b = ${DEFAULTS.b}`],
    ],
  },
  outro: {
    title: "Diffie-Hellman em resumo",
    text: "Com p e g públicos, cada lado guarda um expoente e manda g elevado a ele; elevando a metade recebida ao próprio segredo, os dois chegam a g elevado ao produto. Quem só escuta precisaria resolver um logaritmo discreto, inviável com números grandes. Quem fica no meio pode fazer dois acordos, por isso a metade enviada precisa ser assinada, como no TLS.",
    facts: (run) => [
      ["A e B", `${run.stats.A} e ${run.stats.B}`],
      ["Chave", String(run.stats.key)],
      ["Tentativas de Eva", String(run.stats.tries)],
    ],
  },
  next: ["tls13", "ssh", "wireguard"],
  practice,
};

export default lesson;
