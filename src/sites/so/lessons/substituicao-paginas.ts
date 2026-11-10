import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { type ReplAlgo, type ReplResult, replace } from "../../../sim/os/replace.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { substituicaoPaginas as practice } from "../practice.ts";

/**
 * FIFO, optimal, LRU and clock on the same reference string, then Belady's anomaly (FIFO gets
 * more faults with more frames) against LRU, which never does.
 */
export const DEFAULT_REFS = "2 3 2 1 5 2 4 5 3 2 5 2";
/** Classic string for Belady's anomaly. */
export const BELADY = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];
const ALGOS: { id: ReplAlgo; name: string }[] = [
  { id: "fifo", name: "FIFO" },
  { id: "opt", name: "Ótimo" },
  { id: "lru", name: "LRU" },
  { id: "clock", name: "Relógio" },
];

export function parseRefs(spec: string): number[] {
  const xs = spec
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(Number);
  if (xs.length < 4 || xs.length > 14 || xs.some((x) => !Number.isInteger(x) || x < 0 || x > 9))
    throw new Error("Use de 4 a 14 páginas, cada uma de 0 a 9");
  return xs;
}

function read(p: Params) {
  const frames = Math.min(5, Math.max(2, Number(p.quadros ?? 3)));
  const refs = parseRefs(String(p.paginas ?? DEFAULT_REFS));
  return { frames, refs, rows: 2 + Math.max(frames, 4), cols: Math.max(refs.length, BELADY.length) };
}

function scene(p: Params): SceneSpec {
  const { rows, cols } = read(p);
  const cellW = 44;
  return {
    viewBox: [960, 640],
    nodes: [],
    links: [],
    widgets: [
      {
        kind: "grid",
        id: "g",
        title: "Linha 1: página pedida · linha 2: falta (F) · demais: quadros da memória",
        at: [40, 40],
        cols,
        rows,
        cellW,
        indexLabel: "none",
      },
      {
        kind: "table",
        id: "res",
        title: "Faltas de página",
        at: [700, 40],
        columns: ["Algoritmo", "Faltas"],
        widths: [170, 70],
        rows: 6,
      },
      {
        kind: "chart",
        id: "curva",
        title: "Faltas na cadeia de Belady conforme o número de quadros",
        at: [60, 380],
        width: 560,
        height: 200,
        x: { label: "quadros", max: 6 },
        y: { label: "faltas", max: 12 },
      },
    ],
  };
}

export function build(p: Params) {
  const { frames, refs, rows, cols } = read(p);
  const b = lessonBuilder();
  let t = 0;
  const runs = ALGOS.map((a) => replace(refs, frames, a.id));
  const [fifo, opt, lru, clock] = runs as [ReplResult, ReplResult, ReplResult, ReplResult];
  const cell = (r: number, c: number) => r * cols + c;

  const clear = () => {
    t++;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        b.ev({
          t,
          kind: "cell",
          grid: "g",
          index: cell(r, c),
          value: "",
          role: "muted",
          label: "Limpa a tabela",
        });
  };
  const play = (
    name: string,
    list: readonly number[],
    res: ReplResult,
    nframes: number,
    clockBits = false,
  ) => {
    clear();
    res.steps.forEach((s, c) => {
      t++;
      const what = s.hit
        ? `${s.page} já está no quadro ${s.slot}`
        : s.victim !== undefined
          ? `falta: sai ${s.victim}, entra ${s.page} no quadro ${s.slot}`
          : `falta: ${s.page} vai para o quadro livre ${s.slot}`;
      b.ev({
        t,
        kind: "cell",
        grid: "g",
        index: cell(0, c),
        value: String(list[c]),
        role: "b",
        label: `${name}: acesso à página ${s.page}`,
        row: {
          cols: {
            t: String(c + 1),
            who: name,
            what,
            detail: clockBits ? `R = ${s.ref?.map(Number).join("")}, ponteiro no ${s.hand}` : "",
          },
        },
      });
      b.ev({
        t,
        kind: "cell",
        grid: "g",
        index: cell(1, c),
        value: s.hit ? "" : "F",
        ...(s.hit ? {} : { mark: "miss" as const }),
        role: s.hit ? "muted" : "bad",
        label: s.hit ? "Acerto" : "Falta de página",
      });
      for (let f = 0; f < nframes; f++) {
        const v = s.frames[f];
        const bit = clockBits && v !== null && v !== undefined ? (s.ref?.[f] ? "*" : "") : "";
        b.ev({
          t,
          kind: "cell",
          grid: "g",
          index: cell(2 + f, c),
          value: v === null || v === undefined ? "" : `${v}${bit}`,
          ...(f === s.slot ? { mark: s.hit ? ("hit" as const) : ("new" as const) } : {}),
          role: f === s.slot ? (s.hit ? "s4" : "a") : "muted",
          label: `Quadro ${f}`,
        });
      }
    });
  };
  const result = (i: number, name: string, faults: number, mark: "new" | "hit" | "bad" | "warn" = "new") => {
    b.ev({
      t,
      kind: "row",
      table: "res",
      index: i,
      cells: [name, String(faults)],
      mark,
      role: "b",
      label: `${name}: ${faults} faltas`,
    });
  };
  const firstEvict = (r: ReplResult) => {
    const k = r.steps.findIndex((s) => s.victim !== undefined);
    return k < 0 ? undefined : { k, s: r.steps[k] as ReplResult["steps"][number] };
  };
  const fe = firstEvict(fifo);
  const oe = firstEvict(opt);
  const le = firstEvict(lru);
  const n = refs.length;

  b.step(
    {
      id: "s1-fifo",
      title: "Sai quem entrou primeiro",
      subtitle: `FIFO com ${frames} quadros`,
      text: `O programa pede ${n} páginas em sequência e a memória tem ${frames} [[quadro|quadros]]. Toda página que não está na memória causa uma [[falta-de-pagina]]. Quando os quadros enchem, alguém precisa sair. O FIFO tira a página que entrou há mais tempo${fe ? `: no acesso ${fe.k + 1} sai a ${fe.s.victim} para entrar a ${fe.s.page}` : ""}. É simples, mas ignora se a página ainda está em uso. Resultado: ${fifo.faults} faltas.`,
      facts: [
        ["Quadros", String(frames)],
        ["Acessos", String(n)],
        ["Faltas no FIFO", String(fifo.faults)],
      ],
      highlight: [],
    },
    () => {
      play("FIFO", refs, fifo, frames);
      result(0, "FIFO", fifo.faults);
    },
  );

  b.step(
    {
      id: "s2-otimo",
      title: "Se desse para prever",
      subtitle: "O algoritmo ótimo",
      text: `O melhor possível é tirar a página que vai demorar mais para ser usada de novo${oe ? `. No acesso ${oe.k + 1}, olhando para a frente, a ${oe.s.victim} é a que volta mais tarde, então ela sai` : ""}. Nenhum algoritmo faz menos que as ${opt.faults} faltas do ótimo. Só que ele precisa conhecer os acessos futuros, o que o sistema não sabe. Ele serve de régua para medir os outros.`,
      facts: [
        ["Faltas no ótimo", String(opt.faults)],
        ["Precisa saber", "os acessos futuros"],
        ["Uso", "comparação"],
      ],
      highlight: [],
    },
    () => {
      play("Ótimo", refs, opt, frames);
      result(1, "Ótimo", opt.faults);
    },
  );

  b.step(
    {
      id: "s3-lru",
      title: "O passado prevê o futuro",
      subtitle: "LRU: menos usada recentemente",
      text: `Pela [[localidade]], o que foi usado há pouco tende a ser usado de novo. O [[lru]] tira a página cujo último uso está mais longe no passado${le ? `: no acesso ${le.k + 1} sai a ${le.s.victim}` : ""}. Aqui ele faz ${lru.faults} faltas, contra ${opt.faults} do ótimo e ${fifo.faults} do FIFO. O problema é o custo: registrar a ordem exata de cada acesso à memória é caro demais para o hardware.`,
      facts: [
        ["Faltas no LRU", String(lru.faults)],
        ["Ótimo / FIFO", `${opt.faults} / ${fifo.faults}`],
        ["Custo exato", "anotar cada acesso"],
      ],
      highlight: [],
    },
    () => {
      play("LRU", refs, lru, frames);
      result(2, "LRU", lru.faults);
    },
  );

  b.step(
    {
      id: "s4-relogio",
      title: "Uma segunda chance",
      subtitle: "Relógio com o bit de referência",
      text: `O hardware só liga um [[bit-de-referencia]] (R) quando a página é usada; na tabela, o asterisco marca R = 1. O relógio percorre os quadros em círculo: se R = 1, apaga o bit e dá uma segunda chance; se R = 0, a página sai. Assim ele aproxima o LRU com um bit por página. Nesta sequência foram ${clock.faults} faltas.`,
      facts: [
        ["Faltas no relógio", String(clock.faults)],
        ["Informação usada", "1 bit por página"],
        ["Ponteiro", "anda em círculo"],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Com ${frames} quadros, quantas faltas o relógio vai ter nesta sequência?`,
        answer: clock.faults,
        explain: `Foram ${clock.faults} faltas: entre o LRU (${lru.faults}) e o FIFO (${fifo.faults}) neste caso. Com um único bit, o relógio não distingue qual página foi usada mais recentemente, só se foi usada desde a última passada do ponteiro.`,
      },
    },
    () => {
      play("Relógio", refs, clock, frames, true);
      result(3, "Relógio", clock.faults);
    },
  );

  const belady = [1, 2, 3, 4, 5, 6].map((k) => ({
    k,
    fifo: replace(BELADY, k, "fifo").faults,
    lru: replace(BELADY, k, "lru").faults,
  }));
  const f3 = belady[2]?.fifo ?? 0;
  const f4 = belady[3]?.fifo ?? 0;
  b.step(
    {
      id: "s5-belady",
      title: "Mais memória, mais faltas?",
      subtitle: "A anomalia de Belady",
      text: `Seria de esperar que mais quadros sempre dessem menos faltas. Na cadeia ${BELADY.join(" ")}, o FIFO faz ${f3} faltas com 3 quadros e ${f4} com 4. É a [[anomalia-de-belady]]. No gráfico, a curva do FIFO sobe nesse ponto, e a do LRU só desce: no LRU, o conteúdo com k quadros está sempre contido no conteúdo com k + 1, então mais memória nunca atrapalha.`,
      facts: [
        ["FIFO, 3 quadros", `${f3} faltas`],
        ["FIFO, 4 quadros", `${f4} faltas`],
        ["LRU", "nunca piora com mais quadros"],
      ],
      highlight: [],
    },
    () => {
      play("FIFO, 4 quadros", BELADY, replace(BELADY, 4, "fifo"), 4);
      result(4, "FIFO Belady, 3 quadros", f3, "warn");
      result(5, "FIFO Belady, 4 quadros", f4, "bad");
      for (const x of belady) {
        t++;
        b.ev({
          t,
          kind: "plot",
          chart: "curva",
          series: "FIFO",
          x: x.k,
          y: x.fifo,
          seriesRole: "bad",
          role: "bad",
          label: `FIFO com ${x.k}: ${x.fifo}`,
        });
        b.ev({
          t,
          kind: "plot",
          chart: "curva",
          series: "LRU",
          x: x.k,
          y: x.lru,
          seriesRole: "a",
          role: "a",
          label: `LRU com ${x.k}: ${x.lru}`,
        });
      }
    },
  );

  b.step(
    {
      id: "s6-trabalho",
      title: "Quando falta memória demais",
      subtitle: "Conjunto de trabalho e thrashing",
      text: `Cada programa tem um conjunto de trabalho: as páginas que usa num intervalo curto. Se a soma desses conjuntos não cabe na memória, toda troca tira uma página que logo volta a ser pedida. O sistema passa mais tempo lendo do disco do que executando: é o [[thrashing]]. Nenhum algoritmo de substituição resolve isso; a saída é rodar menos processos ao mesmo tempo ou ter mais memória.`,
      facts: [
        ["Conjunto de trabalho", "páginas usadas recentemente"],
        ["Thrashing", "faltas o tempo todo"],
        ["Saída", "menos processos ou mais memória"],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: "Um servidor está em thrashing. O que mais ajuda?",
        options: [
          "Trocar FIFO por LRU",
          "Suspender alguns processos para que os conjuntos de trabalho caibam na memória",
          "Aumentar o tamanho do quantum",
          "Desligar a TLB",
        ],
        answer: 1,
        explain:
          "No thrashing, a memória não comporta o que os processos precisam ao mesmo tempo. Um algoritmo melhor só muda quem sai; reduzir a quantidade de processos ativos, ou aumentar a memória, faz os conjuntos de trabalho caberem de novo.",
      },
    },
    () => {
      t++;
      b.ev({
        t,
        kind: "row",
        table: "res",
        index: 1,
        cells: ["Ótimo", String(opt.faults)],
        mark: "hit",
        role: "b",
        label: "O ótimo é o limite inferior",
      });
    },
  );

  return b.done({ fifo: fifo.faults, opt: opt.faults, lru: lru.faults, clock: clock.faults, f3, f4 });
}

const lesson: LessonModule = {
  meta: {
    slug: "substituicao-paginas",
    site: "so",
    title: "Substituição de páginas: quem sai da memória",
    summary:
      "FIFO, ótimo, LRU e relógio na mesma sequência de acessos, a anomalia de Belady e por que o thrashing não se resolve trocando de algoritmo.",
    area: "Memória",
    refs: [
      {
        book: "tanenbaum-mos",
        chapter: 3,
        section: "3.4",
        note: "Algoritmos de substituição de páginas",
        verified: true,
      },
      { book: "maziero-so", chapter: 17, section: "17.3", note: "Algoritmos clássicos", verified: true },
      { book: "maziero-so", chapter: 17, section: "17.6", note: "A anomalia de Belady", verified: true },
    ],
    simplifications: [
      "Uma sequência curta de páginas e poucos quadros; na prática são milhares.",
      "O relógio liga o bit R ao carregar a página e os quadros vazios são preenchidos em ordem.",
      "Sem bit de modificação: tirar uma página nunca exige gravá-la no disco aqui.",
    ],
  },
  scene,
  params: {
    defaults: { quadros: 3, paginas: DEFAULT_REFS },
    fields: [
      { key: "quadros", kind: "int", label: "Quadros na memória", min: 2, max: 5 },
      {
        key: "paginas",
        kind: "list",
        label: "Sequência de páginas",
        maxItems: 14,
        pattern: "\\d",
        placeholder: DEFAULT_REFS,
        help: "De 4 a 14 páginas, cada uma de 0 a 9. A cadeia de Belady do passo 5 é fixa.",
      },
    ],
  },
  build,
  intro: {
    text: "A memória tem poucos quadros e os programas querem mais páginas do que cabem. A cada falta, o sistema precisa escolher uma página para sair. Você vai ver quatro critérios na mesma sequência de acessos, contar as faltas de cada um e descobrir um caso em que dar mais memória piora o resultado.",
    facts: [
      ["Sequência", DEFAULT_REFS],
      ["Quadros", "3"],
      ["Algoritmos", "FIFO, ótimo, LRU, relógio"],
    ],
  },
  outro: {
    title: "Substituição em resumo",
    text: "O ótimo é a régua, o LRU chega perto usando o passado e o relógio aproxima o LRU com um bit por página. O FIFO é o mais simples e pode até piorar com mais memória. Quando a memória não comporta os conjuntos de trabalho, nenhum algoritmo salva: é preciso reduzir a carga.",
    facts: (run) => [
      ["FIFO / ótimo", `${run.stats.fifo} / ${run.stats.opt} faltas`],
      ["LRU / relógio", `${run.stats.lru} / ${run.stats.clock} faltas`],
      ["Belady (3 → 4 quadros)", `${run.stats.f3} → ${run.stats.f4}`],
    ],
  },
  next: ["paginacao-tlb", "escalonamento"],
  practice,
};

export default lesson;
