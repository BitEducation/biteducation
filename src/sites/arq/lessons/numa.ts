import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { LOCAL_NS, numaRun, PAGES, type Placement, THREADS } from "../../../sim/arch/numa.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { num } from "../../shared/practice-kit.ts";

/**
 * Memory that is not uniform: UMA's shared bus, NUMA nodes with local and remote memory, the
 * first-touch policy that puts every page on the node of the thread that initialized the array,
 * parallel initialization, affinity, and multicomputers that share no memory at all.
 */
export const DEFAULTS = { remoto: 140, politica: "intercalada" };

function clamp(p: Params): { remote: number; policy: Placement } {
  const remote = Math.min(300, Math.max(90, Math.round(Number(p.remoto ?? DEFAULTS.remoto))));
  const policy: Placement =
    p.politica === "principal" || p.politica === "paralela" ? p.politica : "intercalada";
  return { remote, policy };
}

function scene(): SceneSpec {
  return {
    viewBox: [960, 620],
    zones: [
      { id: "n0", title: "Nó 0 (soquete 0)", rect: { x: 20, y: 20, w: 430, h: 200 }, tone: "cpu" },
      { id: "n1", title: "Nó 1 (soquete 1)", rect: { x: 510, y: 20, w: 430, h: 200 }, tone: "cpu" },
    ],
    nodes: [
      { id: "c0", kind: "cpu", label: "T0", sub: "núcleo 0", at: [110, 80], w: 120 },
      { id: "c1", kind: "cpu", label: "T1", sub: "núcleo 1", at: [270, 80], w: 120 },
      { id: "m0", kind: "memory", label: "Memória 0", sub: `${LOCAL_NS} ns local`, at: [190, 170], w: 200 },
      { id: "c2", kind: "cpu", label: "T2", sub: "núcleo 2", at: [690, 80], w: 120 },
      { id: "c3", kind: "cpu", label: "T3", sub: "núcleo 3", at: [850, 80], w: 120 },
      { id: "m1", kind: "memory", label: "Memória 1", sub: `${LOCAL_NS} ns local`, at: [770, 170], w: 200 },
    ],
    links: [
      { id: "l0", from: "c0", to: "m0" },
      { id: "l1", from: "c1", to: "m0" },
      { id: "l2", from: "c2", to: "m1" },
      { id: "l3", from: "c3", to: "m1" },
      { id: "lx", from: "m0", to: "m1", style: "bus" },
    ],
    widgets: [
      {
        kind: "grid",
        id: "paginas",
        title: `Vetor de ${PAGES} páginas: em que nó cada uma está`,
        at: [40, 250],
        cols: PAGES,
        rows: 1,
        cellW: 105,
        indexLabel: "dec",
      },
      {
        kind: "table",
        id: "threads",
        title: `${THREADS} threads, 2 páginas cada`,
        at: [40, 360],
        columns: ["Thread", "Roda no", "Páginas locais", "Latência média"],
        widths: [100, 110, 150, 160],
        rows: THREADS,
      },
      { kind: "counter", id: "lat", title: "Latência média", at: [640, 370] },
      {
        kind: "table",
        id: "cmp",
        title: "Três formas de juntar processadores",
        at: [40, 520],
        columns: ["Forma", "Memória", "Acesso a dado distante"],
        widths: [200, 330, 330],
        rows: 3,
      },
    ],
  };
}

export function build(p: Params) {
  const { remote, policy } = clamp(p);
  const main = numaRun("principal", remote);
  const par = numaRun("paralela", remote);
  const chosen = numaRun(policy, remote);
  const b = lessonBuilder();
  const c = talk(
    b,
    { c0: "T0", c1: "T1", c2: "T2", c3: "T3", m0: "memória 0", m1: "memória 1" },
    (t) => `t${t}`,
  );
  const ns = (x: number) => `${num(x, 1)} ns`;
  const show = (r: typeof main) => {
    r.nodes.forEach((n, i) => {
      c.cell("paginas", i, `nó ${n}`, { mark: n === 0 ? "new" : "dirty", dt: 0 });
    });
    r.threads.forEach((x) => {
      c.row("threads", x.t, [`T${x.t}`, `nó ${x.node}`, `${x.local} de ${x.total}`, ns(x.ns)], {
        dt: 1,
        mark: x.local === x.total ? "hit" : x.local === 0 ? "bad" : "warn",
      });
    });
    c.count("lat", ns(r.avg), { label: ns(r.avg) });
  };
  const POL: Record<Placement, string> = {
    principal: "tudo inicializado pela thread principal",
    paralela: "cada thread inicializa a sua parte",
    intercalada: "páginas alternadas entre os nós",
  };

  b.step(
    {
      id: "s1-uma",
      title: "Uma memória para todos",
      subtitle: "UMA",
      text: `No desenho clássico, chamado [[uma|UMA]], todos os núcleos chegam à mesma memória pelo mesmo caminho, e qualquer endereço custa o mesmo tempo. Funciona com poucos núcleos. Com dezenas, o barramento e o controlador de memória viram gargalo: cada núcleo a mais divide a mesma banda. A saída foi dar a cada grupo de núcleos a própria memória.`,
      facts: [
        ["Caminhos à memória", "1"],
        ["Latência", "igual para todos"],
        ["Limite", "a banda compartilhada"],
      ],
      highlight: ["m0"],
    },
    () => {
      c.send("c0", "m0", "lê", { what: "leitura", detail: "mesmo caminho" });
      c.send("c1", "m0", "lê", { what: "leitura", detail: "disputa o caminho" });
    },
  );

  b.step(
    {
      id: "s2-numa",
      title: "Memória local e remota",
      subtitle: `${LOCAL_NS} contra ${remote} ns`,
      text: `Num sistema [[numa|NUMA]], cada soquete é um nó com núcleos e memória próprios, e os nós se ligam por uma interconexão. Todo núcleo ainda enxerga toda a memória, com um só espaço de endereços. Mas ler da memória do próprio nó custa ${LOCAL_NS} ns, e da do outro, passando pela interconexão, ${remote} ns: ${num(remote / LOCAL_NS, 2)} vezes mais.`,
      facts: [
        ["Local", `${LOCAL_NS} ns`],
        ["Remota", `${remote} ns`],
        ["Espaço de endereços", "um só"],
      ],
      highlight: ["m0", "m1"],
    },
    () => {
      c.send("c0", "m0", "local", { what: "leitura", detail: `${LOCAL_NS} ns` });
      c.send("c2", "m0", "remota", { what: "leitura", detail: `${remote} ns`, via: ["m1"] });
    },
  );

  b.step(
    {
      id: "s3-primeiro-toque",
      title: "Quem toca primeiro",
      subtitle: "Inicializado pela thread principal",
      text: `Onde fica cada página? Linux e Windows usam o [[primeiro-toque|primeiro toque]]: a página vai para o nó da thread que a escreveu primeiro. O programa preenche o vetor de ${PAGES} páginas na thread principal, que roda no nó 0, e só depois divide o trabalho entre ${THREADS} threads. T2 e T3, no nó 1, fazem todos os acessos remotos: ${ns(main.worst)}. A média vai a ${ns(main.avg)}.`,
      facts: [
        ["Páginas no nó 0", String(PAGES)],
        ["Acessos remotos", `${main.remote} de ${PAGES} páginas`],
        ["Média", ns(main.avg)],
      ],
      highlight: ["paginas", "threads"],
      quiz: {
        kind: "number",
        prompt: `Duas threads acessam só memória local (${LOCAL_NS} ns) e duas só remota (${remote} ns). Qual a latência média, em ns?`,
        answer: (LOCAL_NS + remote) / 2,
        tolerance: 0.5,
        unit: "ns",
        explain: `(2 × ${LOCAL_NS} + 2 × ${remote}) ÷ 4 = ${ns((LOCAL_NS + remote) / 2)}. E o laço paralelo só termina quando T2 e T3 terminam, presas a ${remote} ns.`,
      },
    },
    () => show(main),
  );

  b.step(
    {
      id: "s4-paralelo",
      title: "Cada um inicializa o seu",
      subtitle: "Toque paralelo",
      text: `A correção é inicializar em paralelo, com a mesma divisão do trabalho: cada thread escreve primeiro as páginas que vai usar. Pelo primeiro toque, as páginas de T2 e T3 nascem no nó 1. Agora todo acesso é local: ${ns(par.avg)} de média, e o laço termina quando todas as threads terminam, sem nenhuma presa à interconexão. O código é quase o mesmo; muda a ordem.`,
      facts: [
        ["Acessos remotos", String(par.remote)],
        ["Média", ns(par.avg)],
        ["Antes", ns(main.avg)],
      ],
      highlight: ["paginas", "threads"],
      quiz: {
        kind: "pick",
        prompt:
          "Com a inicialização paralela, em que memória ficam as páginas usadas por T3? Clique na cena.",
        targets: [
          { id: "m1", label: "Memória 1" },
          { id: "m0", label: "Memória 0" },
          { id: "c3", label: "Na cache de T3, sem memória" },
        ],
        answer: "m1",
        explain:
          "T3 roda no nó 1 e escreveu primeiro as próprias páginas, então elas foram para a memória 1, local para ela.",
      },
    },
    () => show(par),
  );

  b.step(
    {
      id: "s5-escolha",
      title: policy === "intercalada" ? "Intercalar as páginas" : "A política escolhida",
      subtitle: POL[policy],
      text: `Quando não se sabe quem vai usar cada dado, uma terceira opção é intercalar: páginas alternadas entre os nós. Ninguém fica só com acessos remotos, mas metade de tudo é remota. No Laboratório, com ${POL[policy]}, a média fica em ${ns(chosen.avg)} e a pior thread em ${ns(chosen.worst)}. E vale fixar threads nos núcleos: se o escalonador muda T3 de nó, a memória dela vira remota.`,
      facts: [
        [
          "Política",
          { principal: "pela principal", paralela: "em paralelo", intercalada: "intercalada" }[policy],
        ],
        ["Média", ns(chosen.avg)],
        ["Pior thread", ns(chosen.worst)],
      ],
      highlight: ["threads", "lat"],
    },
    () => show(chosen),
  );

  b.step(
    {
      id: "s6-multicomputadores",
      title: "Sem memória compartilhada",
      subtitle: "Multicomputadores",
      text: `Um passo além estão os [[multicomputador|multicomputadores]]: aglomerados de máquinas que não compartilham memória nenhuma. Um dado em outra máquina só chega por mensagem pela rede, em microssegundos, e o programa precisa dizer explicitamente o que envia, como no MPI. Os supercomputadores são assim por fora e NUMA por dentro: cada máquina tem vários nós, e o aglomerado as liga em rede.`,
      facts: [
        ["Memória", "uma por máquina"],
        ["Dado distante", "mensagem pela rede"],
        ["Biblioteca típica", "MPI"],
      ],
      highlight: ["cmp"],
    },
    () => {
      c.row("cmp", 0, ["UMA", "uma, igual para todos", "não existe: tudo custa o mesmo"], {
        dt: 1,
        mark: "new",
      });
      c.row("cmp", 1, ["NUMA", "uma por nó, endereços comuns", `leitura remota, ${remote} ns`], {
        dt: 1,
        mark: "new",
      });
      c.row(
        "cmp",
        2,
        ["Multicomputador", "uma por máquina, separadas", "mensagem pela rede, microssegundos"],
        { dt: 1, mark: "warn" },
      );
    },
  );

  return b.done({ main: main.avg, par: par.avg, chosen: chosen.avg, worstMain: main.worst });
}

const lesson: LessonModule = {
  meta: {
    slug: "numa",
    site: "arq",
    title: "NUMA e multicomputadores",
    summary:
      "Com vários soquetes, cada nó tem memória própria e o acesso remoto custa mais. O primeiro toque decide onde cada página fica, e inicializar em paralelo deixa tudo local. Multicomputadores vão além: sem memória compartilhada.",
    area: "Paralelismo",
    refs: [
      {
        book: "tanenbaum-sco",
        chapter: 8,
        section: "8.3.4",
        note: "Multiprocessadores NUMA",
        verified: true,
      },
      {
        book: "tanenbaum-sco",
        chapter: 8,
        section: "8.4",
        note: "Multicomputadores de troca de mensagens",
        verified: true,
      },
    ],
    simplifications: [
      "Cada thread faz o mesmo número de acessos a cada página, e nada fica na cache.",
      "Dois nós só; com mais, a distância entre nós também varia.",
      "As latências são ordens de grandeza, não de um processador específico.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "remoto", kind: "int", label: "Latência remota (ns)", min: 90, max: 300 },
      {
        key: "politica",
        kind: "choice",
        label: "Onde ficam as páginas (passo 5)",
        options: [
          { value: "intercalada", label: "intercaladas entre os nós" },
          { value: "principal", label: "tudo inicializado pela principal" },
          { value: "paralela", label: "cada thread inicializa a sua parte" },
        ],
      },
    ],
  },
  build,
  intro: {
    text: "Num servidor com dois soquetes, a memória não fica toda à mesma distância de cada núcleo. Você vai ver um programa paralelo ficar lento só por causa de quem inicializou o vetor, e a mudança de ordem que resolve.",
    facts: [
      ["Nós", "2"],
      ["Threads", String(THREADS)],
      ["Páginas", String(PAGES)],
    ],
  },
  outro: {
    title: "NUMA em resumo",
    text: "Em NUMA, toda a memória é visível, mas a do próprio nó é mais rápida. O sistema põe cada página no nó de quem a tocou primeiro, então quem inicializa os dados decide onde eles ficam. Inicializar em paralelo e fixar threads nos núcleos mantém os acessos locais. Multicomputadores dispensam a memória comum e trocam mensagens.",
    facts: (r) => [
      ["Pela principal", `${num(Number(r.stats.main), 1)} ns`],
      ["Em paralelo", `${num(Number(r.stats.par), 1)} ns`],
      ["Pior thread", `${num(Number(r.stats.worstMain), 1)} ns`],
    ],
  },
  next: ["coerencia-mesi", "amdahl", "simd-gpu"],
};

export default lesson;
