import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { bodyHash, dkim, dmarc, mails, type Policy, SPF, spf } from "../../../sim/net/mailauth.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Who really sent this e-mail: SMTP accepts any From, SPF authorizes IPs for the envelope domain
 * (which an attacker controls), DKIM signs the body, DMARC ties both to the visible From and says
 * what to do on failure. Mailing lists break SPF and sometimes DKIM. Ends with signals and defenses.
 */
export const DEFAULTS = { politica: "reject", rodape: "sim" };

function clamp(p: Params): { policy: Policy; footer: boolean } {
  const policy: Policy = p.politica === "none" || p.politica === "quarantine" ? p.politica : "reject";
  return { policy, footer: p.rodape !== "nao" };
}

const scene: SceneSpec = {
  viewBox: [960, 600],
  nodes: [
    { id: "banco", kind: "server", label: "mail.banco.example", sub: "192.0.2.10", at: [130, 70], w: 220 },
    {
      id: "golpe",
      kind: "attacker",
      label: "servidor do golpe",
      sub: "203.0.113.66",
      at: [130, 190],
      w: 220,
    },
    { id: "lista", kind: "server", label: "lista de discussão", sub: "198.51.100.5", at: [130, 310], w: 220 },
    {
      id: "rx",
      kind: "server",
      label: "Servidor de quem recebe",
      sub: "confere antes de entregar",
      at: [560, 190],
      w: 250,
    },
    { id: "dns", kind: "dns", label: "DNS de banco.example", sub: "SPF, DKIM, DMARC", at: [850, 70], w: 200 },
  ],
  links: [
    { id: "l-b", from: "banco", to: "rx" },
    { id: "l-g", from: "golpe", to: "rx" },
    { id: "l-l", from: "lista", to: "rx" },
    { id: "l-d", from: "rx", to: "dns", style: "dashed" },
  ],
  widgets: [
    {
      kind: "table",
      id: "msgs",
      title: 'Três mensagens com "From: banco.example"',
      at: [40, 390],
      columns: ["Mensagem", "SPF", "DKIM", "Alinhado ao From", "DMARC", "Ação"],
      widths: [250, 90, 90, 170, 100, 130],
      rows: 3,
    },
  ],
};

export function build(p: Params) {
  const { policy, footer } = clamp(p);
  const ms = mails(footer);
  const [m1, m2, m3] = ms as [(typeof ms)[0], (typeof ms)[0], (typeof ms)[0]];
  const r = ms.map((m) => dmarc(m, policy));
  const [r1, r2, r3] = r as [(typeof r)[0], (typeof r)[0], (typeof r)[0]];
  const b = lessonBuilder();
  const c = talk(
    b,
    { banco: "banco", golpe: "golpe", lista: "lista", rx: "receptor", dns: "DNS" },
    (t) => `t${t}`,
  );
  const aligned = (x: (typeof r)[0]) =>
    [x.spfAligned ? "SPF" : "", x.dkimAligned ? "DKIM" : ""].filter(Boolean).join(" e ") || "nenhum";
  const row = (i: number, cols: string[], mark: "new" | "hit" | "bad" | "warn") =>
    c.row("msgs", i, cols, { dt: 1, mark });
  const POL: Record<Policy, string> = {
    none: "só observar (none)",
    quarantine: "quarentena",
    reject: "rejeitar (reject)",
  };

  b.step(
    {
      id: "s1-smtp",
      title: "Qualquer um escreve From",
      subtitle: "O SMTP não confere",
      text: `O SMTP foi feito para uma rede de confiança e aceita qualquer remetente. Há dois: o do envelope, informado na conversa entre servidores, e o From do cabeçalho, que é o que o leitor vê. O servidor do golpe usa o envelope ${m2.mailFrom}, que é dele, e escreve From: ${m2.from} no cabeçalho. Sem mais nada, a mensagem chega como se fosse do banco.`,
      facts: [
        ["Envelope", m2.mailFrom],
        ["From visível", m2.from],
        ["SMTP confere?", "não"],
      ],
      highlight: ["golpe", "rx"],
    },
    () => {
      c.send("golpe", "rx", `From: ${m2.from}`, { what: "SMTP", detail: `envelope ${m2.mailFrom}` });
      c.state("rx", "aceita: nada conferido", { tone: "warn" });
    },
  );

  b.step(
    {
      id: "s2-spf",
      title: "SPF: quem pode enviar",
      subtitle: "Por domínio do envelope",
      text: `Com [[spf|SPF]], o dono do domínio publica no DNS os endereços autorizados a enviar por ele; banco.example autoriza ${SPF["banco.example"]?.[0]}0/24. O receptor olha o IP da conexão e o domínio do envelope. A fatura passa. Mas a falsa também passa: o envelope dela é ${m2.mailFrom}, cujo SPF autoriza o próprio servidor do golpe. O SPF nunca olhou o From que o leitor vê.`,
      facts: [
        ["Fatura", spf(m1)],
        ["Falsa", spf(m2)],
        ["SPF olha", "o envelope"],
      ],
      highlight: ["dns", "rx"],
      quiz: {
        kind: "choice",
        prompt: "A mensagem falsa passou no SPF. Isso prova que ela veio do banco?",
        options: [
          "Não: o SPF conferiu o domínio do envelope, que é do próprio golpista",
          "Sim: passar no SPF garante o remetente",
          "Sim, porque o IP está numa faixa de documentação",
        ],
        answer: 0,
        explain:
          "O SPF diz só que aquele IP pode enviar pelo domínio do envelope. Sem comparar esse domínio com o From visível, um golpista passa usando um domínio dele.",
      },
    },
    () => {
      c.send("rx", "dns", "SPF de banco.example?", { what: "consulta", detail: "TXT" });
      c.send("dns", "rx", "v=spf1 ip4:192.0.2.0/24 -all", { role: "b", what: "resposta" });
      row(0, [m1.label, spf(m1), "—", "—", "—", "—"], "new");
      row(1, [m2.label, spf(m2), "—", "—", "—", "—"], "warn");
    },
  );

  b.step(
    {
      id: "s3-dkim",
      title: "DKIM: o banco assina",
      subtitle: `bh=${bodyHash(m1.body)}…`,
      text: `Com [[dkim|DKIM]], o servidor do banco calcula o hash do corpo e de alguns cabeçalhos, inclusive o From, e assina com uma chave privada. A assinatura vai num cabeçalho com d=banco.example. O receptor busca a chave pública no DNS do banco e confere: a fatura passa. A falsa não tem assinatura de banco.example, e o golpista não tem como produzir uma sem a chave privada.`,
      facts: [
        ["Fatura", dkim(m1)],
        ["Falsa", dkim(m2)],
        ["Chave pública", "no DNS do banco"],
      ],
      highlight: ["banco", "dns"],
    },
    () => {
      c.send("banco", "rx", "assinado d=banco.example", { what: "DKIM", detail: `bh=${bodyHash(m1.body)}` });
      c.send("rx", "dns", "chave de banco.example?", { what: "consulta", detail: "_domainkey" });
      c.send("dns", "rx", "chave pública", { role: "b", what: "resposta" });
      row(0, [m1.label, spf(m1), dkim(m1), "—", "—", "—"], "hit");
      row(1, [m2.label, spf(m2), dkim(m2), "—", "—", "—"], "warn");
    },
  );

  b.step(
    {
      id: "s4-dmarc",
      title: "DMARC amarra ao From",
      subtitle: `Política: ${POL[policy]}`,
      text: `O [[dmarc|DMARC]] fecha a brecha: a mensagem só passa se o SPF ou o DKIM passarem para um domínio igual ao do From. A fatura está alinhada pelos dois. A falsa passou no SPF, mas de ${m2.mailFrom}, e não tem DKIM: falha. O banco publica no DNS o que fazer nesse caso; com a política ${POL[policy]}, a ação é ${r2.action}.`,
      facts: [
        ["Fatura", r1.ok ? "passa" : "falha"],
        ["Falsa", r2.ok ? "passa" : "falha"],
        ["Ação na falsa", r2.action],
      ],
      highlight: ["msgs"],
      quiz: {
        kind: "choice",
        prompt: "O que o DMARC exige para a mensagem passar?",
        options: [
          "SPF ou DKIM aprovados para o mesmo domínio que aparece no From",
          "SPF e DKIM aprovados, para qualquer domínio",
          "Que o servidor de envio esteja numa lista de servidores conhecidos",
        ],
        answer: 0,
        explain:
          "O ponto é o alinhamento: um dos dois mecanismos precisa ter aprovado justamente o domínio que o leitor vê. Aprovar outro domínio não conta.",
      },
    },
    () => {
      c.send("rx", "dns", "DMARC de banco.example?", { what: "consulta", detail: "_dmarc" });
      c.send("dns", "rx", `p=${policy}`, { role: "b", what: "política" });
      row(0, [m1.label, spf(m1), dkim(m1), aligned(r1), r1.ok ? "pass" : "fail", r1.action], "hit");
      row(
        1,
        [m2.label, spf(m2), dkim(m2), aligned(r2), r2.ok ? "pass" : "fail", r2.action],
        r2.action === "entregar" ? "warn" : "bad",
      );
      c.state("rx", `falsa: ${r2.action}`, { tone: r2.action === "entregar" ? "warn" : "good" });
    },
  );

  b.step(
    {
      id: "s5-lista",
      title: "Listas e encaminhamentos",
      subtitle: footer ? "A lista mexe no corpo" : "A lista não mexe no corpo",
      text: footer
        ? `Uma lista de discussão reenvia a fatura do seu próprio servidor, ${m3.ip}: o SPF de banco.example dá ${spf(m3)}. E a lista acrescenta um rodapé ao corpo, o hash muda e o DKIM dá ${dkim(m3)}. Nenhum alinhamento sobra, e uma mensagem legítima fica com DMARC ${r3.ok ? "pass" : "fail"}. É por isso que listas reescrevem o From ou usam ARC, que registra as verificações de quem encaminhou.`
        : `Uma lista de discussão reenvia a fatura do seu próprio servidor, ${m3.ip}: o SPF de banco.example dá ${spf(m3)}. Mas esta lista não mexe no corpo nem nos cabeçalhos assinados, então o DKIM continua ${dkim(m3)} e alinhado. O DMARC passa pelo DKIM. A assinatura sobrevive ao encaminhamento; o SPF, não.`,
      facts: [
        ["SPF", spf(m3)],
        ["DKIM", dkim(m3)],
        ["DMARC", r3.ok ? "pass" : "fail"],
      ],
      highlight: ["lista", "msgs"],
    },
    () => {
      c.send("lista", "rx", "fatura reenviada", {
        what: "SMTP",
        detail: footer ? "com rodapé" : "sem mudança",
      });
      row(
        2,
        [m3.label, spf(m3), dkim(m3), aligned(r3), r3.ok ? "pass" : "fail", r3.action],
        r3.ok ? "hit" : "bad",
      );
    },
  );

  b.step(
    {
      id: "s6-sinais",
      title: "Sinais de falsificação",
      subtitle: "Relatórios e imitações",
      text: `O DMARC também manda relatórios: os receptores informam ao banco, todo dia, quantas mensagens com From: banco.example chegaram de cada IP e se passaram. IPs desconhecidos falhando em massa indicam alguém se passando pelo domínio. O DMARC não cobre domínios parecidos, como banco-example ou bamco.example, nem o nome exibido; esses aparecem em denúncias de usuários.`,
      facts: [
        ["Relatórios", "diários, por IP"],
        ["Sinal", "IPs desconhecidos falhando"],
        ["Fora do alcance", "domínios parecidos"],
      ],
      highlight: ["dns", "rx"],
    },
    () => {
      c.send("rx", "dns", "relatório: 1 falha de 203.0.113.66", { what: "relatório", detail: "rua=" });
      c.note("golpe", "falha em massa nos relatórios", "warn", { dt: 1 });
    },
  );

  b.step(
    {
      id: "s7-defesa",
      title: "Como proteger um domínio",
      subtitle: "Do none ao reject",
      text: `Publique um SPF que termine em -all, assine tudo o que sai com DKIM e comece o DMARC em p=none, só recebendo relatórios. Corrija cada serviço legítimo que aparecer falhando, como sistemas de cobrança e de marketing, e então suba para quarentena e depois rejeitar. Do lado de quem lê, desconfiar de urgência e conferir o domínio continua necessário.`,
      facts: [
        ["SPF", "terminar em -all"],
        ["DKIM", "assinar tudo"],
        ["DMARC", "none → quarantine → reject"],
      ],
      highlight: ["dns"],
    },
    () => {
      c.state("dns", "SPF -all, DKIM, p=reject", { tone: "good" });
    },
  );

  return b.done({ m1: r1.ok ? 1 : 0, m2: r2.action, m3: r3.ok ? 1 : 0, spf2: spf(m2) });
}

const lesson: LessonModule = {
  meta: {
    slug: "email-autenticacao",
    site: "redes",
    title: "SPF, DKIM e DMARC",
    summary:
      "O SMTP aceita qualquer remetente. SPF autoriza IPs para o domínio do envelope, DKIM assina a mensagem e DMARC exige que um deles aprove o domínio do From, dizendo o que fazer quando falha.",
    area: "Aplicação",
    refs: [
      { book: "tanenbaum-cn", chapter: 7, section: "7.2", note: "Correio eletrônico", verified: true },
      { book: "tanenbaum-cn", chapter: 8, section: "8.11", note: "Segurança de e-mail", verified: true },
      { rfc: 7208, note: "SPF" },
      { rfc: 6376, note: "DKIM" },
      { rfc: 7489, note: "DMARC" },
    ],
    simplifications: [
      "A assinatura DKIM é modelada pelo hash do corpo; a verificação criptográfica real usa RSA ou Ed25519 e SHA-256.",
      "O alinhamento é estrito: domínios iguais, sem subdomínios.",
      "Domínios e IPs são reservados para exemplos e documentação.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "politica",
        kind: "choice",
        label: "Política DMARC do banco",
        options: [
          { value: "reject", label: "reject (rejeitar)" },
          { value: "quarantine", label: "quarantine (quarentena)" },
          { value: "none", label: "none (só relatórios)" },
        ],
      },
      {
        key: "rodape",
        kind: "choice",
        label: "A lista acrescenta rodapé",
        options: [
          { value: "sim", label: "sim" },
          { value: "nao", label: "não" },
        ],
      },
    ],
  },
  build,
  intro: {
    text: 'Um e-mail diz "From: banco.example". Como o servidor de quem recebe decide se é verdade? Você vai seguir três mensagens, uma legítima, uma falsa e uma reenviada por uma lista, pelas três verificações que os provedores fazem hoje.',
    facts: [
      ["Mensagens", "3"],
      ["Verificações", "SPF, DKIM, DMARC"],
      ["Domínio", "banco.example"],
    ],
  },
  outro: {
    title: "Autenticação de e-mail em resumo",
    text: "SPF autoriza IPs para o domínio do envelope; DKIM assina corpo e cabeçalhos com uma chave publicada no DNS; DMARC exige que um dos dois aprove o domínio do From e diz ao receptor se deve entregar, pôr em quarentena ou rejeitar. Encaminhamentos quebram o SPF e, se mexem no corpo, o DKIM.",
    facts: (rr) => [
      ["Falsa", String(rr.stats.m2)],
      ["SPF da falsa", String(rr.stats.spf2)],
      ["Lista passa", rr.stats.m3 === 1 ? "sim" : "não"],
    ],
  },
  next: ["smtp", "dnssec", "dns-poisoning"],
};

export default lesson;
