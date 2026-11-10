import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { LINKS, load, membersOf, path } from "../../../sim/net/multicast.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Multicast: the same stream to many receivers. Unicast sends one copy per receiver over every
 * hop; a group address lets routers copy only at branches. IGMP tells the router who on its LAN
 * joined, PIM builds the tree towards the source, and pruning cuts branches with no members.
 */
export const DEFAULTS = { membros: 4, taxa: 5 };
export const GROUP = "239.1.2.3";

function clamp(p: Params) {
  const k = Math.min(5, Math.max(1, Math.round(Number(p.membros ?? DEFAULTS.membros))));
  const rate = Math.min(20, Math.max(1, Math.round(Number(p.taxa ?? DEFAULTS.taxa))));
  return { k, rate };
}

const AT: Record<string, readonly [number, number]> = {
  S: [480, 60],
  R1: [480, 160],
  R2: [260, 260],
  R3: [700, 260],
  H1: [150, 370],
  H2: [370, 370],
  H3: [600, 370],
  R4: [830, 370],
  H4: [740, 470],
  H5: [910, 470],
};

const scene: SceneSpec = {
  viewBox: [960, 660],
  nodes: [
    {
      id: "S",
      kind: "server",
      label: "Fonte de vídeo",
      sub: "um canal ao vivo",
      at: AT.S as [number, number],
      w: 180,
    },
    ...["R1", "R2", "R3", "R4"].map((id) => ({
      id,
      kind: "router" as const,
      label: id,
      at: AT[id] as [number, number],
      w: 90,
    })),
    ...["H1", "H2", "H3", "H4", "H5"].map((id) => ({
      id,
      kind: "laptop" as const,
      label: id,
      at: AT[id] as [number, number],
      w: 90,
    })),
  ],
  links: LINKS.map((l) => ({ id: l.id, from: l.parent, to: l.child })),
  widgets: [
    { kind: "counter", id: "fonte", title: "Cópias saindo da fonte", at: [40, 560] },
    { kind: "counter", id: "banda", title: "Banda no link S–R1", at: [270, 560] },
    { kind: "counter", id: "total", title: "Transmissões em todos os links", at: [500, 560] },
    { kind: "counter", id: "grupo", title: "Membros do grupo", at: [760, 560] },
  ],
};

export function build(p: Params) {
  const { k, rate } = clamp(p);
  const members = membersOf(k);
  const all = load(members);
  const leaving = members.filter((h) => path(h).includes("R1-R3"));
  const staying = members.filter((h) => !leaving.includes(h));
  const pruned = load(staying);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => `t${t}`);
  const pl = (x: number, one: string, many: string) => (x === 1 ? one : many);
  const along = (h: string, label: string, role: "a" | "b" = "a") => {
    const hops = path(h).map((l) => l.split("-")[1] as string);
    c.send("S", h, label, { what: "fluxo", detail: h, role, via: hops.slice(0, -1) });
  };
  const mcast = (r: typeof all) => {
    for (const l of LINKS)
      if ((r.multi[l.id] ?? 0) > 0)
        c.send(l.parent, l.child, GROUP, { what: "multicast", detail: "uma cópia", dt: 0 });
  };

  b.step(
    {
      id: "s1-unicast",
      title: "Uma cópia por espectador",
      subtitle: `${members.length} ${pl(members.length, "espectador", "espectadores")}`,
      text: `Uma fonte transmite um canal ao vivo a ${rate} Mb/s, e ${members.join(", ")} querem assistir. Com unicast, a fonte manda uma cópia separada para cada um: ${all.fromSource} ${pl(all.fromSource, "cópia", "cópias")} idênticas saem pelo mesmo link até R1, ${all.fromSource * rate} Mb/s. Somando todos os links, são ${all.uniTotal} transmissões do mesmo vídeo. Com mil espectadores, a fonte precisaria de mil vezes a banda.`,
      facts: [
        ["Cópias da fonte", String(all.fromSource)],
        ["Banda em S–R1", `${all.fromSource * rate} Mb/s`],
        ["Transmissões", String(all.uniTotal)],
      ],
      highlight: ["S", "R1"],
    },
    () => {
      for (const h of members) along(h, `cópia para ${h}`);
      c.count("fonte", String(all.fromSource), { label: `${all.fromSource} cópias` });
      c.count("banda", `${all.fromSource * rate} Mb/s`, { label: `${all.fromSource * rate} Mb/s` });
      c.count("total", String(all.uniTotal), { label: `${all.uniTotal} transmissões` });
    },
  );

  b.step(
    {
      id: "s2-grupo",
      title: "Um endereço de grupo",
      subtitle: GROUP,
      text: `No [[multicast|multicast]], a fonte manda um único fluxo para um endereço de grupo, na faixa 224.0.0.0/4, aqui ${GROUP}. Esse endereço não pertence a nenhuma máquina: representa quem quiser receber. Os roteadores copiam o pacote só onde o caminho se divide. Cada link leva no máximo uma cópia, qualquer que seja o número de espectadores depois dele.`,
      facts: [
        ["Grupo", GROUP],
        ["Faixa", "224.0.0.0/4"],
        ["Cópias por link", "no máximo 1"],
      ],
      highlight: ["S"],
    },
    () => {
      c.send("S", "R1", GROUP, { what: "multicast", detail: "uma cópia" });
      c.count("fonte", "1", { label: "uma cópia" });
      c.count("banda", `${rate} Mb/s`, { label: `${rate} Mb/s` });
    },
  );

  b.step(
    {
      id: "s3-igmp",
      title: "Quem quer receber",
      subtitle: "IGMP na rede local",
      text: `Para entrar no grupo, cada espectador manda um aviso [[igmp|IGMP]] ao roteador da sua rede local: "quero ${GROUP}". O roteador não precisa saber quem nem quantos são; basta saber se há pelo menos um interessado na rede. De tempos em tempos ele pergunta se ainda há alguém, e quem sai avisa. ${members.length === 5 ? "Todos entraram." : `${["H1", "H2", "H3", "H4", "H5"].filter((h) => !members.includes(h)).join(", ")} não ${members.length === 4 ? "entrou" : "entraram"}.`}`,
      facts: [
        ["Membros", String(members.length)],
        ["Protocolo", "IGMP"],
        ["Roteador sabe", "se há alguém"],
      ],
      highlight: ["R2", "R4"],
    },
    () => {
      for (const h of members)
        c.send(h, parentOf(h), `IGMP: ${GROUP}`, { what: "IGMP", detail: "entrar no grupo", role: "b" });
      c.count("grupo", String(members.length), { label: members.join(", ") });
    },
  );

  b.step(
    {
      id: "s4-arvore",
      title: "A árvore até a fonte",
      subtitle: `${all.multiTotal} transmissões`,
      text: `Cada roteador com membros pede o fluxo ao vizinho na direção da fonte, e o pedido sobe até lá: o [[pim|PIM]] monta assim uma árvore de distribuição. Agora o vídeo passa uma vez por cada link da árvore: ${all.multiTotal} transmissões no total, contra ${all.uniTotal} com unicast. A fonte manda uma cópia só, e os roteadores duplicam nas bifurcações.`,
      facts: [
        ["Multicast", `${all.multiTotal} transmissões`],
        ["Unicast", `${all.uniTotal} transmissões`],
        ["Economia", `${all.uniTotal - all.multiTotal} transmissões`],
      ],
      highlight: ["R1", "R3"],
      quiz: {
        kind: "number",
        prompt: `Com ${members.join(", ")} no grupo, quantas transmissões do vídeo acontecem somando todos os links, com multicast?`,
        answer: all.multiTotal,
        explain: `Uma por link da árvore que leva a algum membro: ${LINKS.filter(
          (l) => (all.multi[l.id] ?? 0) > 0,
        )
          .map((l) => l.id)
          .join(", ")}. São ${all.multiTotal}.`,
      },
    },
    () => {
      mcast(all);
      c.count("total", String(all.multiTotal), { label: `${all.multiTotal} transmissões` });
    },
  );

  b.step(
    {
      id: "s5-poda",
      title: "Podar um galho",
      subtitle: leaving.length
        ? `${leaving.join(", ")} ${leaving.length === 1 ? "sai" : "saem"}`
        : "Ninguém sai",
      text: leaving.length
        ? `Agora ${leaving.join(" e ")} ${leaving.length === 1 ? "sai" : "saem"} do grupo. Os roteadores daquele lado ficam sem membros e pedem para ser cortados da árvore: é a [[poda|poda]]. O link R1–R3 para de levar o vídeo, e as transmissões caem para ${pruned.multiTotal}. Com unicast, a fonte teria de perceber cada saída e parar cada cópia separadamente.`
        : `Nenhum membro do lado de R3 está no grupo, então aquele galho nem chegou a entrar na árvore. Se alguém dali entrasse, o roteador pediria o fluxo e o galho cresceria; quando todos saem, ele pede para ser cortado: é a [[poda|poda]]. Ponha mais membros no Laboratório para ver a poda acontecer.`,
      facts: [
        ["Saem", leaving.length ? leaving.join(", ") : "ninguém"],
        ["Transmissões depois", String(pruned.multiTotal)],
        ["Link R1–R3", (pruned.multi["R1-R3"] ?? 0) > 0 ? "ativo" : "sem vídeo"],
      ],
      highlight: ["R3", "R1"],
    },
    () => {
      for (const h of leaving)
        c.send(h, parentOf(h), "IGMP: sair", { what: "IGMP", detail: "deixar o grupo", role: "b" });
      if (leaving.length) c.send("R3", "R1", "poda", { what: "PIM", detail: "sem membros", role: "b" });
      else c.state("R3", "sem membros", { tone: "none" });
      c.count("total", String(pruned.multiTotal), { label: `${pruned.multiTotal} transmissões` });
      c.count("grupo", String(staying.length), { label: staying.join(", ") || "ninguém" });
    },
  );

  b.step(
    {
      id: "s6-onde",
      title: "Onde o multicast está",
      subtitle: "Dentro de redes, não na internet",
      text: `O multicast funciona bem dentro de uma rede controlada: TV por assinatura sobre IP dentro do provedor, cotações de bolsa enviadas a muitas corretoras, protocolos de roteamento como o OSPF, que usa 224.0.0.5, e a descoberta de aparelhos na rede de casa. Na internet pública quase não passa entre provedores, e por isso o vídeo ao vivo para o público geral usa CDNs com unicast.`,
      facts: [
        ["IPTV", "dentro do provedor"],
        ["OSPF", "224.0.0.5"],
        ["Internet pública", "CDN e unicast"],
      ],
      highlight: ["S"],
    },
    () => {
      c.note("S", "IPTV, bolsa, OSPF, mDNS", "info", { dt: 1 });
    },
  );

  return b.done({
    unicast: all.uniTotal,
    multicast: all.multiTotal,
    pruned: pruned.multiTotal,
    source: all.fromSource,
  });
}

function parentOf(h: string): string {
  return path(h).at(-1)?.split("-")[0] ?? "R1";
}

const lesson: LessonModule = {
  meta: {
    slug: "multicast",
    site: "redes",
    title: "Multicast",
    summary:
      "O mesmo vídeo para muitos espectadores: unicast manda uma cópia por pessoa, multicast manda uma por link. IGMP diz ao roteador quem entrou, PIM monta a árvore até a fonte e a poda corta galhos vazios.",
    area: "Rede",
    refs: [
      { book: "tanenbaum-cn", chapter: 5, section: "5.2.8", note: "Roteamento multicast", verified: true },
      { book: "tanenbaum-cn", chapter: 5, section: "5.7.8", note: "Multicast na internet", verified: true },
    ],
    simplifications: [
      "Uma árvore fixa a partir da fonte; o PIM real também usa um ponto de encontro compartilhado.",
      "Cada host aparece ligado direto a um roteador, sem a rede local entre eles.",
      "As consultas periódicas do IGMP só aparecem no texto.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "membros", kind: "int", label: "Espectadores no grupo (1 a 5)", min: 1, max: 5 },
      { key: "taxa", kind: "int", label: "Taxa do vídeo (Mb/s)", min: 1, max: 20 },
    ],
  },
  build,
  intro: {
    text: "Transmitir um canal ao vivo para milhares de pessoas com uma cópia para cada uma esgota qualquer link. Você vai comparar unicast com multicast numa pequena rede de roteadores, ver como os espectadores entram no grupo e como a árvore encolhe quando saem.",
    facts: [
      ["Roteadores", "4"],
      ["Espectadores possíveis", "5"],
      ["Grupo", GROUP],
    ],
  },
  outro: {
    title: "Multicast em resumo",
    text: "No multicast, a fonte manda um fluxo para um endereço de grupo, e os roteadores copiam só nas bifurcações: cada link leva no máximo uma cópia. IGMP informa ao roteador local se há membros; PIM constrói a árvore até a fonte e poda galhos sem membros. É comum dentro de redes controladas e raro na internet pública.",
    facts: (r) => [
      ["Unicast", `${r.stats.unicast} transmissões`],
      ["Multicast", `${r.stats.multicast} transmissões`],
      ["Depois da poda", `${r.stats.pruned} transmissões`],
    ],
  },
  next: ["roteamento", "streaming-cdn", "udp"],
};

export default lesson;
