import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import {
  forward,
  hex,
  layout,
  type Module,
  PRINCIPAL,
  pass1,
  pass2,
  resolve,
  SOMA,
  signed,
  WORD,
} from "../../../sim/arch/link.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * From two source files to a program in memory: the assembler's two passes (symbol table, then
 * code with relocation entries), the linker laying modules out and patching references, and the
 * loader moving the result, where only absolute addresses need fixing.
 */
export const DEFAULTS = { base: 1024, ordem: "principal" };
const MOVE = 0x4000;

function clamp(p: Params) {
  const raw = Math.round(Number(p.base ?? DEFAULTS.base) / 256) * 256;
  const base = Math.min(8192, Math.max(0, raw));
  const first = p.ordem === "soma" ? "soma" : "principal";
  return { base, first, mods: first === "soma" ? [SOMA, PRINCIPAL] : [PRINCIPAL, SOMA] };
}

const scene: SceneSpec = {
  viewBox: [960, 600],
  nodes: [],
  links: [],
  widgets: [
    {
      kind: "table",
      id: "fonte",
      title: "Os dois arquivos-fonte",
      at: [30, 50],
      columns: ["Arquivo", "Desloc.", "Rótulo", "Instrução"],
      widths: [100, 70, 70, 150],
      rows: PRINCIPAL.lines.length + SOMA.lines.length,
    },
    {
      kind: "table",
      id: "simbolos",
      title: "Tabela de símbolos",
      at: [470, 50],
      columns: ["Símbolo", "Módulo", "Valor", "Situação"],
      widths: [80, 100, 80, 150],
      rows: 4,
    },
    {
      kind: "table",
      id: "reloc",
      title: "Referências a resolver",
      at: [470, 230],
      columns: ["Onde", "Símbolo", "Tipo", "Valor gravado"],
      widths: [100, 80, 100, 130],
      rows: 3,
    },
    {
      kind: "table",
      id: "mapa",
      title: "Mapa de memória do executável",
      at: [30, 350],
      columns: ["Módulo", "Início", "Fim", "Bytes"],
      widths: [110, 90, 90, 70],
      rows: 2,
    },
    { kind: "counter", id: "soma", title: "Endereço de soma", at: [470, 400] },
    { kind: "counter", id: "total", title: "Endereço de total", at: [660, 400] },
    { kind: "counter", id: "carga", title: "Corrigidas ao mover", at: [470, 490] },
  ],
};

export function build(p: Params) {
  const { base, first, mods } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const pa = pass1(PRINCIPAL);
  const ps = pass1(SOMA);
  const fwds = forward(PRINCIPAL);
  const fwd = fwds.find((f) => f.sym === "fim");
  const refs = pass2(PRINCIPAL);
  const placed = layout(mods, base);
  const solved = resolve(placed);
  const moved = resolve(layout(mods, base + MOVE));
  const find = (rs: typeof solved, sym: string) => rs.find((r) => r.sym === sym);
  const callR = find(solved, "soma");
  const swR = find(solved, "total");
  const jR = find(solved, "fim");
  const addrSoma = callR?.target ?? 0;
  const addrTotal = swR?.target ?? 0;
  const changed = solved.filter((r, i) => moved[i]?.value !== r.value);
  const pPrin = placed.find((x) => x.module === PRINCIPAL);
  const pSoma = placed.find((x) => x.module === SOMA);
  const refRow = (r: { sym: string }) => ["fim", "soma", "total"].indexOf(r.sym);
  const symRow = (name: string) => ["inicio", "fim", "total", "soma"].indexOf(name);
  const where = (m: string, at: number) => `${m === PRINCIPAL.name ? "principal" : "soma"}+${at}`;

  const srcRows = (m: Module, from: number) =>
    m.lines.forEach((l, i) => {
      c.row("fonte", from + i, [m.name, String(i * WORD), l.label ?? "", l.text], {
        dt: i === 0 ? 1 : 0,
        ...(m === PRINCIPAL && fwds.some((f) => f.at === i * WORD) ? { mark: "warn" as const } : {}),
        ...(i === 0
          ? {
              log: {
                who: m.name,
                what: `${m.lines.length} linhas`,
                detail: `${m.lines.length * WORD} bytes`,
              },
            }
          : {}),
      });
    });

  b.step(
    {
      id: "s1-fonte",
      title: "Dois arquivos, um programa",
      subtitle: `${PRINCIPAL.name} chama ${SOMA.name}`,
      text: `O programa está em dois arquivos. ${PRINCIPAL.name} guarda 5 em a0, chama a função soma, grava o resultado na variável total e salta para fim. A função soma está em outro arquivo, ${SOMA.name}. O [[montador]] traduz cada arquivo sozinho, sem ver o outro, e cada instrução ocupa ${WORD} bytes. Repare nas linhas marcadas: ${fwds.map((f) => (f.sym === "fim" ? "j fim" : "sw a0, total")).join(" e ")} citam rótulos que só aparecem mais abaixo.`,
      facts: [
        ["Arquivos", "2"],
        ["Bytes por instrução", String(WORD)],
        ["Referências adiante", fwds.map((f) => f.sym).join(", ")],
      ],
      highlight: [],
    },
    () => {
      srcRows(PRINCIPAL, 0);
      srcRows(SOMA, PRINCIPAL.lines.length);
    },
  );

  b.step(
    {
      id: "s2-passagem1",
      title: "Primeira passagem",
      subtitle: "Contar bytes e anotar rótulos",
      text: `Na primeira passagem o montador só conta bytes e anota cada rótulo na [[tabela-de-simbolos]]: inicio no deslocamento ${pa.symbols[0]?.offset}, fim no ${pa.symbols[1]?.offset} e total no ${pa.symbols[2]?.offset}. Quando chegou em j fim, no deslocamento ${fwd?.at}, ainda não sabia onde fim estava; agora sabe, e o mesmo vale para total. Já soma não aparece em lugar nenhum de ${PRINCIPAL.name}: fica marcado como externo. Em ${SOMA.name}, soma está no deslocamento ${ps.symbols[0]?.offset} e é exportado.`,
      facts: [
        ["Rótulos locais", String(pa.symbols.length)],
        ["Externos", pa.externals.join(", ")],
        ["Tamanho", `${pa.size} bytes`],
      ],
      highlight: [],
    },
    () => {
      for (const s of pa.symbols)
        c.row("simbolos", symRow(s.name), [s.name, PRINCIPAL.name, String(s.offset), "local"], {
          dt: 1,
          mark: "new",
          log: { who: "passagem 1", what: s.name, detail: `deslocamento ${s.offset}` },
        });
      c.row("simbolos", symRow("soma"), ["soma", "?", "?", "externo"], {
        dt: 1,
        mark: "warn",
        log: { who: "passagem 1", what: "soma", detail: "não definido aqui" },
      });
    },
  );

  b.step(
    {
      id: "s3-passagem2",
      title: "Segunda passagem",
      subtitle: `${refs.filter((r) => !r.local).length} pendências para o ligador`,
      text: `Na segunda passagem sai o código. O salto j fim vira um deslocamento relativo ao próprio salto, ${signed(jR?.value ?? 0)} bytes, e está resolvido: não muda se o código for parar em outro endereço. Já call soma cita um símbolo externo, e sw a0, total precisa do endereço absoluto de total, que depende de onde o programa ficar. O montador grava zeros nesses campos e anota uma entrada de [[relocacao]] para cada um no arquivo-objeto.`,
      facts: [
        ["j fim", `${signed(jR?.value ?? 0)}, resolvido`],
        ["call soma", "externo"],
        ["sw total", "absoluto"],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: "Por que o montador precisa de duas passagens pelo arquivo?",
        options: [
          "Porque j fim e sw total usam rótulos definidos depois",
          "Porque cada instrução tem tamanho diferente",
          "Porque a função soma está em outro arquivo",
        ],
        answer: 0,
        explain: `Ao ler j fim, no deslocamento ${fwd?.at}, fim ainda não foi visto. A primeira passagem descobre todos os rótulos; a segunda gera o código. O símbolo soma, de outro arquivo, nem com duas passagens se resolve: fica para o ligador.`,
      },
    },
    () => {
      for (const r of refs)
        c.row(
          "reloc",
          refRow(r),
          [where(r.module, r.at), r.sym, r.kind, r.local ? signed(jR?.value ?? 0) : "0 (pendente)"],
          {
            dt: 1,
            mark: r.local ? "hit" : "warn",
            log: { who: "passagem 2", what: r.sym, detail: r.local ? "resolvido" : "relocação" },
          },
        );
    },
  );

  b.step(
    {
      id: "s4-liga",
      title: "O ligador junta",
      subtitle: `${first === "soma" ? SOMA.name : PRINCIPAL.name} primeiro, a partir de ${hex(base)}`,
      text: `O [[ligador]] recebe os dois arquivos-objeto e escolhe onde cada um fica. Começando em ${hex(base)}, ${placed[0]?.module.name} ocupa ${placed[0]?.size} bytes e ${placed[1]?.module.name} vem logo depois, em ${hex(placed[1]?.base ?? 0)}. Agora cada símbolo tem endereço: soma está em ${hex(addrSoma)} e total em ${hex(addrTotal)}. A tabela de símbolos dos dois módulos vira uma só, e o externo de antes deixa de ser pendente.`,
      facts: [
        [PRINCIPAL.name, hex(pPrin?.base ?? 0)],
        [SOMA.name, hex(pSoma?.base ?? 0)],
        ["soma", hex(addrSoma)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Com o executável começando em ${base} e ${placed[0]?.module.name} primeiro (${placed[0]?.size} bytes), em que endereço, em decimal, fica a função soma?`,
        answer: addrSoma,
        explain: `${SOMA.name} começa em ${pSoma?.base} e soma é o seu primeiro rótulo, no deslocamento 0: ${addrSoma}, ou ${hex(addrSoma)}.`,
      },
    },
    () => {
      placed.forEach((x, i) => {
        c.row("mapa", i, [x.module.name, hex(x.base), hex(x.base + x.size - 1), String(x.size)], {
          dt: 1,
          mark: "new",
          log: { who: "ligador", what: x.module.name, detail: hex(x.base) },
        });
      });
      for (const s of [...pa.symbols, ...ps.symbols]) {
        const pl = placed.find((x) => x.module.name === s.module);
        c.row(
          "simbolos",
          symRow(s.name),
          [s.name, s.module, hex((pl?.base ?? 0) + (s.offset ?? 0)), "endereço final"],
          {
            dt: s.name === "inicio" ? 1 : 0,
            mark: s.name === "soma" ? "hit" : "new",
          },
        );
      }
      c.count("soma", hex(addrSoma), { role: "a", label: `soma em ${hex(addrSoma)}` });
      c.count("total", hex(addrTotal), { dt: 0, role: "a", label: `total em ${hex(addrTotal)}` });
    },
  );

  b.step(
    {
      id: "s5-corrige",
      title: "Remendar as referências",
      subtitle: "Cada entrada de relocação",
      text: `Com os endereços em mãos, o ligador percorre as entradas de relocação. call soma, em ${hex(callR?.where ?? 0)}, recebe a distância até ${hex(addrSoma)}: ${signed(callR?.value ?? 0)} bytes. sw a0, total recebe o endereço inteiro, ${hex(addrTotal)}. O salto j fim continua com ${signed(jR?.value ?? 0)}, porque origem e destino andaram juntos. O resultado é um executável em que nenhum campo ficou em zero.`,
      facts: [
        ["call soma", signed(callR?.value ?? 0)],
        ["sw total", hex(addrTotal)],
        ["j fim", signed(jR?.value ?? 0)],
      ],
      highlight: [],
    },
    () => {
      for (const r of solved)
        c.row(
          "reloc",
          refRow(r),
          [hex(r.where), r.sym, r.kind, r.kind === "relativa" ? signed(r.value) : hex(r.value)],
          {
            dt: 1,
            mark: "hit",
            log: {
              who: "ligador",
              what: r.sym,
              detail: r.kind === "relativa" ? signed(r.value) : hex(r.value),
            },
          },
        );
    },
  );

  b.step(
    {
      id: "s6-carga",
      title: "Mudar de endereço",
      subtitle: `De ${hex(base)} para ${hex(base + MOVE)}`,
      text: `Se o carregador puser o programa ${MOVE} bytes adiante, em ${hex(base + MOVE)}, só ${changed.length === 1 ? "uma referência muda" : `${changed.length} referências mudam`}: ${changed.map((r) => r.sym).join(", ")}, que guarda um endereço absoluto e passa a ${hex(find(moved, "total")?.value ?? 0)}. As relativas valem igual em qualquer lugar. Por isso bibliotecas compartilhadas usam [[codigo-independente-de-posicao]]: quase tudo relativo, e as poucas referências absolutas resolvidas ao carregar, numa tabela à parte.`,
      facts: [
        ["Novo início", hex(base + MOVE)],
        ["Mudam", String(changed.length)],
        ["Não mudam", String(solved.length - changed.length)],
      ],
      highlight: [],
    },
    () => {
      for (const r of moved) {
        const before = solved.find((x) => x.sym === r.sym);
        const diff = before?.value !== r.value;
        c.row(
          "reloc",
          refRow(r),
          [hex(r.where), r.sym, r.kind, r.kind === "relativa" ? signed(r.value) : hex(r.value)],
          {
            dt: 1,
            mark: diff ? "new" : "hit",
            log: { who: "carregador", what: r.sym, detail: diff ? "corrigida" : "igual" },
          },
        );
      }
      c.count("carga", `${changed.length} de ${solved.length}`, { label: `${changed.length} corrigidas` });
    },
  );

  return b.done({
    forward: fwds.length,
    pending: refs.filter((r) => !r.local).length,
    soma: addrSoma,
    total: addrTotal,
    call: callR?.value ?? 0,
    jump: jR?.value ?? 0,
    changed: changed.length,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "ligacao",
    site: "arq",
    title: "Montagem e ligação: do texto ao executável",
    summary:
      "As duas passagens do montador, a tabela de símbolos, as entradas de relocação, o ligador que junta dois arquivos e o carregador que muda o programa de lugar.",
    area: "ISA",
    refs: [
      {
        book: "tanenbaum-sco",
        chapter: 7,
        section: "7.3",
        note: "O processo de montagem: duas passagens e tabela de símbolos",
        verified: true,
      },
      {
        book: "tanenbaum-sco",
        chapter: 7,
        section: "7.4",
        note: "Ligação e carregamento, relocação",
        verified: true,
      },
    ],
    simplifications: [
      "Todas as instruções têm 4 bytes, e call cabe numa só instrução.",
      "Código e dados ficam juntos; executáveis reais separam seções de texto e de dados.",
      "Ligação dinâmica aparece só em uma frase, sem a tabela de saltos de verdade.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "base", kind: "int", label: "Início do executável", min: 0, max: 8192, step: 256 },
      {
        key: "ordem",
        kind: "choice",
        label: "Qual arquivo vem primeiro",
        options: [
          { value: "principal", label: "principal.s" },
          { value: "soma", label: "soma.s" },
        ],
      },
    ],
  },
  build,
  intro: {
    text: "Um programa raramente cabe num arquivo só, e quem o escreve não sabe em que endereço ele vai rodar. Você vai acompanhar o montador lendo dois arquivos, o ligador juntando os pedaços e o carregador mudando tudo de lugar, campo por campo.",
    facts: [
      ["Arquivos", `${PRINCIPAL.name}, ${SOMA.name}`],
      ["Início", hex(DEFAULTS.base)],
      ["Instrução", `${WORD} bytes`],
    ],
  },
  outro: {
    title: "Montagem e ligação em resumo",
    text: "O montador faz duas passagens: a primeira acha os rótulos, a segunda gera o código e anota o que não sabe resolver. O ligador põe os módulos em sequência, dá endereço a cada símbolo e remenda as referências pendentes. Referências relativas sobrevivem a qualquer mudança de lugar; as absolutas são as que o carregador precisa corrigir.",
    facts: (run) => [
      ["soma", hex(Number(run.stats.soma))],
      ["total", hex(Number(run.stats.total))],
      ["Corrigidas ao mover", String(run.stats.changed)],
    ],
  },
  next: ["pilha-chamadas", "instrucao-riscv"],
};

export default lesson;
