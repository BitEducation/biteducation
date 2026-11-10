import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { type Bridge, idText, spanningTree, storm, type Wire } from "../../../sim/net/stp.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Redundant links make loops, and a broadcast multiplies around them forever. STP elects a root,
 * lets each switch find its cheapest way there, keeps one designated port per link and blocks the
 * rest; when a link fails, a blocked port takes over.
 */
export const DEFAULTS = { prioridade: 32768, falha: "w12" };
const NAMES = ["S1", "S2", "S3", "S4"];
const WIRES: Wire[] = [
  { id: "w12", a: "S1", b: "S2", cost: 4 },
  { id: "w13", a: "S1", b: "S3", cost: 4 },
  { id: "w24", a: "S2", b: "S4", cost: 4 },
  { id: "w34", a: "S3", b: "S4", cost: 4 },
  { id: "w23", a: "S2", b: "S3", cost: 19 },
];
const HOPS = 6;
const wireName = (w: Wire) => `${w.a}–${w.b}`;

function clamp(p: Params) {
  const prio = Math.min(
    61440,
    Math.max(0, Math.round(Number(p.prioridade ?? DEFAULTS.prioridade) / 4096) * 4096),
  );
  const cut = WIRES.some((w) => w.id === p.falha) ? String(p.falha) : DEFAULTS.falha;
  return { prio, cut };
}

const bridges = (prio: number): Bridge[] =>
  NAMES.map((name, i) => ({ name, priority: name === "S4" ? prio : 32768, mac: i + 1 }));

const scene: SceneSpec = {
  viewBox: [960, 680],
  nodes: [
    { id: "S1", kind: "switch", label: "S1", sub: "MAC …01", at: [200, 80] },
    { id: "S2", kind: "switch", label: "S2", sub: "MAC …02", at: [600, 80] },
    { id: "S3", kind: "switch", label: "S3", sub: "MAC …03", at: [200, 290] },
    { id: "S4", kind: "switch", label: "S4", sub: "MAC …04", at: [600, 290] },
    { id: "pc", kind: "laptop", label: "PC", sub: "manda um broadcast", at: [840, 80] },
  ],
  links: [...WIRES.map((w) => ({ id: w.id, from: w.a, to: w.b })), { id: "l-pc", from: "pc", to: "S2" }],
  widgets: [
    { kind: "counter", id: "copias", title: "Cópias do broadcast", at: [760, 200] },
    { kind: "counter", id: "bloqueados", title: "Enlaces bloqueados", at: [760, 290] },
    {
      kind: "table",
      id: "pontes",
      title: "Cada switch e o caminho até a raiz",
      at: [40, 400],
      columns: ["Switch", "ID (prioridade.MAC)", "Custo até a raiz", "Porta raiz"],
      widths: [70, 150, 130, 120],
      rows: NAMES.length,
    },
    {
      kind: "table",
      id: "enlaces",
      title: "Cada enlace",
      at: [540, 400],
      columns: ["Enlace", "Custo", "Designada", "Bloqueia"],
      widths: [80, 60, 120, 120],
      rows: WIRES.length,
    },
  ],
};

export function build(p: Params) {
  const { prio, cut } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, { S1: "S1", S2: "S2", S3: "S3", S4: "S4", pc: "PC" }, (t) => String(t));
  const br = bridges(prio);
  const byName = Object.fromEntries(br.map((x) => [x.name, x]));
  const flood = storm(WIRES, "S2", HOPS);
  const tree = spanningTree(br, WIRES);
  const alive = WIRES.filter((w) => w.id !== cut);
  const after = spanningTree(br, alive);
  const cutWire = WIRES.find((w) => w.id === cut) as Wire;
  const unblocked = tree.blocked.filter((w) => w !== cut && !after.blocked.includes(w));
  const wById = (id: string) => WIRES.find((w) => w.id === id) as Wire;
  const rootPortName = (t: typeof tree, n: string) => {
    const w = t.rootPort[n];
    return w ? `para ${wById(w).a === n ? wById(w).b : wById(w).a}` : "é a raiz";
  };
  const bridgeRows = (t: typeof tree, mark: "new" | "hit" | "warn") =>
    NAMES.forEach((n, i) => {
      const x = byName[n] as Bridge;
      c.row(
        "pontes",
        i,
        [n, idText(x), t.dist[n] === undefined ? "—" : String(t.dist[n]), rootPortName(t, n)],
        {
          dt: i === 0 ? 1 : 0,
          mark: n === t.root ? "hit" : mark,
          log: { who: n, what: `custo ${t.dist[n] ?? "—"}`, detail: rootPortName(t, n) },
        },
      );
    });
  const wireRows = (t: typeof tree, wires: Wire[]) =>
    WIRES.forEach((w, i) => {
      const live = wires.includes(w);
      const blocked = t.blocked.includes(w.id);
      c.row(
        "enlaces",
        i,
        [
          wireName(w),
          String(w.cost),
          live ? (t.designated[w.id] ?? "") : "—",
          !live ? "caiu" : blocked ? (t.blocker[w.id] ?? "") : "ninguém",
        ],
        { dt: i === 0 ? 1 : 0, mark: !live ? "bad" : blocked ? "warn" : "hit" },
      );
    });
  const paint = (t: typeof tree, wires: Wire[]) =>
    WIRES.forEach((w) => {
      const live = wires.includes(w);
      c.state(w.id, "", {
        dt: 0,
        tone: !live ? "bad" : t.blocked.includes(w.id) ? "warn" : "good",
        label: `${wireName(w)}: ${!live ? "caiu" : t.blocked.includes(w.id) ? "bloqueado" : "encaminha"}`,
      });
    });

  b.step(
    {
      id: "s1-laco",
      title: "Redundância vira laço",
      subtitle: `${flood[HOPS - 1]} cópias em ${HOPS} saltos`,
      text: `Ligar os switches por mais de um caminho é bom: se um cabo cair, há outro. Mas o [[switch]] repete todo [[broadcast]] em todas as portas menos a de entrada, e o quadro Ethernet não tem TTL. O PC manda um único broadcast para S2; a cada salto, as cópias se multiplicam pelos laços: ${flood.join(", ")}. Elas nunca morrem e, em segundos, ocupam todos os enlaces. É a tempestade de broadcast, e ela derruba a rede inteira.`,
      facts: [
        ["Cópias no salto 1", String(flood[0])],
        [`No salto ${HOPS}`, String(flood[HOPS - 1])],
        ["TTL no quadro", "não existe"],
      ],
      highlight: ["S1", "S2", "S3", "S4"],
    },
    () => {
      c.send("pc", "S2", "broadcast", { what: "um quadro para todos" });
      flood.forEach((n, i) => {
        c.count("copias", String(n), { dt: 1, role: "bad", label: `salto ${i + 1}: ${n} cópias` });
      });
      for (const w of WIRES) c.state(w.id, "", { dt: 0, tone: "bad", label: `${wireName(w)} lotado` });
    },
  );

  const rootB = byName[tree.root] as Bridge;
  b.step(
    {
      id: "s2-raiz",
      title: "Eleger uma raiz",
      subtitle: `Raiz: ${tree.root}`,
      text: `O [[stp]] desliga portas até sobrar uma árvore, sem laços. Primeiro, os switches trocam BPDUs, pequenas mensagens com o ID de cada um: a prioridade configurada e, para desempatar, o MAC. Ganha o menor ID. ${prio < 32768 ? `O S4 teve a prioridade baixada para ${prio}, e por isso ganha mesmo com o maior MAC.` : `Todos estão com a prioridade de fábrica, 32768, e o desempate vai para o menor MAC.`} A raiz é ${tree.root}, com ID ${idText(rootB)}. Todas as portas dela vão encaminhar.`,
      facts: [
        ["Raiz", tree.root],
        ["ID", idText(rootB)],
        ["Critério", "menor prioridade, depois menor MAC"],
      ],
      highlight: [tree.root],
      quiz: {
        kind: "choice",
        prompt: `Com S4 em prioridade ${prio} e os outros em 32768, quem vira a raiz?`,
        options: [tree.root, ...NAMES.filter((n) => n !== tree.root).slice(0, 2)],
        answer: 0,
        explain: `Menor ID ganha: ${br.map((x) => `${x.name} ${idText(x)}`).join(", ")}.`,
      },
    },
    () => {
      for (const w of WIRES) c.state(w.id, "", { dt: 0, tone: "none", label: `${wireName(w)} aguardando` });
      c.state(tree.root, "raiz", { dt: 1, tone: "good", label: `${tree.root} é a raiz` });
      NAMES.forEach((n, i) => {
        const x = byName[n] as Bridge;
        c.row("pontes", i, [n, idText(x), n === tree.root ? "0" : "?", n === tree.root ? "é a raiz" : "?"], {
          dt: 0,
          ...(n === tree.root ? { mark: "hit" as const } : {}),
        });
      });
    },
  );

  const far =
    NAMES.filter((n) => n !== tree.root).sort((x, y) => (tree.dist[y] ?? 0) - (tree.dist[x] ?? 0))[0] ?? "";
  b.step(
    {
      id: "s3-caminho",
      title: "O caminho mais barato",
      subtitle: "Uma porta raiz por switch",
      text: `A raiz anuncia custo 0. Cada switch soma o custo do enlace por onde ouviu o anúncio e repassa. Enlaces mais rápidos custam menos: aqui os de 1 Gbit/s custam 4 e o S2–S3, de 100 Mbit/s, custa 19. Cada switch fica com a porta que leva à raiz pelo menor custo, a porta raiz; no empate, pela que leva ao vizinho de menor ID. O ${far}, por exemplo, chega à raiz com custo ${tree.dist[far]}, saindo pela porta ${rootPortName(tree, far)}.`,
      facts: NAMES.filter((n) => n !== tree.root)
        .slice(0, 3)
        .map((n) => [n, `custo ${tree.dist[n]}, ${rootPortName(tree, n)}`] as [string, string]),
      highlight: [far],
    },
    () => bridgeRows(tree, "new"),
  );

  b.step(
    {
      id: "s4-bloqueia",
      title: "Bloquear o resto",
      subtitle: `${tree.blocked.length} enlaces bloqueados`,
      text: `Em cada enlace, uma só ponta pode encaminhar: a porta designada, do switch mais perto da raiz. Os enlaces que não são caminho de ninguém até a raiz ficam com a outra ponta bloqueada: ${tree.blocked.map((id) => `${wireName(wById(id))}, bloqueado por ${tree.blocker[id]}`).join("; ")}. Porta bloqueada não repassa quadros, só escuta BPDUs. O que sobra, em verde, é uma árvore: entre dois switches quaisquer há um único caminho, e o broadcast do PC chega a todos uma vez só.`,
      facts: [
        ["Bloqueados", String(tree.blocked.length)],
        ["Encaminham", String(WIRES.length - tree.blocked.length)],
        ["Laços", "nenhum"],
      ],
      highlight: tree.blocked.map((id) => tree.blocker[id] ?? ""),
      quiz: {
        kind: "number",
        prompt: `São ${WIRES.length} enlaces entre ${NAMES.length} switches. Quantos precisam ficar bloqueados para não haver laço?`,
        answer: tree.blocked.length,
        explain: `Uma árvore com ${NAMES.length} switches tem ${NAMES.length - 1} enlaces; os outros ${WIRES.length} − ${NAMES.length - 1} = ${tree.blocked.length} ficam bloqueados.`,
      },
    },
    () => {
      wireRows(tree, WIRES);
      paint(tree, WIRES);
      c.count("bloqueados", String(tree.blocked.length), {
        dt: 0,
        role: "warn",
        label: `${tree.blocked.length} bloqueados`,
      });
      c.count("copias", String(NAMES.length - 1), { dt: 0, role: "a", label: "uma cópia por switch" });
    },
  );

  b.step(
    {
      id: "s5-falha",
      title: "Um cabo cai",
      subtitle: `${wireName(cutWire)} fora`,
      text: `Agora o enlace ${wireName(cutWire)} cai. Quem dependia dele para chegar à raiz para de ouvir BPDUs por ali e refaz a conta. ${unblocked.length ? `O bloqueio em ${unblocked.map((id) => wireName(wById(id))).join(" e ")} é liberado, e a árvore se refaz por outro caminho.` : tree.blocked.includes(cut) ? "Como era um enlace bloqueado, nada muda no encaminhamento." : "A árvore se refaz com os enlaces que sobraram."} No STP original isso levava de 30 a 50 segundos, com as portas passando por estados de escuta e aprendizado; o RSTP, versão atual, converge em cerca de um segundo.`,
      facts: [
        ["Caiu", wireName(cutWire)],
        ["Liberados", unblocked.length ? unblocked.map((id) => wireName(wById(id))).join(", ") : "nenhum"],
        ["Tempo", "30–50 s no STP; ~1 s no RSTP"],
      ],
      highlight: unblocked.map((id) => tree.blocker[id] ?? ""),
    },
    () => {
      bridgeRows(after, "warn");
      wireRows(after, alive);
      paint(after, alive);
      c.count("bloqueados", String(after.blocked.length), {
        dt: 0,
        role: "warn",
        label: `${after.blocked.length} bloqueados`,
      });
    },
  );

  b.step(
    {
      id: "s6-protege",
      title: "Quem pode ser raiz",
      subtitle: "Prioridade, PortFast e BPDU guard",
      text: `Como a eleição é automática, um switch qualquer ligado numa tomada da sala, com prioridade menor, viraria raiz e puxaria o tráfego para si. Por isso administradores fixam a prioridade da raiz no switch central e ligam a proteção BPDU guard nas portas de usuários: se chegar um BPDU por ali, a porta é desligada. As mesmas portas usam PortFast, que pula a espera de escuta, porque um computador não forma laço.`,
      facts: [
        ["Raiz", "fixada no switch central"],
        ["Porta de usuário", "PortFast + BPDU guard"],
        ["Sinal", "BPDU em porta de usuário"],
      ],
      highlight: ["S1"],
    },
    () => {
      c.note("enlaces", "BPDU guard nas portas de usuários", "good", { dt: 1 });
    },
  );

  return b.done({
    storm: flood.join(","),
    root: tree.root,
    dist: NAMES.map((n) => tree.dist[n]).join(","),
    blocked: tree.blocked.join(","),
    after: after.blocked.join(","),
    unblocked: unblocked.join(","),
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "spanning-tree",
    site: "redes",
    title: "Spanning Tree: tirar os laços sem tirar os cabos",
    summary:
      "Por que um broadcast se multiplica sem fim em switches com caminhos redundantes, como o STP elege uma raiz, escolhe portas raiz e designadas, bloqueia o resto e se refaz quando um cabo cai.",
    area: "Enlace",
    refs: [
      { book: "tanenbaum-cn", chapter: 4, section: "4.7.3", note: "Spanning tree bridges", verified: true },
    ],
    simplifications: [
      "Um custo por enlace, igual nas duas pontas, e IDs com MAC encurtado.",
      "A convergência aparece pronta; os temporizadores e os estados das portas ficam só no texto.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "prioridade", kind: "int", label: "Prioridade do S4", min: 0, max: 61440, step: 4096 },
      {
        key: "falha",
        kind: "choice",
        label: "Enlace que cai",
        options: WIRES.map((w) => ({ value: w.id, label: wireName(w) })),
      },
    ],
  },
  build,
  intro: {
    text: "Redes de verdade ligam os switches por caminhos redundantes, mas a Ethernet não tolera laços. Você vai ver um único broadcast se multiplicar sem fim e depois acompanhar o protocolo que escolhe quais portas desligar para formar uma árvore.",
    facts: [
      ["Switches", String(NAMES.length)],
      ["Enlaces", String(WIRES.length)],
      ["Prioridade do S4", String(DEFAULTS.prioridade)],
    ],
  },
  outro: {
    title: "Spanning Tree em resumo",
    text: "O STP elege como raiz o switch de menor ID, cada switch escolhe a porta de menor custo até ela, cada enlace tem uma ponta designada, e o que sobra fica bloqueado. A rede vira uma árvore, sem tempestade de broadcast, e os enlaces bloqueados ficam de reserva para quando um cabo cair.",
    facts: (run) => [
      ["Raiz", String(run.stats.root)],
      ["Bloqueados", String(run.stats.blocked).split(",").length.toString()],
      ["Cópias sem STP", String(run.stats.storm).split(",").pop() ?? ""],
    ],
  },
  next: ["switch-vlan", "roteamento"],
};

export default lesson;
