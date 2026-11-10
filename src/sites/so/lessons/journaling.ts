import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import {
  COMMIT_AT,
  FULL,
  inodeBytes,
  type Outcome,
  type Part,
  partialCrashes,
  recover,
  writesFor,
} from "../../../sim/os/journal.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Crash consistency: appending a block touches bitmap, inode and data; partial writes corrupt the
 * file system; fsck must scan everything; a journal with a commit record makes recovery cheap.
 */
export const DEFAULTS = { queda: 3, blocos: 64, disco: 4 };
const MB_S = 200;
const NAME: Record<Part, string> = { B: "bitmap", I: "inode", D: "dado" };
/** Disk cells: bitmap, inode, five journal slots, data block. */
const CELL = { B: 0, I: 1, TxB: 2, jI: 3, jB: 4, jD: 5, TxE: 6, D: 7 } as const;
const SEV: Record<Outcome["severity"], { label: string; role: Role }> = {
  ok: { label: "coerente", role: "crypto" },
  warn: { label: "vazamento", role: "warn" },
  bad: { label: "corrompido", role: "bad" },
};

const num = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const dec = (x: number) => x.toFixed(1).replace(".", ",");

function clamp(p: Params) {
  const crash = Math.min(FULL.length, Math.max(0, Math.round(Number(p.queda ?? DEFAULTS.queda))));
  const blocks = Math.min(256, Math.max(1, Math.round(Number(p.blocos ?? DEFAULTS.blocos))));
  const tb = Math.min(20, Math.max(1, Math.round(Number(p.disco ?? DEFAULTS.disco))));
  return { crash, blocks, tb };
}

function explainCrash(o: Outcome): string {
  const parts: string[] = [];
  if (o.garbage) parts.push("inode → 300 com conteúdo antigo: lê lixo");
  if (o.doubleUse) parts.push("bitmap diz livre: o 300 pode ir a outro arquivo");
  if (o.leak) parts.push("300 usado sem dono: espaço vaza");
  if (o.lost && !o.leak) parts.push("dado sem referência: só a escrita se perde");
  return parts.join("; ");
}

function scene(): SceneSpec {
  return {
    viewBox: [960, 600],
    nodes: [],
    links: [],
    widgets: [
      {
        kind: "grid",
        id: "disco",
        title: "Disco: bitmap, inode 12, diário (5 blocos) e bloco de dados 300",
        at: [40, 50],
        cols: 8,
        rows: 1,
        cellW: 106,
        indexLabel: "none",
      },
      {
        kind: "table",
        id: "quedas",
        title: "Queda no meio do append: o que chegou ao disco",
        at: [40, 150],
        columns: ["No disco", "O que acontece", "Estado"],
        widths: [110, 600, 100],
        rows: 6,
      },
      { kind: "counter", id: "escritas", title: "Escritas no disco", at: [40, 380] },
      { kind: "counter", id: "fsck", title: "fsck lê", at: [210, 380] },
      { kind: "counter", id: "recup", title: "Recuperação lê", at: [380, 380] },
      { kind: "counter", id: "completo", title: "Diário completo", at: [550, 380] },
      { kind: "counter", id: "ordenado", title: "Só metadados", at: [720, 380] },
    ],
  };
}

export function build(p: Params) {
  const { crash, blocks, tb } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));

  const before = ["bitmap: livre", "inode: vazio", "TxB", "I", "B", "D", "TxE", "300: antigo"];
  const after: Record<Part, string> = { B: "bitmap: usado", I: "inode → 300", D: "300: novo" };
  const reset = () => {
    before.forEach((v, i) => {
      c.cell("disco", i, i >= CELL.TxB && i <= CELL.TxE ? "·" : v, { role: "muted" });
    });
  };
  const home = (part: Part, mark: "new" | "dirty" = "new") =>
    c.cell("disco", CELL[part], after[part], { dt: 1, mark, role: "a" });
  const journal = (what: (typeof FULL)[number]["what"]) => {
    const idx =
      what === "TxB"
        ? CELL.TxB
        : what === "TxE"
          ? CELL.TxE
          : what === "I"
            ? CELL.jI
            : what === "B"
              ? CELL.jB
              : CELL.jD;
    c.cell("disco", idx, what === "TxB" || what === "TxE" ? what : `diário: ${NAME[what]}`, {
      dt: 1,
      mark: "new",
      role: what === "TxE" ? "crypto" : "ctrl",
    });
  };

  const crashes = partialCrashes();
  const bad = crashes.filter((o) => o.severity === "bad").length;
  const warn = crashes.filter((o) => o.severity === "warn").length;
  const harmless = crashes.find((o) => o.severity === "ok");
  const inodes = (tb * 1e12) / 16384;
  const table = inodeBytes(tb * 1e12);
  const fsckMin = table / (MB_S * 1e6) / 60;
  const action = recover(crash);
  const w1 = writesFor(1);
  const wn = writesFor(blocks);

  b.step(
    {
      id: "s1-tres",
      title: "Um append, três blocos",
      subtitle: "bitmap, inode e dado",
      text: `Acrescentar um bloco ao fim de um arquivo parece uma operação só, mas mexe em três lugares do disco: o bitmap de blocos livres marca o bloco 300 como usado, o [[inode]] 12 passa a apontar para ele e o próprio bloco 300 recebe os dados. São ${w1.plain} escritas independentes, e o escalonador do disco pode fazê-las em qualquer ordem. Se a energia cai entre uma e outra, o disco fica com só parte delas.`,
      facts: [
        ["Bitmap", "300 livre → usado"],
        ["Inode 12", "0 → 1 bloco"],
        ["Bloco 300", "antigo → novo"],
      ],
      highlight: [],
    },
    () => {
      reset();
      for (let i = 0; i < 6; i++) c.row("quedas", i, ["", "", ""], { role: "muted" });
      for (const part of ["B", "I", "D"] as Part[]) home(part);
      c.count("escritas", String(w1.plain), { label: `${w1.plain} escritas` });
    },
  );

  b.step(
    {
      id: "s2-queda",
      title: "Queda no meio do caminho",
      subtitle: `${bad} corrompem, ${warn} vazam`,
      text: `Há ${crashes.length} jeitos de a queda deixar só parte das escritas. Em ${bad} deles o sistema de arquivos fica corrompido: um arquivo lê lixo ou um bloco pode acabar em dois arquivos. Em ${warn}, espaço vaza. Só ${harmless ? `quando apenas o ${NAME[harmless.written[0] ?? "D"]} chega ao disco` : "um caso"} o resultado é coerente, porque nada aponta para ele ainda. O sistema não sabe qual caso aconteceu: só sabe que não desligou direito.`,
      facts: [
        ["Combinações", String(crashes.length)],
        ["Corrompem", String(bad)],
        ["Vazam espaço", String(warn)],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: "Qual queda parcial deixa o sistema de arquivos coerente?",
        options: ["Só o dado gravado", "Só o inode gravado", "Bitmap e inode gravados"],
        answer: 0,
        explain:
          "Sem o inode, ninguém aponta para o bloco novo: a escrita some, mas nada fica inconsistente.",
      },
    },
    () => {
      reset();
      crashes.forEach((o, i) => {
        c.row(
          "quedas",
          i,
          [o.written.map((x) => NAME[x]).join(" + "), explainCrash(o), SEV[o.severity].label],
          {
            dt: 1,
            mark: o.severity === "ok" ? "hit" : o.severity === "warn" ? "warn" : "bad",
            role: SEV[o.severity].role,
          },
        );
      });
    },
  );

  b.step(
    {
      id: "s3-fsck",
      title: "fsck confere tudo",
      subtitle: `${dec(fsckMin)} min só lendo inodes`,
      text: `Sem saber o que estava em andamento, a saída antiga é o fsck: ler todos os inodes e bitmaps e conferir se batem. Num disco de ${tb} TB, com um inode a cada 16 KiB, são ${num(inodes)} inodes e ${dec(table / 1e9)} GB de tabela; a ${MB_S} MB/s, ${dec(fsckMin)} min antes de começar a conferir. E mesmo assim o fsck não sabe consertar o caso do lixo: o inode e o bitmap batem, só o conteúdo está errado.`,
      facts: [
        ["Inodes", num(inodes)],
        ["Tabela", `${dec(table / 1e9)} GB`],
        ["Leitura", `${dec(fsckMin)} min`],
      ],
      highlight: [],
    },
    () => {
      c.count("fsck", `${dec(table / 1e9)} GB`, { label: `${dec(fsckMin)} min a ${MB_S} MB/s`, dt: 1 });
    },
  );

  b.step(
    {
      id: "s4-diario",
      title: "Primeiro no diário",
      subtitle: `${FULL.length} escritas em vez de ${w1.plain}`,
      text: `O [[journaling]] reserva uma área do disco, o diário. Antes de tocar nos lugares definitivos, grava lá um bloco de início TxB e cópias do inode, do bitmap e do dado. Quando esses chegam ao disco, grava o TxE, o [[registro-de-confirmacao]]: a partir dele a transação conta como feita. Só então copia os blocos para os lugares certos, o checkpoint. São ${FULL.length} escritas em vez de ${w1.plain}, em troca de nunca ficar no meio do caminho.`,
      facts: [
        ["Diário", `${COMMIT_AT} escritas`],
        ["Checkpoint", `${FULL.length - COMMIT_AT} escritas`],
        ["Sem diário", `${w1.plain} escritas`],
      ],
      highlight: [],
    },
    () => {
      reset();
      for (const w of FULL) {
        if (w.region === "journal") journal(w.what);
        else home(w.what as Part, "dirty");
      }
      c.count("escritas", String(FULL.length), { label: `${FULL.length} escritas com diário` });
    },
  );

  const recText =
    action === "nothing"
      ? "Nada tinha sido gravado: o disco está exatamente como antes, e não há o que recuperar."
      : action === "discard"
        ? `${crash === 1 ? `Só 1 das ${COMMIT_AT} escritas do diário chegou` : `Só ${crash} das ${COMMIT_AT} escritas do diário chegaram`}, sem o TxE. A transação não foi confirmada, então a recuperação a descarta: o arquivo fica como era antes do append, coerente, e os lugares definitivos nunca foram tocados.`
        : action === "replay"
          ? `O TxE estava no disco: a transação foi confirmada, mas o checkpoint ${crash === COMMIT_AT ? "nem começou" : `parou depois de ${crash - COMMIT_AT} das ${FULL.length - COMMIT_AT} cópias`}. A recuperação regrava as três a partir do diário. Regravar o que já estava certo não estraga nada, e o arquivo termina com o bloco novo.`
          : "Todas as escritas terminaram, checkpoint incluído. A recuperação vê a transação completa e só libera o espaço do diário.";
  b.step(
    {
      id: "s5-recupera",
      title: "Recuperar lendo só o diário",
      subtitle: `queda após ${crash} de ${FULL.length} escritas`,
      text: `${recText} Em todos os casos, a recuperação lê só as transações pendentes do diário, ${COMMIT_AT} blocos aqui, em vez dos ${dec(table / 1e9)} GB do fsck. Mude no laboratório o ponto da queda.`,
      facts: [
        ["Escritas antes da queda", `${crash} de ${FULL.length}`],
        ["TxE no disco", crash >= COMMIT_AT ? "sim" : "não"],
        ["Recuperação", action === "discard" ? "descarta" : action === "replay" ? "refaz" : "nada a fazer"],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: "O que decide se a recuperação refaz ou descarta a transação?",
        options: ["O TxE estar no diário", "O dado estar no diário", "O fsck"],
        answer: 0,
        explain:
          "Sem o registro de confirmação a transação não aconteceu; com ele, tudo o que está no diário é regravado.",
      },
    },
    () => {
      reset();
      FULL.slice(0, crash).forEach((w) => {
        if (w.region === "journal") journal(w.what);
        else home(w.what as Part, "dirty");
      });
      c.note("disco", `queda após ${crash} escritas`, "bad", { dt: 1 });
      if (action === "discard") {
        for (const k of [CELL.TxB, CELL.jI, CELL.jB, CELL.jD])
          c.cell("disco", k, "·", { dt: k === CELL.TxB ? 1 : 0, mark: "evict", role: "muted" });
      } else if (action === "replay") {
        for (const part of ["I", "B", "D"] as Part[]) home(part);
      }
      c.count("recup", `${COMMIT_AT} blocos`, { label: `diário: ${COMMIT_AT} blocos` });
    },
  );

  b.step(
    {
      id: "s6-ordenado",
      title: "Só os metadados no diário",
      subtitle: `${num(wn.full)} contra ${num(wn.ordered)} escritas`,
      text: `Gravar os dados duas vezes custa caro em escritas grandes. Num append de ${blocks} ${blocks === 1 ? "bloco" : "blocos"}, o diário completo faz ${num(wn.full)} escritas; o modo ordenado, padrão do ext4, faz ${num(wn.ordered)}. Ele grava os dados direto no lugar final e só depois registra inode e bitmap no diário. Se cair antes do TxE, os dados novos ficam num bloco que nada referencia, o caso coerente que vimos. Os metadados nunca apontam para lixo.`,
      facts: [
        ["Sem diário", `${num(wn.plain)} escritas`],
        ["Diário completo", `${num(wn.full)} escritas`],
        ["Ordenado", `${num(wn.ordered)} escritas`],
      ],
      highlight: [],
    },
    () => {
      reset();
      home("D");
      journal("TxB");
      journal("I");
      journal("B");
      journal("TxE");
      home("I", "dirty");
      home("B", "dirty");
      c.count("escritas", num(wn.plain), { label: `sem diário: ${num(wn.plain)}`, dt: 1 });
      c.count("completo", num(wn.full), { label: `diário completo: ${num(wn.full)}` });
      c.count("ordenado", num(wn.ordered), { label: `só metadados: ${num(wn.ordered)}` });
    },
  );

  return b.done({
    partial: crashes.length,
    bad,
    warn,
    fsckMin: dec(fsckMin),
    action,
    full: wn.full,
    ordered: wn.ordered,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "journaling",
    site: "so",
    title: "Journaling: sobreviver a uma queda",
    summary:
      "Por que acrescentar um bloco a um arquivo pode corromper o sistema de arquivos se a energia cai no meio, quanto custa o fsck, e como um diário com registro de confirmação torna a recuperação rápida; e o modo ordenado do ext4.",
    area: "Arquivos e E/S",
    refs: [
      {
        book: "tanenbaum-mos",
        chapter: 4,
        section: "4.3.6",
        note: "Sistemas de arquivos journaling",
        verified: true,
      },
      {
        book: "maziero-so",
        chapter: 24,
        section: "24.7.2",
        note: "Sistemas de arquivos com registro (journal)",
        verified: true,
      },
    ],
    simplifications: [
      "Cada escrita de bloco é atômica: ou chega inteira ao disco, ou não chega.",
      "O diário guarda uma transação por vez; sistemas reais agrupam várias num só commit.",
      "O fsck é medido só pela leitura da tabela de inodes, a parte que cresce com o disco.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "queda",
        kind: "int",
        label: "Queda depois de quantas escritas (passo 5)",
        min: 0,
        max: FULL.length,
        help: `As ${COMMIT_AT} primeiras vão para o diário; a ${COMMIT_AT}ª é o TxE.`,
      },
      { key: "blocos", kind: "int", label: "Blocos no append (passo 6)", min: 1, max: 256 },
      { key: "disco", kind: "int", label: "Tamanho do disco (TB)", min: 1, max: 20 },
    ],
  },
  build,
  intro: {
    text: "A energia cai enquanto o sistema grava um arquivo. Ao religar, o disco pode estar num estado que nenhum programa pediu. Você vai ver o que dá errado, quanto custa conferir tudo e como um diário resolve o problema com uma escrita a mais.",
    facts: [
      ["Operação", "append de 1 bloco"],
      ["Blocos tocados", "3"],
      ["Diário", "5 blocos"],
    ],
  },
  outro: {
    title: "Journaling em resumo",
    text: "Uma operação de arquivo escreve vários blocos, e uma queda pode deixar só parte deles, corrompendo o sistema de arquivos. O fsck confere tudo e demora proporcionalmente ao disco. O journaling grava a operação num diário, confirma com um TxE e só depois a aplica; na recuperação basta refazer o que foi confirmado e descartar o resto. O modo ordenado registra só os metadados e grava os dados antes.",
    facts: (run) => [
      ["Quedas que corrompem", `${run.stats.bad} de ${run.stats.partial}`],
      ["fsck", `${run.stats.fsckMin} min`],
      ["Completo × ordenado", `${run.stats.full} × ${run.stats.ordered}`],
    ],
  },
  next: ["inodes", "raid"],
};

export default lesson;
