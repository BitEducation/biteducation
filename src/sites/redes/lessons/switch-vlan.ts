import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import {
  BROADCAST,
  copies,
  type Delivery,
  flatLan,
  HUB_COPIES,
  Lan,
  parseVlans,
  TAG_BYTES,
  usableVlans,
  VID_BITS,
} from "../../../sim/net/switching.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Learning switches: flooding an unknown destination, learning from source addresses, broadcasts
 * that still reach everyone, VLANs that split the broadcast domain, 802.1Q tags on the trunk and
 * the router needed between VLANs.
 */
export const DEFAULTS = { vlans: "112122", origem: "C" };
const HOSTS = ["A", "B", "C", "D", "E", "F"] as const;
const SUFFIX: Record<string, string> = { A: "0A", B: "0B", C: "0C", D: "0D", E: "0E", F: "0F", R: "FE" };
/** Unicast traffic of steps 1–3: a reply for every request, so both sides get learned. */
const TRAFFIC: [string, string][] = [
  ["A", "D"],
  ["D", "A"],
  ["B", "A"],
  ["A", "B"],
  ["E", "D"],
  ["D", "E"],
  ["A", "D"],
];
const TABLE_ROWS = 6;

const mac = (h: string) => `…:${SUFFIX[h] ?? "??"}`;
const list = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`;
const num = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const vlanRole = (v: number): Role => (v === 20 ? "b" : "a");

function clamp(p: Params) {
  const raw = String(p.vlans ?? DEFAULTS.vlans);
  const vlans = /^[12]{6}$/.test(raw) ? raw : DEFAULTS.vlans;
  const o = String(p.origem ?? DEFAULTS.origem);
  const origem = (HOSTS as readonly string[]).includes(o) ? o : DEFAULTS.origem;
  return { vlans, origem };
}

function scene(): SceneSpec {
  const host = (id: string, at: [number, number]) => ({
    id,
    kind: "laptop" as const,
    label: id,
    sub: `MAC ${mac(id)}`,
    at,
  });
  return {
    viewBox: [960, 600],
    nodes: [
      host("A", [110, 90]),
      host("B", [110, 210]),
      host("C", [110, 330]),
      { id: "S1", kind: "switch", label: "S1", sub: "portas 1–4", at: [330, 210] },
      { id: "S2", kind: "switch", label: "S2", sub: "portas 1–4", at: [630, 210] },
      host("D", [850, 90]),
      host("E", [850, 210]),
      host("F", [850, 330]),
      { id: "R", kind: "router", label: "Roteador", sub: "tronco na porta 5", at: [330, 70], hidden: true },
    ],
    links: [
      {
        id: "lA",
        from: "A",
        to: "S1",
        via: [
          [220, 90],
          [220, 210],
        ],
      },
      { id: "lB", from: "B", to: "S1" },
      {
        id: "lC",
        from: "C",
        to: "S1",
        via: [
          [220, 330],
          [220, 210],
        ],
      },
      { id: "lT", from: "S1", to: "S2", style: "bus" },
      {
        id: "lD",
        from: "S2",
        to: "D",
        via: [
          [740, 210],
          [740, 90],
        ],
      },
      { id: "lE", from: "S2", to: "E" },
      {
        id: "lF",
        from: "S2",
        to: "F",
        via: [
          [740, 210],
          [740, 330],
        ],
      },
      { id: "lR", from: "R", to: "S1", style: "dashed" },
    ],
    widgets: [
      {
        kind: "table",
        id: "t1",
        title: "Tabela de S1",
        at: [60, 414],
        columns: ["VLAN", "MAC", "Porta"],
        widths: [56, 90, 56],
        rows: TABLE_ROWS,
      },
      {
        kind: "table",
        id: "t2",
        title: "Tabela de S2",
        at: [700, 414],
        columns: ["VLAN", "MAC", "Porta"],
        widths: [56, 90, 56],
        rows: TABLE_ROWS,
      },
      { kind: "counter", id: "sw", title: "Enlaces usados", at: [330, 424] },
      { kind: "counter", id: "hub", title: "Com hubs", at: [500, 424] },
    ],
  };
}

export function build(p: Params) {
  const { vlans, origem } = clamp(p);
  const vmap = parseVlans(vlans);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const rows: Record<"S1" | "S2", number> = { S1: 0, S2: 0 };

  const clearTables = () => {
    for (const sw of ["S1", "S2"] as const) {
      for (let i = 0; i < TABLE_ROWS; i++)
        c.row(sw === "S1" ? "t1" : "t2", i, ["", "", ""], { role: "muted" });
      rows[sw] = 0;
    }
  };

  /** Animates one frame: the hops leaving the same switch go out together. */
  const play = (d: Delivery, label: string, role: Role, what: string) => {
    let prev = "";
    d.hops.forEach((h, i) => {
      const dt = i === 0 || h.from !== prev ? 1 : 0;
      prev = h.from;
      const toHost = (HOSTS as readonly string[]).includes(h.to) || h.to === "R";
      const discarded = toHost && !h.kept && i > 0;
      const tag = h.tag !== undefined ? ` #${h.tag}` : "";
      c.send(h.from, h.to, `${label}${tag}`, {
        dt,
        role: discarded ? "muted" : role,
        what,
        detail: discarded ? "descartado: MAC de outro" : h.tag !== undefined ? `etiqueta VLAN ${h.tag}` : "",
      });
    });
    for (const l of d.learned) {
      const table = l.sw === "S1" ? "t1" : "t2";
      const idx = rows[l.sw]++;
      if (idx < TABLE_ROWS)
        c.row(table, idx, [l.vlan ? String(l.vlan) : "–", `${mac(l.mac)} ${l.mac}`, String(l.port)], {
          mark: "new",
          role,
        });
    }
  };

  // Steps 1–3: one flat LAN.
  const flat = flatLan();
  const first = flat.send("A", "D");
  const reply = flat.send("D", "A");
  const rest = TRAFFIC.slice(2).map(([s, d]) => ({ s, d, r: flat.send(s, d) }));
  const unicast = copies(first) + copies(reply) + rest.reduce((a, x) => a + copies(x.r), 0);
  const hub = HUB_COPIES * TRAFFIC.length;
  const bcast = flat.send(origem, BROADCAST);

  // Steps 5–6: the same hosts in two VLANs.
  const vlan = new Lan(vmap);
  const vb = vlan.send(origem, BROADCAST);
  const reached = vb.hops.filter((h) => h.kept).map((h) => h.to);
  const myVlan = vmap[origem] ?? 10;
  const other = HOSTS.find((h) => vmap[h] !== vmap.A);
  const routed = new Lan(vmap, true);
  // ARP already ran: the router and both ends are in the tables before the measured frames.
  if (other) {
    for (const [s, d, v] of [
      ["R", "A", vmap.A ?? 10],
      ["A", "R", undefined],
      ["R", other, vmap[other] ?? 20],
      [other, "R", undefined],
    ] as const)
      routed.send(s, d, v);
  }
  const warm = (["S1", "S2"] as const).map((sw) => ({ sw, entries: [...routed.tables[sw]] }));
  const direct = other ? routed.send("A", other) : undefined;
  const leg1 = other ? routed.send("A", "R") : undefined;
  const leg2 = other ? routed.send("R", other, vmap[other] ?? 20) : undefined;
  const viaRouter = (leg1?.hops.length ?? 0) + (leg2?.hops.length ?? 0);
  const directReached = direct?.hops.some((h) => h.to === other) ?? false;

  b.step(
    {
      id: "s1-inunda",
      title: "Destino desconhecido inunda",
      subtitle: `${copies(first)} enlaces para um quadro`,
      text: `A manda um quadro [[ethernet]] para D. O [[switch]] lê o MAC de destino, mas a tabela está vazia: sem saber onde D está, ele inunda, copiando o quadro para todas as portas menos a de entrada. S2 recebe pelo tronco e faz o mesmo. O quadro percorre ${copies(first)} cabos, contando o de A; B, C, E e F leem o destino, veem que não é o seu e descartam. Enquanto isso, os dois switches anotaram de onde A veio.`,
      facts: [
        ["Origem", `A (${mac("A")})`],
        ["Destino", `D (${mac("D")})`],
        ["Enlaces", String(copies(first))],
      ],
      highlight: ["S1", "S2"],
    },
    () => {
      clearTables();
      play(first, "A→D", "a", "inundação");
      c.count("sw", String(copies(first)), { label: `${copies(first)} enlaces` });
      c.count("hub", String(HUB_COPIES), { label: `${HUB_COPIES} enlaces` });
    },
  );

  b.step(
    {
      id: "s2-aprende",
      title: "A resposta vai direto",
      subtitle: `${copies(reply)} enlaces`,
      text: `Quando D responde, S2 aprende que D está na porta 1 e já sabe que A fica do lado do tronco, porque o primeiro quadro de A chegou por ali. S1 sabe que A está na porta 1. A resposta usa só ${copies(reply)} enlaces, e nenhum outro computador a vê. É a [[ponte-com-aprendizado]]: o switch nunca recebe configuração, ele deduz a tabela olhando o MAC de origem de cada quadro que passa.`,
      facts: [
        ["S1", "A na porta 1, D na 4"],
        ["S2", "A na porta 4, D na 1"],
        ["Enlaces", String(copies(reply))],
      ],
      highlight: ["S1", "S2"],
      quiz: {
        kind: "number",
        prompt:
          "Depois de A e D terem falado, quantos enlaces usa um quadro de B para A, ambos ligados a S1?",
        answer: copies(rest[0]?.r ?? reply),
        explain: `S1 já sabe que A está na porta 1 e manda o quadro só para lá: ${copies(rest[0]?.r ?? reply)} enlaces, o cabo de B e o de A, sem passar pelo tronco.`,
      },
    },
    () => {
      play(reply, "D→A", "a", "encaminhado");
    },
  );

  b.step(
    {
      id: "s3-isola",
      title: "Tabela cheia, tráfego separado",
      subtitle: `${unicast} contra ${hub} enlaces`,
      text: `Com as tabelas preenchidas, cada quadro segue só o caminho necessário: B fala com A sem tocar o tronco, E fala com D sem tocar S1. Nos ${TRAFFIC.length} quadros, o switch usou ${unicast} enlaces; com hubs, que repetem tudo em todas as portas, seriam ${hub}. Por isso duas conversas em portas diferentes acontecem ao mesmo tempo, sem colisão. As entradas expiram depois de alguns minutos sem tráfego, para acompanhar máquinas que mudam de porta.`,
      facts: [
        ["Quadros", String(TRAFFIC.length)],
        ["Switch", `${unicast} enlaces`],
        ["Hubs", `${hub} enlaces`],
      ],
      highlight: [],
    },
    () => {
      for (const x of rest) play(x.r, `${x.s}→${x.d}`, "a", "encaminhado");
      c.count("sw", String(unicast), { label: `${unicast} enlaces nos ${TRAFFIC.length} quadros`, dt: 1 });
      c.count("hub", String(hub), { label: `${hub} enlaces nos ${TRAFFIC.length} quadros` });
    },
  );

  b.step(
    {
      id: "s4-broadcast",
      title: "Broadcast ainda chega a todos",
      subtitle: `${copies(bcast)} enlaces, ${bcast.hops.filter((h) => h.kept).length} recebem`,
      text: `${origem} manda um quadro para FF:FF:FF:FF:FF:FF, o endereço de [[broadcast]], como faz o [[arp]] ao procurar um vizinho. Esse destino nunca entra na tabela, e o switch sempre o inunda: ${copies(bcast)} enlaces, e todos os outros ${bcast.hops.filter((h) => h.kept).length} computadores o processam. A rede inteira é um só domínio de broadcast. Com centenas de máquinas, o ruído de ARP, DHCP e descoberta de serviços cresce junto, e qualquer computador enxerga o broadcast de todos.`,
      facts: [
        ["Destino", "FF:FF:FF:FF:FF:FF"],
        ["Enlaces", String(copies(bcast))],
        ["Domínios", "1"],
      ],
      highlight: [origem],
    },
    () => {
      play(bcast, `${origem}→todos`, "warn", "broadcast");
      c.count("sw", String(copies(bcast)), { label: `broadcast: ${copies(bcast)} enlaces`, dt: 1 });
      c.count("hub", String(HUB_COPIES), { label: `${HUB_COPIES} enlaces` });
    },
  );

  const in10 = HOSTS.filter((h) => vmap[h] === 10);
  const in20 = HOSTS.filter((h) => vmap[h] === 20);
  const groups = !in20.length
    ? "todos na 10"
    : !in10.length
      ? "todos na 20"
      : `${list(in10)} na 10 e ${list(in20)} na 20`;
  const others = reached.filter((h) => h !== "S1" && h !== "S2");
  b.step(
    {
      id: "s5-vlan",
      title: "VLANs dividem a rede",
      subtitle: `${origem} na VLAN ${myVlan}: ${copies(vb)} enlaces`,
      text: `Agora cada porta de acesso pertence a uma [[vlan]]: ${groups}. O mesmo broadcast de ${origem} só sai pelas portas da VLAN ${myVlan} e pelo tronco, e ${others.length ? `chega a ${list(others)}` : "não chega a nenhum computador"}: ${copies(vb)} enlaces. No tronco, o quadro leva uma etiqueta [[ieee-8021q]] de ${TAG_BYTES} bytes com o número da VLAN em ${VID_BITS} bits, ${num(usableVlans())} VLANs possíveis. Cada VLAN tem tabela e broadcast próprios.`,
      facts: [
        ["VLAN 10", list(in10) || "nenhum"],
        ["VLAN 20", list(in20) || "nenhum"],
        ["Etiqueta", `${TAG_BYTES} bytes, VID de ${VID_BITS} bits`],
      ],
      highlight: [origem],
      quiz: {
        kind: "choice",
        prompt: "O que diz ao switch S2 a qual VLAN pertence um quadro vindo do tronco?",
        options: ["A etiqueta 802.1Q no quadro", "O MAC de origem", "A porta de destino"],
        answer: 0,
        explain: `O tronco leva várias VLANs; a etiqueta de ${TAG_BYTES} bytes carrega o número de cada quadro.`,
      },
    },
    () => {
      clearTables();
      for (const h of HOSTS) {
        const v = vmap[h] ?? 10;
        b.ev({
          t: c.t,
          kind: "state",
          target: h,
          text: `VLAN ${v}`,
          tone: "active",
          role: vlanRole(v),
          label: `${h}: VLAN ${v}`,
        });
      }
      play(vb, `${origem}→todos`, vlanRole(myVlan), "broadcast na VLAN");
      c.count("sw", String(copies(vb)), {
        label: `broadcast na VLAN ${myVlan}: ${copies(vb)} enlaces`,
        dt: 1,
      });
      c.count("hub", String(HUB_COPIES), { label: `${HUB_COPIES} enlaces` });
    },
  );

  b.step(
    {
      id: "s6-roteador",
      quiz: {
        kind: "pick",
        prompt: "A está na VLAN 10 e C na VLAN 20. Por qual equipamento o pacote de A para C tem de passar?",
        targets: [
          { id: "S1", label: "S1" },
          { id: "S2", label: "S2" },
          { id: "R", label: "Roteador" },
        ],
        answer: "R",
        explain:
          "Os switches mantêm cada VLAN separada, como se fossem redes diferentes. Para ir de uma à outra é preciso subir à camada de rede, no roteador.",
      },
      title: "Entre VLANs, só roteando",
      subtitle: other ? `A → ${other}: ${viaRouter} enlaces` : "todos na mesma VLAN",
      text: other
        ? `A, na VLAN ${vmap.A}, quer falar com ${other}, na VLAN ${vmap[other]}. ${directReached ? "" : `Um quadro direto nunca chega: o switch só o espalha na VLAN ${vmap.A}, e ${other} não está nela. `}O caminho passa por um roteador ligado por tronco a S1: o quadro sobe com etiqueta ${vmap.A}, o roteador troca de rede na camada 3 e o devolve com etiqueta ${vmap[other]}. São ${viaRouter} enlaces, com o cabo entre S1 e o roteador percorrido duas vezes. É o preço da separação, e onde ficam as regras de quem pode falar com quem.`
        : "Todos os computadores estão na mesma VLAN, então não há o que rotear: qualquer quadro segue direto pelas tabelas dos switches. No laboratório, ponha algum computador na VLAN 20 para ver um quadro precisar do roteador para atravessar de uma VLAN para a outra.",
      facts: [
        ["Origem", `A (VLAN ${vmap.A})`],
        ["Destino", other ? `${other} (VLAN ${vmap[other]})` : "mesma VLAN"],
        ["Pelo roteador", other ? `${viaRouter} enlaces` : "não precisa"],
      ],
      highlight: ["R"],
    },
    () => {
      c.show(["R"]);
      if (!direct || !leg1 || !leg2 || !other) {
        c.note("S1", "nada a rotear", "info", { dt: 1 });
        return;
      }
      clearTables();
      for (const { sw, entries } of warm)
        for (const [key, port] of entries) {
          const [v = "", m = ""] = key.split("|");
          const idx = rows[sw]++;
          if (idx < TABLE_ROWS)
            c.row(sw === "S1" ? "t1" : "t2", idx, [v, `${mac(m)} ${m}`, String(port)], {
              role: vlanRole(Number(v)),
            });
        }
      play(direct, `A→${other}`, "muted", "direto, sem rota");
      c.note("S1", `${other} não está na VLAN ${vmap.A}`, "bad");
      play(leg1, `A→${other}`, vlanRole(vmap.A ?? 10), "para o roteador");
      play(leg2, `A→${other}`, vlanRole(vmap[other] ?? 20), "roteado");
      c.count("sw", String(viaRouter), { label: `pelo roteador: ${viaRouter} enlaces`, dt: 1 });
    },
  );

  return b.done({
    flood: copies(first),
    reply: copies(reply),
    unicast,
    hub,
    bcast: copies(bcast),
    vlanBcast: copies(vb),
    viaRouter,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "switch-vlan",
    site: "redes",
    title: "Switches e VLANs",
    summary:
      "Como um switch aprende onde está cada computador olhando o MAC de origem, por que destinos desconhecidos e broadcasts inundam a rede, e como VLANs, etiquetas 802.1Q e um roteador dividem uma LAN em várias.",
    area: "Enlace",
    refs: [
      { book: "tanenbaum-cn", chapter: 4, section: "4.7.2", note: "Learning bridges", verified: true },
      {
        book: "tanenbaum-cn",
        chapter: 4,
        section: "4.7.4",
        note: "Repetidores, hubs, bridges, switches, roteadores e gateways",
        verified: true,
      },
      { book: "tanenbaum-cn", chapter: 4, section: "4.7.5", note: "LANs virtuais", verified: true },
    ],
    simplifications: [
      "Contamos enlaces percorridos, não tempo; switches reais encaminham em microssegundos.",
      "As tabelas não expiram durante a lição; switches reais apagam entradas após uns 5 minutos sem tráfego.",
      "Não há laços entre switches, então o spanning tree não entra em cena.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "vlans",
        kind: "text",
        label: "VLAN de A a F (1 = VLAN 10, 2 = VLAN 20)",
        maxLength: 6,
        pattern: "^[12]{6}$",
        placeholder: DEFAULTS.vlans,
      },
      {
        key: "origem",
        kind: "choice",
        label: "Quem manda o broadcast",
        options: HOSTS.map((h) => ({ value: h, label: h })),
      },
    ],
  },
  build,
  intro: {
    text: "Seis computadores, dois switches e um cabo entre eles. Como o switch sabe para qual porta mandar cada quadro, se ninguém configurou nada? E como separar a rede em duas sem trocar os cabos?",
    facts: [
      ["Computadores", String(HOSTS.length)],
      ["Switches", "2"],
      ["VLANs", "10 e 20"],
    ],
  },
  outro: {
    title: "Switches em resumo",
    text: "O switch aprende a porta de cada MAC pelo endereço de origem e inunda o que não conhece. Broadcasts sempre inundam, e por isso a LAN plana é um só domínio de broadcast. VLANs dividem as portas em redes separadas, o tronco carrega todas com a etiqueta 802.1Q, e para atravessar de uma VLAN a outra o quadro precisa de um roteador.",
    facts: (run) => [
      ["Unicast", `${run.stats.unicast} contra ${run.stats.hub}`],
      ["Broadcast", `${run.stats.bcast} → ${run.stats.vlanBcast}`],
      ["Pelo roteador", `${run.stats.viaRouter} enlaces`],
    ],
  },
  next: ["arp-spoofing", "encapsulamento"],
};

export default lesson;
