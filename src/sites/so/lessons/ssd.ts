import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { BLOCKS, LOGICAL, PAGES, type Slot, type SsdOp, ssdRun } from "../../../sim/os/ssd.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { num } from "../../shared/practice-kit.ts";
import { ssd as practice } from "../practice.ts";

/**
 * SSD internals: flash writes pages but erases only whole blocks, so the FTL writes out of
 * place and garbage-collects. Without TRIM the SSD keeps copying data the file system already
 * deleted, which shows up as write amplification. Wear leveling and reserve close the lesson.
 */
export const DEFAULTS = { reescritas: 2, trim: "nao" };

function clamp(p: Params) {
  const r = Math.min(3, Math.max(1, Math.round(Number(p.reescritas ?? DEFAULTS.reescritas))));
  return { r, trim: p.trim === "sim" };
}

function scene(): SceneSpec {
  return {
    viewBox: [960, 600],
    nodes: [
      {
        id: "fs",
        kind: "kernel",
        label: "Sistema de arquivos",
        sub: "endereços lógicos L0…",
        at: [180, 70],
        w: 220,
      },
      { id: "ftl", kind: "cpu", label: "Controlador (FTL)", sub: "lógico → físico", at: [560, 70], w: 220 },
    ],
    links: [{ id: "l-f", from: "fs", to: "ftl" }],
    widgets: [
      {
        kind: "grid",
        id: "flash",
        title: `Flash: ${BLOCKS} blocos (colunas) de ${PAGES} páginas; ✗ = cópia inválida`,
        at: [40, 170],
        cols: BLOCKS,
        rows: PAGES,
        cellW: 110,
        indexLabel: "none",
      },
      { kind: "counter", id: "host", title: "Escritas pedidas", at: [640, 180] },
      { kind: "counter", id: "flashw", title: "Escritas na flash", at: [640, 260] },
      { kind: "counter", id: "erase", title: "Apagamentos de bloco", at: [640, 340] },
      {
        kind: "table",
        id: "wa",
        title: "Amplificação de escrita na fase de reescrita",
        at: [40, 450],
        columns: ["Com TRIM?", "Vítima", "Cópias", "Pedidas → na flash", "Fator"],
        widths: [130, 120, 110, 260, 120],
        rows: 2,
      },
    ],
  };
}

const label = (s: Slot) => (s ? `L${s.lpn}${s.valid ? "" : " ✗"}` : "");

export function build(p: Params) {
  const { r, trim } = clamp(p);
  const run = ssdRun(r, trim);
  const other = ssdRun(r, !trim);
  const b = lessonBuilder();
  const c = talk(b, { fs: "sistema de arquivos", ftl: "FTL" }, (t) => `t${t}`);
  let shown: Slot[][] = Array.from({ length: BLOCKS }, () => Array<Slot>(PAGES).fill(null));
  const draw = (op: SsdOp, gc = false) => {
    op.flash.forEach((blk, bi) => {
      blk.forEach((s, pi) => {
        const prev = shown[bi]?.[pi] ?? null;
        if (label(prev) === label(s)) return;
        const mark = s === null ? "flush" : !s.valid ? "evict" : gc && prev === null ? "dirty" : "new";
        c.cell("flash", pi * BLOCKS + bi, label(s), { mark, dt: 0 });
      });
    });
    shown = op.flash;
    c.count("host", String(op.hostWrites), { label: `${op.hostWrites} pedidas` });
    c.count("flashw", String(op.flashWrites), { label: `${op.flashWrites} na flash` });
    c.count("erase", String(op.erases.reduce((a, x) => a + x, 0)), { label: "apagamentos" });
  };
  const ops = (ph: SsdOp["phase"]) => run.ops.filter((o) => o.phase === ph);
  const pl = (k: number, one: string, many: string) => (k === 1 ? one : many);
  const rewritten = r === 1 ? "L0" : `L0 a L${r - 1}`;
  const fator = (x: number) => num(x);

  b.step(
    {
      id: "s1-paginas-blocos",
      title: "Página escreve, bloco apaga",
      subtitle: `${LOGICAL} páginas gravadas`,
      text: `A memória flash grava em páginas, de alguns KiB, mas só apaga blocos inteiros, de centenas de páginas, e uma página só pode ser gravada depois de apagada. Aqui cada bloco tem ${PAGES} páginas. O sistema de arquivos grava os endereços lógicos L0 a L${LOGICAL - 1}, e o controlador os põe em sequência nos blocos 0, 1 e 2.`,
      facts: [
        ["Blocos", String(BLOCKS)],
        ["Páginas por bloco", String(PAGES)],
        ["Capacidade anunciada", `${LOGICAL} páginas`],
      ],
      highlight: ["flash"],
    },
    () => {
      c.send("fs", "ftl", `grava L0…L${LOGICAL - 1}`, { what: "escrita", detail: `${LOGICAL} páginas` });
      for (const op of ops("escreve")) draw(op);
    },
  );

  b.step(
    {
      id: "s2-apagar",
      title: trim ? "Apagar com TRIM" : "Apagar sem avisar",
      subtitle: "Arquivo com L4 a L7",
      text: trim
        ? `Um arquivo que ocupava L4 a L7 é apagado. O sistema de arquivos marca esses endereços como livres e manda ao SSD o comando [[trim|TRIM]]: "L4 a L7 não guardam mais nada". O controlador marca as quatro páginas do bloco 1 como inválidas. Nenhum byte foi apagado ainda, mas agora o SSD sabe que pode descartá-las.`
        : `Um arquivo que ocupava L4 a L7 é apagado. O sistema de arquivos marca esses endereços como livres na própria tabela, mas sem [[trim|TRIM]] não avisa o SSD. Para o controlador, as quatro páginas do bloco 1 continuam válidas: ele vai preservá-las como se fossem dados importantes.`,
      facts: [
        ["Arquivo apagado", "L4 a L7"],
        ["TRIM", trim ? "enviado" : "não"],
        ["Bloco 1 para o SSD", trim ? "4 inválidas" : "4 válidas"],
      ],
      highlight: ["fs", "flash"],
    },
    () => {
      if (trim) c.send("fs", "ftl", "TRIM L4…L7", { what: "TRIM", detail: "endereços livres" });
      else c.state("fs", "apaga o arquivo e não avisa", { tone: "warn" });
      for (const op of ops("apaga")) draw(op);
    },
  );

  b.step(
    {
      id: "s3-fora-do-lugar",
      title: "Reescrever em outro lugar",
      subtitle: `Reescreve ${rewritten}`,
      text: `O sistema de arquivos reescreve ${rewritten}. O controlador não pode gravar por cima: apagar o bloco 0 inteiro para mudar ${pl(r, "uma página", `${r} páginas`)} seria lento e gastaria o bloco. Então grava a versão nova numa página livre do bloco 3, atualiza o mapa lógico → físico e marca a cópia antiga como inválida. É a [[ftl|FTL]] trabalhando.`,
      facts: [
        ["Reescritas", String(r)],
        ["Inválidas no bloco 0", String(r)],
        ["Blocos livres", "1, a reserva"],
      ],
      highlight: ["ftl", "flash"],
      quiz: {
        kind: "choice",
        prompt: "Por que o controlador grava a versão nova em outra página em vez de no mesmo lugar?",
        options: [
          "A flash só regrava depois de apagar, e só apaga blocos inteiros",
          "Para manter uma cópia de segurança da versão antiga",
          "Porque o sistema de arquivos pediu outro endereço lógico",
        ],
        answer: 0,
        explain:
          "Gravar no lugar exigiria copiar as outras páginas do bloco, apagá-lo e regravar tudo. Escrever em página livre e marcar a antiga como inválida é muito mais barato agora; a conta chega na coleta de lixo.",
      },
    },
    () => {
      c.send("fs", "ftl", `reescreve ${rewritten}`, {
        what: "escrita",
        detail: `${r} ${pl(r, "página", "páginas")}`,
      });
      for (const op of ops("reescreve")) draw(op);
    },
  );

  b.step(
    {
      id: "s4-coleta",
      title: "Coleta de lixo",
      subtitle: `Vítima: bloco ${run.victim}`,
      text: run.copies
        ? `Sobrou só o bloco de reserva, e o controlador precisa liberar outro. Ele escolhe o bloco cheio com mais páginas inválidas: o bloco ${run.victim}, com ${run.victimInvalid}. Antes de apagá-lo, copia as ${run.copies} ${pl(run.copies, "página válida", "páginas válidas")} para o bloco 3. O bloco 1, com o arquivo apagado, tinha mais lixo de verdade, mas o SSD não sabia.`
        : `Sobrou só o bloco de reserva, e o controlador precisa liberar outro. Ele escolhe o bloco cheio com mais páginas inválidas: o bloco ${run.victim}, com as ${run.victimInvalid} páginas do arquivo apagado. Nenhuma está válida, então ele apaga o bloco sem copiar nada. O TRIM transformou o arquivo apagado em espaço livre de verdade.`,
      facts: [
        ["Vítima", `bloco ${run.victim}`],
        ["Páginas copiadas", String(run.copies)],
        ["Apagamentos", "1"],
      ],
      highlight: ["flash", "erase"],
      quiz: {
        kind: "number",
        prompt: `O bloco ${run.victim} tem ${PAGES} páginas, ${run.victimInvalid} delas inválidas. Quantas páginas o controlador copia antes de apagá-lo?`,
        answer: run.copies,
        explain: `Só as válidas precisam sobreviver: ${PAGES} − ${run.victimInvalid} = ${run.copies}. Cada cópia é uma escrita na flash que ninguém pediu.`,
      },
    },
    () => {
      c.state("ftl", `coleta: bloco ${run.victim}`, { tone: "warn" });
      for (const op of ops("coleta")) draw(op, true);
    },
  );

  b.step(
    {
      id: "s5-amplificacao",
      title: "Amplificação de escrita",
      subtitle: `Fator ${fator(run.wa)}`,
      text: `Na fase de reescrita, o sistema pediu ${run.hostAfter} ${pl(run.hostAfter, "escrita", "escritas")} e a flash recebeu ${run.flashAfter}: ${pl(r, "a pedida", "as pedidas")} mais as cópias da coleta. A razão, ${run.flashAfter} ÷ ${run.hostAfter} = ${fator(run.wa)}, é a [[amplificacao-de-escrita|amplificação de escrita]]. ${trim ? `Sem TRIM, a mesma sequência daria ${fator(other.wa)}.` : `Com TRIM, a mesma sequência daria ${fator(other.wa)}.`} Quanto maior o fator, mais rápido o SSD se gasta.`,
      facts: [
        ["Pedidas", String(run.hostAfter)],
        ["Na flash", String(run.flashAfter)],
        ["Fator", fator(run.wa)],
      ],
      highlight: ["wa", "flashw"],
      quiz: {
        kind: "number",
        prompt: `O sistema pediu ${run.hostAfter} ${pl(run.hostAfter, "escrita", "escritas")} e a coleta copiou ${run.copies} ${pl(run.copies, "página", "páginas")}. Qual o fator de amplificação?`,
        answer: run.wa,
        tolerance: 0.01,
        explain: `(${run.hostAfter} + ${run.copies}) ÷ ${run.hostAfter} = ${fator(run.wa)}. Um fator 1 quer dizer que só o que foi pedido chegou à flash.`,
      },
    },
    () => {
      const rows = trim ? [other, run] : [run, other];
      rows.forEach((x, i) => {
        c.row(
          "wa",
          i,
          [
            i === 0 ? "não" : "sim",
            `bloco ${x.victim}`,
            String(x.copies),
            `${x.hostAfter} → ${x.flashAfter}`,
            fator(x.wa),
          ],
          {
            dt: 1,
            mark: x.copies ? "warn" : "new",
          },
        );
      });
    },
  );

  b.step(
    {
      id: "s6-desgaste",
      title: "Desgaste e reserva",
      subtitle: "Nivelamento de desgaste",
      text: `Cada bloco aguenta um número limitado de apagamentos, de centenas a dezenas de milhares conforme o tipo de célula. Por isso o controlador faz [[nivelamento-de-desgaste|nivelamento de desgaste]]: espalha os apagamentos e, de tempos em tempos, move dados frios para blocos gastos. O bloco de reserva, que o sistema não enxerga, dá folga para a coleta. Mais reserva quer dizer menos cópias.`,
      facts: [
        ["Reserva aqui", `1 de ${BLOCKS} blocos`],
        ["TRIM", "deixe ligado"],
        ["Fator mínimo", "1"],
      ],
      highlight: ["erase", "flash"],
    },
    () => {
      c.note("flash", "o bloco apagado volta ao conjunto livre", "info", { dt: 1 });
      c.state("ftl", "distribui os apagamentos", { tone: "good" });
    },
  );

  return b.done({
    victim: run.victim,
    copies: run.copies,
    host: run.hostAfter,
    flash: run.flashAfter,
    wa: run.wa,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "ssd",
    site: "so",
    title: "Como funciona um SSD",
    summary:
      "A flash grava páginas mas só apaga blocos. O controlador escreve fora do lugar e faz coleta de lixo; sem TRIM, copia dados já apagados, e cada cópia vira amplificação de escrita e desgaste.",
    area: "Arquivos e E/S",
    refs: [
      {
        book: "maziero-so",
        chapter: 21,
        section: "21.3",
        note: "Dispositivos de estado sólido",
        verified: true,
      },
      { book: "tanenbaum-sco", chapter: 2, section: "2.3.6", note: "SSD e memória flash", verified: true },
    ],
    simplifications: [
      `Blocos de ${PAGES} páginas; os reais têm centenas.`,
      "A coleta roda uma vez, quando sobra só o bloco de reserva; a real roda em segundo plano.",
      "O mapa lógico → físico aparece só pelos rótulos L0, L1…",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "reescritas", kind: "int", label: "Páginas reescritas", min: 1, max: 3 },
      {
        key: "trim",
        kind: "choice",
        label: "TRIM ligado",
        options: [
          { value: "nao", label: "não" },
          { value: "sim", label: "sim" },
        ],
      },
    ],
  },
  build,
  practice,
  intro: {
    text: "Um SSD não tem partes móveis, mas tem um problema que o disco rígido não tem: não dá para gravar por cima. Você vai ver o controlador escrever fora do lugar, apagar blocos inteiros e copiar dados que já estavam apagados, e o que o TRIM muda.",
    facts: [
      ["Blocos", String(BLOCKS)],
      ["Páginas por bloco", String(PAGES)],
      ["TRIM", "desligado"],
    ],
  },
  outro: {
    title: "SSD em resumo",
    text: "A flash só regrava depois de apagar, e apaga blocos inteiros. A FTL escreve fora do lugar, marca a cópia antiga como inválida e, quando faltam blocos livres, copia as páginas válidas e apaga a vítima. Cópias são escritas extras: a amplificação de escrita. TRIM e reserva diminuem as cópias; o nivelamento espalha o desgaste.",
    facts: (rr) => [
      ["Cópias na coleta", String(rr.stats.copies)],
      ["Fator", num(Number(rr.stats.wa))],
      ["Vítima", `bloco ${rr.stats.victim}`],
    ],
  },
  next: ["escalonamento-disco", "raid", "alocacao-arquivos"],
};

export default lesson;
