import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { CHANNELS, CITY_CELLS, handoverRun, reuse, STEPS, WEAK_DB } from "../../../sim/net/cellular.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { celular as practice } from "../practice.ts";

/**
 * The cellular network: cells reuse scarce frequencies, a moving phone hands over from one cell
 * to the next with a hysteresis margin that avoids ping-pong, the operator's core keeps the
 * phone's IP across cells, and the SIM authenticates by challenge and response. Ends with 2G–5G.
 */
export const DEFAULTS = { cluster: "7", histerese: 3 };

function clamp(p: Params) {
  const n = [3, 4, 7].includes(Number(p.cluster)) ? Number(p.cluster) : 7;
  const h = Math.min(12, Math.max(0, Math.round(Number(p.histerese ?? DEFAULTS.histerese))));
  return { n, h };
}

const scene: SceneSpec = {
  viewBox: [960, 660],
  nodes: [
    { id: "A", kind: "router", label: "Antena A", sub: "célula de origem", at: [120, 70], w: 160 },
    { id: "cel", kind: "laptop", label: "Celular", sub: "andando de A para B", at: [480, 70], w: 190 },
    { id: "B", kind: "router", label: "Antena B", sub: "célula vizinha", at: [840, 70], w: 160 },
    {
      id: "core",
      kind: "cloud",
      label: "Núcleo da operadora",
      sub: "controle e gateway",
      at: [480, 180],
      w: 230,
    },
    { id: "net", kind: "cloud", label: "Internet", at: [840, 180], w: 150 },
  ],
  links: [
    { id: "l-a", from: "cel", to: "A", style: "dashed" },
    { id: "l-b", from: "cel", to: "B", style: "dashed" },
    { id: "l-ac", from: "A", to: "core" },
    { id: "l-bc", from: "B", to: "core" },
    { id: "l-n", from: "core", to: "net" },
  ],
  widgets: [
    {
      kind: "chart",
      id: "sinal",
      title: "Qualidade do sinal (dB) ao longo do caminho",
      at: [60, 270],
      width: 520,
      height: 180,
      x: { label: `posição (de A, 0, até B, ${STEPS})`, max: STEPS },
      y: { label: "dB", max: 60 },
    },
    {
      kind: "table",
      id: "reuso",
      title: `${CHANNELS} canais, ${CITY_CELLS} células na cidade`,
      at: [640, 270],
      columns: ["N", "Por célula", "Na cidade"],
      widths: [60, 120, 120],
      rows: 3,
    },
    {
      kind: "table",
      id: "geracoes",
      title: "Gerações",
      at: [40, 520],
      columns: ["Geração", "O que trouxe"],
      widths: [120, 760],
      rows: 4,
    },
  ],
};

export function build(p: Params) {
  const { n, h } = clamp(p);
  const ru = reuse(n);
  const r = handoverRun(h);
  const r0 = handoverRun(0);
  const b = lessonBuilder();
  const c = talk(
    b,
    { A: "antena A", B: "antena B", cel: "celular", core: "núcleo", net: "internet" },
    (t) => `t${t}`,
  );
  const pl = (k: number, one: string, many: string) => (k === 1 ? one : many);
  const where = r.switches.map((s) => `${s.x} (para ${s.to})`).join(", ");

  b.step(
    {
      id: "s1-celulas",
      title: "Dividir a cidade em células",
      subtitle: "Frequência é escassa",
      text: `O espectro que uma operadora pode usar é limitado e caro. Por isso a cidade é dividida em [[celula|células]], cada uma servida por uma antena de potência baixa, e as mesmas frequências são reaproveitadas em células distantes o bastante para não se atrapalharem. Quanto menores as células, mais vezes a mesma frequência se repete e mais aparelhos a rede atende ao mesmo tempo.`,
      facts: [
        ["Canais da operadora", String(CHANNELS)],
        ["Células na cidade", String(CITY_CELLS)],
        ["Truque", "reaproveitar frequências"],
      ],
      highlight: ["A", "B"],
    },
    () => {
      c.state("A", "canais do grupo 1", { tone: "active" });
      c.state("B", "canais do grupo 2", { tone: "active", dt: 0 });
    },
  );

  b.step(
    {
      id: "s2-reuso",
      title: "O grupo de reúso",
      subtitle: `N = ${n}`,
      text: `As células formam grupos de N vizinhas, e os ${CHANNELS} canais são divididos entre elas: com N = ${n}, cada célula fica com ${ru.perCell}. O grupo se repete pela cidade, então as ${CITY_CELLS} células somam ${ru.city} conversas ao mesmo tempo. N menor dá mais canais por célula, mas células com a mesma frequência ficam mais perto e interferem mais. O 4G e o 5G chegam a usar N = 1, coordenando a interferência.`,
      facts: [
        ["N", String(n)],
        ["Canais por célula", String(ru.perCell)],
        ["Na cidade", String(ru.city)],
      ],
      highlight: ["reuso"],
      quiz: {
        kind: "number",
        prompt: `A operadora tem ${CHANNELS} canais e usa grupos de ${n} células. Quantos canais cada célula recebe?`,
        answer: ru.perCell,
        explain: `${CHANNELS} ÷ ${n} = ${ru.perCell}. Repetindo o grupo pelas ${CITY_CELLS} células, a cidade atende ${ru.city} ao mesmo tempo.`,
      },
    },
    () => {
      [3, 4, 7].forEach((k, i) => {
        const x = reuse(k);
        c.row("reuso", i, [String(k), String(x.perCell), String(x.city)], {
          dt: 1,
          mark: k === n ? "hit" : "new",
        });
      });
    },
  );

  b.step(
    {
      id: "s3-sinal",
      title: "Andando entre duas antenas",
      subtitle: "Um sinal cai, o outro sobe",
      text: `O celular está numa ligação e anda de A para B. A qualidade do sinal de A cai com a distância e a de B sobe, mas nenhuma das duas é uma linha reta: prédios, árvores e reflexos fazem cada uma oscilar alguns dB para cima e para baixo. O aparelho mede as duas continuamente e informa a rede, que decide quando passar a ligação para B.`,
      facts: [
        ["Mede", "a própria célula e as vizinhas"],
        ["Oscilação", "alguns dB"],
        ["Quem decide", "a rede"],
      ],
      highlight: ["sinal"],
    },
    () => {
      for (const s of r.signals) {
        c.plot("sinal", "A", s.x, Math.max(0, s.a), { label: `A: ${s.a} dB`, role: "a" });
        c.plot("sinal", "B", s.x, Math.max(0, s.b), { label: `B: ${s.b} dB`, role: "b", dt: 0 });
      }
    },
  );

  b.step(
    {
      id: "s4-handover",
      title: "Trocar de antena sem cair",
      subtitle: `Histerese de ${h} dB`,
      text: `A regra é trocar quando a vizinha ficar melhor que a atual por uma margem, a [[histerese|histerese]]. Com ${h} dB, houve ${r.count} ${pl(r.count, "troca", "trocas")}, na posição ${where}. Sem margem, ${r0.count} trocas: no meio do caminho os sinais se cruzam várias vezes e a ligação fica indo e voltando. Margem demais deixa o aparelho preso a uma antena fraca: aqui, ${r.weak} ${pl(r.weak, "posição", "posições")} abaixo de ${WEAK_DB} dB.`,
      facts: [
        ["Histerese", `${h} dB`],
        ["Trocas", String(r.count)],
        ["Sem margem", `${r0.count} trocas`],
      ],
      highlight: ["sinal", "cel"],
      quiz: {
        kind: "choice",
        prompt: "Por que a rede só troca de antena quando a vizinha está melhor por alguns dB?",
        options: [
          "Para não ficar trocando a cada oscilação quando os dois sinais estão parecidos",
          "Para economizar bateria da antena",
          "Porque a antena vizinha precisa de tempo para ligar",
        ],
        answer: 0,
        explain:
          "Perto do meio, os sinais se cruzam várias vezes por causa das oscilações. Exigir uma vantagem clara evita o vai e volta, que custa sinalização e pode derrubar a ligação.",
      },
    },
    () => {
      for (const s of r.switches) {
        c.state("cel", `posição ${s.x}: passa para ${s.to}`, { tone: "warn" });
        c.send(s.to === "B" ? "A" : "B", s.to, "handover", { what: "troca", detail: `posição ${s.x}` });
      }
    },
  );

  b.step(
    {
      id: "s5-nucleo",
      title: "O núcleo guarda o endereço",
      subtitle: "O IP não muda",
      text: `As antenas não falam direto com a internet. Atrás delas está o [[nucleo-celular|núcleo da operadora]]: uma parte cuida do controle, de quem está ligado e em que célula, e um gateway dá ao celular o endereço IP e o liga à internet. No handover, só o túnel entre o gateway e a antena muda de ponta; o IP continua o mesmo, e a videochamada não cai.`,
      facts: [
        ["Controle", "MME no 4G, AMF no 5G"],
        ["Dados", "gateway, UPF no 5G"],
        ["IP no handover", "o mesmo"],
      ],
      highlight: ["core"],
    },
    () => {
      c.send("cel", "A", "vídeo", { what: "dados", detail: "pela antena A" });
      c.send("A", "core", "túnel", { what: "túnel", detail: "até o gateway" });
      c.send("core", "net", "IP 100.64.7.20", { what: "dados", detail: "mesmo IP" });
      c.send("cel", "B", "vídeo", { what: "dados", detail: "agora pela antena B" });
      c.send("B", "core", "túnel", { what: "túnel", detail: "nova ponta" });
      c.send("core", "net", "IP 100.64.7.20", { what: "dados", detail: "mesmo IP" });
    },
  );

  b.step(
    {
      id: "s6-sim",
      title: "O chip prova quem é",
      subtitle: "Desafio e resposta",
      text: `Ao ligar, o celular precisa provar que tem direito à rede. O [[sim|chip SIM]] guarda uma chave secreta que só ele e a operadora conhecem, e que nunca sai do chip. A rede manda um número aleatório; o chip calcula uma resposta com a chave e a devolve. Desde o 3G, a rede também se prova ao chip, o que dificulta antenas falsas, problema sério no 2G.`,
      facts: [
        ["Chave", "só no chip e na operadora"],
        ["Pela rede passa", "desafio e resposta"],
        ["Autenticação mútua", "desde o 3G"],
      ],
      highlight: ["cel", "core"],
      quiz: {
        kind: "choice",
        prompt: "Por que a chave secreta do chip nunca precisa passar pela rede?",
        options: [
          "A rede manda um desafio e confere a resposta, que só quem tem a chave sabe calcular",
          "Porque ela é enviada cifrada a cada ligação",
          "Porque o número de telefone já identifica o chip",
        ],
        answer: 0,
        explain:
          "Num desafio e resposta, o segredo é usado nos dois lados para fazer a mesma conta. Quem escuta a troca vê o desafio e a resposta, mas não consegue a chave a partir deles.",
      },
    },
    () => {
      c.send("core", "cel", "desafio + prova da rede", {
        what: "AKA",
        detail: "número aleatório",
        role: "b",
      });
      c.send("cel", "core", "resposta", { what: "AKA", detail: "calculada no chip" });
      c.state("core", "resposta confere", { tone: "good" });
    },
  );

  b.step(
    {
      id: "s7-geracoes",
      title: "De 2G a 5G",
      subtitle: "O que cada geração trouxe",
      text: `Cada geração mudou o que a rede faz. O 2G digitalizou a voz e trouxe o SMS. O 3G trouxe dados de verdade e a autenticação mútua. O 4G passou tudo para IP, inclusive a voz. O 5G usa frequências mais altas, com células menores, latência de poucos milissegundos e fatias da rede separadas para usos diferentes, como fábricas e veículos.`,
      facts: [
        ["4G", "tudo em IP"],
        ["5G", "células menores, latência baixa"],
        ["Fatias", "redes lógicas separadas"],
      ],
      highlight: ["geracoes"],
    },
    () => {
      const rows: [string, string][] = [
        ["2G", "voz digital e SMS"],
        ["3G", "dados móveis e autenticação mútua"],
        ["4G", "rede toda em IP, inclusive a voz"],
        ["5G", "frequências altas, células pequenas, latência baixa, fatias"],
      ];
      rows.forEach(([g, w], i) => {
        c.row("geracoes", i, [g, w], { dt: 1, mark: "new" });
      });
    },
  );

  return b.done({ perCell: ru.perCell, city: ru.city, handovers: r.count, pingPong: r0.count, weak: r.weak });
}

const lesson: LessonModule = {
  meta: {
    slug: "celular",
    site: "redes",
    title: "Redes celulares",
    summary:
      "Células reaproveitam frequências, o celular troca de antena com uma margem que evita o vai e volta, o núcleo da operadora mantém o IP entre células e o chip se autentica por desafio e resposta. Termina com as gerações, de 2G a 5G.",
    area: "Fundamentos",
    refs: [
      { book: "tanenbaum-cn", chapter: 2, section: "2.6.6", note: "4G", verified: true },
      { book: "tanenbaum-cn", chapter: 2, section: "2.6.7", note: "5G", verified: true },
      {
        book: "tanenbaum-cn",
        chapter: 2,
        section: "2.10.2",
        note: "Rede de telefonia celular",
        verified: true,
      },
    ],
    simplifications: [
      "Um canal por conversa; no 4G e no 5G os recursos são divididos de forma mais fina.",
      "A qualidade do sinal cai em linha reta com a distância, mais uma oscilação fixa.",
      "O handover usa só a histerese, sem o tempo mínimo de espera que as redes reais também exigem.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "cluster",
        kind: "choice",
        label: "Células por grupo de reúso (N)",
        options: [
          { value: "3", label: "3" },
          { value: "4", label: "4" },
          { value: "7", label: "7" },
        ],
      },
      { key: "histerese", kind: "int", label: "Histerese do handover (dB)", min: 0, max: 12 },
    ],
  },
  build,
  practice,
  intro: {
    text: "Milhões de celulares numa cidade dividem um pedaço pequeno do espectro de rádio, e mesmo assim a ligação não cai quando você atravessa o bairro. Você vai ver como as células reaproveitam frequências, como o aparelho troca de antena e como a operadora sabe que o chip é seu.",
    facts: [
      ["Canais", String(CHANNELS)],
      ["Células", String(CITY_CELLS)],
      ["Antenas na cena", "2"],
    ],
  },
  outro: {
    title: "Redes celulares em resumo",
    text: "A cidade é dividida em células que reaproveitam frequências; quanto menores, mais capacidade. O celular troca de antena quando a vizinha fica melhor por uma margem, o que evita o vai e volta. O núcleo da operadora mantém o IP durante as trocas, e o chip prova quem é por desafio e resposta, sem expor a chave.",
    facts: (rr) => [
      ["Canais por célula", String(rr.stats.perCell)],
      ["Trocas de antena", String(rr.stats.handovers)],
      ["Sem margem", `${rr.stats.pingPong} trocas`],
    ],
  },
  next: ["camada-fisica", "wifi-csma-ca", "ipv6-slaac"],
};

export default lesson;
