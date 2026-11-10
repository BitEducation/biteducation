import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { buddyBlock, PAGE, SlabCache } from "../../../sim/os/slab.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { slab as practice } from "../practice.ts";

/**
 * The slab allocator for one kernel object type: the waste of rounding to a power of two, a page
 * cut into equal objects, allocation as popping a free list, freeing without tearing the object
 * down, reuse of the slot freed last inside a partial slab, and an empty slab going back as a page.
 */
export const DEFAULTS = { tamanho: 600 };
const MANY = 1000;
/** Slots freed in the first slab; the lesson needs at least five objects per slab. */
const FREED = [1, 3, 4];
const pct = (x: number) => `${Math.round(x * 100)}%`;
const kib = (bytes: number) => `${Math.round(bytes / 1024)} KiB`;

function clamp(p: Params) {
  return { size: Math.min(800, Math.max(200, Math.round(Number(p.tamanho ?? DEFAULTS.tamanho)))) };
}

function scene(p: Params): SceneSpec {
  const { size } = clamp(p);
  const k = Math.floor(PAGE / size);
  return {
    viewBox: [960, 560],
    nodes: [],
    links: [],
    widgets: [
      {
        kind: "grid",
        id: "placas",
        title: `Cache de inodes: cada linha é uma placa de ${PAGE} bytes com ${k} objetos de ${size} bytes`,
        at: [40, 50],
        cols: k,
        rows: 2,
        cellW: Math.min(70, Math.floor(860 / k)),
        indexLabel: "none",
      },
      {
        kind: "table",
        id: "cmp",
        title: `Guardar inodes de ${size} bytes`,
        at: [40, 230],
        columns: ["Alocador", "Bloco por objeto", "Desperdício", "mil objetos"],
        widths: [130, 140, 110, 120],
        rows: 2,
      },
      {
        kind: "table",
        id: "estado",
        title: "Placas do cache",
        at: [580, 230],
        columns: ["Placa", "Estado", "Em uso"],
        widths: [90, 110, 90],
        rows: 2,
      },
      { kind: "counter", id: "livres", title: "Objetos livres no cache", at: [580, 380] },
    ],
  };
}

export function build(p: Params) {
  const { size } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const cache = new SlabCache(size);
  const k = cache.k;
  const block = buddyBlock(size);
  const wasteBuddy = (block - size) / block;
  const leftover = PAGE - k * size;
  const wasteSlab = leftover / PAGE;
  const pages = Math.ceil(MANY / k);
  const idx = (slab: number, slot: number) => slab * k + slot;
  const free = () => cache.slabs.reduce((s, row) => s + row.filter((x) => x === null).length, 0);

  const showState = (slab: number) => {
    const st = cache.state(slab);
    c.row("estado", slab, [`placa ${slab + 1}`, st, `${cache.used(slab)} de ${k}`], {
      dt: 0,
      mark: st === "cheio" ? "warn" : st === "vazio" ? "bad" : "hit",
    });
  };
  const put = (name: string) => {
    const s = cache.alloc(name);
    if (s.newSlab) for (let i = 0; i < k; i++) c.cell("placas", idx(s.slab, i), "·", { role: "muted" });
    c.cell("placas", idx(s.slab, s.slot), name, {
      dt: 1,
      mark: "new",
      role: s.slab === 0 ? "a" : "b",
      log: {
        who: name,
        what: `placa ${s.slab + 1}, posição ${s.slot}`,
        detail: s.newSlab ? "placa nova" : "",
      },
    });
    return s;
  };
  const drop = (slab: number, slot: number) => {
    const name = cache.slabs[slab]?.[slot] ?? "";
    const r = cache.release(slab, slot);
    c.cell("placas", idx(slab, slot), "·", {
      dt: 1,
      mark: "evict",
      role: "muted",
      log: { who: name, what: `liberado da placa ${slab + 1}`, detail: `posição ${slot}` },
    });
    return r;
  };

  b.step(
    {
      id: "s1-iguais",
      title: "Milhares de objetos iguais",
      subtitle: `${size} bytes viram ${block}`,
      text: `O kernel cria e destrói o tempo todo objetos do mesmo tipo: um [[inode]] para cada arquivo aberto, um descritor para cada processo. Aqui cada inode tem ${size} bytes. O [[buddy]] só entrega potências de dois${block === size ? `, e ${size} já é uma, então aqui nada sobra; com 600 bytes, cada inode ocuparia 1024 e 41% do bloco ficaria sem uso, a [[fragmentacao-interna]]` : `, então cada um ocuparia ${block} bytes, e ${block - size} bytes de cada bloco, ${pct(wasteBuddy)}, ficariam sem uso: é a [[fragmentacao-interna]]. Com mil inodes, isso dá ${kib(MANY * block)} para guardar ${kib(MANY * size)} de dados`}.`,
      facts: [
        ["Objeto", `${size} bytes`],
        ["Bloco do buddy", `${block} bytes`],
        ["Desperdício", pct(wasteBuddy)],
      ],
      highlight: ["cmp"],
    },
    () => {
      c.row("cmp", 0, ["buddy", `${block} bytes`, pct(wasteBuddy), kib(MANY * block)], {
        dt: 1,
        mark: "bad",
      });
    },
  );

  b.step(
    {
      id: "s2-placa",
      title: "Uma página, vários objetos",
      subtitle: `${k} inodes por placa`,
      text: `O [[slab]] pede ao buddy páginas inteiras de ${PAGE} bytes e corta cada uma, chamada placa, em objetos do mesmo tamanho. Cabem ${k} inodes de ${size} bytes, e sobram ${leftover} bytes no fim da página, ${pct(wasteSlab)} dela. Cada tipo de objeto tem o seu cache de placas, e cada placa guarda uma lista das posições livres. Para mil inodes bastam ${pages} páginas, ${kib(pages * PAGE)}.`,
      facts: [
        ["Por placa", `${k} objetos`],
        ["Sobra por página", `${leftover} bytes`],
        ["Desperdício", pct(wasteSlab)],
      ],
      highlight: ["cmp", "placas"],
      quiz: {
        kind: "number",
        prompt: `Quantos objetos de ${size} bytes cabem inteiros numa página de ${PAGE} bytes?`,
        answer: k,
        explain: `${PAGE} ÷ ${size} = ${(PAGE / size).toFixed(2).replace(".", ",")}; cabem ${k} inteiros e sobram ${leftover} bytes.`,
      },
    },
    () => {
      c.row("cmp", 1, ["slab", `${size} bytes`, pct(wasteSlab), kib(pages * PAGE)], { dt: 1, mark: "hit" });
    },
  );

  b.step(
    {
      id: "s3-alocar",
      title: "Alocar é tirar da lista",
      subtitle: `${k + 2} inodes, 2 placas`,
      text: `O kernel abre ${k + 2} arquivos. Cada pedido de inode tira a primeira posição da lista de livres da placa: nada de procurar espaço, dividir blocos ou arredondar. Os ${k} primeiros enchem a placa 1. Para o inode ${k + 1}, não há placa com espaço, então o cache pede uma página nova ao buddy e monta a placa 2. Pedir uma página é raro; tirar da lista é o caso comum, e leva sempre o mesmo tempo.`,
      facts: [
        ["Placa 1", `cheia, ${k} de ${k}`],
        ["Placa 2", `2 de ${k}`],
        ["Páginas pedidas", "2"],
      ],
      highlight: ["placas", "estado"],
    },
    () => {
      for (let i = 1; i <= k + 2; i++) put(`i${i}`);
      showState(0);
      showState(1);
      c.count("livres", String(free()), { dt: 0, label: `${free()} posições livres` });
    },
  );

  const freedNames = FREED.map((s) => cache.slabs[0]?.[s] ?? "");
  b.step(
    {
      id: "s4-liberar",
      title: "Liberar sem desmontar",
      subtitle: `${freedNames.join(", ")} liberados`,
      text: `Três arquivos são fechados, e os inodes ${freedNames.join(", ")} voltam ao cache. A posição de cada um entra na lista de livres da placa 1, que passa a parcial. A página não volta ao buddy e o objeto não é desmontado: o slab guarda objetos já inicializados, então o próximo pedido recebe um inode pronto, sem refazer travas e listas internas. É por isso que o alocador se chama cache.`,
      facts: [
        ["Liberados", freedNames.join(", ")],
        ["Placa 1", "parcial"],
        ["Página devolvida", "nenhuma"],
      ],
      highlight: ["placas", "estado"],
    },
    () => {
      for (const s of FREED) drop(0, s);
      showState(0);
      c.count("livres", String(free()), { dt: 0, label: `${free()} posições livres` });
    },
  );

  const reuse: number[] = [];
  b.step(
    {
      id: "s5-reusar",
      title: "Reaproveitar o buraco",
      subtitle: "A placa parcial primeiro",
      text: `Chegam dois pedidos novos. O cache prefere uma placa parcial a uma vazia ou nova, para manter as páginas cheias. A lista de livres funciona como uma pilha: a posição liberada por último, ${FREED[FREED.length - 1]}, é a primeira entregue, porque provavelmente ainda está na [[cache]] da CPU. Os dois novos inodes ocupam as posições ${FREED[2]} e ${FREED[1]} da placa 1, e a placa 2 continua como estava.`,
      facts: [
        ["Prioridade", "placa parcial"],
        ["Ordem", "último liberado sai primeiro"],
        ["Placas novas", "nenhuma"],
      ],
      highlight: ["placas"],
      quiz: {
        kind: "choice",
        prompt: "Com a placa 1 parcial e a placa 2 parcial, onde entra o próximo inode?",
        options: [
          `Na placa 1, na posição liberada por último (${FREED[FREED.length - 1]})`,
          "Numa placa nova, para não misturar objetos velhos e novos",
          "Na placa 2, na primeira posição livre depois dos objetos dela",
        ],
        answer: 0,
        explain: `O cache enche primeiro a placa parcial mais antiga, e a lista de livres é uma pilha: a posição ${FREED[FREED.length - 1]} saiu por último e volta primeiro.`,
      },
    },
    () => {
      for (const name of [`i${k + 3}`, `i${k + 4}`]) reuse.push(put(name).slot);
      showState(0);
      c.count("livres", String(free()), { dt: 0, label: `${free()} posições livres` });
    },
  );

  b.step(
    {
      id: "s6-devolver",
      title: "Devolver a página",
      subtitle: "Placa vazia volta ao buddy",
      text: `Os inodes i${k + 1} e i${k + 2} são liberados e a placa 2 fica vazia. O cache pode guardá-la para a próxima rajada de pedidos, mas, quando a memória aperta, o kernel recolhe as placas vazias e devolve as páginas ao buddy. O Linux usa uma versão desse alocador, o SLUB, para quase todos os seus objetos pequenos, cada tipo no seu cache. O kmalloc, que aceita qualquer tamanho, usa caches de 8, 16, 32 bytes e assim por diante.`,
      facts: [
        ["Placa 2", "vazia"],
        ["Sob pressão", "página volta ao buddy"],
        ["No Linux", "SLUB"],
      ],
      highlight: ["placas", "estado"],
    },
    () => {
      drop(1, 0);
      drop(1, 1);
      showState(1);
      c.count("livres", String(free()), { dt: 0, label: `${free()} posições livres` });
    },
  );

  return b.done({
    perSlab: k,
    buddy: block,
    wasteBuddy: pct(wasteBuddy),
    wasteSlab: pct(wasteSlab),
    pages,
    reused: reuse.join(","),
    free: free(),
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "slab",
    site: "so",
    title: "Alocador slab: caches de objetos do kernel",
    summary:
      "Inodes de tamanho fixo desperdiçam espaço no buddy. O slab corta páginas em objetos iguais, aloca tirando de uma lista, reaproveita o último liberado e devolve placas vazias.",
    area: "Memória",
    refs: [
      { book: "maziero-so", chapter: 16, section: "16.5", note: "O alocador Slab", verified: true },
      {
        book: "tanenbaum-mos",
        chapter: 10,
        section: "10.4.3",
        note: "Implementação do gerenciamento de memória no Linux",
        verified: true,
      },
    ],
    simplifications: [
      "Um cache só, de inodes; o kernel tem centenas, um por tipo de objeto.",
      "Placas de uma página, sem metadados dentro dela nem coloração de cache.",
      "Sem caches por núcleo, que o SLUB usa para evitar travas.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "tamanho", kind: "int", label: "Tamanho do objeto (bytes)", min: 200, max: 800, step: 8 },
    ],
  },
  build,
  intro: {
    text: "O kernel não aloca memória como um programa comum: pede milhares de objetos do mesmo tamanho, o tempo todo. Você vai ver por que o buddy desperdiça espaço com eles e como o alocador slab corta páginas em objetos prontos para reuso.",
    facts: [
      ["Objeto", `${DEFAULTS.tamanho} bytes`],
      ["Página", `${PAGE} bytes`],
      ["Tipo", "inode"],
    ],
  },
  outro: {
    title: "Slab em resumo",
    text: "Cada tipo de objeto tem um cache de placas, e cada placa é uma página cortada em objetos iguais. Alocar e liberar são operações numa lista de livres, sem arredondar para potência de dois. Objetos liberados ficam prontos para reuso, placas parciais são preenchidas primeiro e placas vazias voltam ao buddy quando falta memória.",
    facts: (run) => [
      ["Por placa", String(run.stats.perSlab)],
      ["Desperdício no buddy", String(run.stats.wasteBuddy)],
      ["Desperdício no slab", String(run.stats.wasteSlab)],
    ],
  },
  next: ["buddy", "paginacao-tlb", "inodes"],
  practice,
};

export default lesson;
