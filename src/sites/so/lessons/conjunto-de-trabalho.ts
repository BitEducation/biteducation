import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { load, lruFaults, workingSet } from "../../../sim/os/workingset.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Working set and thrashing: a 72-reference string in three loops, its working set over time,
 * LRU faults per frame count, and CPU use as more copies of it share the frames.
 */
export const DEFAULTS = { quadros: 24 };
const DELTA = 8;
const DISK = 6;
const MAX_K = 8;
const loop = (pages: number[], times: number) => Array.from({ length: times }, () => pages).flat();
const REFS = [...loop([1, 2, 3, 4], 6), ...loop([5, 6, 7, 8], 6), ...loop([1, 2, 9, 10], 6)];

const clamp = (p: Params) => Math.min(32, Math.max(8, Math.round(Number(p.quadros ?? DEFAULTS.quadros))));

const scene: SceneSpec = {
  viewBox: [960, 600],
  nodes: [],
  links: [],
  widgets: [
    {
      kind: "chart",
      id: "ws",
      title: `Conjunto de trabalho (Δ = ${DELTA}) ao longo das ${REFS.length} referências`,
      at: [50, 50],
      width: 380,
      height: 150,
      x: { label: "referência", max: REFS.length },
      y: { label: "páginas", max: 8 },
    },
    {
      kind: "chart",
      id: "faltas",
      title: "Faltas com LRU por número de quadros",
      at: [530, 50],
      width: 380,
      height: 150,
      x: { label: "quadros", max: 8 },
      y: { label: "faltas", max: REFS.length },
    },
    {
      kind: "table",
      id: "carga",
      title: "k cópias do processo dividindo os quadros",
      at: [40, 290],
      columns: ["Processos", "Quadros cada", "Faltas cada", "Uso da CPU"],
      widths: [120, 140, 130, 130],
      rows: MAX_K,
    },
    {
      kind: "chart",
      id: "uso",
      title: "Uso da CPU por processos",
      at: [620, 320],
      width: 290,
      height: 150,
      x: { label: "processos", max: MAX_K },
      y: { label: "%", max: 100 },
    },
  ],
};

export function build(p: Params) {
  const frames = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const ws = workingSet(REFS, DELTA);
  const steady = 4;
  const peak = Math.max(...ws);
  const curve = Array.from({ length: 8 }, (_, i) => ({ f: i + 1, n: lruFaults(REFS, i + 1) }));
  const at3 = curve[2]?.n ?? 0;
  const at4 = curve[3]?.n ?? 0;
  const loads = Array.from({ length: MAX_K }, (_, i) => ({ k: i + 1, ...load(REFS, frames, i + 1, DISK) }));
  const one = loads[0] as (typeof loads)[number];
  const bestUse = Math.max(...loads.map((l) => l.use));
  const crash = loads.find((l) => l.each < steady);
  const admit = Math.floor(frames / steady);

  b.step(
    {
      id: "s1-localidade",
      title: "Poucas páginas por vez",
      subtitle: `Quase sempre ${steady} páginas`,
      text: `Um processo faz ${REFS.length} acessos à memória em três laços: primeiro nas páginas 1 a 4, depois 5 a 8, depois 1, 2, 9 e 10. O [[conjunto-de-trabalho]] é o grupo de páginas usadas nas últimas Δ = ${DELTA} referências. No gráfico, ele fica em ${steady} páginas e só sobe, até ${peak}, nas trocas de laço, quando as páginas velhas e as novas se misturam na janela.`,
      facts: [
        ["Referências", String(REFS.length)],
        ["Janela Δ", String(DELTA)],
        ["Tamanho típico", `${steady} páginas`],
      ],
      highlight: [],
    },
    () => {
      ws.forEach((v, t) => {
        if (t % 2 === 1 || t === REFS.length - 1)
          c.plot("ws", "W", t + 1, v, {
            role: "a",
            dt: t === 1 ? 1 : 0,
            label: `t = ${t + 1}: ${v} páginas`,
          });
      });
    },
  );

  b.step(
    {
      id: "s2-faltas",
      title: "Abaixo do conjunto, desastre",
      subtitle: `${at4} faltas com 4 quadros, ${at3} com 3`,
      text: `Agora o mesmo processo roda com cada vez menos quadros, usando LRU. Com 4 ou mais, quase só há as faltas inevitáveis da primeira vez de cada página: ${at4}. Com 3, o laço de quatro páginas expulsa sempre a página que será usada logo depois, e todas as ${at3} referências faltam. A curva não desce aos poucos: ela despenca quando os quadros cobrem o conjunto de trabalho.`,
      facts: [
        ["Com 4 quadros", `${at4} faltas`],
        ["Com 3 quadros", `${at3} faltas`],
        ["Limite", `${steady} quadros`],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: "Com quantos quadros, no mínimo, as faltas deixam de acontecer em toda referência?",
        answer: steady,
        explain: `Cada laço usa ${steady} páginas. Com ${steady} quadros elas cabem e só a primeira passada falta; com ${steady - 1}, o LRU sempre expulsa a próxima a ser usada.`,
      },
    },
    () => {
      for (const x of curve)
        c.plot("faltas", "LRU", x.f, x.n, { role: "b", dt: 1, label: `${x.f} quadros: ${x.n} faltas` });
    },
  );

  const row = (l: (typeof loads)[number]) =>
    c.row("carga", l.k - 1, [String(l.k), String(l.each), String(l.faults), `${l.use}%`], {
      dt: 1,
      mark: l.each < steady ? "bad" : l.use === 100 ? "hit" : "new",
      log: {
        who: `${l.k} processos`,
        what: `${l.use}% de CPU`,
        detail: `${l.each} quadros, ${l.faults} faltas cada`,
      },
    });

  b.step(
    {
      id: "s3-multiprogramacao",
      title: "Mais processos, mais CPU",
      subtitle: `${one.use}% com 1, até ${bestUse}%`,
      text: `Há ${frames} quadros para dividir. Sozinho, o processo deixa a CPU parada enquanto o disco busca suas ${one.faults} páginas: ${one.use}% de uso, com cada falta custando ${DISK} unidades de tempo. Com mais processos, um usa a CPU enquanto outro espera o disco, e o uso sobe até ${bestUse}%. É por isso que o sistema mantém vários processos na memória: o [[grau-de-multiprogramacao]] esconde a espera de um com o trabalho de outro.`,
      facts: [
        ["Quadros", String(frames)],
        ["Uso com 1 processo", `${one.use}%`],
        ["Melhor uso", `${bestUse}%`],
      ],
      highlight: [],
    },
    () => {
      for (const l of loads.filter((x) => x.each >= steady)) {
        row(l);
        c.plot("uso", "CPU", l.k, l.use, { role: "a", label: `${l.k}: ${l.use}%` });
      }
    },
  );

  b.step(
    {
      id: "s4-thrashing",
      title: "A CPU para de novo",
      subtitle: crash ? `${crash.k} processos, ${crash.use}%` : "Não chega a acontecer",
      text: crash
        ? `Com ${crash.k} processos, cada um fica com ${crash.each} quadros, menos que o seu conjunto de trabalho. Cada processo passa a faltar em todas as ${crash.faults} referências, o disco vira o gargalo e o uso da CPU cai para ${crash.use}%. É o [[thrashing]]: o sistema passa o tempo trocando páginas e quase não trabalha. Um observador ingênuo vê a CPU ociosa e admite mais processos, o que piora tudo.`
        : `Com ${frames} quadros, nem ${MAX_K} processos ficam abaixo do conjunto de trabalho de ${steady} páginas, e o [[thrashing]] não aparece. Diminua os quadros no Laboratório para ver a CPU despencar quando cada processo recebe menos de ${steady}.`,
      facts: crash
        ? [
            ["Quadros cada", String(crash.each)],
            ["Faltas cada", String(crash.faults)],
            ["Uso da CPU", `${crash.use}%`],
          ]
        : [
            ["Quadros", String(frames)],
            ["Processos", String(MAX_K)],
            ["Thrashing", "não"],
          ],
      highlight: [],
    },
    () => {
      const rest = loads.filter((x) => x.each < steady);
      if (!rest.length) c.note("uso", "Nenhum processo abaixo do conjunto de trabalho", "good", { dt: 1 });
      for (const l of rest) {
        row(l);
        c.plot("uso", "CPU", l.k, l.use, { role: "bad", label: `${l.k}: ${l.use}%` });
      }
    },
  );

  b.step(
    {
      id: "s5-controle",
      title: "Controlar a carga",
      subtitle: `No máximo ${admit} processos`,
      text: `A defesa é medir. Pelo modelo do conjunto de trabalho, um processo só entra na memória se a soma dos conjuntos couber nos quadros: aqui, ${frames} ÷ ${steady} = ${admit} processos. Outra técnica acompanha a frequência de faltas de cada um, dando quadros a quem falta demais e tirando de quem quase não falta. Se não há como atender todos, o sistema suspende um processo e devolve os quadros dele aos outros.`,
      facts: [
        ["Admitir até", `${admit} processos`],
        ["Técnica 1", "soma dos conjuntos de trabalho"],
        ["Técnica 2", "frequência de faltas"],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Há ${frames} quadros e cada processo tem conjunto de trabalho de ${steady} páginas. Quantos processos o controle de carga deixa na memória?`,
        answer: admit,
        tolerance: 0,
        unit: "processos",
        explain: `Cabem ${frames} ÷ ${steady} = ${admit} conjuntos inteiros. Um processo a mais deixaria alguém abaixo de ${steady} quadros, e as faltas explodiriam.`,
      },
    },
    () => {
      c.note("carga", `Limite pelo conjunto de trabalho: ${admit} processos`, "good", { dt: 1 });
    },
  );

  return b.done({
    steady,
    peak,
    at3,
    at4,
    oneUse: one.use,
    crashK: crash?.k ?? 0,
    crashUse: crash?.use ?? 0,
    admit,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "conjunto-de-trabalho",
    site: "so",
    title: "Conjunto de trabalho e thrashing",
    summary:
      "Um processo com três laços, seu conjunto de trabalho, as faltas por número de quadros e a CPU despencando quando processos demais dividem a memória.",
    area: "Memória",
    refs: [
      {
        book: "tanenbaum-mos",
        chapter: 3,
        section: "3.4.8",
        note: "O algoritmo de substituição do conjunto de trabalho",
        verified: true,
      },
      {
        book: "tanenbaum-mos",
        chapter: 3,
        section: "3.5.2",
        note: "Controle de carga",
        verified: true,
      },
      {
        book: "maziero-so",
        chapter: 17,
        section: "17.5",
        note: "Conjunto de trabalho; thrashing na seção 17.7",
        verified: true,
      },
    ],
    simplifications: [
      "As cópias do processo têm a mesma sequência de referências e dividem os quadros por igual.",
      "CPU e disco se sobrepõem perfeitamente entre processos; um único disco atende as faltas em fila.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [{ key: "quadros", kind: "int", label: "Quadros na memória", min: 8, max: 32 }],
  },
  build,
  intro: {
    text: "Um processo não usa todas as suas páginas ao mesmo tempo: usa um punhado por vez. Se ganhar quadros para esse punhado, roda bem; se ganhar um a menos, quase só falta. Você vai ver essa fronteira e o que acontece quando o sistema a ignora.",
    facts: [
      ["Referências", String(REFS.length)],
      ["Quadros", String(DEFAULTS.quadros)],
      ["Custo de uma falta", `${DISK} unidades`],
    ],
  },
  outro: {
    title: "Conjunto de trabalho em resumo",
    text: "Cada processo precisa de quadros para o seu conjunto de trabalho; abaixo disso, as faltas explodem. Mais processos aumentam o uso da CPU até o ponto em que ninguém cabe mais, e então o thrashing a derruba; o controle de carga evita esse ponto.",
    facts: (run) => [
      ["Faltas com 4 quadros", String(run.stats.at4)],
      ["Faltas com 3 quadros", String(run.stats.at3)],
      ["Limite de processos", String(run.stats.admit)],
    ],
  },
  next: ["substituicao-paginas", "paginacao-tlb"],
};

export default lesson;
