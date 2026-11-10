import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import {
  bufferStalls,
  type Event,
  LINES,
  type Policy,
  simulate,
  sumLoop,
  WB,
  WORDS,
  WriteCache,
  WT,
  X,
  zeroLoop,
} from "../../../sim/arch/writepolicy.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { politicasEscrita as practice } from "../practice.ts";

/**
 * What happens on a store: write through vs write back, write allocate vs no allocate, the dirty
 * bit, and the write buffer that hides memory latency from bursts of stores.
 */
export const DEFAULTS = { iteracoes: 16, buffer: 4 };
const BURST = 8;
const DRAIN = 10;

function clamp(p: Params) {
  const n = Math.min(32, Math.max(4, Math.round(Number(p.iteracoes ?? DEFAULTS.iteracoes))));
  const depth = Math.min(8, Math.max(0, Math.round(Number(p.buffer ?? DEFAULTS.buffer))));
  return { n, depth };
}

function scene(): SceneSpec {
  return {
    viewBox: [960, 600],
    nodes: [
      { id: "cpu", kind: "cpu", label: "CPU", sub: "soma += a[i]", at: [110, 90] },
      { id: "cache", kind: "box", label: "Cache", sub: `${LINES} linhas × ${WORDS} palavras`, at: [430, 90] },
      { id: "mem", kind: "box", label: "Memória", sub: "x na palavra 12", at: [790, 90] },
    ],
    links: [
      { id: "l1", from: "cpu", to: "cache" },
      { id: "l2", from: "cache", to: "mem" },
    ],
    widgets: [
      {
        kind: "table",
        id: "linhas",
        title: "Conteúdo da cache",
        at: [40, 190],
        columns: ["Linha", "Bloco", "Palavras", "Sujo"],
        widths: [56, 64, 120, 56],
        rows: LINES,
      },
      {
        kind: "table",
        id: "trafego",
        title: "Tráfego com a memória (em palavras)",
        at: [380, 190],
        columns: ["Caso", "Faltas", "Lidas", "Escritas"],
        widths: [250, 70, 70, 80],
        rows: 4,
      },
      { kind: "counter", id: "lidas", title: "Palavras lidas", at: [40, 380] },
      { kind: "counter", id: "escritas", title: "Palavras escritas", at: [200, 380] },
      { kind: "counter", id: "paradas", title: "Ciclos parados", at: [360, 380] },
    ],
  };
}

export function build(p: Params) {
  const { n, depth } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, { cpu: "CPU", cache: "cache", mem: "memória" }, (t) => String(t));

  const words = (blk: number) => `${blk * WORDS}–${blk * WORDS + WORDS - 1}`;
  const quiet = (target: string, text: string) =>
    b.ev({ t: c.t, kind: "state", target, text, tone: "active", role: "a", label: text });
  const lineRow = (cache: WriteCache, i: number, mark = false) => {
    const t = cache.tags[i];
    c.row(
      "linhas",
      i,
      [
        String(i),
        t === null || t === undefined ? "–" : String(t),
        t === null || t === undefined ? "vazia" : words(t),
        cache.dirty[i] ? "sim" : "",
      ],
      {
        role: cache.dirty[i] ? "bad" : t === null ? "muted" : "a",
        ...(mark ? { mark: "new" as const } : {}),
      },
    );
  };
  const clearLines = () => {
    for (let i = 0; i < LINES; i++) c.row("linhas", i, [String(i), "–", "vazia", ""], { role: "muted" });
  };

  /** Animates only the memory traffic, replaying the accesses on a fresh cache to show its lines. */
  const play = (policy: Policy, accesses: ReturnType<typeof sumLoop>, flush: boolean) => {
    const cache = new WriteCache(policy);
    clearLines();
    let read = 0;
    let written = 0;
    const show = (e: Event) => {
      if (e.writeback !== null) {
        written += WORDS;
        c.send("cache", "mem", `bloco ${e.writeback}`, {
          role: "bad",
          what: "write-back",
          detail: `bloco sujo ${e.writeback} despejado (${WORDS} palavras)`,
        });
      }
      if (e.fetched !== null) {
        read += WORDS;
        c.send("mem", "cache", `bloco ${e.fetched}`, {
          role: "a",
          what: "busca bloco",
          detail: `${e.access.label}: falta na linha ${e.line}`,
        });
      }
      if (e.direct) {
        written += 1;
        c.send("cache", "mem", "1 palavra", {
          role: "warn",
          what: "escrita direta",
          detail: e.access.label,
        });
      }
      if (e.fetched !== null || e.writeback !== null || e.direct) {
        lineRow(cache, e.line, true);
        c.count("lidas", String(read), { label: `${read} palavras lidas` });
        c.count("escritas", String(written), { label: `${written} palavras escritas` });
      }
    };
    for (const a of accesses) show(cache.access(a));
    if (flush)
      for (const blk of cache.flush()) {
        written += WORDS;
        c.send("cache", "mem", `bloco ${blk}`, {
          role: "bad",
          what: "write-back final",
          detail: `bloco ${blk} ainda sujo`,
        });
        c.count("escritas", String(written), { label: `${written} palavras escritas` });
      }
    for (let i = 0; i < LINES; i++) lineRow(cache, i);
    return cache;
  };
  const traffic = (i: number, name: string, cache: WriteCache) =>
    c.row("trafego", i, [name, String(cache.misses), String(cache.readWords), String(cache.writeWords)], {
      dt: 1,
      mark: "new",
      role: "a",
    });

  const loop = sumLoop(n);
  const wt = simulate(WT, loop).cache;
  const wb = simulate(WB, loop).cache;
  const zero = zeroLoop(n);
  const zt = simulate(WT, zero).cache;
  const zb = simulate(WB, zero).cache;
  const stalls = bufferStalls(BURST, depth, DRAIN);
  const stalls0 = bufferStalls(BURST, 0, DRAIN);
  const conflicts = n > 12;
  const wbBetter = wb.writeWords < wt.writeWords;

  b.step(
    {
      id: "s1-escrever",
      title: "Uma escrita que acerta",
      subtitle: "a cache já tem x",
      text: `O laço soma um vetor: lê a[i], lê x e escreve x de volta. A cache é de [[mapeamento-direto]], com ${LINES} linhas de ${WORDS} palavras. Na primeira volta, a[0] e x faltam e seus blocos vêm da memória. A escrita de x acerta: o bloco está na cache. Mas agora a cache e a memória discordam sobre x. Quando, e se, a memória deve receber o valor novo? Cada resposta é uma política de escrita.`,
      facts: [
        ["Laço", "x += a[i]"],
        ["x", `palavra ${X}, linha ${Math.floor(X / WORDS) % LINES}`],
        ["Escrita de x", "acerto"],
      ],
      highlight: ["cache"],
    },
    () => {
      for (let i = 0; i < 4; i++) c.row("trafego", i, ["", "", "", ""], { role: "muted" });
      const cache = new WriteCache(WB);
      clearLines();
      for (const a of loop.slice(0, 3)) {
        const e = cache.access(a);
        c.send("cpu", "cache", a.label, {
          role: a.kind === "W" ? "warn" : "a",
          what: a.label,
          detail: e.hit ? "acerto" : "falta",
        });
        if (e.fetched !== null)
          c.send("mem", "cache", `bloco ${e.fetched}`, { role: "a", what: "busca bloco" });
        lineRow(cache, e.line, true);
      }
      quiet("cache", "x mudou aqui");
      quiet("mem", "x ainda antigo");
    },
  );

  b.step(
    {
      id: "s2-direta",
      title: "Escrita direta",
      subtitle: `${wt.writeWords} palavras escritas`,
      text: `Na [[escrita-direta]] (write-through), toda escrita vai também para a memória, na hora. A memória nunca fica desatualizada, e despejar uma linha não custa nada. O preço: nas ${n} voltas, x foi escrito ${n} vezes e as ${n} escritas foram para a memória, ${wt.writeWords} palavras, embora só o último valor importe. Em faltas de escrita, essa política costuma não trazer o bloco para a cache: escreve direto na memória.`,
      facts: [
        ["Faltas", String(wt.misses)],
        ["Lidas", `${wt.readWords} palavras`],
        ["Escritas", `${wt.writeWords} palavras`],
      ],
      highlight: ["mem"],
    },
    () => {
      c.count("paradas", "–", { label: "sem buffer modelado" });
      quiet("cache", "repassa cada escrita");
      quiet("mem", "sempre em dia");
      const cache = play(WT, loop, false);
      traffic(0, `Direta, ${n} voltas`, cache);
    },
  );

  b.step(
    {
      id: "s3-retroativa",
      title: "Escrita retroativa",
      subtitle: `${wb.writeWords} palavras, ${wb.writebacks} despejos`,
      text: `Na [[escrita-retroativa]] (write-back), a escrita fica na cache e liga o [[bit-sujo]] da linha. A memória só recebe o bloco quando ele é despejado. ${conflicts ? `Aqui, a partir de a[12] o vetor cai na mesma linha de x e o expulsa a cada volta: são ${wb.writebacks} despejos de blocos inteiros, ${wb.writeWords} palavras, ${wbBetter ? "ainda menos que" : "mais que"} as ${wt.writeWords} da escrita direta.` : `Sem conflito na linha de x, ele só sai no fim: ${wb.writebacks} despejo, ${wb.writeWords} palavras contra ${wt.writeWords} da escrita direta.`} ${conflicts ? "Sem esses conflitos, as escritas repetidas em x custariam um único despejo no fim." : "Escritas repetidas no mesmo lugar saem quase de graça."}`,
      facts: [
        ["Despejos sujos", String(wb.writebacks)],
        ["Escritas", `${wb.writeWords} palavras`],
        ["Direta", `${wt.writeWords} palavras`],
      ],
      highlight: ["cache"],
    },
    () => {
      quiet("cache", "guarda as escritas");
      quiet("mem", "atualiza no despejo");
      const cache = play(WB, loop, true);
      traffic(1, `Retroativa, ${n} voltas`, cache);
    },
  );

  b.step(
    {
      id: "s4-alocacao",
      title: "Falta na escrita",
      subtitle: `${zb.readWords} palavras lidas à toa`,
      text: `Outro laço zera um vetor b de ${n} palavras: só escritas, todas faltas. Com [[alocacao-na-escrita]], cada falta traz o bloco inteiro da memória para depois sobrescrevê-lo: ${zb.readWords} palavras lidas sem uso, mais ${zb.writeWords} escritas no despejo. Sem alocação, as escritas vão direto para a memória: ${zt.writeWords} palavras e nenhuma leitura. Alocar compensa quando o programa volta a ler ou escrever o mesmo bloco logo depois.`,
      facts: [
        ["Com alocação", `${zb.readWords} lidas + ${zb.writeWords} escritas`],
        ["Sem alocação", `${zt.writeWords} escritas`],
        ["Palavras", String(n)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Com alocação na escrita, quantas palavras são lidas da memória ao zerar as ${n} palavras de b?`,
        answer: zb.readWords,
        unit: "palavras",
        explain: `Cada uma das ${Math.ceil(n / WORDS)} faltas traz um bloco de ${WORDS} palavras: ${zb.readWords} palavras que serão sobrescritas.`,
      },
    },
    () => {
      quiet("cache", "aloca na falta");
      quiet("mem", "envia blocos inteiros");
      const cache = play(WB, zero, true);
      traffic(2, `Retroativa com alocação, zerar ${n}`, cache);
      traffic(3, `Direta sem alocação, zerar ${n}`, zt);
    },
  );

  b.step(
    {
      id: "s5-buffer",
      quiz: {
        kind: "choice",
        prompt:
          "Se a CPU escreve, em média, mais depressa do que a memória aceita, um buffer de escrita maior resolve?",
        options: [
          "Não: ele só adia o momento em que enche",
          "Sim: com entradas suficientes, a CPU nunca espera",
          "Sim, se for duas vezes maior que a cache",
        ],
        answer: 0,
        explain:
          "O buffer esvazia no ritmo da memória. Se entra mais do que sai, qualquer tamanho acaba cheio. Ele absorve rajadas curtas, não um ritmo médio alto.",
      },
      title: "O buffer de escrita",
      subtitle: `${stalls0} → ${stalls} ciclos parados`,
      text: `Escrever na memória leva ${DRAIN} ciclos, e a escrita direta faria a CPU esperar cada uma. Um [[buffer-de-escrita]] guarda as escritas pendentes e deixa a CPU seguir. Numa rajada de ${BURST} escritas seguidas, sem buffer a CPU para ${stalls0} ciclos; com ${depth} ${depth === 1 ? "entrada" : "entradas"}, ${stalls}. ${stalls === 0 ? "A rajada inteira cabe no buffer." : "Quando o buffer enche, a CPU volta a esperar."} Ele absorve rajadas, mas não ajuda se a CPU escreve, em média, mais depressa do que a memória aceita.`,
      facts: [
        ["Rajada", `${BURST} escritas`],
        ["Memória", `1 escrita a cada ${DRAIN} ciclos`],
        ["Paradas", `${stalls} ciclos`],
      ],
      highlight: ["cache", "mem"],
    },
    () => {
      quiet("cache", `buffer de ${depth}`);
      quiet("mem", `1 escrita a cada ${DRAIN} ciclos`);
      for (let k = 0; k < Math.min(BURST, Math.max(depth, 1)); k++)
        c.send("cpu", "cache", `escrita ${k + 1}`, {
          dt: k === 0 ? 1 : 0,
          role: "warn",
          what: "entra no buffer",
        });
      c.send("cache", "mem", "1 por vez", {
        role: "warn",
        what: "buffer esvazia",
        detail: `a cada ${DRAIN} ciclos`,
      });
      c.count("paradas", String(stalls), { label: `${stalls} ciclos parados com ${depth} entradas` });
    },
  );

  b.step(
    {
      id: "s6-escolha",
      title: "Cada política tem seu par",
      subtitle: "direta + sem alocação · retroativa + alocação",
      text: `As combinações naturais aparecem nos números: a escrita direta combina com não alocar e com um buffer, e mantém a memória sempre em dia, o que simplifica a [[coerencia-de-cache]] e a E/S. A retroativa combina com alocar: traz o bloco e acumula as escritas nele, poupando banda quando o programa escreve várias vezes no mesmo lugar. ${conflicts ? `Quando os blocos brigam pela mesma linha, como x e a[12] aqui, a retroativa ${wbBetter ? "ainda ganha, por pouco" : "pode até perder"}.` : `Neste laço sem conflitos, ela escreve ${wb.writeWords} palavras contra ${wt.writeWords}.`}`,
      facts: [
        ["Laço, direta", `${wt.writeWords} palavras escritas`],
        ["Laço, retroativa", `${wb.writeWords} palavras escritas`],
        ["Zerar, com alocação", `${zb.readWords + zb.writeWords} palavras`],
      ],
      highlight: [],
    },
    () => {
      c.count("lidas", String(wt.readWords), {
        label: `laço: ${wt.readWords} palavras lidas nas duas políticas`,
        dt: 1,
      });
      c.count("escritas", `${wt.writeWords} × ${wb.writeWords}`, {
        label: `escritas: direta ${wt.writeWords}, retroativa ${wb.writeWords}`,
      });
    },
  );

  return b.done({
    misses: wt.misses,
    wtWrites: wt.writeWords,
    wbWrites: wb.writeWords,
    writebacks: wb.writebacks,
    zeroRead: zb.readWords,
    stalls0,
    stalls,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "politicas-escrita",
    site: "arq",
    title: "Políticas de escrita da cache",
    summary:
      "O que a cache faz quando o programa escreve: escrita direta ou retroativa, bit sujo, alocar ou não o bloco numa falta de escrita, e o buffer que esconde a lentidão da memória.",
    area: "Memória",
    refs: [{ book: "tanenbaum-sco", chapter: 4, section: "4.5.1", note: "Memória cache", verified: true }],
    simplifications: [
      `A cache tem ${LINES} linhas de ${WORDS} palavras e mapeamento direto; caches reais têm centenas de linhas de 64 bytes e várias vias.`,
      "O tráfego é contado em palavras, sem o custo de abrir cada transação no barramento.",
      "No fim de cada laço, as linhas sujas são gravadas, para comparar o tráfego total das duas políticas.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "iteracoes",
        kind: "int",
        label: "Voltas do laço e palavras zeradas",
        min: 4,
        max: 32,
        help: "A partir de 13 voltas, a[i] começa a disputar a linha de x.",
      },
      { key: "buffer", kind: "int", label: "Entradas do buffer de escrita", min: 0, max: 8 },
    ],
  },
  build,
  intro: {
    text: "Ler da cache é simples: ou o dado está lá, ou vem da memória. Escrever exige decisões. A memória precisa saber agora? E se o bloco nem estiver na cache? Você vai medir o tráfego de cada escolha num laço de soma e num laço que zera um vetor.",
    facts: [
      ["Cache", `${LINES} × ${WORDS} palavras`],
      ["Voltas", String(DEFAULTS.iteracoes)],
      ["Memória", `${DRAIN} ciclos por escrita`],
    ],
  },
  outro: {
    title: "Escrita na cache em resumo",
    text: "A escrita direta manda cada escrita à memória e a mantém em dia, de preferência com um buffer para a CPU não esperar. A retroativa guarda as escritas na cache, marca a linha como suja e só a grava ao despejá-la, poupando banda em escritas repetidas. Numa falta de escrita, alocar traz o bloco antes; vale a pena se ele for usado de novo.",
    facts: (run) => [
      ["Direta × retroativa", `${run.stats.wtWrites} × ${run.stats.wbWrites} palavras`],
      ["Lidas à toa ao zerar", `${run.stats.zeroRead} palavras`],
      ["Paradas", `${run.stats.stalls0} → ${run.stats.stalls} ciclos`],
    ],
  },
  next: ["cache-direta", "coerencia-mesi"],
  practice,
};

export default lesson;
