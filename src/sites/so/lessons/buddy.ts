import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import { type AllocResult, Buddy, type FreeResult, roundUp } from "../../../sim/os/buddy.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { buddy as practice } from "../practice.ts";

/**
 * The binary buddy allocator on 1 MiB with 64 KiB granules: splitting in halves, internal
 * fragmentation from rounding up, freeing and merging with the buddy, and a request that fails
 * although enough memory is free.
 */
export const DEFAULTS = { pedidoA: 100, pedidoF: 400 };
const TOTAL = 1024;
const MIN = 64;
const SLOTS = TOTAL / MIN;
const SIZES = [64, 128, 256, 512, 1024];
const ROLE: Record<string, Role> = { A: "a", B: "b", C: "crypto", D: "warn", E: "ctrl", F: "bad" };
const ROW: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 };

function clamp(p: Params) {
  const a = Math.min(256, Math.max(1, Math.round(Number(p.pedidoA ?? DEFAULTS.pedidoA))));
  const f = Math.min(1024, Math.max(1, Math.round(Number(p.pedidoF ?? DEFAULTS.pedidoF))));
  return { a, f };
}

function scene(): SceneSpec {
  return {
    viewBox: [960, 600],
    nodes: [],
    links: [],
    widgets: [
      {
        kind: "grid",
        id: "mem",
        title: `Memória de ${TOTAL} KiB em grãos de ${MIN} KiB (endereços em KiB)`,
        at: [32, 50],
        cols: SLOTS,
        rows: 1,
        cellW: 52,
        indexLabel: "none",
      },
      {
        kind: "table",
        id: "listas",
        title: "Listas de blocos livres",
        at: [40, 160],
        columns: ["Tamanho", "Livres em (KiB)"],
        widths: [80, 200],
        rows: SIZES.length,
      },
      {
        kind: "table",
        id: "pedidos",
        title: "Pedidos",
        at: [360, 160],
        columns: ["Pedido", "Pediu", "Bloco", "Em", "Sobra"],
        widths: [64, 60, 64, 56, 72],
        rows: 6,
      },
      { kind: "counter", id: "div", title: "Divisões", at: [740, 160] },
      { kind: "counter", id: "fus", title: "Fusões", at: [740, 260] },
      { kind: "counter", id: "int", title: "Desperdício interno", at: [740, 360] },
      { kind: "counter", id: "livre", title: "Livre", at: [360, 360] },
      { kind: "counter", id: "maior", title: "Maior bloco livre", at: [520, 360] },
    ],
  };
}

export function build(p: Params) {
  const { a, f } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const m = new Buddy(TOTAL, MIN);

  // Each snapshot is taken right after its operation, so steps can draw the state they describe.
  const snap = () => ({
    slots: m.slots(),
    free: SIZES.map((s) => [...(m.free.get(s) ?? [])]),
    splits: m.splits,
    merges: m.merges,
    internal: m.internal(),
    freeTotal: m.freeTotal(),
    largest: m.largestFree(),
  });
  type Snap = ReturnType<typeof snap>;

  const rA = m.alloc("A", a);
  const sA = snap();
  const rest = [m.alloc("B", 240), m.alloc("C", 60), m.alloc("D", 250)];
  const sD = snap();
  const used = [...m.used.values()];
  const allocated = used.reduce((x, u) => x + u.size, 0);
  const requested = used.reduce((x, u) => x + u.request, 0);
  const fB = m.release("B");
  const fA = m.release("A");
  const rE = m.alloc("E", 120);
  const sE = snap();
  const rF = m.alloc("F", f);
  const sF = snap();
  const frees = ["C", "E", "D", "F"].map((n) => m.release(n)).filter((x): x is FreeResult => !!x);
  const sEnd = snap();

  const draw = (s: Snap, sizes: Map<string, number>) => {
    let i = 0;
    while (i < SLOTS) {
      const owner = s.slots[i] ?? "";
      if (owner) {
        const size = sizes.get(owner) ?? MIN;
        for (let k = 0; k < size / MIN; k++)
          c.cell("mem", i + k, k === 0 ? `${owner} ${size}` : owner, { role: ROLE[owner] ?? "a" });
        i += size / MIN;
      } else {
        const start = i * MIN;
        const size = SIZES.find((_, j) => s.free[j]?.includes(start)) ?? MIN;
        for (let k = 0; k < size / MIN; k++)
          c.cell("mem", i + k, k === 0 ? `${size}` : "·", { role: "muted" });
        i += size / MIN;
      }
    }
    SIZES.forEach((sz, j) => {
      const l = s.free[j] ?? [];
      c.row("listas", j, [`${sz} KiB`, l.length ? l.join(", ") : "–"], { role: l.length ? "a" : "muted" });
    });
    c.count("div", String(s.splits), { label: `${s.splits} divisões` });
    c.count("fus", String(s.merges), { label: `${s.merges} fusões` });
    c.count("int", `${s.internal} KiB`, { label: `${s.internal} KiB perdidos por arredondamento` });
    c.count("livre", `${s.freeTotal} KiB`, { label: `${s.freeTotal} KiB livres` });
    c.count("maior", `${s.largest} KiB`, { label: `maior bloco livre: ${s.largest} KiB` });
  };
  const sizes = new Map<string, number>();
  const request = (r: AllocResult) => {
    if (r.block) sizes.set(r.name, r.block.size);
    c.row(
      "pedidos",
      ROW[r.name] ?? 0,
      r.block
        ? [r.name, `${r.request}`, `${r.block.size}`, `${r.block.addr}`, `${r.block.size - r.request}`]
        : [r.name, `${r.request}`, "falhou", "–", "–"],
      {
        mark: r.ok ? "new" : "bad",
        role: r.ok ? (ROLE[r.name] ?? "a") : "bad",
        dt: 1,
        log: {
          who: r.name,
          what: r.ok ? `pede ${r.request} KiB` : `pede ${r.request} KiB: falha`,
          detail: r.block
            ? `bloco de ${r.block.size} em ${r.block.addr}${r.splits.length ? `, ${r.splits.length} ${r.splits.length === 1 ? "divisão" : "divisões"}` : ""}`
            : `precisa de ${roundUp(r.request, MIN)} contíguos`,
        },
      },
    );
  };
  const freeRow = (r: FreeResult | undefined) => {
    if (!r) return;
    sizes.delete(r.name);
    c.row("pedidos", ROW[r.name] ?? 0, [r.name, "–", `${r.block.size}`, `${r.block.addr}`, "liberado"], {
      role: "muted",
      dt: 1,
      log: {
        who: r.name,
        what: "libera",
        detail: r.merges.length
          ? `${r.merges.length} ${r.merges.length === 1 ? "fusão" : "fusões"} → ${r.final.size} em ${r.final.addr}`
          : "irmão ocupado, sem fusão",
      },
    });
  };

  const sizeA = rA.block?.size ?? roundUp(a, MIN);
  const describe = (r: AllocResult) =>
    r.block
      ? `${r.name}, ${r.request} KiB, recebe ${r.block.size} em ${r.block.addr}${r.splits.length ? ` (${r.splits.length} ${r.splits.length === 1 ? "divisão" : "divisões"})` : " (bloco pronto)"}`
      : `${r.name}, ${r.request} KiB, falha`;
  const waste = allocated - requested;
  const quizReq = 129;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const needF = roundUp(f, MIN);
  const enough = sE.freeTotal >= needF;
  // Largest power of two that fits in the free total but not in any single free block.
  let fragBand = 0;
  for (let sz = sE.largest * 2; sz <= sE.freeTotal; sz *= 2) fragBand = sz;
  const times = (n: number) => (n === 1 ? "uma vez" : `${n} vezes`);

  b.step(
    {
      id: "s1-divide",
      title: "Dividir ao meio até caber",
      subtitle: `${a} KiB → bloco de ${sizeA}`,
      text: `O [[buddy|alocador buddy]] só entrega blocos de tamanho potência de dois. A pede ${a} KiB, que arredonda para ${sizeA}. A memória começa como um único bloco livre de ${TOTAL} KiB, grande demais: ele é partido ao meio, e cada metade é o "irmão" da outra. A metade de baixo é partida de novo, e assim por diante: ${rA.splits.length} divisões até sobrar um bloco de ${sizeA}. Cada metade que não foi usada entra na lista do seu tamanho.`,
      facts: [
        ["Pedido", `${a} KiB`],
        ["Bloco", `${sizeA} KiB`],
        ["Divisões", String(rA.splits.length)],
      ],
      highlight: [],
    },
    () => {
      for (let i = 0; i < 6; i++) c.row("pedidos", i, ["", "", "", "", ""], { role: "muted" });
      request(rA);
      draw(sA, sizes);
    },
  );

  b.step(
    {
      id: "s2-encaixa",
      title: "Usar a menor sobra",
      subtitle: `${sD.splits} divisões no total`,
      text: `Cada pedido procura primeiro a lista do tamanho exato; se está vazia, pega o menor bloco maior e o divide. ${rest.map(describe).join("; ")}. As listas guardam os blocos livres por tamanho, então achar um bloco é olhar no máximo ${SIZES.length} listas. O endereço do irmão de qualquer bloco sai de uma conta: endereço XOR tamanho.`,
      facts: rest.map(
        (r) => [r.name, r.block ? `${r.block.size} KiB em ${r.block.addr}` : "falhou"] as [string, string],
      ),
      highlight: [],
    },
    () => {
      for (const r of rest) request(r);
      draw(sD, sizes);
    },
  );

  b.step(
    {
      id: "s3-interna",
      title: "O que se perde arredondando",
      subtitle: `${waste} KiB de ${allocated}`,
      text: `Os quatro pedidos somam ${requested} KiB, mas ocupam ${allocated}: ${waste} KiB alocados e nunca usados, a [[fragmentacao-interna]]. O pior caso é um pedido logo acima de uma potência de dois: ${quizReq} KiB vira ${roundUp(quizReq, MIN)}, quase metade perdida. É o preço de dividir e juntar tão depressa. Por isso o kernel usa o buddy para páginas inteiras e põe por cima um alocador de objetos pequenos, como o slab.`,
      facts: [
        ["Pedido", `${requested} KiB`],
        ["Alocado", `${allocated} KiB`],
        ["Desperdício", `${waste} KiB`],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Que tamanho de bloco recebe um pedido de ${quizReq} KiB?`,
        answer: roundUp(quizReq, MIN),
        unit: "KiB",
        explain: `A potência de dois seguinte a ${quizReq} é ${roundUp(quizReq, MIN)}; ${roundUp(quizReq, MIN) - quizReq} KiB ficam sem uso.`,
      },
    },
    () => {
      c.note("mem", `${waste} KiB perdidos dentro dos blocos`, "warn", { dt: 1 });
    },
  );

  b.step(
    {
      id: "s4-libera",
      quiz: {
        kind: "number",
        prompt:
          "Um bloco de 64 KiB começa no endereço 192 KiB. Em que endereço, em KiB, começa o irmão dele?",
        answer: 128,
        unit: "KiB",
        explain:
          "O irmão sai de endereço XOR tamanho: 192 XOR 64 = 128. Os dois juntos formam o bloco de 128 KiB que começa em 128 e vai até 256.",
      },
      title: "Liberar e procurar o irmão",
      subtitle: plural((fB?.merges.length ?? 0) + (fA?.merges.length ?? 0), "fusão", "fusões"),
      text: `Ao liberar um bloco, o alocador olha o irmão: se também estiver livre, os dois voltam a ser um bloco do dobro do tamanho, e a busca sobe de nível. B é liberado${fB?.merges.length ? ` e se funde ${times(fB.merges.length)}` : ", mas o irmão dele está ocupado, então fica como está"}; A é liberado${fA?.merges.length ? ` e se funde ${times(fA.merges.length)}` : " e também não encontra o irmão livre"}. Em seguida E pede 120 KiB e ${rE.block ? `reaproveita um bloco de ${rE.block.size} em ${rE.block.addr}` : "não encontra espaço"}.`,
      facts: [
        ["B", fB?.merges.length ? `${fB.merges.length} fusões` : "sem fusão"],
        ["A", fA?.merges.length ? `${fA.merges.length} fusões` : "sem fusão"],
        ["E", rE.block ? `${rE.block.size} KiB em ${rE.block.addr}` : "falhou"],
      ],
      highlight: [],
    },
    () => {
      freeRow(fB);
      freeRow(fA);
      request(rE);
      draw(sE, sizes);
    },
  );

  b.step(
    {
      id: "s5-externa",
      title: rF.ok ? "O pedido cabe" : enough ? "Livre, mas em pedaços" : "Falta memória",
      subtitle: `${f} KiB com ${sE.freeTotal} livres`,
      text: rF.ok
        ? `F pede ${f} KiB, que vira um bloco de ${roundUp(f, MIN)}. Há ${sE.freeTotal} KiB livres e o maior bloco tem ${sE.largest}, então o pedido cabe e recebe ${rF.block?.size} KiB em ${rF.block?.addr}. ${fragBand ? `Tente no laboratório um pedido entre ${sE.largest + 1} e ${fragBand} KiB: há espaço livre no total, mas ele falha, porque o buddy só junta blocos irmãos.` : `Aqui, qualquer pedido maior que ${sE.largest} KiB também passa do total livre.`}`
        : enough
          ? `F pede ${f} KiB, que precisa de um bloco de ${roundUp(f, MIN)}. Há ${sE.freeTotal} KiB livres, mais do que o necessário, mas o maior bloco tem ${sE.largest}. Os pedaços livres não são irmãos entre si, e o buddy só junta irmãos: o pedido falha. É a [[fragmentacao-externa]]. O Linux tenta compactar a memória movendo páginas para refazer blocos grandes.`
          : `F pede ${f} KiB, que precisa de um bloco de ${roundUp(f, MIN)}, e só há ${sE.freeTotal} KiB livres: falta memória de verdade, e nenhum alocador resolveria. ${fragBand ? `O caso interessante é um pedido entre ${sE.largest + 1} e ${fragBand} KiB, que caberia no total livre mas falha por [[fragmentacao-externa]]; tente no laboratório.` : "Aqui o maior bloco livre já é tudo o que o buddy consegue juntar."}`,
      facts: [
        ["Pedido", `${f} → ${roundUp(f, MIN)} KiB`],
        ["Livre no total", `${sE.freeTotal} KiB`],
        ["Maior bloco", `${sE.largest} KiB`],
      ],
      highlight: [],
    },
    () => {
      request(rF);
      draw(sF, sizes);
      if (!rF.ok) c.note("mem", `F precisa de ${roundUp(f, MIN)} contíguos`, "bad", { dt: 1 });
    },
  );

  const lastMerge = frees[frees.length - 1];
  b.step(
    {
      id: "s6-junta",
      title: "Tudo volta a um bloco",
      subtitle: `${sEnd.merges} fusões no total`,
      text: `Liberando o resto, as fusões sobem em cascata: os blocos encontram os irmãos livres, viram blocos do dobro e tenta de novo no nível de cima. A última liberação, de ${lastMerge?.name}, termina num bloco de ${lastMerge?.final.size} KiB: a memória volta inteira, sem nenhuma desfragmentação. No Linux, o buddy de cada zona tem 11 ordens, de 4 KiB a 4 MiB, e /proc/buddyinfo mostra quantos blocos livres há em cada uma.`,
      facts: [
        ["Divisões", String(sEnd.splits)],
        ["Fusões", String(sEnd.merges)],
        ["Livre", `${sEnd.freeTotal} KiB`],
      ],
      highlight: [],
    },
    () => {
      for (const r of frees) freeRow(r);
      draw(sEnd, sizes);
    },
  );

  return b.done({
    sizeA,
    splitsA: rA.splits.length,
    splits: sD.splits,
    waste,
    freeAtF: sE.freeTotal,
    largestAtF: sE.largest,
    fOk: rF.ok ? "sim" : "não",
    merges: sEnd.merges,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "buddy",
    site: "so",
    title: "O alocador buddy",
    summary:
      "Como o kernel reparte a memória física em blocos potência de dois: dividir ao meio até caber, o desperdício do arredondamento, liberar e fundir com o bloco irmão, e o pedido que falha mesmo com memória livre.",
    area: "Memória",
    refs: [
      { book: "maziero-so", chapter: 16, section: "16.4", note: "O alocador Buddy", verified: true },
      { book: "maziero-so", chapter: 16, section: "16.3", note: "Fragmentação", verified: true },
    ],
    simplifications: [
      `A memória tem ${TOTAL} KiB em grãos de ${MIN} KiB; o Linux usa páginas de 4 KiB e blocos de até 4 MiB.`,
      "Cada lista guarda endereços ordenados; implementações reais usam listas ligadas e um mapa de bits por ordem.",
      "Não há compactação nem alocador slab: só o buddy, para ver o efeito dele sozinho.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "pedidoA", kind: "int", label: "Tamanho pedido por A (KiB)", min: 1, max: 256 },
      { key: "pedidoF", kind: "int", label: "Tamanho pedido por F (KiB)", min: 1, max: 1024 },
    ],
  },
  build,
  intro: {
    text: "O kernel precisa entregar e receber de volta pedaços de memória física o tempo todo, depressa e sem deixar a memória em migalhas. O buddy faz isso com uma regra simples: tudo é potência de dois, e todo bloco tem um irmão.",
    facts: [
      ["Memória", `${TOTAL} KiB`],
      ["Menor bloco", `${MIN} KiB`],
      ["Pedidos", "A a F"],
    ],
  },
  outro: {
    title: "Buddy em resumo",
    text: "O buddy arredonda cada pedido para uma potência de dois, divide blocos maiores ao meio até caber e, ao liberar, funde o bloco com o irmão sempre que ele está livre. É rápido e refaz blocos grandes sozinho, mas perde espaço no arredondamento e pode recusar um pedido grande quando o espaço livre está em pedaços que não são irmãos.",
    facts: (run) => [
      ["Desperdício interno", `${run.stats.waste} KiB`],
      ["F", run.stats.fOk === "sim" ? "coube" : "falhou"],
      ["Fusões", String(run.stats.merges)],
    ],
  },
  next: ["paginacao-tlb", "paginacao-multinivel"],
  practice,
};

export default lesson;
