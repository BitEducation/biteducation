import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { kerberosRun, MAX_SKEW_MIN, TGT_HOURS } from "../../../sim/net/kerberos.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Kerberos: a trusted key distribution center hands out tickets so the password never travels.
 * The AS reply is readable only with the password-derived key, the TGT only by the TGS, the
 * service ticket only by the service; timestamps in authenticators stop replays within 5 minutes.
 */
export const DEFAULTS = { relogio: 2, senha: "certa", servicos: 3 };

function clamp(p: Params) {
  const skew = Math.min(10, Math.max(0, Math.round(Number(p.relogio ?? DEFAULTS.relogio))));
  const services = Math.min(6, Math.max(1, Math.round(Number(p.servicos ?? DEFAULTS.servicos))));
  return { skew, right: p.senha !== "errada", services };
}

const scene: SceneSpec = {
  viewBox: [960, 640],
  zones: [
    {
      id: "kdc",
      title: "KDC: conhece a chave de todos",
      rect: { x: 330, y: 20, w: 300, h: 250 },
      tone: "kernel",
    },
  ],
  nodes: [
    {
      id: "cliente",
      kind: "laptop",
      label: "Estação de ana",
      sub: "digita a senha uma vez",
      at: [130, 150],
      w: 200,
    },
    { id: "as", kind: "server", label: "AS", sub: "autenticação", at: [480, 80], w: 180 },
    { id: "tgs", kind: "server", label: "TGS", sub: "emite bilhetes", at: [480, 210], w: 180 },
    {
      id: "srv",
      kind: "server",
      label: "Servidor de arquivos",
      sub: "conhece só Karq",
      at: [830, 150],
      w: 210,
    },
  ],
  links: [
    { id: "l-as", from: "cliente", to: "as" },
    { id: "l-tgs", from: "cliente", to: "tgs" },
    { id: "l-srv", from: "cliente", to: "srv" },
  ],
  widgets: [
    {
      kind: "table",
      id: "msgs",
      title: "As mensagens: {x}K = x cifrado com a chave K",
      at: [40, 300],
      columns: ["#", "Conteúdo", "Quem consegue abrir"],
      widths: [40, 470, 370],
      rows: 6,
    },
    {
      kind: "table",
      id: "chaves",
      title: "Quem conhece cada chave",
      at: [40, 520],
      columns: ["Chave", "Conhecida por"],
      widths: [260, 620],
      rows: 2,
    },
  ],
};

export function build(p: Params) {
  const { skew, right, services } = clamp(p);
  const r = kerberosRun(skew, right, services);
  const b = lessonBuilder();
  const c = talk(b, { cliente: "ana", as: "AS", tgs: "TGS", srv: "arquivos" }, (t) => `t${t}`);
  const show = (n: number, mark: "new" | "hit" | "bad" = "new") => {
    const m = r.msgs[n - 1];
    if (!m) return;
    c.send(m.from, m.to, m.what.split(":")[0] ?? "", {
      what: m.what.split(":")[0] ?? "",
      detail: m.sealed,
      role: m.from === "cliente" ? "a" : "b",
    });
    c.row("msgs", n - 1, [String(m.n), m.what, m.opens], { dt: 0, mark });
  };

  b.step(
    {
      id: "s1-problema",
      title: "Uma senha, muitos serviços",
      subtitle: "Terceiro de confiança",
      text: `Numa empresa, ana usa servidor de arquivos, impressora, e-mail e banco de dados. Mandar a senha a cada um espalharia a senha pela rede e por todos os servidores. O [[kerberos|Kerberos]] resolve com um terceiro de confiança, o [[kdc|KDC]], que conhece uma chave secreta de cada usuário e de cada serviço. A senha de ana nunca sai da estação dela.`,
      facts: [
        ["Senha na rede", "nunca"],
        ["Quem conhece todas as chaves", "o KDC"],
        ["Onde se usa", "Active Directory, universidades"],
      ],
      highlight: ["as", "tgs"],
    },
    () => {
      c.row("chaves", 0, ["Kana (derivada da senha)", "estação de ana, KDC"], { dt: 1, mark: "new" });
      c.row("chaves", 1, ["Ktgs, Karq", "só o KDC; Karq também o servidor de arquivos"], {
        dt: 1,
        mark: "new",
      });
    },
  );

  b.step(
    {
      id: "s2-as",
      title: "O primeiro bilhete",
      subtitle: right ? "ana recebe o TGT" : "Senha errada",
      text: right
        ? `A estação pede ao AS um bilhete para ana, sem mandar senha. O AS sorteia uma chave de sessão K1 e devolve duas coisas: K1 cifrada com Kana, a chave que só a senha de ana gera, e o [[tgt|TGT]], cifrado com uma chave que só o próprio KDC tem. A estação deriva Kana da senha digitada, abre K1 e guarda o TGT fechado, válido por ${TGT_HOURS} horas.`
        : `A estação pede ao AS um bilhete para ana, sem mandar senha. O AS devolve K1 cifrada com Kana e o TGT. Mas a senha digitada estava errada: a chave derivada não é Kana e a estação não consegue abrir K1. Sem K1, o TGT é inútil. Repare que o AS nem precisou saber que a senha estava errada; ninguém confere senha pela rede.`,
      facts: [
        ["Senha enviada", "não"],
        ["K1 aberta", right ? "sim" : "não"],
        ["TGT legível por ana", "não"],
      ],
      highlight: ["msgs", "cliente"],
      quiz: {
        kind: "choice",
        prompt: "ana não consegue ler o TGT. Para que ele serve, então?",
        options: [
          "Para apresentar ao TGS, que o abre e encontra K1 e o nome de ana",
          "Para ana conferir a validade da própria senha",
          "Para ser mostrado ao servidor de arquivos diretamente",
        ],
        answer: 0,
        explain:
          "O TGT é uma carta lacrada que o KDC escreveu para si mesmo. Só o TGS a abre, e dentro está a mesma K1 que ana recebeu: assim o TGS sabe que está falando com ana.",
      },
    },
    () => {
      show(1);
      show(2, right ? "new" : "bad");
      c.state("cliente", right ? "abre K1, guarda o TGT" : "senha errada: não abre K1", {
        tone: right ? "good" : "bad",
      });
    },
  );

  b.step(
    {
      id: "s3-tgs",
      title: "Pedir acesso a um serviço",
      subtitle: "Bilhete para o servidor de arquivos",
      text: `Para abrir o servidor de arquivos, a estação manda ao TGS o TGT e um autenticador: o nome e a hora atuais, cifrados com K1. O TGS abre o TGT com a chave dele, encontra K1, abre o autenticador e confere nome e hora. Então sorteia K2 e responde com K2 cifrada com K1 e um bilhete para o servidor de arquivos, cifrado com Karq.`,
      facts: [
        ["Prova de identidade", "saber K1"],
        ["Nova chave", "K2"],
        ["Bilhete abre com", "Karq"],
      ],
      highlight: ["tgs", "msgs"],
    },
    () => {
      if (!r.gotTgt) {
        c.state("cliente", "sem K1: não há como seguir", { tone: "bad" });
        return;
      }
      show(3);
      show(4);
    },
  );

  b.step(
    {
      id: "s4-servico",
      title: "Entrar no servidor",
      subtitle: r.accepted ? "Aceito" : r.gotTgt ? "Relógio fora" : "Sem bilhete",
      text: r.gotTgt
        ? `A estação manda ao servidor de arquivos o bilhete e um novo autenticador, com a hora, cifrado com K2. O servidor abre o bilhete com Karq, acha K2 e o nome de ana, abre o autenticador e compara a hora com a dele. O relógio da estação está ${skew} min adiantado; o limite é ${MAX_SKEW_MIN}. ${r.accepted ? "Aceito, e o servidor responde provando que também conhece K2." : "Fora do limite: o pedido é recusado, porque poderia ser uma cópia antiga reenviada."}`
        : `Sem K1 não há autenticador para o TGS, e sem bilhete não há o que mostrar ao servidor de arquivos. A troca para aqui, na estação de ana, sem que nenhum servidor tenha recebido a senha errada para conferir. Corrija a senha no Laboratório para ver o resto.`,
      facts: [
        ["Diferença de relógio", `${skew} min`],
        ["Limite", `${MAX_SKEW_MIN} min`],
        ["Resultado", r.accepted ? "aceito" : "recusado"],
      ],
      highlight: ["srv"],
      quiz: {
        kind: "number",
        prompt:
          "Por padrão, qual a maior diferença de relógio, em minutos, que um serviço Kerberos aceita num autenticador?",
        answer: MAX_SKEW_MIN,
        unit: "min",
        explain:
          "Cinco minutos é o padrão. A hora no autenticador impede que alguém grave um pedido e o reenvie mais tarde; por isso os relógios da rede precisam estar sincronizados, com NTP.",
      },
    },
    () => {
      if (!r.gotTgt) {
        c.state("srv", "nenhum pedido chegou", { tone: "none" });
        return;
      }
      show(5, r.accepted ? "new" : "bad");
      if (r.accepted) show(6, "hit");
      c.state("srv", r.accepted ? "ana autenticada" : `hora fora em ${skew} min: recusa`, {
        tone: r.accepted ? "good" : "bad",
      });
    },
  );

  b.step(
    {
      id: "s5-sso",
      title: "Digitar a senha uma vez",
      subtitle: `${services} ${services === 1 ? "serviço" : "serviços"}, ${r.total} mensagens`,
      text: `Enquanto o TGT vale, cada serviço novo pula o AS: são só as quatro mensagens com o TGS e com o serviço. Para ${services} ${services === 1 ? "serviço" : "serviços"}, são ${r.total} mensagens, e ana digita a senha ${r.passwordTyped} vez${r.gotTgt ? "" : ", desde que seja a certa"}. Esse é o [[sso|login único]]. Os serviços nunca veem a senha; cada um só conhece a própria chave.`,
      facts: [
        ["Serviços", String(services)],
        ["Mensagens", String(r.total)],
        ["Senha digitada", "1 vez"],
      ],
      highlight: ["cliente", "tgs"],
      quiz: {
        kind: "number",
        prompt: `O primeiro serviço custa 6 mensagens e cada serviço seguinte custa 4. Quantas mensagens para ${services} ${services === 1 ? "serviço" : "serviços"}?`,
        answer: r.total,
        explain: `6 + 4 × (${services} − 1) = ${r.total}. O AS só é consultado uma vez, enquanto o TGT for válido.`,
      },
    },
    () => {
      if (!r.gotTgt || services === 1)
        c.state("cliente", r.gotTgt ? "TGT guardado para os próximos" : "sem TGT, nada a reaproveitar", {
          tone: r.gotTgt ? "good" : "bad",
        });
      else
        for (let i = 2; i <= services; i++) {
          c.send("cliente", "tgs", `TGT, serviço ${i}`, { what: "TGS-REQ", detail: "sem senha" });
          c.send("tgs", "cliente", `bilhete ${i}`, { role: "b", what: "TGS-REP" });
        }
    },
  );

  b.step(
    {
      id: "s6-riscos",
      title: "Onde o Kerberos é frágil",
      subtitle: "KDC, senhas e relógios",
      text: `O KDC é o alvo mais valioso: quem tiver a chave do TGS emite TGTs para qualquer nome. Por isso fica isolado e com acesso mínimo. A resposta do AS pode ser usada para testar senhas fora da rede; a pré-autenticação, que exige um carimbo de hora cifrado com Kana já no primeiro pedido, e senhas fortes dificultam isso. E sem relógios sincronizados, ninguém entra.`,
      facts: [
        ["Alvo principal", "a chave do TGS"],
        ["Contra adivinhar senhas", "pré-autenticação"],
        ["Dependência", "NTP"],
      ],
      highlight: ["as", "tgs"],
    },
    () => {
      c.state("as", "exige pré-autenticação", { tone: "good" });
      c.state("tgs", "isolado, acesso mínimo", { tone: "good" });
    },
  );

  return b.done({ tgt: r.gotTgt ? 1 : 0, accepted: r.accepted ? 1 : 0, total: r.total });
}

const lesson: LessonModule = {
  meta: {
    slug: "kerberos",
    site: "redes",
    title: "Kerberos e bilhetes",
    summary:
      "Um centro de distribuição de chaves entrega bilhetes cifrados para que a senha nunca viaje: o AS dá o TGT, o TGS dá bilhetes por serviço, e autenticadores com hora barram reenvios. A senha é digitada uma vez.",
    area: "Segurança",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 8,
        section: "8.9.4",
        note: "Autenticação com Kerberos",
        verified: true,
      },
      { book: "maziero-so", chapter: 28, section: "28.10", note: "Kerberos", verified: true },
    ],
    simplifications: [
      "AS e TGS aparecem separados, embora costumem ser o mesmo servidor.",
      "Os campos dos bilhetes estão reduzidos a nome, chave e validade.",
      "A pré-autenticação aparece só no último passo.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "relogio", kind: "int", label: "Relógio da estação adiantado (min)", min: 0, max: 10 },
      {
        key: "senha",
        kind: "choice",
        label: "Senha digitada",
        options: [
          { value: "certa", label: "certa" },
          { value: "errada", label: "errada" },
        ],
      },
      { key: "servicos", kind: "int", label: "Serviços acessados", min: 1, max: 6 },
    ],
  },
  build,
  intro: {
    text: "Como entrar em dez servidores de uma rede digitando a senha uma vez só, sem que ela passe pela rede? Você vai seguir os bilhetes do Kerberos e ver, a cada mensagem, quem consegue abrir o quê.",
    facts: [
      ["Usuária", "ana"],
      ["Servidores", "AS, TGS e arquivos"],
      ["Mensagens", "6 no primeiro acesso"],
    ],
  },
  outro: {
    title: "Kerberos em resumo",
    text: "O KDC conhece a chave de todos. O AS entrega uma chave de sessão que só a senha abre e um TGT que só o TGS abre; o TGS troca o TGT por bilhetes de serviço; cada serviço abre o próprio bilhete. Autenticadores com hora impedem reenvios, e a senha é digitada uma vez por dia.",
    facts: (rr) => [
      ["TGT obtido", rr.stats.tgt === 1 ? "sim" : "não"],
      ["Acesso", rr.stats.accepted === 1 ? "aceito" : "recusado"],
      ["Mensagens", String(rr.stats.total)],
    ],
  },
  next: ["ntp", "tls13", "ssh"],
};

export default lesson;
