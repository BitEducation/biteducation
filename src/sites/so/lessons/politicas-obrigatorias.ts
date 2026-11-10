import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import {
  allowed,
  count,
  LEVELS,
  type MacPolicy,
  matrix,
  OBJECTS,
  type Op,
  SUBJECTS,
} from "../../../sim/os/mac.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Mandatory policies: a Trojan horse defeats discretionary permissions by copying a secret into a
 * public file; Bell-LaPadula stops it with "no read up, no write down", and Biba flips the rules
 * to protect integrity. Ends with where these ideas live today (SELinux, integrity levels).
 */
export const DEFAULTS = { sujeito: "1" };

function clamp(p: Params) {
  return Math.min(2, Math.max(0, Math.round(Number(p.sujeito ?? DEFAULTS.sujeito))));
}

const HEAD = ["Sujeito", ...OBJECTS.map((o) => `${o.name} (${LEVELS[o.level]})`)];

function scene(): SceneSpec {
  return {
    viewBox: [960, 620],
    nodes: [
      {
        id: "dir",
        kind: "process",
        label: "editor da diretora",
        sub: "nível secreto",
        at: [160, 70],
        w: 220,
      },
      { id: "plano", kind: "disk", label: "plano", sub: "secreto", at: [480, 70], w: 160 },
      { id: "card", kind: "disk", label: "cardápio", sub: "público", at: [800, 70], w: 160 },
    ],
    links: [
      { id: "l-p", from: "dir", to: "plano" },
      { id: "l-c", from: "plano", to: "card", style: "dashed" },
    ],
    widgets: [
      {
        kind: "table",
        id: "ler",
        title: "Pode ler?",
        at: [40, 170],
        columns: HEAD,
        widths: [150, 200, 230, 180],
        rows: 3,
      },
      {
        kind: "table",
        id: "escrever",
        title: "Pode escrever?",
        at: [40, 330],
        columns: HEAD,
        widths: [150, 200, 230, 180],
        rows: 3,
      },
      { kind: "counter", id: "permitidas", title: "Combinações permitidas (de 9)", at: [40, 500] },
    ],
  };
}

export function build(p: Params) {
  const who = clamp(p);
  const me = SUBJECTS[who] ?? SUBJECTS[1];
  const b = lessonBuilder();
  const c = talk(b, { dir: "diretora", plano: "plano", card: "cardápio" }, (t) => `t${t}`);
  const mark = (ok: boolean) => (ok ? "✓" : "✗");
  const fill = (policy: MacPolicy, op: Op) => {
    const m = matrix(policy, op);
    m.forEach((row, i) => {
      c.row(op, i, [SUBJECTS[i]?.name ?? "", ...row.map(mark)], { dt: 1, mark: i === who ? "hit" : "new" });
    });
    return m;
  };
  const list = (policy: MacPolicy, op: Op) => {
    const xs = OBJECTS.filter((o) => allowed(policy, me.level, o.level, op)).map((o) => o.name);
    return xs.length === OBJECTS.length ? "todos" : xs.join(" e ");
  };
  const blpRead = count(matrix("blp", "ler"));
  const blpWrite = count(matrix("blp", "escrever"));

  b.step(
    {
      id: "s1-cavalo",
      title: "Onde as permissões falham",
      subtitle: "Um cavalo de Troia",
      text: `Com permissões [[controle-discricionario|discricionárias]], quem é dono do arquivo decide quem o acessa. A diretora pode ler o plano secreto e escrever no cardápio público. Se o editor de textos dela tiver um [[cavalo-de-troia|cavalo de Troia]], ele roda com os direitos dela, lê o plano e copia o conteúdo para o cardápio. Nenhuma permissão foi violada, e o segredo vazou.`,
      facts: [
        ["Quem decide", "o dono"],
        ["O programa roda como", "a diretora"],
        ["Resultado", "segredo no cardápio"],
      ],
      highlight: ["dir", "card"],
    },
    () => {
      c.send("dir", "plano", "lê", { what: "leitura", detail: "permitida" });
      c.send("plano", "card", "copia", { what: "escrita", detail: "permitida", role: "warn" });
      c.state("card", "contém o segredo", { tone: "bad" });
    },
  );

  b.step(
    {
      id: "s2-rotulos",
      title: "Rótulos acima do dono",
      subtitle: `${LEVELS.join(" < ")}`,
      text: `Numa [[politica-obrigatoria|política obrigatória]], o sistema dá a cada sujeito e a cada objeto um rótulo de nível, ${LEVELS.join(", ")}, em ordem. As regras comparam os rótulos e valem para todos, inclusive para os donos: nenhum usuário pode afrouxá-las. Aqui o estagiário é público, o analista é confidencial e a diretora é secreta; os arquivos seguem os mesmos níveis.`,
      facts: [
        ["Níveis", String(LEVELS.length)],
        ["Quem define", "o administrador de segurança"],
        ["Dono pode mudar?", "não"],
      ],
      highlight: ["ler", "escrever"],
    },
    () => {
      SUBJECTS.forEach((s, i) => {
        c.row("ler", i, [`${s.name} (${LEVELS[s.level]})`, "?", "?", "?"], { dt: 1 });
        c.row("escrever", i, [`${s.name} (${LEVELS[s.level]})`, "?", "?", "?"], { dt: 0 });
      });
    },
  );

  b.step(
    {
      id: "s3-ler",
      title: "Não ler acima",
      subtitle: "Bell-LaPadula, leitura",
      text: `O modelo [[bell-lapadula|Bell-LaPadula]] protege o sigilo. A primeira regra: um sujeito só lê objetos do seu nível ou abaixo. A diretora lê tudo; o estagiário, só o cardápio. Na matriz, a linha destacada é a de ${me.name}, que pode ler ${list("blp", "ler")}. Das nove combinações, ${blpRead} são permitidas.`,
      facts: [
        ["Regra", "nível do sujeito ≥ objeto"],
        [me.name, list("blp", "ler")],
        ["Permitidas", `${blpRead} de 9`],
      ],
      highlight: ["ler"],
      quiz: {
        kind: "number",
        prompt:
          "Com três níveis e a regra de não ler acima, quantas das 9 combinações de sujeito e objeto permitem leitura?",
        answer: blpRead,
        explain: "O secreto lê os 3, o confidencial lê 2 e o público lê 1: 3 + 2 + 1 = 6.",
      },
    },
    () => {
      fill("blp", "ler");
      c.count("permitidas", String(blpRead), { label: `${blpRead} de 9` });
    },
  );

  b.step(
    {
      id: "s4-escrever",
      title: "Não escrever abaixo",
      subtitle: "Bell-LaPadula, escrita",
      text: `A segunda regra, a propriedade estrela: um sujeito só escreve em objetos do seu nível ou acima. Parece estranho, porque o estagiário pode escrever no plano secreto sem poder lê-lo. Mas é ela que para o cavalo de Troia: o editor da diretora, no nível secreto, não pode escrever no cardápio público. O segredo não desce. ${me.name} pode escrever em ${list("blp", "escrever")}.`,
      facts: [
        ["Regra", "nível do sujeito ≤ objeto"],
        [me.name, list("blp", "escrever")],
        ["Cavalo de Troia", "bloqueado"],
      ],
      highlight: ["escrever", "card"],
      quiz: {
        kind: "choice",
        prompt: "Por que a diretora, que pode ler tudo, não pode escrever no cardápio público?",
        options: [
          "Porque qualquer coisa que ela escreva pode conter o que leu no nível secreto",
          "Porque o cardápio pertence a outro usuário",
          "Porque ela não tem permissão de escrita em arquivo nenhum",
        ],
        answer: 0,
        explain:
          "O modelo não confia nos programas. Proibindo escrever abaixo, nenhuma informação lida num nível pode chegar a um nível menor, nem por engano nem por um programa malicioso.",
      },
    },
    () => {
      fill("blp", "escrever");
      c.send("plano", "card", "copia", { what: "escrita", detail: "negada", lost: true });
      c.state("card", "intacto", { tone: "good" });
      c.count("permitidas", String(blpWrite), { label: `${blpWrite} de 9` });
    },
  );

  b.step(
    {
      id: "s5-biba",
      title: "Biba: o espelho",
      subtitle: "Integridade",
      text: `Às vezes o problema não é vazar, e sim contaminar: um dado pouco confiável chegando a um sistema crítico. O modelo [[biba|Biba]] inverte as regras, com níveis de integridade: não ler abaixo, para não se basear em dado duvidoso, e não escrever acima, para não estragar o que é mais confiável. Com Biba, ${me.name} lê ${list("biba", "ler")} e escreve em ${list("biba", "escrever")}.`,
      facts: [
        ["Ler", "só do seu nível ou acima"],
        ["Escrever", "só no seu nível ou abaixo"],
        ["Protege", "integridade"],
      ],
      highlight: ["ler", "escrever"],
    },
    () => {
      fill("biba", "ler");
      fill("biba", "escrever");
    },
  );

  b.step(
    {
      id: "s6-hoje",
      title: "Onde isso está hoje",
      subtitle: "SELinux e níveis de integridade",
      text: `Sistemas militares usaram Bell-LaPadula ao pé da letra. Hoje as ideias aparecem em mecanismos mais flexíveis: o SELinux e o AppArmor, no Linux, impõem regras que nem o dono do processo pode desligar. O Windows marca processos e arquivos com níveis de integridade, como Biba: um navegador em nível baixo não escreve nos arquivos do usuário, mesmo rodando como ele.`,
      facts: [
        ["Linux", "SELinux, AppArmor"],
        ["Windows", "níveis de integridade"],
        ["Ideia comum", "regras acima do dono"],
      ],
      highlight: ["dir"],
    },
    () => {
      c.state("dir", "confinado pela política", { tone: "good" });
    },
  );

  return b.done({ blpRead, blpWrite, bibaRead: count(matrix("biba", "ler")), subject: me.name });
}

const lesson: LessonModule = {
  meta: {
    slug: "politicas-obrigatorias",
    site: "so",
    title: "Políticas obrigatórias",
    summary:
      "Um cavalo de Troia vaza um segredo sem violar nenhuma permissão discricionária. Bell-LaPadula impede com não ler acima e não escrever abaixo; Biba inverte as regras para proteger a integridade.",
    area: "Segurança",
    refs: [
      { book: "maziero-so", chapter: 29, section: "29.4", note: "Políticas obrigatórias", verified: true },
      { book: "tanenbaum-mos", chapter: 9, section: "9.4.1", note: "Segurança multinível", verified: true },
    ],
    simplifications: [
      "Os níveis são uma ordem simples; o modelo completo também usa categorias.",
      "Biba usa aqui os mesmos três níveis, como se fossem de integridade.",
      "Não há sujeitos confiáveis que possam rebaixar dados.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "sujeito",
        kind: "choice",
        label: "Sujeito destacado",
        options: SUBJECTS.map((s, i) => ({ value: String(i), label: `${s.name} (${LEVELS[s.level]})` })),
      },
    ],
  },
  build,
  intro: {
    text: "Permissões comuns deixam o dono decidir, e isso não basta quando o programa do dono é malicioso. Você vai ver um segredo vazar sem nenhuma permissão violada e as duas regras que impedem isso, além da versão espelhada que protege a integridade.",
    facts: [
      ["Níveis", LEVELS.join(", ")],
      ["Modelos", "Bell-LaPadula e Biba"],
      ["Sujeitos", String(SUBJECTS.length)],
    ],
  },
  outro: {
    title: "Políticas obrigatórias em resumo",
    text: "Numa política obrigatória, o sistema rotula sujeitos e objetos e as regras valem até para o dono. Bell-LaPadula guarda o sigilo: não ler acima, não escrever abaixo. Biba guarda a integridade: não ler abaixo, não escrever acima. SELinux, AppArmor e os níveis de integridade do Windows levam essas ideias ao dia a dia.",
    facts: (r) => [
      ["Leituras BLP", `${r.stats.blpRead} de 9`],
      ["Escritas BLP", `${r.stats.blpWrite} de 9`],
      ["Leituras Biba", `${r.stats.bibaRead} de 9`],
    ],
  },
  next: ["controle-de-acesso", "senhas", "estouro-de-buffer"],
};

export default lesson;
