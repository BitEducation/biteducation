import type { LessonModule, Params } from "../../../contracts/types.ts";
import { type DnsMsg, dns, type QType } from "../../../sim/net/dns.ts";
import { dnskey, ds, rrsig } from "../../../sim/net/dnssec.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { prng, randInt } from "../../../sim/shared/prng.ts";
import { seqScene, talk } from "../../../sim/shared/seq.ts";
import { AUTH_NS, DAVI, LIA, MALU, RESOLVER, ROOT_NS, TLD_NS } from "../plan.ts";
import { udpFrame } from "../wire.ts";

/**
 * DNSSEC validation: A + RRSIG, the zone's DNSKEYs, the DS in the parent zone, up to the root's
 * trust anchor; then a forged answer that fails validation and becomes SERVFAIL.
 */
const SEED = 4034;
const NAME = DAVI.host;
export const DEFAULTS = { forjar: true };

const scene = seqScene(
  [
    { id: "lia", kind: "laptop", label: "Lia", sub: LIA.ip, at: [110, 250] },
    { id: "res", kind: "dns", label: "Resolvedor validador", sub: RESOLVER.ip, at: [390, 250] },
    { id: "root", kind: "dns", label: "Raiz", sub: ROOT_NS.ip, at: [780, 80] },
    { id: "tld", kind: "dns", label: "Servidor .example", sub: TLD_NS.ip, at: [780, 250] },
    { id: "auth", kind: "dns", label: "campus.example", sub: AUTH_NS.ip, at: [780, 420] },
    { id: "malu", kind: "attacker", label: "Malu", sub: MALU.wanIp, at: [390, 470] },
  ],
  {
    height: 660,
    links: [
      { id: "l1", from: "lia", to: "res", style: "bus" },
      { id: "l2", from: "res", to: "root", style: "dashed" },
      { id: "l3", from: "res", to: "tld", style: "dashed" },
      { id: "l4", from: "res", to: "auth", style: "dashed" },
      { id: "l5", from: "malu", to: "res", style: "dashed" },
    ],
    widgets: [
      {
        kind: "table",
        id: "chain",
        title: "Cadeia de confiança",
        at: [40, 540],
        columns: ["Zona", "O que foi conferido", "Resultado"],
        widths: [150, 380, 120],
        rows: 3,
      },
    ],
  },
);

export function build(p: Params) {
  const forjar = p.forjar !== false;
  const b = lessonBuilder();
  const c = talk(b, {
    lia: "Lia",
    res: "Resolvedor",
    root: "Raiz",
    tld: ".example",
    auth: "campus.example",
    malu: "Malu",
  });
  const rand = prng(SEED);
  const tag = () => randInt(rand, 1000, 65000);
  const k = { campusZ: tag(), campusK: tag(), exZ: tag(), exK: tag(), rootZ: tag(), rootK: tag() };
  let id = randInt(rand, 1, 0xffff);
  const port = randInt(rand, 49152, 65535);
  let fn = 0;
  const ask = (
    to: "root" | "tld" | "auth",
    ip: string,
    qname: string,
    qtype: QType,
    ans: DnsMsg["answers"],
    label: string,
    detail: string,
  ) => {
    id = (id + 1) & 0xffff;
    const q = { name: qname, type: qtype };
    fn++;
    c.send("res", to, `${qtype}?`, {
      dt: 10,
      role: "b",
      frame: udpFrame(
        { src: RESOLVER.ip, dst: ip, sport: port, dport: 53 },
        dns({ id, response: false, question: q, edns: { size: 1232, dnssecOk: true } }),
        { id: `f-q${fn}`, title: `Pergunta ${qname} ${qtype}`, summary: "Com DO=1: quero as assinaturas." },
      ),
    });
    c.send(to, "res", label, {
      dt: 10,
      role: "s4",
      frame: udpFrame(
        { src: ip, dst: RESOLVER.ip, sport: 53, dport: port },
        dns({
          id,
          response: true,
          aa: true,
          question: q,
          ...(ans ? { answers: ans } : {}),
          edns: { size: 1232, dnssecOk: true },
        }),
        { id: `f-r${fn}`, title: `Resposta ${qname} ${qtype}`, summary: detail },
      ),
      detail,
    });
  };

  b.step(
    {
      id: "s1-assinatura",
      title: "Resposta com assinatura",
      subtitle: "O registro A e o seu RRSIG",
      text: `O resolvedor do campus valida [[dnssec]]. Ao perguntar o endereço de \`${NAME}\`, ele liga o bit **DO** ("quero as assinaturas"). O autoritativo devolve o registro A e, junto, um **RRSIG**: uma assinatura ECDSA sobre esse registro, feita com a chave ${k.campusZ} da zona. Abra o inspetor (I): a assinatura tem validade e diz qual chave a fez.`,
      facts: [
        ["Registro", `${NAME} A ${DAVI.ip}`],
        ["Assinado pela chave", String(k.campusZ)],
        ["Algoritmo", "13 (ECDSA P-256)"],
      ],
      highlight: ["auth"],
    },
    () => {
      c.send("lia", "res", "A?", { dt: 1, detail: NAME });
      ask(
        "auth",
        AUTH_NS.ip,
        NAME,
        "A",
        [
          { name: NAME, type: "A", ttl: 300, data: DAVI.ip },
          rrsig(NAME, "A", 300, "campus.example", k.campusZ),
        ],
        "A + RRSIG",
        "Registro e assinatura.",
      );
    },
  );

  b.step(
    {
      id: "s2-chaves",
      title: "As chaves da zona",
      subtitle: "DNSKEY: ZSK e KSK",
      text: `Para conferir a assinatura, o resolvedor precisa da chave pública: pede o **DNSKEY** de \`campus.example\`. Vêm duas: a ZSK (${k.campusZ}), que assina os registros, e a KSK (${k.campusK}), que assina o conjunto de chaves. Com a ZSK, o RRSIG do registro A confere. Mas por que confiar nessas chaves? Quem as mandou foi o mesmo servidor.`,
      facts: [
        ["ZSK", String(k.campusZ)],
        ["KSK", String(k.campusK)],
        ["RRSIG do A", "confere com a ZSK"],
      ],
      highlight: ["auth", "res"],
    },
    () => {
      ask(
        "auth",
        AUTH_NS.ip,
        "campus.example",
        "DNSKEY",
        [
          dnskey("campus.example", false, k.campusZ),
          dnskey("campus.example", true, k.campusK),
          rrsig("campus.example", "DNSKEY", 3600, "campus.example", k.campusK),
        ],
        "DNSKEY + RRSIG",
        "As chaves, assinadas pela KSK.",
      );
      c.row(
        "chain",
        0,
        ["campus.example", `RRSIG(A) com ZSK ${k.campusZ}; DNSKEY com KSK ${k.campusK}`, "ok"],
        { mark: "hit", label: "Zona campus.example confere" },
      );
    },
  );

  b.step(
    {
      id: "s3-ds",
      title: "O elo com o pai",
      subtitle: "O registro DS no .example",
      text: `A resposta vem da zona de cima. O servidor de \`.example\` guarda um registro **DS** para \`campus.example\`: o resumo SHA-256 da KSK ${k.campusK}. O DS é assinado pela chave de \`.example\`. O resolvedor calcula o resumo da KSK que recebeu e compara: se baterem, a confiança em \`.example\` passa para \`campus.example\`.`,
      facts: [
        ["DS", `SHA-256 da KSK ${k.campusK}`],
        ["Assinado por", `.example (ZSK ${k.exZ})`],
      ],
      highlight: ["tld"],
    },
    () => {
      ask(
        "tld",
        TLD_NS.ip,
        "campus.example",
        "DS",
        [ds("campus.example", k.campusK), rrsig("campus.example", "DS", 86400, "example", k.exZ)],
        "DS + RRSIG",
        "O elo da cadeia.",
      );
      ask(
        "tld",
        TLD_NS.ip,
        "example",
        "DNSKEY",
        [
          dnskey("example", false, k.exZ),
          dnskey("example", true, k.exK),
          rrsig("example", "DNSKEY", 3600, "example", k.exK),
        ],
        "DNSKEY + RRSIG",
        "As chaves de .example.",
      );
      c.row("chain", 1, [".example", `DS de campus.example; DNSKEY com KSK ${k.exK}`, "ok"], {
        mark: "hit",
        label: "Zona .example confere",
      });
    },
  );

  b.step(
    {
      id: "s4-raiz",
      title: "Até a raiz",
      subtitle: "A âncora de confiança",
      text: `O mesmo se repete um nível acima: a raiz tem o DS de \`.example\`, assinado pela chave da raiz. E a chave da raiz? Ela não é perguntada a ninguém: vem configurada no resolvedor, como a lista de certificados raiz de um navegador. É a **âncora de confiança**. Do topo ao registro A, cada elo foi conferido.`,
      facts: [
        ["DS de .example", `na raiz, chave ${k.rootZ}`],
        ["Âncora", `KSK da raiz (${k.rootK}), configurada`],
      ],
      highlight: ["root"],
      quiz: {
        kind: "choice",
        prompt: "Onde começa a confiança do resolvedor na cadeia DNSSEC?",
        options: [
          "No registro A da biblioteca",
          "Na chave da raiz, configurada no próprio resolvedor",
          "No servidor de .example",
          "No primeiro servidor que responder",
        ],
        answer: 1,
        explain:
          "A chave da raiz é a **âncora de confiança**: vem instalada no resolvedor. Cada zona prova as suas chaves pelo DS assinado na zona de cima, até chegar a essa âncora.",
      },
    },
    () => {
      ask(
        "root",
        ROOT_NS.ip,
        "example",
        "DS",
        [ds("example", k.exK), rrsig("example", "DS", 86400, ".", k.rootZ)],
        "DS + RRSIG",
        "DS de .example na raiz.",
      );
      c.row("chain", 2, ["raiz", `DS de .example; chave da raiz = âncora ${k.rootK}`, "ok"], {
        mark: "hit",
        label: "Raiz: âncora de confiança",
      });
    },
  );

  b.step(
    {
      id: "s5-ad",
      title: "Resposta validada",
      subtitle: "A flag AD",
      text: `Com a cadeia inteira conferida, o resolvedor responde à Lia com a flag **AD** (dados autenticados). Todas essas consultas extras só acontecem na primeira vez: as chaves e os DS ficam em cache como qualquer outro registro. Repare no que o DNSSEC **não** faz: a resposta continua em claro, e quem observa a rede ainda vê o nome consultado.`,
      facts: [
        ["Flag", "AD = 1"],
        ["Cifra", "nenhuma"],
        ["Protege contra", "respostas forjadas"],
      ],
      highlight: ["res", "lia"],
    },
    () => {
      fn++;
      c.send("res", "lia", `A ${DAVI.ip} (AD)`, {
        dt: 1,
        role: "s4",
        frame: udpFrame(
          { src: RESOLVER.ip, dst: LIA.ip, sport: 53, dport: 51500 },
          dns({
            id: 0x2a2a,
            response: true,
            rd: true,
            ra: true,
            ad: true,
            question: { name: NAME, type: "A" },
            answers: [{ name: NAME, type: "A", ttl: 300, data: DAVI.ip }],
          }),
          { id: "f-ad", title: "Resposta validada", summary: "AD=1." },
        ),
        detail: "AD=1",
      });
    },
  );

  if (forjar)
    b.step(
      {
        id: "s6-forjado",
        quiz: {
          kind: "choice",
          prompt:
            "A Malu acertou porta e identificador da consulta. O resolvedor que valida DNSSEC aceita a resposta dela?",
          options: [
            "Não: sem um RRSIG válido, a resposta é descartada",
            "Sim, porque acertar os números era o que bastava",
            "Sim, mas só para a Lia, sem guardar em cache",
          ],
          answer: 0,
          explain:
            "Acertar porta e identificador basta contra um resolvedor que não valida. Com DNSSEC, a resposta precisa de uma assinatura feita com a chave privada da zona, que a Malu não tem.",
        },
        title: "Uma resposta forjada",
        subtitle: "A assinatura não confere",
        text: `Mais tarde, a Malu tenta [[envenenamento-de-cache|envenenar o cache]]: corre para entregar ao resolvedor uma resposta dizendo que \`${NAME}\` está em ${MALU.wanIp}, e acerta porta e identificador. Sem a chave privada da zona, ela não consegue gerar um RRSIG válido. O resolvedor descarta a resposta e, se não houver outra, devolve **SERVFAIL** em vez de um endereço falso.`,
        facts: [
          ["Endereço forjado", MALU.wanIp],
          ["RRSIG", "inválido"],
          ["Resposta à Lia", "SERVFAIL"],
        ],
        highlight: ["malu", "res"],
        tags: ["signals"],
      },
      () => {
        c.at(c.t + 600000);
        c.send("malu", "res", `A ${MALU.wanIp}`, {
          dt: 5,
          role: "bad",
          frame: udpFrame(
            { src: AUTH_NS.ip, dst: RESOLVER.ip, sport: 53, dport: port },
            dns({
              id,
              response: true,
              aa: true,
              question: { name: NAME, type: "A" },
              answers: [
                { name: NAME, type: "A", ttl: 86400, data: MALU.wanIp, note: "Falso" },
                rrsig(NAME, "A", 86400, "campus.example", k.campusZ),
              ],
            }),
            {
              id: "f-forged",
              title: "Resposta forjada",
              summary: "Origem falsificada, assinatura inválida.",
            },
          ),
          detail: "origem forjada",
        });
        c.state("res", "RRSIG inválido: descarta", { dt: 0, tone: "bad", role: "bad" });
        c.send("res", "lia", "SERVFAIL", { dt: 1, role: "warn", detail: "sem endereço falso" });
      },
    );

  return b.done({ ...k, forjar: forjar ? 1 : 0 });
}

const lesson: LessonModule = {
  meta: {
    slug: "dnssec",
    site: "redes",
    title: "DNSSEC: respostas assinadas",
    summary:
      "RRSIG, DNSKEY e DS formando uma cadeia de confiança até a raiz, e a resposta forjada que vira SERVFAIL.",
    area: "Segurança",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 8,
        section: "8.12.2",
        note: "Nomenclatura segura e DNSSEC",
        verified: true,
      },
      { rfc: 4033, note: "Introdução ao DNSSEC" },
      { rfc: 4034, note: "Registros DNSKEY, RRSIG e DS" },
      { rfc: 4035, note: "Validação" },
    ],
    simplifications: [
      "Chaves, resumos e assinaturas aparecem como bytes desconhecidos do tamanho certo.",
      "O resolvedor já conhece a hierarquia (a lição de DNS mostra as indicações).",
      "Sem NSEC/NSEC3, que provam que um nome não existe.",
      "A Malu acerta porta e identificador na primeira tentativa, para encurtar a sequência.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [{ key: "forjar", kind: "bool", label: "Mostrar a resposta forjada da Malu" }],
  },
  build,
  intro: {
    text: "No DNS comum, o resolvedor aceita a primeira resposta que parecer certa, e quem forjar uma desvia todo mundo. O DNSSEC acrescenta assinaturas digitais aos registros e uma cadeia de confiança que sobe até a raiz. Você vai acompanhar o resolvedor do campus conferindo cada elo.",
    facts: [
      ["Nome", NAME],
      ["Resolvedor", "valida DNSSEC"],
      ["Algoritmo", "ECDSA P-256"],
    ],
  },
  outro: {
    title: "DNSSEC em resumo",
    text: "Cada zona assina os seus registros (RRSIG) e publica as chaves (DNSKEY); a zona de cima publica o resumo dessas chaves (DS), até a raiz, cuja chave vem configurada. Uma resposta sem assinatura válida é recusada.",
    facts: (run) => [
      ["ZSK de campus.example", String(run.stats.campusZ)],
      ["KSK de campus.example", String(run.stats.campusK)],
    ],
  },
  next: ["doh", "dns"],
};

export default lesson;
