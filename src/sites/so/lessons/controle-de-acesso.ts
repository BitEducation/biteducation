import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import {
  acl,
  caps,
  type File,
  MATRIX,
  modeString,
  OBJECTS,
  type Right,
  SUBJECTS,
  type User,
  unixCheck,
} from "../../../sim/os/access.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { controleDeAcesso as practice } from "../practice.ts";

/**
 * Access control: the access matrix, stored by column (ACLs) or by row (capabilities), the nine
 * UNIX bits as a compressed ACL checked on open(), the owner who gets fewer rights than strangers,
 * and an open file descriptor that keeps working after chmod, because it behaves like a capability.
 */
export const DEFAULTS = { dono: 6, grupo: 4, outros: 0 };
const USERS: Record<string, User> = {
  ana: { name: "ana", groups: ["prof"] },
  bruno: { name: "bruno", groups: ["prof"] },
  carla: { name: "carla", groups: ["alunos"] },
};
const WANT: Record<Right, string> = { r: "ler", w: "escrever", x: "executar" };
/** Mode of the "owner has less" example: ---r--r--. */
const ODD = 0o044;
/** Mode used in the descriptor step, before and after chmod. */
const FD_BEFORE = 0o640;
const FD_AFTER = 0o000;

function clamp(p: Params) {
  const d = (v: unknown, def: number) => Math.min(7, Math.max(0, Math.round(Number(v ?? def))));
  const mode =
    (d(p.dono, DEFAULTS.dono) << 6) | (d(p.grupo, DEFAULTS.grupo) << 3) | d(p.outros, DEFAULTS.outros);
  return { mode };
}
const octal = (m: number) => m.toString(8).padStart(3, "0");

const scene: SceneSpec = {
  viewBox: [960, 600],
  nodes: [
    { id: "ana", kind: "process", label: "ana", sub: "dona, grupo prof", at: [95, 70], w: 140 },
    { id: "bruno", kind: "process", label: "bruno", sub: "grupo prof", at: [255, 70], w: 140 },
    { id: "carla", kind: "process", label: "carla", sub: "grupo alunos", at: [415, 70], w: 140 },
    { id: "kernel", kind: "kernel", label: "Kernel", sub: "confere no open()", at: [625, 70], w: 160 },
    { id: "arq", kind: "disk", label: "notas.txt", sub: "dono ana, grupo prof", at: [830, 70], w: 170 },
  ],
  links: [
    { id: "l-a", from: "ana", to: "kernel", style: "dashed" },
    { id: "l-b", from: "bruno", to: "kernel", style: "dashed" },
    { id: "l-c", from: "carla", to: "kernel", style: "dashed" },
    { id: "l-k", from: "kernel", to: "arq" },
  ],
  widgets: [
    {
      kind: "table",
      id: "matriz",
      title: "Matriz de acesso: linhas são sujeitos, colunas são objetos",
      at: [40, 170],
      columns: ["Sujeito", ...OBJECTS],
      widths: [100, 110, 110, 110],
      rows: SUBJECTS.length,
    },
    {
      kind: "table",
      id: "guarda",
      title: "Onde a matriz é guardada",
      at: [40, 390],
      columns: ["Guardado com", "Entradas"],
      widths: [150, 300],
      rows: 4,
    },
    {
      kind: "table",
      id: "pedidos",
      title: "Pedidos a notas.txt",
      at: [530, 170],
      columns: ["Pedido", "Classe", "Bits", "Resultado"],
      widths: [170, 70, 60, 90],
      rows: 8,
    },
  ],
};

export function build(p: Params) {
  const { mode } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, { ana: "ana", bruno: "bruno", carla: "carla", kernel: "kernel", arq: "notas.txt" }, (t) =>
    String(t),
  );
  const file: File = { owner: "ana", group: "prof", mode };
  const ms = modeString(mode);
  const cells = SUBJECTS.length * OBJECTS.length;
  const filled = SUBJECTS.reduce((s, x) => s + MATRIX[x].filter(Boolean).length, 0);
  let line = 0;

  const ask = (who: string, want: Right, f: File, note?: string) => {
    const r = unixCheck(f, USERS[who] as User, want);
    c.send(who, "kernel", `open(${want})`, { what: `${who} quer ${WANT[want]}`, detail: modeString(f.mode) });
    c.row(
      "pedidos",
      line++,
      [`${who} ${WANT[want]}${note ? ` (${note})` : ""}`, r.cls, r.bits, r.ok ? "permitido" : "negado"],
      {
        dt: 0,
        mark: r.ok ? "hit" : "bad",
      },
    );
    c.state(who, r.ok ? "permitido" : "negado", {
      dt: 0,
      tone: r.ok ? "good" : "bad",
      label: `${who}: ${r.ok ? "permitido" : "negado"}${note ? ` (${note})` : ""}`,
    });
    return r;
  };
  const requests: [string, Right][] = [
    ["ana", "w"],
    ["bruno", "r"],
    ["bruno", "w"],
    ["carla", "r"],
  ];
  const results = requests.map(([who, want]) => ({
    who,
    want,
    ...unixCheck(file, USERS[who] as User, want),
  }));
  const brunoW = results[2];
  const odd = unixCheck({ ...file, mode: ODD }, USERS.ana as User, "r");
  const oddOther = unixCheck({ ...file, mode: ODD }, USERS.carla as User, "r");
  const granted = results.filter((r) => r.ok).length;

  b.step(
    {
      id: "s1-matriz",
      title: "Quem pode o quê",
      subtitle: `${SUBJECTS.length} sujeitos, ${OBJECTS.length} objetos`,
      text: `Toda decisão de acesso responde a uma pergunta: este sujeito pode fazer esta operação neste objeto? A resposta completa cabe numa [[matriz-de-acesso]], com uma linha por usuário ou processo e uma coluna por arquivo ou dispositivo. Aqui ela tem ${cells} células, e só ${filled} dão algum direito. Num sistema real, com milhares de usuários e milhões de arquivos, quase todas as células ficam vazias, então ninguém guarda a matriz inteira.`,
      facts: [
        ["Células", String(cells)],
        ["Com direito", String(filled)],
        ["Vazias", String(cells - filled)],
      ],
      highlight: ["matriz"],
    },
    () => {
      SUBJECTS.forEach((s, i) => {
        c.row("matriz", i, [s, ...MATRIX[s].map((x) => x || "–")], { dt: 1, mark: "new" });
      });
    },
  );

  b.step(
    {
      id: "s2-acl",
      title: "Guardar por objeto",
      subtitle: "Uma lista em cada arquivo",
      text: `Cortando a matriz em colunas, cada objeto guarda a sua [[acl]], a lista de quem pode fazer o quê com ele. A lista de notas.txt é "${acl(0).join(", ")}". Responder "quem lê notas.txt?" é olhar uma lista só, e tirar o acesso de bruno é apagar uma entrada. A pergunta inversa, "o que bruno pode fazer?", obriga a visitar todos os objetos. É o modelo dos sistemas de arquivos: NTFS e as ACLs POSIX do Linux.`,
      facts: [
        ["Guardada com", "o objeto"],
        ["Revogar", "fácil"],
        ["Tudo de um sujeito", "difícil"],
      ],
      highlight: ["guarda"],
    },
    () => {
      OBJECTS.slice(0, 2).forEach((o, i) => {
        c.row("guarda", i, [`ACL de ${o}`, acl(i).join(", ")], { dt: 1, mark: "new" });
      });
    },
  );

  b.step(
    {
      id: "s3-capacidade",
      title: "Guardar por sujeito",
      subtitle: "Uma lista em cada processo",
      text: `Cortando em linhas, cada sujeito carrega a sua lista de [[capacidade|capacidades]], como fichas que provam o direito: a de carla é "${caps("carla").join(", ")}". Conferir é ver se o processo tem a ficha, sem consultar o objeto, e passá-la a outro processo delega o direito. O lado ruim é revogar: as fichas estão espalhadas pelos processos. Sistemas como o seL4 e o Capsicum do FreeBSD são construídos assim.`,
      facts: [
        ["Guardada com", "o sujeito"],
        ["Delegar", "passar a ficha"],
        ["Revogar", "difícil"],
      ],
      highlight: ["guarda"],
    },
    () => {
      (["carla", "backup"] as const).forEach((s, i) => {
        c.row("guarda", 2 + i, [`fichas de ${s}`, caps(s).join(", ")], { dt: 1, mark: "warn" });
      });
    },
  );

  b.step(
    {
      id: "s4-unix",
      title: "UNIX em nove bits",
      subtitle: `notas.txt com ${ms} (${octal(mode)})`,
      text: `O UNIX comprime a ACL em nove bits: três para o dono, três para o grupo e três para os outros. Com ${ms}, o kernel decide no open() olhando uma classe só: se você é o dono, valem os bits do dono; senão, se está no grupo, os do grupo; senão, os de outros. Dos ${requests.length} pedidos, ${granted} ${granted === 1 ? "passa" : "passam"}. Bruno, do grupo prof, recebe "${brunoW?.bits}" e ${brunoW?.ok ? "pode" : "não pode"} escrever.`,
      facts: [
        ["Modo", `${ms} (${octal(mode)})`],
        ["Permitidos", `${granted} de ${requests.length}`],
        ["Bruno usa", "bits do grupo"],
      ],
      highlight: ["pedidos", "kernel"],
      quiz: {
        kind: "choice",
        prompt: `notas.txt tem ${ms}, dono ana e grupo prof. Que bits o kernel olha quando bruno, do grupo prof, pede para escrever?`,
        options: [
          `Os do grupo, "${brunoW?.bits}"`,
          "Os do dono e os do grupo, somados",
          "Os de outros, porque bruno não é o dono",
        ],
        answer: 0,
        explain: `Bruno não é o dono e está no grupo prof, então valem só os bits do grupo: "${brunoW?.bits}", que ${brunoW?.ok ? "incluem" : "não incluem"} o w.`,
      },
    },
    () => {
      for (const [who, want] of requests) ask(who, want, file);
    },
  );

  b.step(
    {
      id: "s5-dono",
      title: "O dono com menos",
      subtitle: `${modeString(ODD)}`,
      text: `Como só uma classe vale, dá para o dono ter menos que um estranho. Com ${modeString(ODD)}, ana pede para ler: ela é a dona, os bits do dono são "${odd.bits}" e o pedido é ${odd.ok ? "aceito" : "negado"}. Carla, que cai em outros, ${oddOther.ok ? "consegue ler" : "também não lê"}. O kernel não continua procurando uma classe mais generosa. Ana ainda pode mudar o modo com chmod, porque esse poder vem de ser dona, não dos bits.`,
      facts: [
        ["Modo", modeString(ODD)],
        ["ana (dona)", odd.ok ? "lê" : "não lê"],
        ["carla (outros)", oddOther.ok ? "lê" : "não lê"],
      ],
      highlight: ["pedidos"],
    },
    () => {
      ask("ana", "r", { ...file, mode: ODD });
      ask("carla", "r", { ...file, mode: ODD });
    },
  );

  const before = unixCheck({ ...file, mode: FD_BEFORE }, USERS.ana as User, "r");
  const after = unixCheck({ ...file, mode: FD_AFTER }, USERS.ana as User, "r");
  b.step(
    {
      id: "s6-descritor",
      quiz: {
        kind: "choice",
        prompt:
          "Ana abriu notas.txt para leitura e depois o modo virou ---------. O read(3) dela ainda funciona?",
        options: [
          "Sim: o descritor já aberto continua valendo",
          "Não: o kernel confere os bits a cada read()",
          "Só se ana for do grupo do arquivo",
        ],
        answer: 0,
        explain:
          "Os bits são conferidos no open(). O descritor que ele devolve funciona como uma ficha: quem o tem continua lendo, mesmo que o modo mude depois.",
      },
      title: "O descritor é uma ficha",
      subtitle: "Conferido uma vez, no open()",
      text: `O kernel confere os bits só no open(). Com ${modeString(FD_BEFORE)}, ana abre notas.txt para leitura e recebe o descritor 3. Em seguida o arquivo vira ${modeString(FD_AFTER)}: um open() novo é ${after.ok ? "aceito" : "negado"}, mas read(3) continua funcionando, porque o descritor aberto age como uma capacidade. Por isso um serviço deve abrir o que precisa e só depois largar privilégios, e tirar um direito nem sempre corta quem já tem o arquivo aberto.`,
      facts: [
        ["open() antes", before.ok ? "aceito" : "negado"],
        ["open() depois", after.ok ? "aceito" : "negado"],
        ["read(3) depois", "funciona"],
      ],
      highlight: ["ana", "kernel"],
    },
    () => {
      ask("ana", "r", { ...file, mode: FD_BEFORE }, "fd 3");
      c.state("arq", modeString(FD_AFTER), { tone: "warn", label: `chmod ${octal(FD_AFTER)} em notas.txt` });
      c.send("ana", "kernel", "read(3)", { what: "ana lê pelo fd 3", detail: "sem nova conferência" });
      c.send("kernel", "arq", "lê", { dt: 1, what: "bytes de notas.txt" });
      ask("ana", "r", { ...file, mode: FD_AFTER }, "open() novo");
    },
  );

  return b.done({
    mode: ms,
    granted,
    brunoWrite: brunoW?.ok ? "sim" : "não",
    ownerOdd: odd.ok ? "sim" : "não",
    othersOdd: oddOther.ok ? "sim" : "não",
    filled,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "controle-de-acesso",
    site: "so",
    title: "Controle de acesso: ACLs, capacidades e os bits do UNIX",
    summary:
      "A matriz de quem pode o quê, guardada por objeto ou por sujeito, os nove bits do UNIX conferidos no open(), o dono com menos direitos que um estranho e o descritor que sobrevive a um chmod.",
    area: "Segurança",
    refs: [
      {
        book: "tanenbaum-mos",
        chapter: 9,
        section: "9.3",
        note: "Controlando o acesso aos recursos",
        verified: true,
      },
      { book: "maziero-so", chapter: 29, section: "29.3", note: "Políticas discricionárias", verified: true },
      {
        book: "maziero-so",
        chapter: 29,
        section: "29.7",
        note: "Mecanismos de controle de acesso",
        verified: true,
      },
    ],
    simplifications: [
      "Sem root, que passa por cima dos bits, nem setuid.",
      "Sem ACLs POSIX estendidas, que somam entradas aos nove bits.",
      "Diretórios também têm bits e precisam de x para serem atravessados; aqui só há um arquivo.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "dono", kind: "int", label: "Bits do dono (0–7)", min: 0, max: 7 },
      { key: "grupo", kind: "int", label: "Bits do grupo (0–7)", min: 0, max: 7 },
      { key: "outros", kind: "int", label: "Bits de outros (0–7)", min: 0, max: 7 },
    ],
  },
  build,
  intro: {
    text: "Quando um programa abre um arquivo, o kernel decide na hora se ele pode. Você vai ver a matriz que descreve todos os direitos, as duas formas de guardá-la, como o UNIX resume tudo em nove bits e por que um arquivo já aberto escapa de um chmod.",
    facts: [
      ["Arquivo", "notas.txt"],
      ["Modo", `${modeString((DEFAULTS.dono << 6) | (DEFAULTS.grupo << 3) | DEFAULTS.outros)}`],
      ["Usuários", "ana, bruno, carla"],
    ],
  },
  outro: {
    title: "Controle de acesso em resumo",
    text: "A matriz de acesso diz quem pode o quê. Guardada por objeto, vira ACL: fácil de revogar e de auditar por arquivo. Guardada por sujeito, vira lista de capacidades: fácil de delegar, difícil de revogar. O UNIX usa nove bits e escolhe uma classe só, e o descritor aberto funciona como capacidade até ser fechado.",
    facts: (run) => [
      ["Modo", String(run.stats.mode)],
      ["Pedidos permitidos", `${run.stats.granted} de 4`],
      ["Dona com ---r--r--", run.stats.ownerOdd === "sim" ? "lê" : "não lê"],
    ],
  },
  next: ["chamada-de-sistema", "inodes", "virtualizacao"],
  practice,
};

export default lesson;
