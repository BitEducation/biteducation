import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import { type Bit, counter, parseBits, type Sr, settleSr, waves } from "../../../sim/arch/latch.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * One bit of memory: two cross-coupled NOR gates hold a value, the forbidden input oscillates,
 * a clock-gated D latch is transparent while the clock is high, and an edge-triggered flip-flop
 * samples once per cycle, which is what registers and counters are made of.
 */
export const DEFAULTS = { d: "0110001110011000", inicio: 13 };
const T = 16;
const PERIOD = 4;
const G = { w: 70, h: 38 } as const;
const IN = { w: 56, h: 34 } as const;

const scene: SceneSpec = {
  viewBox: [960, 600],
  nodes: [
    { id: "R", kind: "box", label: "R", at: [80, 100], ...IN },
    { id: "S", kind: "box", label: "S", at: [80, 240], ...IN },
    { id: "G1", kind: "box", label: "NOR", at: [280, 100], ...G },
    { id: "G2", kind: "box", label: "NOR", at: [280, 240], ...G },
    { id: "Q", kind: "box", label: "Q", at: [480, 100], ...IN },
    { id: "NQ", kind: "box", label: "Q̄", at: [480, 240], ...IN },
  ],
  links: [
    { id: "w-r", from: "R", to: "G1" },
    { id: "w-s", from: "S", to: "G2" },
    { id: "w-q", from: "G1", to: "Q" },
    { id: "w-nq", from: "G2", to: "NQ" },
    {
      id: "w-fb-q",
      from: "G1",
      to: "G2",
      via: [
        [390, 100],
        [390, 140],
        [200, 200],
        [200, 228],
      ],
    },
    {
      id: "w-fb-nq",
      from: "G2",
      to: "G1",
      via: [
        [390, 240],
        [390, 200],
        [200, 140],
        [200, 112],
      ],
    },
  ],
  widgets: [
    {
      kind: "table",
      id: "sr",
      title: "Latch SR: entradas e saídas",
      at: [580, 50],
      columns: ["S", "R", "Q", "Q̄", "Efeito"],
      widths: [40, 40, 40, 40, 150],
      rows: 5,
    },
    { kind: "counter", id: "rodadas", title: "Atrasos de porta", at: [580, 210] },
    { kind: "counter", id: "mudancas", title: "Mudanças de Q", at: [760, 210] },
    {
      kind: "gantt",
      id: "ondas",
      title: "Formas de onda · barra = sinal em 1",
      at: [40, 320],
      lanes: ["CLK", "D", "Q do latch", "Q do flip-flop"],
      span: T,
      width: 880,
    },
    {
      kind: "grid",
      id: "reg",
      title: "Registrador de 4 bits",
      at: [40, 500],
      cols: 4,
      rows: 1,
      cellW: 46,
      indexLabel: "none",
    },
    { kind: "counter", id: "valor", title: "Valor no registrador", at: [300, 500] },
  ],
};

function clamp(p: Params) {
  const raw = String(p.d ?? DEFAULTS.d);
  const d = parseBits(/^[01]{16}$/.test(raw) ? raw : DEFAULTS.d);
  const start = Math.min(15, Math.max(0, Math.round(Number(p.inicio ?? DEFAULTS.inicio))));
  return { d, start };
}

const ticks = (n: number) => (n === 1 ? "1 vez" : `${n} vezes`);
const changes = (n: number) => (n === 0 ? "Q não muda" : `Q muda ${ticks(n)}`);
const list = (xs: number[]) =>
  xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`;

export function build(p: Params) {
  const { d, start } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, { G1: "NOR de cima", G2: "NOR de baixo", NQ: "Q̄" }, (t) => `${t}`);
  const w = waves(d, PERIOD);

  // wires change too often to log each one
  const quiet = (target: string, v: Bit) =>
    b.ev({
      t: c.t,
      kind: "state",
      target,
      text: "",
      tone: v ? "active" : "none",
      role: "a",
      label: `${target} = ${v}`,
    });
  let sr: Sr = { q: 0, nq: 1 };
  const inputs = (s: Bit, r: Bit) => {
    c.state("S", `= ${s}`, { tone: s ? "active" : "none", label: `S = ${s}`, dt: 1 });
    quiet("w-s", s);
    c.state("R", `= ${r}`, { tone: r ? "active" : "none", label: `R = ${r}` });
    quiet("w-r", r);
  };
  const outputs = (o: Sr, label: string, dt = 1) => {
    c.state("Q", `= ${o.q}`, {
      tone: o.q ? "active" : "none",
      label: `${label}: Q = ${o.q}, Q̄ = ${o.nq}`,
      dt,
    });
    c.state("NQ", `= ${o.nq}`, { tone: o.nq ? "active" : "none", label: `Q̄ = ${o.nq}` });
    for (const id of ["w-q", "w-fb-q"]) quiet(id, o.q);
    for (const id of ["w-nq", "w-fb-nq"]) quiet(id, o.nq);
  };
  const apply = (s: Bit, r: Bit) => {
    inputs(s, r);
    const res = settleSr(s, r, sr);
    res.states.forEach((x, i) => {
      outputs(x, `rodada ${i + 1}`);
      c.count("rodadas", String(i + 1));
    });
    if (res.states.length === 0) c.count("rodadas", "0", { label: "nada muda" });
    sr = res.states[res.states.length - 1] ?? sr;
    return res;
  };
  const row = (i: number, s: Bit, r: Bit, effect: string, mark: "new" | "bad" = "new") =>
    c.row("sr", i, [String(s), String(r), String(sr.q), String(sr.nq), effect], { mark, dt: 1 });

  b.step(
    {
      id: "s1-laco",
      title: "Um circuito que lembra",
      subtitle: "Duas portas NOR em laço",
      text: `Um somador esquece tudo assim que as entradas mudam. Para guardar um bit, a saída de cada porta NOR volta como entrada da outra. Com S e R em 0, cada porta só repete o que a outra diz: se Q vale 0, a porta de baixo mantém Q̄ em 1, e esse 1 mantém Q em 0. O par é um [[latch]] e fica assim enquanto houver energia.`,
      facts: [
        ["Portas", "2 NOR"],
        ["Q", String(sr.q)],
        ["Q̄", String(sr.nq)],
      ],
      highlight: ["G1", "G2"],
    },
    () => {
      inputs(0, 0);
      outputs(sr, "estado inicial", 0);
      c.count("rodadas", "0");
      row(0, 0, 0, "mantém");
    },
  );

  const set = settleSr(1, 0, sr);
  b.step(
    {
      id: "s2-set",
      title: "S grava 1",
      subtitle: `${set.states.length} atrasos de porta`,
      text: `Ligar S força a porta de baixo a 0, porque NOR dá 0 se alguma entrada vale 1. Esse 0 chega à porta de cima, que agora vê R = 0 e Q̄ = 0 e sobe Q para 1. São ${set.states.length} [[atraso-de-porta|atrasos de porta]] em sequência. Depois, com S de volta a 0, nada muda: o laço continua segurando Q = 1. O pulso passou, o bit ficou.`,
      facts: [
        ["S = 1", "Q̄ cai, depois Q sobe"],
        ["Atrasos", String(set.states.length)],
        ["S volta a 0", "Q continua 1"],
      ],
      highlight: ["S", "G2", "G1"],
      quiz: {
        kind: "number",
        prompt: "Depois de ligar S, quantos atrasos de porta até Q valer 1?",
        answer: set.states.length,
        explain:
          "Primeiro a porta de baixo derruba Q̄; só então a de cima, com as duas entradas em 0, sobe Q.",
      },
    },
    () => {
      apply(1, 0);
      row(1, 1, 0, "set: grava 1");
      apply(0, 0);
      row(2, 0, 0, "mantém o 1");
    },
  );

  b.step(
    {
      id: "s3-proibido",
      title: "Reset e a combinação proibida",
      subtitle: "S e R juntos",
      text: `R faz o espelho: força Q a 0, e o laço guarda o 0. Ligar S e R juntos leva as duas saídas a 0, e Q̄ deixa de ser o inverso de Q. Pior: se as duas entradas voltam a 0 no mesmo instante, as portas se contradizem a cada atraso e o circuito oscila. No hardware real, a porta mais rápida vence, e qual vence é imprevisível: é a [[metaestabilidade]]. Por isso S = R = 1 é proibido.`,
      facts: [
        ["R = 1", "Q = 0"],
        ["S = R = 1", "Q = Q̄ = 0"],
        ["Soltar juntos", "oscila"],
      ],
      highlight: ["S", "R"],
    },
    () => {
      apply(0, 1);
      apply(0, 0);
      row(3, 0, 1, "reset: grava 0");
      apply(1, 1);
      row(4, 1, 1, "proibido: Q = Q̄", "bad");
      const rel = apply(0, 0);
      c.count("rodadas", `${rel.states.length}+`, {
        label: rel.stable ? "estabilizou" : `${rel.states.length} rodadas sem estabilizar`,
      });
      c.note("Q", rel.stable ? "estável" : "oscila entre 1 1 e 0 0", rel.stable ? "info" : "bad");
    },
  );

  // Draws the 1-runs of a waveform as bars.
  const lane = (name: string, bits: Bit[], role: Role) => {
    let t0 = -1;
    bits.forEach((v, t) => {
      if (v && t0 < 0) t0 = t;
      if (t0 >= 0 && (!v || t === bits.length - 1)) {
        const t1 = v ? t + 1 : t;
        const at = c.t + 1;
        c.at(at);
        b.ev({
          t: at,
          kind: "gantt",
          lane: name,
          from: t0,
          to: t1,
          item: "1",
          itemRole: role,
          role,
          label: `${name} em 1 de ${t0} a ${t1}`,
          row: { cols: { t: `${t0}–${t1}`, who: name, what: "1", detail: "" } },
        });
        t0 = -1;
      }
    });
  };

  const glitch = d.findIndex((v, t) => t > 0 && w.clk[t] === 1 && w.clk[t - 1] === 1 && v !== d[t - 1]);
  b.step(
    {
      id: "s4-latch-d",
      title: "Latch D: o clock decide",
      subtitle: changes(w.latchChanges),
      text: `Para nunca cair na combinação proibida, uma entrada D gera as duas: S = D AND CLK e R = (NOT D) AND CLK. Com o clock baixo, S e R ficam em 0 e o latch guarda. Com o clock alto, Q copia D, e qualquer mudança de D passa direto, por isso o latch D é chamado de transparente. ${glitch > 0 ? `Veja o tick ${glitch}: D muda com o clock ainda alto, e Q muda junto.` : "Neste padrão, D só muda com o clock baixo; mude D no meio de um nível alto para ver Q acompanhar."}`,
      facts: [
        ["S", "D AND CLK"],
        ["R", "(NOT D) AND CLK"],
        ["Mudanças de Q", String(w.latchChanges)],
      ],
      highlight: ["S", "R"],
    },
    () => {
      c.state("S", "D·CLK", { tone: "none", label: "S passa a ser D AND CLK", dt: 1 });
      c.state("R", "D̄·CLK", { tone: "none", label: "R passa a ser (NOT D) AND CLK" });
      lane("CLK", w.clk, "ctrl");
      lane("D", w.d, "a");
      lane("Q do latch", w.latch, "warn");
      c.count("mudancas", String(w.latchChanges), { label: `latch: Q muda ${ticks(w.latchChanges)}` });
    },
  );

  b.step(
    {
      id: "s5-flip-flop",
      title: "Flip-flop: só na borda",
      subtitle: changes(w.ffChanges),
      text: `Dois latches em série, com clocks opostos, formam um [[flip-flop]]: o primeiro copia D enquanto o clock está baixo, o segundo só abre quando o clock sobe. O efeito é amostrar D uma vez por ciclo, na [[borda-de-subida]], nos ticks ${list(w.edges)}. Entre as bordas, D pode mudar à vontade. ${w.ffChanges === w.latchChanges ? (w.ffChanges === 0 ? "Q não muda, como no latch neste padrão" : `${changes(w.ffChanges)}, o mesmo número que o latch neste padrão`) : `${changes(w.ffChanges)}, contra ${w.latchChanges === 0 ? "nenhuma" : ticks(w.latchChanges)} no latch`}, e o circuito todo avança em passos previsíveis.`,
      facts: [
        ["Bordas de subida", list(w.edges)],
        ["Mudanças no latch", String(w.latchChanges)],
        ["Mudanças no flip-flop", String(w.ffChanges)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: "Quantas vezes o Q do flip-flop muda nesses 16 ticks?",
        answer: w.ffChanges,
        explain: `Nas bordas ${list(w.edges)}, D vale ${w.edges.map((t) => d[t]).join(", ")}. Q só muda quando o valor amostrado difere do anterior.`,
      },
    },
    () => {
      lane("Q do flip-flop", w.ff, "b");
      c.count("mudancas", String(w.ffChanges), { label: `flip-flop: Q muda ${ticks(w.ffChanges)}`, dt: 1 });
    },
  );

  const vals = counter(start, 4);
  const end = vals[vals.length - 1] ?? 0;
  const wraps = start + 4 > 15;
  const bits4 = (v: number) => v.toString(2).padStart(4, "0");
  b.step(
    {
      id: "s6-registrador",
      title: "Registradores e contadores",
      subtitle: `${start} → ${end}`,
      text: `Quatro flip-flops com o mesmo clock formam um [[registrador]] de 4 bits: todos gravam juntos, na mesma borda. Ligando a saída a um somador que soma 1 e devolvendo o resultado à entrada, cada borda avança o valor: é um contador. Começando em ${start}, quatro bordas levam a ${end}${wraps ? ", porque depois de 15 os 4 bits voltam a 0" : ""}. O contador de programa e os registradores de pipeline funcionam assim.`,
      facts: [
        ["Flip-flops", "4"],
        ["Início", `${start} (${bits4(start)})`],
        ["Depois de 4 bordas", `${end} (${bits4(end)})`],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Um contador de 4 bits começa em ${start}. Quanto vale depois de 4 bordas de subida?`,
        answer: end,
        explain: wraps
          ? `${start} + 4 = ${start + 4}, que não cabe em 4 bits; sobra ${start + 4} − 16 = ${end}.`
          : `${start} + 4 = ${end}, que cabe em 4 bits.`,
      },
    },
    () => {
      vals.forEach((v, i) => {
        [...bits4(v)].forEach((bit, k) => {
          c.cell("reg", k, bit, { dt: k === 0 ? 1 : 0, mark: i === 0 ? "new" : "hit" });
        });
        c.count("valor", String(v), {
          label: i === 0 ? `registrador começa em ${v}` : `borda ${i}: registrador = ${v}`,
        });
      });
    },
  );

  return b.done({
    setDelays: set.states.length,
    latchChanges: w.latchChanges,
    ffChanges: w.ffChanges,
    edges: w.edges.join(","),
    counterEnd: end,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "flip-flops",
    site: "arq",
    title: "Latches e flip-flops",
    summary:
      "Como duas portas guardam um bit: o latch SR, a combinação proibida, o latch D transparente, o flip-flop que só muda na borda do clock e o registrador que conta.",
    area: "Lógica digital",
    refs: [
      { book: "tanenbaum-sco", chapter: 3, section: "3.3.1", note: "Memórias de 1 bit", verified: true },
      {
        book: "tanenbaum-sco",
        chapter: 3,
        section: "3.3.2",
        note: "Flip-flops e registradores (3.3.3)",
        verified: true,
      },
    ],
    simplifications: [
      "As duas portas do latch SR têm o mesmo atraso e são avaliadas juntas a cada rodada.",
      "O tempo das formas de onda é discreto: o flip-flop lê D no próprio tick da borda, sem tempo de preparação.",
      "O registrador e o somador do contador aparecem como blocos, sem as portas internas.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "d",
        kind: "text",
        label: "Sinal D, um bit por tick",
        maxLength: 16,
        pattern: "^[01]{16}$",
        placeholder: "0110001110011000",
        help: "16 bits. O clock sobe nos ticks 2, 6, 10 e 14.",
      },
      { key: "inicio", kind: "int", label: "Valor inicial do contador", min: 0, max: 15 },
    ],
  },
  build,
  intro: {
    text: "Toda a lógica vista até aqui esquece o resultado assim que as entradas mudam. Nesta lição, duas portas em laço guardam um bit, o clock decide quando ele pode mudar e quatro desses bits viram um registrador.",
    facts: [
      ["Portas", "NOR"],
      ["Ticks", String(T)],
      ["Período do clock", `${PERIOD} ticks`],
    ],
  },
  outro: {
    title: "Latches e flip-flops em resumo",
    text: "Realimentação transforma portas em memória. O latch SR guarda um bit, mas tem uma combinação proibida; o latch D a elimina e é transparente com o clock alto. O flip-flop amostra só na borda, e registradores, contadores e o pipeline inteiro dependem dessa batida comum.",
    facts: (run) => [
      ["Mudanças no latch", String(run.stats.latchChanges)],
      ["Mudanças no flip-flop", String(run.stats.ffChanges)],
      ["Contador após 4 bordas", String(run.stats.counterEnd)],
    ],
  },
  next: ["portas-logicas", "pipeline"],
};

export default lesson;
