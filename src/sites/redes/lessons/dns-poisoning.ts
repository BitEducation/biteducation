import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import {
  cumulative,
  oneRace,
  PORT_RANGE,
  raceChance,
  racesUntil,
  TXID_SPACE,
} from "../../../sim/net/poison.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { dnsPoisoning as practice } from "../practice.ts";

/**
 * Simulated off-path DNS cache poisoning as a race of probabilities: guessing the 16-bit ID,
 * why the TTL limits retries and how asking for random names removes that limit, the signals a
 * resolver sees, and the defenses (random source ports, DNSSEC). Documentation names and
 * addresses only; nothing here is usable outside the lesson.
 */
export const DEFAULTS = { palpites: 100, ttl: 3600 };
const NAME = "banco.example";
const REAL_IP = "203.0.113.10";
const FAKE_IP = "198.51.100.66";
const RACE_S = 0.05;
const SEED = 53;

function clamp(p: Params) {
  const guesses = Math.min(1000, Math.max(10, Math.round(Number(p.palpites ?? DEFAULTS.palpites))));
  const ttl = Math.min(86400, Math.max(300, Math.round(Number(p.ttl ?? DEFAULTS.ttl))));
  return { guesses, ttl };
}

function plan(p: Params) {
  const { guesses, ttl } = clamp(p);
  const pFixed = raceChance(guesses, false);
  const pRand = raceChance(guesses, true);
  const expected = Math.round(1 / pFixed);
  const xmax = Math.min(20000, Math.max(100, Math.ceil((3 * expected) / 100) * 100));
  return { guesses, ttl, pFixed, pRand, expected, xmax };
}

function scene(p: Params): SceneSpec {
  const { xmax } = plan(p);
  return {
    viewBox: [960, 600],
    nodes: [
      { id: "cliente", kind: "laptop", label: "Cliente", sub: `quer ${NAME}`, at: [110, 140] },
      { id: "resolvedor", kind: "dns", label: "Resolvedor", sub: "192.0.2.53", at: [440, 140] },
      { id: "auth", kind: "server", label: "Autoritativo", sub: NAME, at: [820, 140] },
      { id: "atacante", kind: "attacker", label: "Atacante", sub: FAKE_IP, at: [820, 320], hidden: true },
    ],
    links: [
      { id: "l-cr", from: "cliente", to: "resolvedor" },
      { id: "l-ra", from: "resolvedor", to: "auth" },
      {
        id: "l-xr",
        from: "atacante",
        to: "resolvedor",
        via: [
          [600, 320],
          [600, 175],
        ],
        style: "dashed",
      },
    ],
    widgets: [
      {
        kind: "table",
        id: "corrida",
        title: "Uma corrida, vista pelo resolvedor",
        at: [40, 390],
        columns: ["Resposta", "ID", "Resultado"],
        widths: [140, 80, 150],
        rows: 5,
      },
      { kind: "counter", id: "corridas", title: "Corridas", at: [40, 270] },
      { kind: "counter", id: "errados", title: "Respostas com ID errado", at: [200, 270] },
      {
        kind: "chart",
        id: "chance",
        title: "Chance de já ter envenenado o cache · porta fixa e aleatória",
        at: [470, 420],
        width: 380,
        height: 130,
        x: { label: "corridas", max: xmax },
        y: { label: "%", max: 100 },
      },
    ],
  };
}

const hex4 = (n: number) => `0x${n.toString(16).toUpperCase().padStart(4, "0")}`;
const pct = (v: number) => `${(v * 100).toFixed(v < 0.01 ? 3 : 1).replace(".", ",")}%`;
const num = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
function duration(s: number): string {
  if (s < 120) return `${Math.round(s)} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 172800) return `${Math.round(s / 3600)} h`;
  if (s < 3 * 365 * 86400) return `${Math.round(s / 86400)} dias`;
  return `${num(Math.round(s / (365 * 86400)))} anos`;
}

export function build(p: Params) {
  const { guesses, ttl, pFixed, pRand, expected, xmax } = plan(p);
  const b = lessonBuilder();
  const c = talk(
    b,
    { cliente: "cliente", resolvedor: "resolvedor", auth: "autoritativo", atacante: "atacante" },
    (t) => String(t),
  );
  const race = oneRace(guesses, SEED);
  const k = racesUntil(pFixed, SEED) ?? expected;
  const half = Math.ceil(Math.log(0.5) / Math.log(1 - pFixed));

  b.step(
    {
      id: "s1-consulta",
      title: "Uma consulta comum",
      subtitle: `ID ${hex4(race.real)}`,
      text: `O cliente pergunta ao [[resolvedor]] o endereço de ${NAME}. O resolvedor pergunta ao servidor [[autoritativo]] usando [[udp]], que não tem conexão: a única forma de casar a resposta com a pergunta é conferir o identificador de 16 bits, aqui ${hex4(race.real)}, e a porta. A resposta certa chega, vai para o cache por ${duration(ttl)} e o cliente recebe ${REAL_IP}.`,
      facts: [
        ["Identificador", `16 bits (${num(TXID_SPACE)} valores)`],
        ["Resposta", REAL_IP],
        ["TTL", duration(ttl)],
      ],
      highlight: ["resolvedor"],
    },
    () => {
      c.send("cliente", "resolvedor", `${NAME}?`, { what: "pergunta" });
      c.send("resolvedor", "auth", `ID ${hex4(race.real)}`, {
        what: `pergunta ${NAME}`,
        detail: "porta fixa",
      });
      c.send("auth", "resolvedor", REAL_IP, { role: "b", what: "resposta", detail: `ID ${hex4(race.real)}` });
      c.state("resolvedor", `cache: ${REAL_IP}`, { tone: "good", label: `cache guarda ${REAL_IP}`, dt: 0 });
      c.send("resolvedor", "cliente", REAL_IP, { role: "b", what: "resposta" });
    },
  );

  const shown = race.tried.slice(0, 3);
  b.step(
    {
      id: "s2-corrida",
      title: "A corrida do palpite",
      subtitle: race.hit ? "Acertou" : "Errou",
      text: `Um atacante fora do caminho não vê a pergunta, mas pode provocá-la e tentar responder antes do autoritativo. Sem saber o ID, ele manda ${num(guesses)} respostas falsas com IDs diferentes, todas dizendo que ${NAME} fica em ${FAKE_IP}. O resolvedor descarta as que não casam. Nesta corrida o ID verdadeiro era ${hex4(race.real)} e os palpites ${race.hit ? "incluíam esse valor: o cache foi [[envenenamento-de-cache|envenenado]]" : `foram de ${hex4(race.tried[0] ?? 0)} a ${hex4(race.tried[race.tried.length - 1] ?? 0)}: a resposta verdadeira chegou e venceu`}.`,
      facts: [
        ["Palpites", num(guesses)],
        ["ID verdadeiro", hex4(race.real)],
        ["Chance por corrida", pct(pFixed)],
      ],
      highlight: ["atacante"],
    },
    () => {
      c.show(["atacante"], { dt: 1, label: "o atacante entra em cena" });
      c.send("atacante", "resolvedor", `${NAME}?`, { role: "bad", what: "provoca a pergunta" });
      c.send("resolvedor", "auth", `ID ${hex4(race.real)}`, { what: "pergunta ao autoritativo" });
      shown.forEach((id, i) => {
        c.send("atacante", "resolvedor", `ID ${hex4(id)}`, {
          role: "bad",
          what: "resposta falsa",
          detail: FAKE_IP,
        });
        c.row("corrida", i, ["falsa", hex4(id), id === race.real ? "aceita!" : "descartada"], {
          mark: id === race.real ? "bad" : "miss",
        });
      });
      c.row(
        "corrida",
        3,
        [`+ ${guesses - shown.length} falsas`, "…", race.hit ? "uma casa" : "descartadas"],
        {
          dt: 1,
          mark: race.hit ? "bad" : "miss",
        },
      );
      c.send("auth", "resolvedor", REAL_IP, {
        role: "b",
        what: "resposta verdadeira",
        detail: hex4(race.real),
      });
      c.row("corrida", 4, ["verdadeira", hex4(race.real), race.hit ? "chegou tarde" : "aceita"], {
        mark: race.hit ? "bad" : "hit",
      });
      c.count("corridas", "1");
      c.count("errados", num(race.hit ? guesses - 1 : guesses));
    },
  );

  b.step(
    {
      id: "s3-repetir",
      title: "Repetir sem esperar",
      subtitle: `${num(k)} corridas nesta simulação`,
      text: `Depois de uma corrida perdida, a resposta certa fica no cache por ${duration(ttl)} e o resolvedor nem pergunta de novo: uma tentativa por TTL, cerca de ${duration(expected * ttl)} em média. O ataque de Kaminsky contorna isso pedindo nomes inventados, como x1.${NAME}, x2.${NAME}, cada um uma corrida nova, e a resposta falsa reivindica o domínio inteiro. A ${num(Math.round(1 / RACE_S))} corridas por segundo, esta simulação acertou na corrida ${num(k)}, em ${duration(k * RACE_S)}.`,
      facts: [
        ["Corridas esperadas", num(expected)],
        ["Sem Kaminsky", duration(expected * ttl)],
        ["Com nomes novos", duration(expected * RACE_S)],
      ],
      highlight: ["resolvedor"],
      quiz: {
        kind: "number",
        prompt: `Com ${num(guesses)} palpites por corrida e ${num(TXID_SPACE)} IDs possíveis, quantas corridas são esperadas até o primeiro acerto?`,
        answer: expected,
        explain: `Cada corrida acerta com chance ${guesses}/${num(TXID_SPACE)}; a média é o inverso: ${num(TXID_SPACE)}/${guesses} ≈ ${num(expected)}.`,
      },
    },
    () => {
      c.send("atacante", "resolvedor", `x1.${NAME}?`, { role: "bad", what: "nome inventado" });
      c.send("atacante", "resolvedor", `x2.${NAME}?`, { role: "bad", what: "nome inventado" });
      c.count("corridas", num(k), { label: `${num(k)} corridas`, dt: 1 });
      c.count("errados", num(k * guesses - 1), { label: "respostas falsas descartadas" });
      c.state("resolvedor", `cache: ${FAKE_IP}`, {
        tone: "bad",
        label: `cache envenenado: ${NAME} → ${FAKE_IP}`,
      });
      c.send("resolvedor", "cliente", FAKE_IP, { role: "bad", what: "resposta envenenada" });
    },
  );

  const steps = 20;
  b.step(
    {
      id: "s4-chance",
      title: "A conta do atacante",
      subtitle: `50% em ${num(half)} corridas`,
      text: `Cada corrida tem chance ${pct(pFixed)}, pequena, mas as tentativas se acumulam: depois de k corridas, a chance de já ter acertado é 1 − (1 − p)^k. Com ${num(guesses)} palpites, ela passa de 50% em ${num(half)} corridas. Mais palpites por corrida encurtam o caminho, limitados pelo tempo que a resposta verdadeira leva para chegar. Por isso o identificador sozinho é pouco: 16 bits são um espaço pequeno.`,
      facts: [
        ["Chance por corrida", pct(pFixed)],
        ["50% depois de", `${num(half)} corridas`],
        [`Em ${num(xmax)} corridas`, pct(cumulative(pFixed, xmax))],
      ],
      highlight: [],
    },
    () => {
      for (let i = 0; i <= steps; i++) {
        const x = Math.round((xmax * i) / steps);
        c.plot("chance", "fixa", x, Number((cumulative(pFixed, x) * 100).toFixed(1)), {
          role: "bad",
          dt: i % 4 === 0 ? 1 : 0,
          label: `${num(x)} corridas: ${pct(cumulative(pFixed, x))}`,
        });
      }
    },
  );

  b.step(
    {
      id: "s5-sinais",
      title: "O que o resolvedor vê",
      subtitle: `${num(k * guesses - 1)} respostas descartadas`,
      text: `O ataque é barulhento para quem olha. O resolvedor recebe rajadas de respostas com ID errado para perguntas recém-feitas, ${num(k * guesses - 1)} nesta simulação, vindas de fora do caminho do autoritativo. Ao mesmo tempo, aparecem consultas para nomes que não existem sob o mesmo domínio, x1, x2, x3, e uma troca súbita do servidor que responde por ele. Contadores de respostas descartadas e de NXDOMAIN por domínio denunciam a corrida.`,
      facts: [
        ["IDs errados", num(k * guesses - 1)],
        ["Nomes inexistentes", num(k)],
        ["Domínio-alvo", NAME],
      ],
      highlight: ["resolvedor"],
      tags: ["signals"],
    },
    () => {
      c.note("resolvedor", `${num(k * guesses - 1)} respostas com ID errado`, "warn", { dt: 1 });
      c.note("atacante", `${num(k)} nomes inexistentes`, "warn");
    },
  );

  const expectedRand = 1 / pRand;
  b.step(
    {
      id: "s6-defesa",
      quiz: {
        kind: "choice",
        prompt: "Por que sortear a porta de origem de cada pergunta atrapalha tanto o atacante?",
        options: [
          "Ele precisa acertar ID e porta ao mesmo tempo, e as combinações se multiplicam",
          "A porta sorteada cifra a resposta",
          "Respostas para portas altas são descartadas pelo roteador",
        ],
        answer: 0,
        explain:
          "Uma resposta falsa só é aceita se ID e porta casarem com a pergunta. São dois sorteios independentes, então o número de combinações é o produto dos dois, e cada palpite vale muito menos.",
      },
      title: "Porta aleatória e assinatura",
      subtitle: `${num(expected)} → ${num(Math.round(expectedRand))} corridas`,
      text: `A defesa imediata foi sortear também a porta de origem de cada pergunta: com ${num(PORT_RANGE)} portas possíveis, o atacante precisa acertar ID e porta, e a média sobe para ${num(Math.round(expectedRand))} corridas, ${duration(expectedRand * RACE_S)} no mesmo ritmo. Misturar maiúsculas no nome consultado acrescenta mais bits. A defesa definitiva é o [[dnssec]]: o resolvedor que valida assinaturas descarta qualquer resposta forjada, por mais rápida que seja.`,
      facts: [
        ["Espaço", `${num(TXID_SPACE)} × ${num(PORT_RANGE)}`],
        ["Corridas esperadas", num(Math.round(expectedRand))],
        ["DNSSEC", "rejeita o que não está assinado"],
      ],
      highlight: ["resolvedor"],
      tags: ["defense"],
    },
    () => {
      for (let i = 0; i <= steps; i++) {
        const x = Math.round((xmax * i) / steps);
        c.plot("chance", "aleatória", x, Number((cumulative(pRand, x) * 100).toFixed(1)), {
          role: "b",
          dt: i % 4 === 0 ? 1 : 0,
          label: `porta aleatória, ${num(x)} corridas: ${pct(cumulative(pRand, x))}`,
        });
      }
      c.state("resolvedor", `cache: ${REAL_IP}`, {
        tone: "good",
        label: "com DNSSEC, só a resposta assinada entra",
      });
    },
  );

  return b.done({ real: hex4(race.real), hit: race.hit ? 1 : 0, expected, races: k, half });
}

const lesson: LessonModule = {
  meta: {
    slug: "dns-poisoning",
    site: "redes",
    title: "Envenenamento de cache DNS",
    summary:
      "Uma simulação da corrida para forjar a resposta de um resolvedor: a chance de acertar o identificador, por que pedir nomes inventados acelera o ataque, os sinais que ele deixa e as defesas.",
    area: "Segurança",
    refs: [
      { book: "tanenbaum-cn", chapter: 8, section: "8.2.3", note: "Spoofing além do ARP", verified: true },
      {
        book: "tanenbaum-cn",
        chapter: 8,
        section: "8.12.2",
        note: "Nomenclatura segura e DNSSEC",
        verified: true,
      },
    ],
    simplifications: [
      "Uma simulação de probabilidades: nenhum pacote é montado e nada aqui funciona fora da lição.",
      "Todos os palpites de uma corrida chegam antes da resposta verdadeira; na prática, só parte deles chega a tempo.",
      "O ritmo de 20 corridas por segundo e a faixa de portas são valores de exemplo.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "palpites", kind: "int", label: "Respostas falsas por corrida", min: 10, max: 1000 },
      {
        key: "ttl",
        kind: "int",
        label: "TTL do registro (segundos)",
        min: 300,
        max: 86400,
        help: "Quanto tempo a resposta certa fica no cache e bloqueia novas corridas pelo mesmo nome.",
      },
    ],
  },
  build,
  intro: {
    text: "Um resolvedor aceita a primeira resposta que casar com a pergunta. Se um atacante acertar o identificador antes do servidor verdadeiro, o cache passa a mentir para todos os clientes. Você vai ver essa corrida em números, os sinais que ela deixa e as defesas que a tornam inviável.",
    facts: [
      ["Domínio", NAME],
      ["Palpites por corrida", String(DEFAULTS.palpites)],
      ["Identificador", "16 bits"],
    ],
  },
  outro: {
    title: "Envenenamento de cache em resumo",
    text: "Sem conexão, o resolvedor confia num identificador de 16 bits e na porta. Com porta fixa, milhares de tentativas bastam, e pedir nomes inventados elimina a espera do TTL. Respostas descartadas em massa e nomes inexistentes denunciam o ataque; portas aleatórias multiplicam o esforço por dezenas de milhares, dando tempo de perceber, e o DNSSEC o neutraliza.",
    facts: (run) => [
      ["Corridas esperadas", String(run.stats.expected)],
      ["Nesta simulação", `${run.stats.races} corridas`],
      ["50% depois de", `${run.stats.half} corridas`],
    ],
  },
  next: ["dnssec", "doh"],
  practice,
};

export default lesson;
