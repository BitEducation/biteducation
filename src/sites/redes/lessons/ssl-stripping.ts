import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { daysOf, firstHop } from "../../../sim/net/strip.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Simulated SSL stripping: the first plain-HTTP request is the opening, a man in the middle keeps
 * HTTPS with the server and serves HTTP to the victim, the signs on the screen, and HSTS plus the
 * preload list closing the opening. A model of decisions; no traffic or tooling.
 */
export const DEFAULTS = { hsts: true, visitou: false, preload: false, dias: 365 };
const SITE = "banco.example";

const scene: SceneSpec = {
  viewBox: [960, 580],
  nodes: [
    { id: "nav", kind: "laptop", label: "Navegador", sub: `digitou ${SITE}`, at: [120, 150] },
    { id: "srv", kind: "server", label: "Servidor", sub: SITE, at: [840, 150] },
    { id: "mitm", kind: "attacker", label: "Atacante", sub: "no mesmo Wi-Fi", at: [480, 300], hidden: true },
  ],
  links: [
    { id: "l-ns", from: "nav", to: "srv" },
    { id: "l-nm", from: "nav", to: "mitm", via: [[120, 300]], style: "dashed" },
    { id: "l-ms", from: "mitm", to: "srv", via: [[840, 300]], style: "dashed" },
  ],
  widgets: [
    {
      kind: "table",
      id: "barra",
      title: "O que o usuário vê",
      at: [40, 400],
      columns: ["Barra de endereço", "Cadeado"],
      widths: [210, 90],
      rows: 1,
    },
    {
      kind: "table",
      id: "trechos",
      title: "Cada trecho da conexão",
      at: [380, 400],
      columns: ["Trecho", "Protocolo", "Quem lê"],
      widths: [190, 90, 120],
      rows: 2,
    },
    { kind: "counter", id: "lembra", title: "Navegador lembra HSTS por", at: [40, 480] },
  ],
};

function clamp(p: Params) {
  return {
    hsts: p.hsts !== false,
    visited: p.visitou === true,
    preload: p.preload === true,
    days: Math.min(730, Math.max(1, Math.round(Number(p.dias ?? DEFAULTS.dias)))),
  };
}

export function build(p: Params) {
  const { hsts, visited, preload, days } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, { nav: "navegador", srv: "servidor", mitm: "atacante" }, (t) => String(t));
  const hop = firstHop({ hsts, visited, preload });
  const maxAge = days * 86400;
  const bar = (url: string, lock: boolean, mark: "hit" | "bad") =>
    c.row("barra", 0, [url, lock ? "sim" : "não"], { dt: 1, mark });

  b.step(
    {
      id: "s1-redirecionamento",
      title: "Primeiro pedido em claro",
      subtitle: "http:// e depois https://",
      text: `Quem digita só ${SITE} na barra não escolhe protocolo, e o navegador começa por HTTP, na porta 80. O servidor responde com um redirecionamento 301 para https://${SITE}, e só então a conexão passa a usar [[tls]]. Tudo depois é cifrado, mas aquele primeiro pedido e o redirecionamento viajaram em texto claro. É essa brecha que o ataque aproveita.${hop.strippable ? "" : ` Nesta configuração, porém, ${preload ? "o domínio está na pré-carga" : "a visita com HSTS já aconteceu"}, e o navegador pula essa etapa.`}`,
      facts: [
        ["Primeiro pedido", `http://${SITE}`],
        ["Resposta", "301 → https://"],
        ["Em claro", "pedido e redirecionamento"],
      ],
      highlight: ["nav"],
    },
    () => {
      c.send("nav", "srv", "GET http://", { what: "pedido em claro", detail: "porta 80" });
      c.send("srv", "nav", "301 https://", { role: "b", what: "redirecionamento", detail: "em claro" });
      c.send("nav", "srv", "TLS", { role: "crypto", what: "handshake TLS", detail: "porta 443" });
      bar(`https://${SITE}`, true, "hit");
    },
  );

  b.step(
    {
      id: "s2-meio",
      quiz: {
        kind: "choice",
        prompt: "Do lado do servidor do banco, o que aparece durante o ataque?",
        options: [
          "Uma conexão HTTPS normal, aberta pelo atacante",
          "Um pedido HTTP em claro, fácil de recusar",
          "Um erro de certificado no handshake",
        ],
        answer: 0,
        explain:
          "O atacante fala HTTPS de verdade com o servidor; só o trecho até a vítima fica sem TLS. Por isso o servidor não tem o que recusar, e a proteção precisa estar no navegador.",
      },
      title: "O atacante no meio",
      subtitle: hop.strippable ? "HTTPS só de um lado" : "Não há pedido em claro",
      text: hop.strippable
        ? `Num Wi-Fi público, um atacante que se pôs no caminho, por exemplo com [[arp-spoofing]], recebe o pedido em claro. Ele mesmo abre HTTPS com o servidor, busca a página e a devolve ao navegador por HTTP, trocando todo link https:// por http://. O servidor vê uma conexão cifrada normal; o navegador nunca chega a ver o redirecionamento. É o [[ssl-stripping]]: o [[mitm]] remove o TLS só do lado da vítima.`
        : `O mesmo atacante está no caminho, mas não há pedido em claro para interceptar: ${preload ? "o domínio está na lista de pré-carga do navegador" : "o navegador guardou a política HSTS da visita anterior"}, e o pedido sai direto como HTTPS. O atacante só vê bytes cifrados e não consegue apresentar um [[certificado]] válido para ${SITE}. Tirar o TLS de um lado só exige que o primeiro passo seja em claro.`,
      facts: [
        ["Primeiro pedido", `${hop.scheme}://${SITE}`],
        ["Atacante ↔ servidor", "HTTPS"],
        ["Navegador ↔ atacante", hop.strippable ? "HTTP" : "HTTPS (não lê)"],
      ],
      highlight: ["mitm"],
    },
    () => {
      c.show(["mitm"], { dt: 1, label: "o atacante está no caminho" });
      if (hop.strippable) {
        c.send("nav", "mitm", "GET http://", { what: "pedido em claro", detail: "interceptado" });
        c.send("mitm", "srv", "TLS + GET", { role: "crypto", what: "atacante abre HTTPS" });
        c.send("srv", "mitm", "página", { role: "crypto", what: "página cifrada" });
        c.send("mitm", "nav", "página em HTTP", { role: "bad", what: "links trocados para http://" });
        bar(`http://${SITE}`, false, "bad");
        c.row("trechos", 0, ["navegador ↔ atacante", "HTTP", "o atacante"], { mark: "bad" });
        c.row("trechos", 1, ["atacante ↔ servidor", "HTTPS", "ninguém mais"], { mark: "new" });
      } else {
        c.send("nav", "mitm", "TLS", { role: "crypto", what: "pedido já cifrado" });
        c.note("mitm", "só vê bytes cifrados", "good");
        bar(`https://${SITE}`, true, "hit");
        c.row("trechos", 0, ["navegador ↔ servidor", "HTTPS", "só as pontas"], { mark: "hit" });
      }
    },
  );

  b.step(
    {
      id: "s3-senha",
      title: "A senha passa por ele",
      subtitle: hop.strippable ? "Login em texto claro" : "Login cifrado",
      text: hop.strippable
        ? `O usuário preenche usuário e senha num formulário que parece o de sempre. O envio vai por HTTP até o atacante, que lê a senha e a repassa ao servidor por HTTPS. O login funciona, a página seguinte carrega, e nem o servidor nem o usuário percebem nada de estranho. Tudo o que a vítima fizer nessa sessão, inclusive cookies sem o atributo Secure, passa pelas mãos do atacante.`
        : `O formulário de login vai cifrado de ponta a ponta. O atacante pode atrasar ou derrubar a conexão, mas não ler nem alterar o conteúdo. Se tentar se passar pelo servidor com um certificado próprio, o navegador mostra um erro que, com HSTS ativo, não pode ser ignorado pelo usuário.`,
      facts: [
        ["Senha", hop.strippable ? "lida pelo atacante" : "cifrada"],
        ["Servidor percebe?", "não"],
        ["Usuário percebe?", hop.strippable ? "só olhando a barra" : "não há o que perceber"],
      ],
      highlight: hop.strippable ? ["mitm"] : ["nav", "srv"],
    },
    () => {
      if (hop.strippable) {
        c.send("nav", "mitm", "POST senha", { role: "bad", what: "formulário em claro" });
        c.note("mitm", "lê usuário e senha", "bad");
        c.send("mitm", "srv", "POST via TLS", { role: "crypto", what: "repassa por HTTPS" });
      } else {
        c.send("nav", "srv", "POST via TLS", { role: "crypto", what: "formulário cifrado" });
      }
    },
  );

  b.step(
    {
      id: "s4-sinais",
      title: "Os sinais na tela",
      subtitle: "http:// num site de banco",
      text: `O ataque deixa marcas visíveis para quem procura. A barra mostra http:// e nenhum cadeado num site que sempre teve; navegadores modernos marcam páginas com campo de senha em HTTP como não seguras. Do lado do servidor, sessões de muitos usuários diferentes chegam do mesmo endereço, o do atacante. Na rede local, as mesmas pistas do ARP spoofing aparecem antes.`,
      facts: [
        ["Barra", "http:// sem cadeado"],
        ["Aviso", "campo de senha não seguro"],
        ["Servidor", "muitas sessões, um só IP"],
      ],
      highlight: ["nav"],
      tags: ["signals"],
    },
    () => {
      c.note("nav", "http:// sem cadeado e aviso de senha não segura", "warn", { dt: 1 });
      c.note("srv", "sessões demais vindas de um só endereço", "warn");
    },
  );

  b.step(
    {
      id: "s5-hsts",
      title: "HSTS: lembrar de usar HTTPS",
      subtitle: `max-age = ${days} ${days === 1 ? "dia" : "dias"}`,
      text: `${hsts ? "" : "Este servidor ainda não usa HSTS; veja o que muda quando usa. "}Com [[hsts]], o servidor manda, numa resposta HTTPS, o cabeçalho Strict-Transport-Security com max-age=${maxAge}. O navegador guarda a regra por ${days} ${days === 1 ? "dia" : "dias"} e, nesse período, transforma sozinho todo pedido http:// para ${SITE} em https://, antes de qualquer pacote sair. Erros de certificado deixam de ter o botão de continuar. A falha que sobra é a primeira visita, ainda sem a regra guardada.`,
      facts: [
        ["Cabeçalho", `max-age=${maxAge}`],
        ["Lembra por", `${days} ${days === 1 ? "dia" : "dias"}`],
        ["Brecha restante", "a primeira visita"],
      ],
      highlight: ["nav"],
      tags: ["defense"],
      quiz: {
        kind: "number",
        prompt: `Um servidor envia max-age=${maxAge}. Por quantos dias o navegador mantém a regra?`,
        answer: daysOf(maxAge),
        explain: `${maxAge} s ÷ 86 400 s por dia = ${daysOf(maxAge)}.`,
      },
    },
    () => {
      c.send("srv", "nav", "Strict-Transport-Security", {
        role: "crypto",
        what: "política HSTS",
        detail: `max-age=${maxAge}`,
      });
      c.count("lembra", `${days} ${days === 1 ? "dia" : "dias"}`, {
        label: `regra guardada por ${days} dias`,
      });
      c.send("nav", "srv", "TLS (troca interna)", {
        role: "crypto",
        what: "http:// vira https:// no próprio navegador",
      });
      bar(`https://${SITE}`, true, "hit");
    },
  );

  b.step(
    {
      id: "s6-preload",
      title: "Lista de pré-carga",
      subtitle: "Nem a primeira visita em claro",
      text: `Para fechar a primeira visita, navegadores trazem embutida uma lista de domínios que só aceitam HTTPS, a lista de pré-carga do HSTS. Um domínio nela nunca recebe um pedido em claro, nem na primeira vez, nem depois de limpar o histórico. Junto com cookies marcados como Secure, que nunca viajam por HTTP, e com links que já usam https://, o stripping fica sem ponto de entrada.`,
      facts: [
        ["Pré-carga", "embutida no navegador"],
        ["Cookies", "atributo Secure"],
        ["Pedido em claro", "nunca"],
      ],
      highlight: ["nav", "srv"],
      tags: ["defense"],
    },
    () => {
      c.state("nav", "pré-carga: só HTTPS", {
        tone: "good",
        label: `${SITE} está na lista de pré-carga`,
        dt: 1,
      });
      c.row("trechos", 0, ["navegador ↔ servidor", "HTTPS", "só as pontas"], { dt: 1, mark: "hit" });
      c.row("trechos", 1, ["navegador ↔ atacante", "nenhum", "—"], { mark: "hit" });
    },
  );

  return b.done({ strippable: hop.strippable ? 1 : 0, scheme: hop.scheme, days: daysOf(maxAge) });
}

const lesson: LessonModule = {
  meta: {
    slug: "ssl-stripping",
    site: "redes",
    title: "SSL stripping e HSTS",
    summary:
      "Uma simulação de como um intermediário aproveita o primeiro pedido em HTTP para manter a vítima sem TLS, os sinais na tela e como HSTS e a lista de pré-carga tiram esse ponto de entrada.",
    area: "Segurança",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 8,
        section: "8.12.3",
        note: "Segurança da camada de transporte",
        verified: true,
      },
      { book: "tanenbaum-cn", chapter: 8, section: "8.2.2", note: "Sniffing e snooping", verified: true },
    ],
    simplifications: [
      "Um modelo das decisões do navegador: nenhum tráfego é gerado e nada aqui funciona fora da lição.",
      "O atacante já está no caminho; como ele chega lá é assunto da lição de ARP spoofing.",
      "A pré-carga e o HSTS valem também para subdomínios quando o servidor pede; aqui só o domínio principal aparece.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "hsts", kind: "bool", label: "Servidor envia HSTS" },
      {
        key: "visitou",
        kind: "bool",
        label: "Usuário já visitou o site por HTTPS",
        help: "Com HSTS, a regra fica guardada desde a visita anterior.",
      },
      { key: "preload", kind: "bool", label: "Domínio na lista de pré-carga" },
      { key: "dias", kind: "int", label: "max-age do HSTS (dias)", min: 1, max: 730 },
    ],
  },
  build,
  intro: {
    text: "Muitos acessos a sites seguros começam com um pedido em texto claro, porque o usuário não digitou https://. Esta simulação mostra como um intermediário aproveita esse momento, o que denuncia o ataque e como o navegador aprende a nunca mais pedir em claro.",
    facts: [
      ["Site", SITE],
      ["HSTS", "sim"],
      ["Visita anterior", "não"],
    ],
  },
  outro: {
    title: "SSL stripping em resumo",
    text: "Se o primeiro pedido sai em HTTP, quem está no meio pode manter a vítima em HTTP enquanto fala HTTPS com o servidor. A barra sem cadeado e o aviso de senha denunciam. HSTS faz o navegador trocar http por https sozinho depois da primeira visita, e a lista de pré-carga cobre até essa primeira vez.",
    facts: (run) => [
      ["Primeiro pedido", `${run.stats.scheme}://`],
      ["Vulnerável", run.stats.strippable ? "sim" : "não"],
      ["HSTS lembrado", `${run.stats.days} dias`],
    ],
  },
  next: ["tls13", "arp-spoofing", "http"],
};

export default lesson;
