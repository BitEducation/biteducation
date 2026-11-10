import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import { type Policy, type Result, run } from "../../../sim/arch/smt.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { smt as practice } from "../practice.ts";

/**
 * Hardware multithreading: two threads that miss the cache share one core under no
 * multithreading, coarse-grained, fine-grained and simultaneous multithreading (SMT).
 */
export const DEFAULTS = { falta: 6, troca: 2 };
const THREADS = ["iimiiimi", "iiiimiii"];
const NAMES = ["A", "B"];
const LANES: Record<Policy, string[]> = {
  single: ["Sem multithreading"],
  coarse: ["Grão grosso"],
  fine: ["Grão fino"],
  smt: ["SMT, via 1", "SMT, via 2"],
};

function clamp(p: Params) {
  const falta = Math.min(12, Math.max(1, Math.round(Number(p.falta ?? DEFAULTS.falta))));
  const troca = Math.min(4, Math.max(0, Math.round(Number(p.troca ?? DEFAULTS.troca))));
  return { falta, troca };
}

const opts = (p: Params) => {
  const { falta, troca } = clamp(p);
  return { threads: THREADS, miss: falta, switchCost: troca, width: 2 };
};

function scene(p: Params): SceneSpec {
  const span = Math.max(...(["single", "coarse", "fine", "smt"] as const).map((k) => run(k, opts(p)).cycles));
  return {
    viewBox: [960, 520],
    nodes: [],
    links: [],
    widgets: [
      {
        kind: "gantt",
        id: "ciclos",
        title: "Quem emite em cada ciclo (A e B; as faltas de cache em destaque)",
        at: [40, 50],
        lanes: Object.values(LANES).flat(),
        span,
        width: 880,
      },
      {
        kind: "table",
        id: "placar",
        title: "16 instruções, 4 faltas de cache",
        at: [40, 330],
        columns: ["Política", "Ciclos", "Uso das vias"],
        widths: [260, 120, 160],
        rows: 4,
      },
      { kind: "counter", id: "ciclos-n", title: "Ciclos", at: [680, 340] },
    ],
  };
}

const dec = (x: number) => String(x).replace(".", ",");

export function build(p: Params) {
  const { falta, troca } = clamp(p);
  const o = opts(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => `ciclo ${t}`);
  const r = {
    single: run("single", o),
    coarse: run("coarse", o),
    fine: run("fine", o),
    smt: run("smt", o),
  };
  const ORDER: Policy[] = ["single", "coarse", "fine", "smt"];
  let seq = 0;
  const draw = (x: Result) => {
    for (const i of x.issues) {
      seq += 1;
      const name = `${NAMES[i.thread]}${i.index}`;
      const role: Role = i.miss ? "warn" : i.thread === 0 ? "a" : "b";
      b.ev({
        t: seq,
        kind: "gantt",
        lane: (LANES[x.policy] as string[])[i.slot] as string,
        from: i.cycle,
        to: i.cycle + 1,
        item: name,
        itemRole: role,
        role,
        label: `${name} no ciclo ${i.cycle}${i.miss ? ", falta de cache" : ""}`,
        row: {
          cols: {
            t: `ciclo ${i.cycle}`,
            who: (LANES[x.policy] as string[])[i.slot] as string,
            what: name,
            detail: i.miss ? `falta: ${NAMES[i.thread]} espera ${falta} ciclos` : "",
          },
        },
      });
    }
    c.at(seq);
    const label = (LANES[x.policy] as string[])[0]?.replace(", via 1", "") ?? "";
    c.row("placar", ORDER.indexOf(x.policy), [label, String(x.cycles), `${dec(x.use)}%`], {
      dt: 1,
      mark: "new",
      log: { who: label, what: `${x.cycles} ciclos`, detail: `${dec(x.use)}% das vias ocupadas` },
    });
    c.count("ciclos-n", String(x.cycles), { label: `${label}: ${x.cycles} ciclos` });
    seq = c.t;
  };
  const best = ORDER.reduce((a, k) => (r[k].cycles < r[a].cycles ? k : a), "single" as Policy);

  b.step(
    {
      id: "s1-espera",
      title: "O núcleo parado",
      subtitle: `${r.single.cycles} ciclos, ${dec(r.single.use)}% de uso`,
      text: `Duas [[thread|threads]], A e B, têm 8 instruções cada; algumas faltam na cache e a thread espera ${falta} ciclos pela memória. Sem multithreading, o núcleo roda A até o fim e depois B, e a cada falta fica parado. São ${r.single.cycles} ciclos para 16 instruções: o núcleo trabalha em ${dec(r.single.use)}% deles. O resto é espera pela memória, que nenhuma das duas threads consegue esconder sozinha.`,
      facts: [
        ["Ciclos", String(r.single.cycles)],
        ["Uso", `${dec(r.single.use)}%`],
        ["Espera por falta", `${falta} ciclos`],
      ],
      highlight: [],
    },
    () => draw(r.single),
  );

  b.step(
    {
      id: "s2-grosso",
      title: "Trocar na falta",
      subtitle: `${r.coarse.cycles} ciclos com troca de ${troca}`,
      text: `No [[multithreading-grao-grosso]], o núcleo guarda os registradores das duas threads e, quando uma falta na cache, passa para a outra. A troca não é de graça: o pipeline esvazia e ${troca === 1 ? "perde-se 1 ciclo" : `perdem-se ${troca} ciclos`}. Mesmo assim, enquanto A espera a memória, B avança, e o total cai de ${r.single.cycles} para ${r.coarse.cycles} ciclos. Faltas curtas quase não compensam a troca; as longas, sim.`,
      facts: [
        ["Ciclos", String(r.coarse.cycles)],
        ["Custo da troca", `${troca} ${troca === 1 ? "ciclo" : "ciclos"}`],
        ["Uso", `${dec(r.coarse.use)}%`],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: "Quando trocar de thread na falta de cache deixa de valer a pena?",
        options: [
          "Quando a falta dura pouco mais que a própria troca",
          "Quando as duas threads têm o mesmo número de instruções",
          "Quando o núcleo tem mais de uma via",
        ],
        answer: 0,
        explain: `A troca custa ${troca} ${troca === 1 ? "ciclo" : "ciclos"} e só ganha o tempo da espera de ${falta}. Se a espera for quase igual à troca, o núcleo perde o que ganharia; no Laboratório, aproxime os dois valores para ver.`,
      },
    },
    () => draw(r.coarse),
  );

  b.step(
    {
      id: "s3-fino",
      title: "Alternar a cada ciclo",
      subtitle: `${r.fine.cycles} ciclos, sem custo de troca`,
      text: `No [[multithreading-grao-fino]], o núcleo alterna de thread a cada ciclo, pulando a que está esperando. Como as instruções de A e B se intercalam desde o início, não há troca a pagar: ${r.fine.cycles} ciclos e ${dec(r.fine.use)}% de uso. Uma vantagem extra é que duas instruções seguidas no pipeline são de threads diferentes, então não dependem uma da outra.`,
      facts: [
        ["Ciclos", String(r.fine.cycles)],
        ["Uso", `${dec(r.fine.use)}%`],
        ["Troca", "sem custo"],
      ],
      highlight: [],
    },
    () => draw(r.fine),
  );

  b.step(
    {
      id: "s4-smt",
      title: "Duas por ciclo",
      subtitle: `${r.smt.cycles} ciclos com 2 vias`,
      text: `Um núcleo superescalar emite várias instruções por ciclo, mas uma thread só raramente tem trabalho para todas as vias. No [[smt]], as vias livres recebem instruções da outra thread no mesmo ciclo: aqui, até duas por ciclo, e o total cai para ${r.smt.cycles} ciclos. O uso das vias, ${dec(r.smt.use)}%, parece baixo porque há o dobro de vias; quando as duas threads esperam a memória ao mesmo tempo, nada preenche o ciclo.`,
      facts: [
        ["Ciclos", String(r.smt.cycles)],
        ["Vias", "2"],
        ["Uso das vias", `${dec(r.smt.use)}%`],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: "O que o SMT faz que o multithreading de grão fino não faz?",
        options: [
          "Emite instruções de threads diferentes no mesmo ciclo",
          "Guarda os registradores de várias threads",
          "Evita a falta de cache",
        ],
        answer: 0,
        explain:
          "Os dois guardam os registradores de várias threads e nenhum evita a falta. O grão fino alterna ciclo a ciclo; o SMT preenche as vias de um mesmo ciclo com threads diferentes.",
      },
    },
    () => draw(r.smt),
  );

  b.step(
    {
      id: "s5-preco",
      title: "O que se divide",
      subtitle: "Hyper-Threading é SMT com 2 threads",
      text: `No placar, a política mais rápida é ${(LANES[best] as string[])[0]?.replace(", via 1", "")}, com ${r[best].cycles} ciclos contra ${r.single.cycles} sem multithreading. Nenhuma delas tira a falta de cache; só põem outra thread para trabalhar enquanto a memória responde. O preço é dividir tudo: as threads disputam caches, preditor de desvio e vias, e uma pode deixar a outra mais lenta. Para o sistema operacional, cada thread de hardware aparece como um processador.`,
      facts: [
        ["Mais rápido", `${r[best].cycles} ciclos`],
        ["Sem multithreading", `${r.single.cycles} ciclos`],
        ["Para o SO", "um processador lógico por thread"],
      ],
      highlight: [],
    },
    () => {
      c.row(
        "placar",
        ORDER.indexOf(best),
        [
          (LANES[best] as string[])[0]?.replace(", via 1", "") ?? "",
          String(r[best].cycles),
          `${dec(r[best].use)}%`,
        ],
        { dt: 1, mark: "hit" },
      );
    },
  );

  return b.done({
    single: r.single.cycles,
    coarse: r.coarse.cycles,
    fine: r.fine.cycles,
    smt: r.smt.cycles,
    smtUse: dec(r.smt.use),
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "smt",
    site: "arq",
    title: "Multithreading em hardware: esconder a espera pela memória",
    summary:
      "Duas threads com faltas de cache num núcleo: sem multithreading, grão grosso, grão fino e SMT, ciclo a ciclo.",
    area: "Paralelismo",
    refs: [
      {
        book: "tanenbaum-sco",
        chapter: 8,
        section: "8.1.2",
        note: "Multithreading no chip: grão fino, grão grosso e simultâneo",
        verified: true,
      },
    ],
    simplifications: [
      "Cada instrução leva 1 ciclo para ser emitida; só as faltas de cache causam espera.",
      "No SMT, cada thread emite no máximo uma instrução por ciclo.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "falta", kind: "int", label: "Espera por falta de cache (ciclos)", min: 1, max: 12 },
      { key: "troca", kind: "int", label: "Custo da troca no grão grosso (ciclos)", min: 0, max: 4 },
    ],
  },
  build,
  intro: {
    text: "Uma falta de cache deixa o núcleo esperando a memória por dezenas de ciclos. Em vez de esperar, o hardware pode guardar o estado de outra thread e trabalhar nela. Você vai ver quatro jeitos de fazer isso, ciclo a ciclo.",
    facts: [
      ["Threads", "A e B, 8 instruções cada"],
      ["Faltas de cache", "4"],
      ["Vias no SMT", "2"],
    ],
  },
  outro: {
    title: "Multithreading em resumo",
    text: "O multithreading em hardware esconde a espera pela memória trabalhando em outra thread. Grão grosso troca na falta e paga a troca; grão fino alterna a cada ciclo; SMT põe threads diferentes nas vias do mesmo ciclo.",
    facts: (run) => [
      ["Sem multithreading", `${run.stats.single} ciclos`],
      ["Grão fino", `${run.stats.fine} ciclos`],
      ["SMT", `${run.stats.smt} ciclos`],
    ],
  },
  next: ["coerencia-mesi", "fora-de-ordem"],
  practice,
};

export default lesson;
