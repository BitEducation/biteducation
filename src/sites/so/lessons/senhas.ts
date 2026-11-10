import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { BIG_LIST, COMMON, human, passwordsRun, USERS } from "../../../sim/os/passwords.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { big } from "../../shared/practice-kit.ts";

/**
 * Storing passwords, one defense at a time: plaintext, a plain hash (equal passwords show and a
 * precomputed list matches), a per-user salt (precomputation dies, weak passwords still fall) and
 * a slow hash (each guess costs). The attack is only counted; it closes with signals and defenses.
 */
export const DEFAULTS = { custo: 20 };

function clamp(p: Params) {
  return Math.min(24, Math.max(0, Math.round(Number(p.custo ?? DEFAULTS.custo))));
}

function scene(): SceneSpec {
  return {
    viewBox: [960, 600],
    nodes: [
      {
        id: "srv",
        kind: "server",
        label: "Servidor de login",
        sub: "guarda o banco de senhas",
        at: [180, 80],
        w: 220,
      },
      {
        id: "atk",
        kind: "attacker",
        label: "Atacante",
        sub: "com uma cópia do banco",
        at: [780, 80],
        w: 220,
      },
    ],
    links: [{ id: "l-vaza", from: "srv", to: "atk", style: "dashed" }],
    widgets: [
      {
        kind: "table",
        id: "banco",
        title: "O que o servidor guarda",
        at: [40, 190],
        columns: ["Usuário", "Sal", "Guardado (8 primeiros dígitos)"],
        widths: [120, 130, 300],
        rows: USERS.length,
      },
      { kind: "counter", id: "achadas", title: "Senhas descobertas", at: [640, 200] },
      {
        kind: "table",
        id: "custo",
        title: `Testar ${big(BIG_LIST)} palpites contra ${USERS.length} usuários com sal`,
        at: [40, 420],
        columns: ["Hash", "Cálculos por palpite", "Tempo numa GPU"],
        widths: [260, 260, 260],
        rows: 2,
      },
    ],
  };
}

export function build(p: Params) {
  const cost = clamp(p);
  const r = passwordsRun(cost);
  const fast = passwordsRun(0);
  const b = lessonBuilder();
  const c = talk(b, { srv: "servidor", atk: "atacante" }, (t) => `t${t}`);
  const names = (xs: string[]) => (xs.length ? xs.join(", ") : "ninguém");
  const fill = (rows: { name: string; salt?: string; shown: string }[], mark?: "new" | "warn" | "bad") =>
    rows.forEach((u, i) => {
      c.row("banco", i, [u.name, u.salt ?? "—", u.shown], { dt: 1, ...(mark ? { mark } : {}) });
    });

  b.step(
    {
      id: "s1-texto",
      title: "Senha em texto puro",
      subtitle: "O pior caso",
      text: `O jeito mais ingênuo é guardar a senha como foi digitada e comparar no login. Funciona até o dia em que o banco vaza: um backup esquecido, uma injeção de SQL, um funcionário. Quem pega a cópia lê todas as senhas de uma vez, e como muita gente repete a senha em outros serviços, o estrago passa do sistema que vazou.`,
      facts: [
        ["Usuários", String(USERS.length)],
        ["Expostos num vazamento", String(USERS.length)],
        ["Esforço do atacante", "nenhum"],
      ],
      highlight: ["banco"],
    },
    () => {
      fill(
        USERS.map((u) => ({ name: u.name, shown: u.pw })),
        "bad",
      );
      c.send("srv", "atk", "cópia do banco", { what: "vazamento", detail: "todas as linhas" });
      c.count("achadas", String(USERS.length), { label: "todas" });
    },
  );

  b.step(
    {
      id: "s2-hash",
      title: "Guardar só o resumo",
      subtitle: "Função de hash",
      text: `Em vez da senha, o servidor guarda o [[hash-de-senha|hash]] dela: um resumo de tamanho fixo que não dá para inverter. No login, calcula o hash do que foi digitado e compara. Agora a cópia vazada mostra só números. Mas repare em bia e caio: os dois hashes são iguais, ${r.plain[1]?.hash}. Quem olha o banco sabe que eles usam a mesma senha.`,
      facts: [
        ["bia", r.plain[1]?.hash ?? ""],
        ["caio", r.plain[2]?.hash ?? ""],
        ["Senhas legíveis", "nenhuma"],
      ],
      highlight: ["banco"],
      quiz: {
        kind: "choice",
        prompt: "bia e caio têm o mesmo hash guardado. O que isso revela a quem tem a cópia do banco?",
        options: [
          "Que os dois usam a mesma senha, e descobrir uma é descobrir as duas",
          "Nada: hashes iguais podem vir de senhas diferentes com frequência",
          "A própria senha, porque hashes iguais são fáceis de inverter",
        ],
        answer: 0,
        explain:
          "A mesma entrada sempre dá o mesmo hash. Colisões de verdade são raríssimas, então hashes iguais quase certamente são senhas iguais.",
      },
    },
    () => {
      fill(
        r.plain.map((u) => ({ name: u.name, shown: u.hash })),
        "new",
      );
      c.count("achadas", "0", { label: "nenhuma legível" });
    },
  );

  b.step(
    {
      id: "s3-lista",
      title: "A lista pronta",
      subtitle: `${r.crackedPlain.length} de ${USERS.length}`,
      text: `O hash não se inverte, mas se calcula. O atacante pega uma lista de senhas comuns, publicada depois de vazamentos antigos, calcula o hash de cada uma uma única vez e compara com o banco inteiro. Com só ${COMMON.length} palavras, acha ${names(r.crackedPlain)}. A senha longa de duda não está em lista nenhuma e resiste. Tabelas assim são guardadas e reaproveitadas contra qualquer banco.`,
      facts: [
        ["Palavras na lista", String(COMMON.length)],
        ["Descobertas", String(r.crackedPlain.length)],
        ["Resistiu", "duda"],
      ],
      highlight: ["atk", "achadas"],
    },
    () => {
      c.state("atk", `compara ${COMMON.length} hashes prontos`, { tone: "warn" });
      r.plain.forEach((u, i) => {
        const hit = r.crackedPlain.includes(u.name);
        c.row("banco", i, [u.name, "—", hit ? `${u.hash} = ${u.pw}` : u.hash], {
          dt: 1,
          mark: hit ? "bad" : "new",
        });
      });
      c.count("achadas", String(r.crackedPlain.length), { label: names(r.crackedPlain) });
    },
  );

  b.step(
    {
      id: "s4-sal",
      title: "Um sal por usuário",
      subtitle: "Mesma senha, hashes diferentes",
      text: `Agora o servidor sorteia um [[sal|sal]] para cada usuário e guarda o hash de sal mais senha, com o sal ao lado. bia e caio passam a ter hashes diferentes, e a lista pronta não acha ninguém: cada hash depende de um sal que ela não conhecia. O atacante precisa refazer as contas para cada usuário. Mas senha fraca continua fraca: com ${r.guessesSalted} cálculos, ele ainda acha ${names(r.perUser)}.`,
      facts: [
        ["Achadas pela lista pronta", String(r.crackedTable.length)],
        ["Cálculos agora", String(r.guessesSalted)],
        ["Achadas assim mesmo", String(r.perUser.length)],
      ],
      highlight: ["banco"],
      quiz: {
        kind: "number",
        prompt: `Com sal, o atacante testa ${COMMON.length} palavras contra cada um dos ${USERS.length} usuários. Quantos hashes ele precisa calcular?`,
        answer: r.guessesSalted,
        explain: `Cada usuário tem seu sal, então cada palavra é calculada de novo para cada um: ${COMMON.length} × ${USERS.length} = ${r.guessesSalted}. Sem sal, bastavam ${COMMON.length}.`,
      },
    },
    () => {
      fill(
        r.salted.map((u) => ({ name: u.name, salt: u.salt, shown: u.hash })),
        "new",
      );
      c.count("achadas", "0", { label: "lista pronta: nenhuma" });
      c.state("atk", `${r.guessesSalted} cálculos, um a um`, { tone: "warn" });
      r.salted.forEach((u, i) => {
        if (r.perUser.includes(u.name))
          c.row("banco", i, [u.name, u.salt, `${u.hash} = ${u.pw}`], { dt: 1, mark: "warn" });
      });
      c.count("achadas", String(r.perUser.length), { label: names(r.perUser) });
    },
  );

  b.step(
    {
      id: "s5-lento",
      title: "Um hash de propósito lento",
      subtitle: `${big(r.iterations)} cálculos por palpite`,
      text: `Um hash comum é feito para ser rápido: uma GPU calcula na casa do bilhão por segundo. Funções como bcrypt, scrypt e Argon2 são [[hash-lento|lentas de propósito]] e têm um custo ajustável. Aqui o custo ${cost} repete o cálculo ${big(r.iterations)} vezes. Testar ${big(BIG_LIST)} palpites contra ${USERS.length} usuários passa de ${human(fast.seconds)} para ${human(r.seconds)}. O login de verdade quase não sente.`,
      facts: [
        ["Custo", String(cost)],
        ["Hash rápido", human(fast.seconds)],
        ["Hash lento", human(r.seconds)],
      ],
      highlight: ["custo"],
      quiz: {
        kind: "choice",
        prompt: "Por que deixar o hash lento ajuda o servidor, se ele mesmo tem de calculá-lo a cada login?",
        options: [
          "O servidor calcula um hash por login; o atacante, milhões por conta",
          "Porque hashes lentos não podem ser calculados em GPU",
          "Porque o hash lento esconde o sal",
        ],
        answer: 0,
        explain:
          "Uma fração de segundo por login é imperceptível. Multiplicada pelos milhões de palpites de um ataque, vira horas, dias ou anos.",
      },
    },
    () => {
      c.row("custo", 0, ["rápido (custo 0)", "1", human(fast.seconds)], { dt: 1, mark: "bad" });
      c.row("custo", 1, [`lento (custo ${cost})`, big(r.iterations), human(r.seconds)], {
        dt: 1,
        mark: cost >= 14 ? "hit" : "warn",
      });
    },
  );

  b.step(
    {
      id: "s6-sinais",
      title: "Sinais de ataque",
      subtitle: "O que aparece nos registros",
      text: `Um ataque contra senhas costuma deixar rastros. Muitas falhas de login seguidas numa conta, ou poucas tentativas em muitas contas a partir da mesma origem. Logins que dão certo vindos de lugares ou aparelhos nunca vistos. E, no pior caso, uma cópia do banco aparecendo em listas de vazamentos. Qualquer um deles pede troca forçada de senhas e o encerramento das sessões abertas.`,
      facts: [
        ["Falhas em sequência", "uma conta"],
        ["Poucas em muitas contas", "mesma origem"],
        ["Resposta", "trocar senhas, encerrar sessões"],
      ],
      highlight: ["srv"],
    },
    () => {
      c.state("srv", "falhas em muitas contas", { tone: "warn" });
      c.note("srv", "mesma origem, intervalo regular", "warn", { dt: 1 });
    },
  );

  b.step(
    {
      id: "s7-defesa",
      title: "Defesa em camadas",
      subtitle: "O que fazer",
      text: `Guarde senhas com Argon2id, scrypt ou bcrypt, sempre com sal e um custo que leve uma fração de segundo no seu servidor; nunca em texto puro nem com cifra reversível. Limite tentativas por conta e por origem. Ofereça um segundo fator, que protege mesmo quem tem senha fraca. E recuse, no cadastro, senhas que já apareceram em vazamentos.`,
      facts: [
        ["Hash", "Argon2id, scrypt ou bcrypt"],
        ["Tentativas", "limitadas"],
        ["Segundo fator", "sim"],
      ],
      highlight: ["srv", "banco"],
    },
    () => {
      c.state("srv", "Argon2id + sal + limite + 2º fator", { tone: "good" });
      c.state("atk", "palpites lentos e bloqueados", { tone: "bad" });
    },
  );

  return b.done({
    crackedPlain: r.crackedPlain.length,
    crackedTable: r.crackedTable.length,
    perUser: r.perUser.length,
    guesses: r.guessesSalted,
    seconds: Math.round(r.seconds),
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "senhas",
    site: "so",
    title: "Como guardar senhas",
    summary:
      "Do texto puro ao hash lento com sal: o hash esconde a senha mas mostra repetições, a lista pronta acha as fracas, o sal acaba com a pré-computação e o custo multiplica cada palpite. Termina com sinais de ataque e defesas.",
    area: "Segurança",
    refs: [
      { book: "maziero-so", chapter: 28, section: "28.4", note: "Senhas", verified: true },
      { book: "tanenbaum-mos", chapter: 9, section: "9.6", note: "Autenticação", verified: true },
    ],
    simplifications: [
      "Os hashes são SHA-1 de verdade, cortados em 8 dígitos para caber na tela; SHA-1 não serve para senhas.",
      "O hash lento é modelado como repetir o hash rápido; Argon2 e scrypt também gastam memória.",
      "A taxa de um bilhão de palpites por segundo é uma ordem de grandeza para uma GPU.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [{ key: "custo", kind: "int", label: "Custo do hash lento (2^custo cálculos)", min: 0, max: 24 }],
  },
  build,
  intro: {
    text: "Todo sistema com login guarda alguma coisa sobre a senha de cada usuário. Você vai ver quatro jeitos de guardar, do pior ao recomendado, e contar o que um atacante com uma cópia do banco consegue em cada um.",
    facts: [
      ["Usuários", String(USERS.length)],
      ["Lista de senhas comuns", `${COMMON.length} palavras`],
      ["Ataque", "só contado"],
    ],
  },
  outro: {
    title: "Senhas em resumo",
    text: "Nunca guarde a senha. Guarde um hash com sal único por usuário, feito com uma função lenta e de custo ajustável. O sal impede tabelas prontas e esconde senhas repetidas; a lentidão multiplica o custo de cada palpite. Nada disso salva uma senha fraca: limite de tentativas e segundo fator completam a defesa.",
    facts: (rr) => [
      ["Sem sal, achadas", String(rr.stats.crackedPlain)],
      ["Lista pronta com sal", String(rr.stats.crackedTable)],
      ["Fracas com sal", String(rr.stats.perUser)],
    ],
  },
  next: ["controle-de-acesso", "chamada-de-sistema", "virtualizacao"],
};

export default lesson;
