import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { BODY, branchVsPredicate, finish, LATENCY, scalar, schedule } from "../../../sim/arch/vliw.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { vliw as practice } from "../practice.ts";

/**
 * VLIW and EPIC: the compiler packs z = a × b + c × d into bundles; empty slots turn into NOPs.
 * Then predication replaces a hard-to-predict branch by two guarded operations.
 */
export const DEFAULTS = { vias: 3, penalidade: 10 };
const MAX_BUNDLES = 10;

function clamp(p: Params) {
  const vias = Math.min(4, Math.max(1, Math.round(Number(p.vias ?? DEFAULTS.vias))));
  const penalidade = Math.min(20, Math.max(1, Math.round(Number(p.penalidade ?? DEFAULTS.penalidade))));
  return { vias, penalidade };
}

function scene(p: Params): SceneSpec {
  const { vias } = clamp(p);
  return {
    viewBox: [960, 600],
    nodes: [],
    links: [],
    widgets: [
      {
        kind: "table",
        id: "ops",
        title: "z = a × b + c × d",
        at: [30, 40],
        columns: ["Nº", "Operação", "Latência", "Depende de"],
        widths: [50, 150, 90, 110],
        rows: BODY.length,
      },
      {
        kind: "table",
        id: "pacotes",
        title: `Pacotes de ${vias} ${vias === 1 ? "via" : "vias"}`,
        at: [450, 40],
        columns: ["Ciclo", ...Array.from({ length: vias }, (_, i) => `Via ${i + 1}`)],
        widths: [70, ...Array(vias).fill(Math.floor(400 / vias))],
        rows: MAX_BUNDLES,
      },
      { kind: "counter", id: "ciclos", title: "Ciclos", at: [40, 420] },
      { kind: "counter", id: "nops", title: "Espaços vazios (NOP)", at: [240, 420] },
      {
        kind: "table",
        id: "if",
        title: "if (a < b) x++ else y++",
        at: [450, 470],
        columns: ["Versão", "Ciclos em média"],
        widths: [300, 170],
        rows: 2,
      },
    ],
  };
}

const dec = (x: number) => String(x).replace(".", ",");

export function build(p: Params) {
  const { vias, penalidade } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const bundles = schedule(BODY, vias);
  const end = finish(bundles);
  const sc = scalar(BODY);
  const slots = bundles.length * vias;
  const nops = slots - BODY.length;
  const nopPct = Math.round((nops / slots) * 100);
  const bp = branchVsPredicate(penalidade, 50);
  const wide = schedule(BODY, 4);
  const wideEnd = finish(wide);

  b.step(
    {
      id: "s1-dependencias",
      title: "Quem espera quem",
      subtitle: `${sc.end} ciclos, uma operação por vez`,
      text: `O cálculo tem 8 operações. As quatro leituras da memória são independentes; cada multiplicação espera duas leituras, a soma espera as duas multiplicações. Uma leitura leva ${LATENCY.ld} ciclos e uma multiplicação ${LATENCY.mul}. Um processador simples, que emite uma operação por ciclo na ordem do texto, termina em ${sc.end} ciclos: ele para antes da soma, esperando a segunda multiplicação.`,
      facts: [
        ["Operações", String(BODY.length)],
        ["Latências", `leitura ${LATENCY.ld}, multiplicação ${LATENCY.mul}, soma ${LATENCY.add}`],
        ["Escalar em ordem", `${sc.end} ciclos`],
      ],
      highlight: [],
    },
    () => {
      BODY.forEach((o, i) => {
        c.row("ops", i, [o.id, o.text, String(LATENCY[o.kind]), o.deps.join(", ") || "nada"], {
          dt: 1,
          mark: "new",
          log: { who: `op ${o.id}`, what: o.text, detail: `emitida no ciclo ${sc.issue.get(o.id)}` },
        });
      });
      c.count("ciclos", String(sc.end), { label: `escalar: ${sc.end} ciclos` });
    },
  );

  b.step(
    {
      id: "s2-pacotes",
      title: "O compilador empacota",
      subtitle: `${bundles.length} pacotes, ${end} ciclos`,
      text: `Numa máquina [[vliw]], a instrução é um pacote com ${vias} ${vias === 1 ? "via" : "vias"}, uma por unidade funcional. Quem decide o que vai junto é o compilador, que conhece as dependências e as latências: põe as leituras lado a lado e cada multiplicação no primeiro ciclo em que seus dados estão prontos. O hardware não confere nada, só executa o pacote. O cálculo cabe em ${bundles.length} pacotes e termina em ${end} ciclos, contra ${sc.end}.`,
      facts: [
        ["Vias por pacote", String(vias)],
        ["Pacotes", String(bundles.length)],
        ["Ciclos", String(end)],
      ],
      highlight: [],
    },
    () => {
      bundles.forEach((bu, i) => {
        c.row("pacotes", i, [String(bu.cycle), ...bu.slots.map((o) => (o ? o.text : "nop"))], {
          dt: 1,
          mark: bu.slots.every((o) => !o) ? "warn" : "new",
          log: {
            who: `ciclo ${bu.cycle}`,
            what: bu.slots.filter(Boolean).length
              ? bu.slots
                  .filter((o) => o)
                  .map((o) => o?.text)
                  .join(", ")
              : "só nop",
          },
        });
      });
      c.count("ciclos", String(end), { role: "a", label: `${end} ciclos` });
    },
  );

  b.step(
    {
      id: "s3-nops",
      title: "Espaço vazio custa",
      subtitle: `${nops} de ${slots} vias com NOP`,
      text: `Onde não há operação independente, a via leva um NOP. Aqui são ${nops} das ${slots} vias, ${nopPct}%: o programa fica bem maior que a versão escalar e ocupa mais cache de instruções. E o escalonamento vale para estas latências: se uma leitura falta na cache e demora mais, o pacote inteiro espera, porque não há hardware para reordenar. Com 4 vias, este cálculo terminaria em ${wideEnd} ciclos.`,
      facts: [
        ["NOPs", `${nops} de ${slots}`],
        ["Com 4 vias", `${wideEnd} ciclos`],
        ["Risco", "latência diferente da prevista"],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Quantas vias dos ${bundles.length} pacotes ficam com NOP?`,
        answer: nops,
        explain: `${bundles.length} pacotes × ${vias} ${vias === 1 ? "via" : "vias"} = ${slots}; menos as ${BODY.length} operações, sobram ${nops}.`,
      },
    },
    () => {
      c.count("nops", `${nops} de ${slots}`, { role: "bad", label: `${nops} NOPs` });
    },
  );

  b.step(
    {
      id: "s4-predicacao",
      title: "Trocar desvio por predicado",
      subtitle: `${dec(bp.branch)} contra ${bp.predicated} ciclos`,
      text: `Um if difícil de prever é ruim para um pacote fixo. Com a [[predicacao]], a comparação liga um de dois predicados, p1 ou p2, e as duas somas, x++ guardada por p1 e y++ por p2, entram no mesmo pacote; só a de predicado verdadeiro grava o resultado. Se o desvio erra metade das vezes e cada erro custa ${penalidade} ciclos, ele gasta em média ${dec(bp.branch)} ciclos; a versão predicada, ${bp.predicated}, sempre.`,
      facts: [
        ["Com desvio", `${dec(bp.branch)} ciclos em média`],
        ["Predicado", `${bp.predicated} ciclos`],
        ["Erro de previsão", `${penalidade} ciclos, 50%`],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `A versão com desvio gasta 3 ciclos (comparar, desviar, somar) mais a penalidade de ${penalidade} ciclos quando erra, e erra metade das vezes. Quantos ciclos ela gasta em média?`,
        answer: bp.branch,
        tolerance: 0.05,
        unit: "ciclos",
        explain: `3 + ${penalidade} × 0,5 = ${dec(bp.branch)} ciclos. A predicada gasta ${bp.predicated} sempre, então vence ${bp.branch > bp.predicated ? "com qualquer penalidade a partir de 1 ciclo" : "aqui por pouco"}.`,
      },
    },
    () => {
      c.row("if", 0, ["Desvio, erra 50%", dec(bp.branch)], { dt: 1, mark: "bad" });
      c.row("if", 1, ["Predicado (p1, p2)", String(bp.predicated)], { dt: 1, mark: "hit" });
    },
  );

  b.step(
    {
      id: "s5-epic",
      title: "O que sobrou do Itanium",
      subtitle: "EPIC, DSPs e GPUs",
      text: "O Itanium (IA-64) levou essa ideia ao limite: pacotes de três instruções, predicados em quase tudo e cargas especulativas, chamadas de [[epic]]. O desempenho dependia do compilador acertar latências que mudam a cada falta de cache, e os processadores fora de ordem venceram no uso geral. A ideia sobrevive onde as latências são previsíveis: processadores de sinais (DSPs) e partes das GPUs.",
      facts: [
        ["IA-64", "pacotes de 3, predicados"],
        ["Venceu no uso geral", "execução fora de ordem"],
        ["Ainda usado", "DSPs, GPUs"],
      ],
      highlight: [],
    },
    () => {
      c.count("ciclos", String(end), { dt: 1, label: `${end} ciclos com ${vias} vias` });
    },
  );

  return b.done({ scalar: sc.end, bundles: bundles.length, cycles: end, nops, branch: dec(bp.branch) });
}

const lesson: LessonModule = {
  meta: {
    slug: "vliw",
    site: "arq",
    title: "VLIW e predicação: o compilador monta o pacote",
    summary:
      "z = a × b + c × d escalonado pelo compilador em pacotes de vias fixas, os NOPs que sobram e a predicação no lugar de um desvio.",
    area: "Microarquitetura",
    refs: [
      {
        book: "tanenbaum-sco",
        chapter: 5,
        section: "5.8",
        note: "A arquitetura IA-64: pacotes, predicação e cargas especulativas",
        verified: true,
      },
    ],
    simplifications: [
      "Qualquer via executa qualquer operação; no IA-64, cada modelo de pacote fixa os tipos de unidade.",
      "As latências são fixas e conhecidas pelo compilador; não há faltas de cache.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "vias", kind: "int", label: "Vias por pacote", min: 1, max: 4 },
      { key: "penalidade", kind: "int", label: "Custo de um erro de previsão (ciclos)", min: 1, max: 20 },
    ],
  },
  build,
  intro: {
    text: "Um processador fora de ordem descobre sozinho, em hardware, quais instruções podem ir juntas. A alternativa é deixar essa decisão para o compilador e entregar ao hardware instruções largas, já montadas. Você vai montar esses pacotes para um cálculo de oito operações.",
    facts: [
      ["Cálculo", "z = a × b + c × d"],
      ["Vias", String(DEFAULTS.vias)],
      ["Quem escalona", "o compilador"],
    ],
  },
  outro: {
    title: "VLIW em resumo",
    text: "No VLIW, o compilador agrupa operações independentes em pacotes e o hardware fica simples. O preço são NOPs onde falta paralelismo e um escalonamento que quebra quando a latência muda; a predicação troca desvios imprevisíveis por operações guardadas.",
    facts: (run) => [
      ["Escalar", `${run.stats.scalar} ciclos`],
      ["VLIW", `${run.stats.cycles} ciclos`],
      ["NOPs", String(run.stats.nops)],
    ],
  },
  next: ["fora-de-ordem", "previsao-desvio"],
  practice,
};

export default lesson;
