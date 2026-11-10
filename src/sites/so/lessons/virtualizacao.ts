import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import {
  fate,
  GUEST_INSTRS,
  nativeWalk,
  nestedSteps,
  nestedWalk,
  slowdown,
  TRAP_CYCLES,
} from "../../../sim/os/virt.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * A virtual machine from the inside: the guest kernel runs unprivileged, privileged instructions
 * trap to the hypervisor, x86's sensitive-but-unprivileged instructions break the classic recipe,
 * and memory needs two translations, whose page walk grows to (n + 1)(m + 1) - 1 reads.
 */
export const DEFAULTS = { sensiveis: 5, niveis: 4 };

function clamp(p: Params) {
  const k = Math.min(50, Math.max(0, Math.round(Number(p.sensiveis ?? DEFAULTS.sensiveis))));
  const n = Math.min(5, Math.max(2, Math.round(Number(p.niveis ?? DEFAULTS.niveis))));
  return { k, n };
}

/** 10 000 style grouping from five digits up, as in the text. */
const grp = (x: number) => (x >= 10_000 ? String(x).replace(/\B(?=(\d{3})+(?!\d))/g, " ") : String(x));
const dec = (x: number, d = 2) => String(Math.round(x * 10 ** d) / 10 ** d).replace(".", ",");

const scene: SceneSpec = {
  viewBox: [960, 600],
  nodes: [
    { id: "app", kind: "process", label: "Programa", sub: "modo usuário", at: [150, 70] },
    { id: "guest", kind: "kernel", label: "Kernel convidado", sub: "acha que manda", at: [150, 165] },
    { id: "hv", kind: "kernel", label: "Hipervisor", sub: "modo privilegiado", at: [150, 260] },
    { id: "hw", kind: "cpu", label: "Hardware", sub: "CPU, memória, E/S", at: [150, 355] },
  ],
  links: [
    { id: "l-app", from: "app", to: "guest" },
    { id: "l-guest", from: "guest", to: "hv" },
    { id: "l-hv", from: "hv", to: "hw" },
  ],
  widgets: [
    {
      kind: "table",
      id: "instr",
      title: "Instruções do kernel convidado",
      at: [330, 50],
      columns: ["Instrução", "O que faz", "Privilegiada", "No convidado"],
      widths: [90, 200, 100, 180],
      rows: GUEST_INSTRS.length,
    },
    { kind: "counter", id: "lentidao", title: "Tempo relativo ao nativo", at: [330, 245] },
    { kind: "counter", id: "acessos", title: "Leituras por falta na TLB", at: [560, 245] },
    {
      kind: "table",
      id: "walk",
      title: "Uma falta na TLB com paginação aninhada",
      at: [330, 340],
      columns: ["Etapa", "Leituras"],
      widths: [260, 100],
      rows: 6,
    },
    {
      kind: "table",
      id: "compara",
      title: "Leituras por tradução",
      at: [30, 430],
      columns: ["Modo", "Leituras"],
      widths: [170, 90],
      rows: 3,
    },
  ],
};

export function build(p: Params) {
  const { k, n } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, { app: "programa", guest: "kernel convidado", hv: "hipervisor", hw: "hardware" }, (t) =>
    String(t),
  );
  const slow = slowdown(k);
  const native = nativeWalk(n);
  const nested = nestedWalk(n, n);
  const steps = nestedSteps(n, n);
  const instrRow = (i: number, mark?: "hit" | "warn" | "bad" | "new") => {
    const x = GUEST_INSTRS[i];
    if (!x) return;
    const f = fate(x);
    c.row("instr", i, [x.name, x.does, x.privileged ? "sim" : "não", f], {
      dt: 1,
      ...(mark ? { mark } : {}),
      log: { who: x.name, what: f, detail: x.does },
    });
  };

  b.step(
    {
      id: "s1-camadas",
      title: "Um kernel sobre outro",
      subtitle: "Hipervisor tipo 1",
      text: `Uma máquina virtual roda um sistema operacional inteiro como se tivesse o hardware só para ele. Quem faz isso é o [[hipervisor]]: aqui do tipo 1, rodando direto no hardware, como Xen e KVM. Só ele executa em modo privilegiado. O kernel convidado roda sem privilégio, embora tenha sido escrito para mandar em tudo. O truque é deixar as instruções comuns rodarem direto na CPU, na velocidade real, e interceptar só as que mexem no estado da máquina.`,
      facts: [
        ["Privilegiado", "só o hipervisor"],
        ["Convidado", "modo usuário"],
        ["Instruções comuns", "rodam direto"],
      ],
      highlight: ["guest", "hv"],
    },
    () => {
      c.state("hv", "privilegiado", { role: "ctrl", label: "hipervisor em modo privilegiado" });
      c.state("guest", "sem privilégio", { dt: 0, role: "warn", label: "kernel convidado sem privilégio" });
      instrRow(0, "hit");
    },
  );

  b.step(
    {
      id: "s2-armadilha",
      title: "Armadilha e emulação",
      subtitle: "cli, mov cr3, out",
      text: `Quando o kernel convidado executa cli, para desligar interrupções, a CPU percebe que a instrução é privilegiada e não está em modo privilegiado: gera uma armadilha para o hipervisor. Ele olha o que o convidado queria e emula o efeito só na máquina virtual, marcando as interrupções dela como desligadas, e devolve o controle. O mesmo vale para trocar a tabela de páginas e para falar com dispositivos. Para o convidado, parece que funcionou.`,
      facts: [
        ["Detecta", "a CPU, pelo modo"],
        ["Quem emula", "o hipervisor"],
        ["Efeito", "só na VM"],
      ],
      highlight: ["guest", "hv"],
    },
    () => {
      c.send("guest", "hv", "cli", { role: "warn", what: "armadilha", detail: "instrução privilegiada" });
      c.state("hv", "emula", { role: "ctrl", label: "desliga as interrupções da VM" });
      c.send("hv", "guest", "volta", { role: "ctrl", what: "retoma o convidado" });
      for (const i of [1, 2, 3]) instrRow(i, "warn");
    },
  );

  b.step(
    {
      id: "s3-custo",
      title: "O preço de cada armadilha",
      subtitle: `${k} a cada 10 000 instruções`,
      text: `Uma instrução comum custa cerca de 1 ciclo; uma armadilha, com ida ao hipervisor e volta, algo como ${TRAP_CYCLES}. Se o convidado executa ${k} instruções sensíveis a cada 10 000, o tempo vira (10 000 + ${k} × ${TRAP_CYCLES}) ÷ 10 000 = ${dec(slow)} vezes o nativo. Programas que quase só calculam ficam perto de 1; um kernel que troca de processo e faz E/S o tempo todo sofre muito mais. Reduzir armadilhas é o centro de toda técnica de virtualização.`,
      facts: [
        ["Instrução comum", "1 ciclo"],
        ["Armadilha", `${TRAP_CYCLES} ciclos`],
        ["Tempo relativo", `${dec(slow)}×`],
      ],
      highlight: ["hv"],
      quiz: {
        kind: "number",
        prompt: `Com ${k} instruções sensíveis a cada 10 000 e ${TRAP_CYCLES} ciclos por armadilha, quantas vezes mais lento que o nativo o convidado roda?`,
        answer: slow,
        tolerance: 0.01,
        unit: "×",
        explain: `10 000 ciclos das instruções mais ${k} × ${TRAP_CYCLES} = ${k * TRAP_CYCLES} das armadilhas: ${grp(10_000 + k * TRAP_CYCLES)} ÷ 10 000 = ${dec(slow)}.`,
      },
    },
    () => {
      c.count("lentidao", `${dec(slow)}×`, {
        role: slow > 1.5 ? "bad" : "warn",
        label: `${dec(slow)} vezes o nativo`,
      });
    },
  );

  b.step(
    {
      id: "s4-popf",
      title: "A instrução que não avisa",
      subtitle: "Sensível, mas não privilegiada",
      text: `A receita só funciona se toda instrução [[instrucao-sensivel|sensível]] for também privilegiada. No x86 antigo não era: popf, em modo usuário, ignora em silêncio o bit de interrupções, sem armadilha. O convidado acha que religou as interrupções e nada aconteceu. As saídas foram três: traduzir o código do kernel antes de rodar, como fez o VMware; mudar o convidado para chamar o hipervisor de propósito, a [[paravirtualizacao]] do Xen; e, desde 2005, o VT-x e o AMD-V, que dão ao hipervisor um modo próprio e fazem essas instruções saírem para ele.`,
      facts: [
        ["popf no convidado", "falha calada"],
        ["Tradução binária", "VMware"],
        ["Hardware", "VT-x, AMD-V"],
      ],
      highlight: ["guest"],
      quiz: {
        kind: "choice",
        prompt: "Por que o popf atrapalhava a virtualização clássica no x86?",
        options: [
          "Muda o estado da máquina, mas não gera armadilha fora do modo privilegiado",
          "É privilegiada e gera armadilhas demais",
          "Só existe em processadores com VT-x",
        ],
        answer: 0,
        explain:
          "Sem armadilha, o hipervisor nunca fica sabendo e não pode emular: o convidado se comporta errado em silêncio.",
      },
    },
    () => {
      instrRow(4, "bad");
      c.state("guest", "erro silencioso", { role: "bad", tone: "bad", label: "popf ignorado sem aviso" });
    },
  );

  b.step(
    {
      id: "s5-memoria",
      title: "Duas traduções",
      subtitle: `${n} níveis no convidado e no hospedeiro`,
      text: `O convidado tem as suas tabelas de páginas, que levam endereços virtuais a endereços que ele acha físicos. Esses, por sua vez, são virtuais para o hipervisor, que tem outra tabela. Na paginação aninhada, a CPU percorre as duas: cada um dos ${n} níveis do convidado está num endereço do convidado, que precisa de ${n} leituras do hospedeiro mais a leitura da entrada; no fim, o endereço do dado precisa de mais ${n}. Uma falta na TLB custa ${nested} leituras, contra ${native} sem virtualização.`,
      facts: [
        ["Nativo", `${native} leituras`],
        ["Aninhada", `${nested} leituras`],
        ["Fórmula", "(n + 1)(m + 1) − 1"],
      ],
      highlight: ["guest", "hv", "hw"],
      quiz: {
        kind: "number",
        prompt: `Com tabelas de ${n} níveis no convidado e ${n} no hospedeiro, quantas leituras de memória custa uma falta na TLB?`,
        answer: nested,
        explain: `${n} níveis do convidado × (${n} + 1) = ${n * (n + 1)}, mais ${n} para o endereço final: ${nested}, que é (${n} + 1) × (${n} + 1) − 1.`,
      },
    },
    () => {
      steps.forEach((s, i) => {
        c.row("walk", i, [s.what, String(s.reads)], {
          dt: 1,
          mark: "new",
          log: { who: "paginação aninhada", what: s.what, detail: `${s.reads} leituras` },
        });
      });
      c.count("acessos", String(nested), { dt: 0, role: "bad", label: `${nested} leituras` });
    },
  );

  b.step(
    {
      id: "s6-tlb",
      title: "A TLB paga a conta",
      subtitle: `${native} contra ${nested}`,
      text: `Antes do suporte de hardware, o hipervisor mantinha tabelas-sombra: uma tabela que vai direto do virtual do convidado ao físico real, com ${native} leituras por falta. O preço era outro: toda escrita do convidado nas suas tabelas precisava gerar armadilha para atualizar a sombra. A paginação aninhada elimina essas armadilhas e aposta na [[tlb]]: como a maioria dos acessos acerta nela, as ${nested} leituras só aparecem nas faltas, e TLBs maiores e páginas grandes tornam isso raro.`,
      facts: [
        ["Tabelas-sombra", `${native} leituras + armadilhas`],
        ["Aninhada", `${nested} leituras, sem armadilhas`],
        ["Quem salva", "a TLB"],
      ],
      highlight: ["hv", "hw"],
    },
    () => {
      const rows: [string, number, "hit" | "warn" | "bad"][] = [
        ["Nativo", native, "hit"],
        ["Tabelas-sombra", native, "warn"],
        ["Aninhada", nested, "bad"],
      ];
      rows.forEach(([mode, reads, mark], i) => {
        c.row("compara", i, [mode, String(reads)], {
          dt: 1,
          mark,
          log: { who: mode, what: `${reads} leituras` },
        });
      });
    },
  );

  return b.done({
    slowdown: dec(slow),
    native,
    nested,
    failsSilently: GUEST_INSTRS.filter((i) => fate(i) === "falha calada").length,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "virtualizacao",
    site: "so",
    title: "Virtualização: armadilhas e paginação aninhada",
    summary:
      "O kernel convidado sem privilégio, a armadilha e emulação, o custo de cada saída para o hipervisor, a instrução popf do x86 e as duas traduções de memória com a paginação aninhada.",
    area: "Virtualização e distribuição",
    refs: [
      {
        book: "tanenbaum-mos",
        chapter: 7,
        section: "7.2",
        note: "Exigências para a virtualização",
        verified: true,
      },
      { book: "tanenbaum-mos", chapter: 7, section: "7.6", note: "Virtualização da memória", verified: true },
      { book: "maziero-so", chapter: 33, note: "Construção de máquinas virtuais", verified: true },
    ],
    simplifications: [
      `Uma armadilha custa ${TRAP_CYCLES} ciclos fixos; o custo real varia com a CPU e com o motivo da saída.`,
      "Convidado e hospedeiro usam o mesmo número de níveis de tabela.",
      "A tradução binária e a paravirtualização aparecem só como alternativas, sem o mecanismo.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "sensiveis", kind: "int", label: "Instruções sensíveis a cada 10 000", min: 0, max: 50 },
      { key: "niveis", kind: "int", label: "Níveis da tabela de páginas", min: 2, max: 5 },
    ],
  },
  build,
  intro: {
    text: "Um computador roda vários sistemas operacionais ao mesmo tempo, cada um convencido de que manda no hardware. Você vai ver o hipervisor interceptar as instruções perigosas, medir quanto isso custa, encontrar a instrução que quase impediu a virtualização no x86 e contar as leituras de uma tradução de memória em dois níveis.",
    facts: [
      ["Hipervisor", "tipo 1"],
      ["Sensíveis", `${DEFAULTS.sensiveis} a cada 10 000`],
      ["Níveis", String(DEFAULTS.niveis)],
    ],
  },
  outro: {
    title: "Virtualização em resumo",
    text: "O convidado roda sem privilégio e o hipervisor emula cada instrução sensível quando ela gera armadilha. Isso exige que toda instrução sensível seja privilegiada, o que o x86 só garantiu com VT-x e AMD-V. Na memória, as duas tabelas de páginas multiplicam as leituras de uma falta na TLB, um custo que a própria TLB esconde na maior parte do tempo.",
    facts: (run) => [
      ["Tempo relativo", `${run.stats.slowdown}×`],
      ["Nativo", `${run.stats.native} leituras`],
      ["Aninhada", `${run.stats.nested} leituras`],
    ],
  },
  next: ["paginacao-multinivel", "chamada-de-sistema"],
};

export default lesson;
