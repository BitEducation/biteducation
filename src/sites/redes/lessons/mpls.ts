import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { CAPACITY, LONG, LSP, SHIM, SHORT, teRun, WEB } from "../../../sim/net/mpls.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * MPLS: instead of a longest-prefix lookup at every hop, the edge router classifies the packet
 * once and pushes a 20-bit label; core routers swap labels by exact match and the far edge pops it.
 * Labels also let the provider steer flows off the shortest path and keep customer VPNs apart.
 */
export const DEFAULTS = { video: 500 };

function clamp(p: Params) {
  return Math.min(900, Math.max(100, Math.round(Number(p.video ?? DEFAULTS.video) / 50) * 50));
}

const scene: SceneSpec = {
  viewBox: [960, 660],
  zones: [{ id: "isp", title: "Rede do provedor", rect: { x: 140, y: 40, w: 720, h: 300 }, tone: "kernel" }],
  nodes: [
    { id: "A", kind: "laptop", label: "Filial A", sub: "10.1.0.0/16", at: [60, 190], w: 110 },
    { id: "PE1", kind: "router", label: "PE1", sub: "borda de entrada", at: [230, 190], w: 130 },
    { id: "P1", kind: "router", label: "P1", sub: "núcleo", at: [410, 100], w: 110 },
    { id: "P2", kind: "router", label: "P2", sub: "núcleo", at: [600, 100], w: 110 },
    { id: "P3", kind: "router", label: "P3", sub: "núcleo", at: [500, 290], w: 110 },
    { id: "PE2", kind: "router", label: "PE2", sub: "borda de saída", at: [770, 190], w: 130 },
    { id: "B", kind: "server", label: "Matriz B", sub: "10.2.0.0/16", at: [910, 190], w: 100 },
  ],
  links: [
    { id: "l-a", from: "A", to: "PE1" },
    { id: "l-1", from: "PE1", to: "P1" },
    { id: "l-2", from: "P1", to: "P2" },
    { id: "l-3", from: "P2", to: "PE2" },
    { id: "l-4", from: "PE1", to: "P3" },
    { id: "l-5", from: "P3", to: "PE2" },
    { id: "l-b", from: "PE2", to: "B" },
  ],
  widgets: [
    {
      kind: "grid",
      id: "shim",
      title: "Cabeçalho MPLS: 32 bits entre o quadro e o IP",
      at: [40, 370],
      cols: 4,
      rows: 1,
      cellW: 160,
      indexLabel: "none",
    },
    {
      kind: "table",
      id: "lfib",
      title: "Caminho com rótulos (LSP)",
      at: [40, 460],
      columns: ["Roteador", "Entra com", "Sai com", "Faz"],
      widths: [110, 120, 120, 130],
      rows: 4,
    },
    {
      kind: "table",
      id: "carga",
      title: `Carga nos caminhos (capacidade ${CAPACITY} Mb/s)`,
      at: [560, 460],
      columns: ["Caminho", "Só IP", "Com rótulos"],
      widths: [160, 100, 120],
      rows: 2,
    },
  ],
};

export function build(p: Params) {
  const video = clamp(p);
  const te = teRun(video);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => `t${t}`);
  const labels = 2 ** (SHIM[0]?.bits ?? 20);
  const hop = (from: string, to: string, label: string, detail: string) =>
    c.send(from, to, label, { what: "pacote", detail });

  b.step(
    {
      id: "s1-ip",
      title: "Cada roteador decide de novo",
      subtitle: "Maior prefixo, a cada salto",
      text: `No roteamento IP comum, cada roteador do caminho olha o endereço de destino e procura, na tabela dele, o prefixo mais longo que combina. Num provedor grande, essa tabela tem perto de um milhão de rotas, e a busca se repete em todo salto. O pacote da filial A para a matriz B passa por PE1, P3 e PE2, o caminho mais curto, e é classificado três vezes.`,
      facts: [
        ["Busca", "maior prefixo"],
        ["Rotas na tabela", "perto de 1 milhão"],
        ["Classificações", "uma por salto"],
      ],
      highlight: ["PE1", "P3", "PE2"],
    },
    () => {
      hop("A", "PE1", "IP 10.2.0.9", "busca na tabela");
      hop("PE1", "P3", "IP 10.2.0.9", "busca na tabela");
      hop("P3", "PE2", "IP 10.2.0.9", "busca na tabela");
      hop("PE2", "B", "IP 10.2.0.9", "entrega");
    },
  );

  b.step(
    {
      id: "s2-rotulo",
      title: "Classificar uma vez",
      subtitle: "PE1 empilha o rótulo 100",
      text: `Com [[mpls|MPLS]], só o roteador de entrada, PE1, examina o IP. Ele decide a que classe de encaminhamento o pacote pertence, por destino e por tipo de serviço, e insere um cabeçalho de 32 bits entre o quadro e o IP. O campo principal é o [[rotulo-mpls|rótulo]], de ${SHIM[0]?.bits} bits. Daqui até a outra borda, ninguém mais olha o endereço IP.`,
      facts: [
        ["Cabeçalho", "32 bits"],
        ["Rótulo", `${SHIM[0]?.bits} bits`],
        ["Quem lê o IP", "só as bordas"],
      ],
      highlight: ["shim", "PE1"],
      quiz: {
        kind: "number",
        prompt: `Com ${SHIM[0]?.bits} bits, quantos valores de rótulo diferentes existem?`,
        answer: labels,
        explain: `2 elevado a ${SHIM[0]?.bits} = ${labels}. Os primeiros 16 são reservados para usos especiais.`,
      },
    },
    () => {
      SHIM.forEach((f, i) => {
        c.cell("shim", i, `${f.field} (${f.bits})`, { mark: i === 0 ? "hit" : "new" });
      });
      c.row("lfib", 0, [LSP[0].router, LSP[0].inLabel, LSP[0].outLabel, LSP[0].op], { dt: 1, mark: "new" });
      hop("A", "PE1", "IP", "classifica");
    },
  );

  b.step(
    {
      id: "s3-troca",
      title: "Trocar o rótulo",
      subtitle: "Busca exata",
      text: `P1 recebe o pacote com rótulo 100. A tabela dele é pequena e a busca é exata, não de maior prefixo: o rótulo 100 entra, sai 200, para P2. P2 faz o mesmo e troca 200 por 300. Cada rótulo só tem sentido entre dois vizinhos, e o caminho inteiro, combinado antes entre os roteadores, se chama [[lsp|LSP]]. O pacote segue o caminho combinado, não o que cada um acharia melhor.`,
      facts: [
        ["P1", "100 → 200"],
        ["P2", "200 → 300"],
        ["Busca", "exata, pelo rótulo"],
      ],
      highlight: ["lfib", "P1", "P2"],
      quiz: {
        kind: "choice",
        prompt: "Por que P1 não precisa olhar o endereço IP do pacote?",
        options: [
          "O rótulo já diz o que fazer: a tabela de P1 associa o rótulo 100 à saída e ao rótulo novo",
          "Porque o IP foi cifrado por PE1",
          "Porque P1 só conhece um destino",
        ],
        answer: 0,
        explain:
          "A decisão foi tomada uma vez na borda e codificada no rótulo. No núcleo, encaminhar é uma consulta exata numa tabela pequena.",
      },
    },
    () => {
      hop("PE1", "P1", "rótulo 100", "empilhado");
      c.row("lfib", 1, [LSP[1].router, LSP[1].inLabel, LSP[1].outLabel, LSP[1].op], { dt: 0, mark: "new" });
      hop("P1", "P2", "rótulo 200", "trocado");
      c.row("lfib", 2, [LSP[2].router, LSP[2].inLabel, LSP[2].outLabel, LSP[2].op], { dt: 0, mark: "new" });
      hop("P2", "PE2", "rótulo 300", "trocado");
    },
  );

  b.step(
    {
      id: "s4-saida",
      title: "Tirar o rótulo",
      subtitle: "PE2 entrega por IP",
      text: `Na borda de saída, PE2 retira o rótulo e volta a encaminhar pelo endereço IP, entregando à matriz B. Muitas redes fazem isso um salto antes: o penúltimo roteador já tira o rótulo, e PE2 faz uma busca só, a do IP. Para a filial e a matriz, nada mudou: elas mandam e recebem IP comum e nem sabem que houve rótulos no meio.`,
      facts: [
        ["PE2", "retira o rótulo"],
        ["Variação comum", "o penúltimo retira"],
        ["Clientes veem", "só IP"],
      ],
      highlight: ["PE2", "B"],
    },
    () => {
      c.row("lfib", 3, [LSP[3].router, LSP[3].inLabel, LSP[3].outLabel, LSP[3].op], { dt: 1, mark: "new" });
      hop("PE2", "B", "IP", "entregue");
    },
  );

  b.step(
    {
      id: "s5-engenharia",
      title: "Escolher o caminho",
      subtitle: te.ip.over ? "O caminho curto estoura" : "O caminho curto aguenta",
      text: `Agora há dois fluxos: ${WEB} Mb/s de tráfego web e ${video} Mb/s de vídeo. O IP manda os dois pelo caminho curto, ${SHORT.join("–")}, com ${te.ip.short} Mb/s num link de ${CAPACITY}${te.ip.over ? ": estoura, e pacotes se perdem" : ""}. Com MPLS, o provedor monta um LSP só para o vídeo pelo caminho longo, ${LONG.join("–")}, que estava ocioso. É a [[engenharia-de-trafego|engenharia de tráfego]].`,
      facts: [
        ["Só IP, caminho curto", `${te.ip.short} Mb/s`],
        ["Com rótulos, curto", `${te.te.short} Mb/s`],
        ["Com rótulos, longo", `${te.te.long} Mb/s`],
      ],
      highlight: ["carga", "P3"],
    },
    () => {
      c.row("carga", 0, [SHORT.join("–"), `${te.ip.short}`, `${te.te.short}`], {
        dt: 1,
        mark: te.ip.over ? "bad" : "new",
      });
      c.row("carga", 1, [LONG.join("–"), `${te.ip.long}`, `${te.te.long}`], { dt: 1, mark: "hit" });
      hop("PE1", "P3", "web", `${WEB} Mb/s`);
      c.send("PE1", "PE2", "vídeo, rótulo 100", {
        what: "LSP",
        detail: `${video} Mb/s`,
        via: ["P1", "P2"],
        role: "b",
      });
    },
  );

  b.step(
    {
      id: "s6-vpn",
      title: "Redes privadas sobre o provedor",
      subtitle: "Dois rótulos empilhados",
      text: `Rótulos se empilham, e o bit S marca o último. O provedor usa isso em [[vpn-mpls|VPNs MPLS]]: o rótulo de fora leva o pacote pelo núcleo, e o de dentro diz à borda de saída a qual cliente ele pertence. Duas empresas podem usar os mesmos endereços privados, como 10.0.0.0/8, sem se misturar. É o serviço que muitas empresas contratam para ligar filiais.`,
      facts: [
        ["Rótulo de fora", "caminho no núcleo"],
        ["Rótulo de dentro", "qual cliente"],
        ["Endereços repetidos", "permitidos"],
      ],
      highlight: ["shim"],
    },
    () => {
      c.cell("shim", 2, "S = 0, depois 1", { mark: "dirty" });
      c.note("PE2", "rótulo de dentro: cliente da filial A", "info", { dt: 1 });
    },
  );

  return b.done({ labels, short: te.ip.short, over: te.ip.over ? 1 : 0, teLong: te.te.long });
}

const lesson: LessonModule = {
  meta: {
    slug: "mpls",
    site: "redes",
    title: "MPLS e comutação por rótulos",
    summary:
      "A borda classifica o pacote uma vez e põe um rótulo de 20 bits; o núcleo troca rótulos por busca exata e a outra borda os retira. Com rótulos, o provedor tira fluxos do caminho mais curto e separa as redes dos clientes.",
    area: "Rede",
    refs: [{ book: "tanenbaum-cn", chapter: 5, section: "5.7.5", note: "MPLS", verified: true }],
    simplifications: [
      "Os rótulos 100, 200 e 300 são ilustrativos; na prática cada roteador escolhe os seus.",
      "A distribuição dos rótulos entre roteadores (LDP ou RSVP-TE) só é citada.",
      "As capacidades e cargas são números redondos.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [{ key: "video", kind: "int", label: "Fluxo de vídeo (Mb/s)", min: 100, max: 900 }],
  },
  build,
  intro: {
    text: "Dentro das redes dos provedores, a maior parte dos pacotes não é encaminhada pelo endereço IP, mas por um rótulo curto posto na entrada. Você vai seguir um pacote rotulado de borda a borda e ver o que os rótulos permitem que o IP sozinho não permite.",
    facts: [
      ["Roteadores", "2 de borda, 3 de núcleo"],
      ["Rótulo", "20 bits"],
      ["Caminhos", "2"],
    ],
  },
  outro: {
    title: "MPLS em resumo",
    text: "O roteador de entrada classifica o pacote e empilha um rótulo; os do núcleo trocam o rótulo por busca exata; o de saída o retira e volta ao IP. O caminho é combinado antes, então o provedor pode desviar fluxos do caminho mais curto e, empilhando rótulos, manter separadas as redes de clientes diferentes.",
    facts: (r) => [
      ["Rótulos possíveis", String(r.stats.labels)],
      ["Só IP, caminho curto", `${r.stats.short} Mb/s`],
      ["Estourou", r.stats.over === 1 ? "sim" : "não"],
    ],
  },
  next: ["roteamento", "bgp-hijack", "sub-redes"],
};

export default lesson;
