import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { exchange, SLEW_PPM, STEP_MS, samples, slewSeconds } from "../../../sim/net/ntp.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { ntp as practice } from "../practice.ts";

/**
 * NTP: four timestamps give the round-trip delay and the clock offset; asymmetric paths bias the
 * offset by half their difference; the clock filter keeps the fastest sample; small offsets are
 * slewed, large ones stepped.
 */
export const DEFAULTS = { erro: -250, atraso: 20, assimetria: 30 };
const START = 5000;
const SERVER = 1;

const num = (n: number) => {
  const s = Math.abs(n)
    .toFixed(Number.isInteger(n) ? 0 : 1)
    .replace(".", ",");
  const [i = "", d] = s.split(",");
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "−" : ""}${d ? `${g},${d}` : g}`;
};
const ms = (n: number) => `${num(n)} ms`;
const signed = (n: number) => `${n > 0 ? "+" : ""}${num(n)} ms`;

function clamp(p: Params) {
  const err = Math.min(2000, Math.max(-2000, Math.round(Number(p.erro ?? DEFAULTS.erro))));
  const base = Math.min(200, Math.max(5, Math.round(Number(p.atraso ?? DEFAULTS.atraso))));
  const asym = Math.min(100, Math.max(0, Math.round(Number(p.assimetria ?? DEFAULTS.assimetria))));
  return { err, base, asym };
}

function scene(): SceneSpec {
  return {
    viewBox: [960, 600],
    nodes: [
      { id: "cli", kind: "laptop", label: "Cliente", sub: "relógio próprio", at: [150, 110] },
      { id: "srv", kind: "server", label: "Servidor NTP", sub: "estrato 1", at: [800, 110] },
      { id: "gps", kind: "box", label: "Relógio GPS", sub: "estrato 0", at: [800, 20], hidden: true },
    ],
    links: [
      { id: "l1", from: "cli", to: "srv" },
      { id: "l2", from: "gps", to: "srv", style: "dashed" },
    ],
    widgets: [
      {
        kind: "table",
        id: "carimbos",
        title: "Os quatro carimbos (ms)",
        at: [40, 210],
        columns: ["Carimbo", "Quem marca", "Valor"],
        widths: [170, 150, 90],
        rows: 4,
      },
      {
        kind: "table",
        id: "amostras",
        title: "Oito consultas",
        at: [500, 210],
        columns: ["#", "Atraso δ", "Desloc. θ", "Erro"],
        widths: [40, 110, 110, 100],
        rows: 8,
      },
      { kind: "counter", id: "delta", title: "Atraso δ", at: [40, 360] },
      { kind: "counter", id: "theta", title: "Deslocamento θ", at: [190, 360] },
      { kind: "counter", id: "erro", title: "Erro de θ", at: [340, 360] },
    ],
  };
}

export function build(p: Params) {
  const { err, base, asym } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, { cli: "cliente", srv: "servidor" }, (t) => String(t));

  const sym = exchange(START, err, base, base, SERVER);
  const skew = exchange(START, err, base + asym, base, SERVER);
  const s = samples(base, err);
  const correction = -err;
  const step = Math.abs(sym.offset) > STEP_MS;
  const behind = err < 0;

  const stamps = (e: typeof sym) => {
    const rows: [string, string, number][] = [
      ["T1: cliente envia", "cliente", e.t1],
      ["T2: servidor recebe", "servidor", e.t2],
      ["T3: servidor responde", "servidor", e.t3],
      ["T4: cliente recebe", "cliente", e.t4],
    ];
    c.send("cli", "srv", `T1 = ${num(e.t1)}`, {
      role: "a",
      what: "pedido NTP",
      detail: `T1 = ${num(e.t1)} no relógio do cliente`,
    });
    c.row("carimbos", 0, [rows[0]?.[0] ?? "", "cliente", num(e.t1)], { mark: "new", role: "a" });
    c.row("carimbos", 1, [rows[1]?.[0] ?? "", "servidor", num(e.t2)], { mark: "new", role: "b" });
    c.row("carimbos", 2, [rows[2]?.[0] ?? "", "servidor", num(e.t3)], { dt: 1, mark: "new", role: "b" });
    c.send("srv", "cli", `T2, T3`, {
      role: "b",
      what: "resposta",
      detail: `T2 = ${num(e.t2)}, T3 = ${num(e.t3)}`,
    });
    c.row("carimbos", 3, [rows[3]?.[0] ?? "", "cliente", num(e.t4)], { mark: "new", role: "a" });
  };

  b.step(
    {
      id: "s1-relogios",
      title: "Relógios que discordam",
      subtitle: `cliente ${signed(err)}`,
      text: `O relógio de cada computador é um cristal que adianta ou atrasa alguns milissegundos por hora. ${err === 0 ? "Aqui o cliente está em dia; mude o erro no laboratório." : `Aqui o cliente está ${ms(Math.abs(err))} ${behind ? "atrasado" : "adiantado"} em relação à hora certa.`} Isso importa mais do que parece: logs de máquinas diferentes saem fora de ordem, certificados [[tls]] parecem vencidos ou ainda não válidos, e o Kerberos recusa diferenças acima de 5 minutos. O [[ntp]] mede a diferença pela rede e a corrige.`,
      facts: [
        ["Erro do cliente", signed(err)],
        ["Hora certa", `${num(START)} ms`],
        ["No cliente", `${num(START + err)} ms`],
      ],
      highlight: ["cli"],
    },
    () => {
      for (let i = 0; i < 4; i++) c.row("carimbos", i, ["", "", ""], { role: "muted" });
      for (let i = 0; i < 8; i++) c.row("amostras", i, ["", "", "", ""], { role: "muted" });
      b.ev({
        t: c.t,
        kind: "state",
        target: "cli",
        text: `${num(START + err)} ms`,
        tone: "warn",
        role: "warn",
        label: "relógio do cliente",
      });
      b.ev({
        t: c.t,
        kind: "state",
        target: "srv",
        text: `${num(START)} ms`,
        tone: "good",
        role: "crypto",
        label: "relógio do servidor",
      });
      c.count("erro", signed(err), { label: `cliente ${signed(err)}`, dt: 1 });
    },
  );

  b.step(
    {
      id: "s2-carimbos",
      title: "Quatro carimbos de tempo",
      subtitle: `${base} ms em cada sentido`,
      text: `O cliente anota T1 no próprio relógio e envia o pedido. O servidor anota T2 ao receber e T3 ao responder, no relógio dele, e devolve os dois. O cliente anota T4 quando a resposta chega. Cada sentido leva ${ms(base)} pela rede e o servidor gasta ${ms(SERVER)}. Repare que T1 e T4 estão na escala do cliente, T2 e T3 na do servidor: as diferenças entre eles misturam o tempo de viagem com o erro do relógio.`,
      facts: [
        ["T1", num(sym.t1)],
        ["T2 e T3", `${num(sym.t2)} e ${num(sym.t3)}`],
        ["T4", num(sym.t4)],
      ],
      highlight: ["cli", "srv"],
    },
    () => {
      stamps(sym);
    },
  );

  b.step(
    {
      id: "s3-conta",
      title: "Atraso e deslocamento",
      subtitle: `δ = ${ms(sym.delay)}, θ = ${signed(sym.offset)}`,
      text: `O atraso de ida e volta é o tempo total no cliente menos o tempo no servidor: δ = (T4 − T1) − (T3 − T2) = ${num(sym.t4 - sym.t1)} − ${num(sym.t3 - sym.t2)} = ${ms(sym.delay)}. O deslocamento é a média das duas diferenças: θ = ((T2 − T1) + (T3 − T4)) / 2 = ${signed(sym.offset)}. Os tempos de viagem se cancelam, e θ é exatamente o que falta somar ao relógio do cliente: ${signed(correction)}.`,
      facts: [
        ["δ", ms(sym.delay)],
        ["θ", signed(sym.offset)],
        ["Correção certa", signed(correction)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: "Qual o atraso de ida e volta δ, em ms?",
        answer: sym.delay,
        unit: "ms",
        explain: `(${num(sym.t4)} − ${num(sym.t1)}) − (${num(sym.t3)} − ${num(sym.t2)}) = ${num(sym.delay)}.`,
      },
    },
    () => {
      c.count("delta", ms(sym.delay), { label: `δ = ${ms(sym.delay)}`, dt: 1 });
      c.count("theta", signed(sym.offset), { label: `θ = ${signed(sym.offset)}` });
      c.count("erro", signed(sym.error), { label: `erro de θ: ${signed(sym.error)}` });
    },
  );

  b.step(
    {
      id: "s4-assimetria",
      title: "Caminhos desiguais",
      subtitle: `erro de ${signed(skew.error)}`,
      text: `A conta supõe que ida e volta demoram o mesmo. Se a ida leva ${ms(base + asym)} e a volta ${ms(base)}, θ vira ${signed(skew.offset)}, e o erro é ${signed(skew.error)}: metade da diferença entre os dois sentidos. ${asym === 0 ? "Com assimetria zero, o erro some; mude-a no laboratório." : "Os quatro carimbos não têm como revelar isso: o cliente só enxerga o total."} Por isso o erro do NTP é limitado por δ/2, ${ms(skew.delay / 2)} aqui, e servidores próximos dão resultados melhores.`,
      facts: [
        ["Ida / volta", `${ms(base + asym)} / ${ms(base)}`],
        ["θ medido", signed(skew.offset)],
        ["Erro", signed(skew.error)],
      ],
      highlight: [],
    },
    () => {
      stamps(skew);
      c.count("delta", ms(skew.delay), { label: `δ = ${ms(skew.delay)}` });
      c.count("theta", signed(skew.offset), { label: `θ = ${signed(skew.offset)}` });
      c.count("erro", signed(skew.error), { label: `erro: ${signed(skew.error)}` });
    },
  );

  b.step(
    {
      id: "s5-filtro",
      title: "A amostra mais rápida",
      subtitle: `consulta ${s.bestIndex + 1}: δ = ${ms(s.best.delay)}`,
      text: `Na prática, filas nos roteadores somam atrasos variáveis a cada sentido. O cliente faz várias consultas, aqui ${s.list.length}, e o filtro do NTP fica com a de menor δ: quanto menos fila, menos espaço para assimetria. A consulta ${s.bestIndex + 1} teve δ = ${ms(s.best.delay)} e erro de ${signed(s.best.error)}, contra um erro médio de ${ms(s.meanAbsError)} nas ${s.list.length}. O NTP ainda combina vários servidores e descarta os que discordam muito.`,
      facts: [
        ["Consultas", String(s.list.length)],
        ["Escolhida", `nº ${s.bestIndex + 1}, δ = ${ms(s.best.delay)}`],
        ["Erro", `${signed(s.best.error)} (média ${ms(s.meanAbsError)})`],
      ],
      highlight: [],
    },
    () => {
      s.list.forEach((e, i) => {
        c.send("cli", "srv", `consulta ${i + 1}`, { role: "muted", what: `consulta ${i + 1}` });
        c.row("amostras", i, [String(i + 1), ms(e.delay), signed(e.offset), signed(e.error)], {
          dt: 0,
          mark: i === s.bestIndex ? "hit" : "new",
          role: i === s.bestIndex ? "crypto" : "muted",
        });
      });
      c.row(
        "amostras",
        s.bestIndex,
        [String(s.bestIndex + 1), ms(s.best.delay), signed(s.best.offset), signed(s.best.error)],
        {
          dt: 1,
          mark: "hit",
          role: "crypto",
          log: { who: "filtro", what: "menor atraso", detail: `consulta ${s.bestIndex + 1}` },
        },
      );
      c.count("delta", ms(s.best.delay), { label: `δ = ${ms(s.best.delay)}` });
      c.count("theta", signed(s.best.offset), { label: `θ = ${signed(s.best.offset)}` });
      c.count("erro", signed(s.best.error), { label: `erro: ${signed(s.best.error)}` });
    },
  );

  b.step(
    {
      id: "s6-ajuste",
      quiz: {
        kind: "choice",
        prompt:
          "Se o cliente estivesse só alguns milissegundos adiantado, o NTP faria o relógio voltar de uma vez?",
        options: [
          "Não: deixaria o relógio andar um pouco mais devagar até alcançar a hora",
          "Sim: todo erro é corrigido com um salto",
          "Não: erros pequenos nunca são corrigidos",
        ],
        answer: 0,
        explain:
          "Abaixo do limite, o NTP ajusta a velocidade do relógio aos poucos. Assim o tempo nunca anda para trás, o que confundiria programas que medem intervalos ou ordenam eventos.",
      },
      title: "Acertar sem voltar no tempo",
      subtitle: step ? `salto de ${signed(sym.offset)}` : `${num(slewSeconds(sym.offset))} s de ajuste`,
      text: `${sym.offset === 0 ? "Com θ = 0, não há o que corrigir." : step ? `Como ${ms(Math.abs(sym.offset))} passa do limite de ${ms(STEP_MS)}, o NTP acerta o relógio de uma vez, com um salto${behind ? " para a frente" : " para trás"}.${behind ? "" : " Voltar no tempo pode confundir programas que medem intervalos."}` : `Abaixo de ${ms(STEP_MS)}, o NTP não salta: faz o relógio andar até ${SLEW_PPM} ppm mais ${behind ? "rápido" : "devagar"}, meio milissegundo por segundo. Corrigir ${ms(Math.abs(sym.offset))} leva ${num(slewSeconds(sym.offset))} s, e o tempo nunca anda para trás.`} O servidor está no [[estrato]] 1, ligado direto a um GPS, o estrato 0; o cliente, que o consulta, passa a ser estrato 2 e pode servir a hora para outros.`,
      facts: [
        ["θ", signed(sym.offset)],
        ["Limite para salto", ms(STEP_MS)],
        ["Ajuste", step ? "salto" : `${num(slewSeconds(sym.offset))} s a ${SLEW_PPM} ppm`],
      ],
      highlight: ["gps"],
    },
    () => {
      c.show(["gps"]);
      c.send("gps", "srv", "hora de referência", { role: "crypto", what: "estrato 0 → 1" });
      b.ev({
        t: c.t,
        kind: "state",
        target: "cli",
        text: `${num(START)} ms`,
        tone: "good",
        role: "crypto",
        label: "relógio do cliente acertado",
      });
      c.count("erro", "0 ms", { label: "relógio acertado", dt: 1 });
    },
  );

  return b.done({
    delay: sym.delay,
    offset: sym.offset,
    skewError: skew.error,
    best: s.bestIndex + 1,
    bestError: s.best.error,
    step: step ? "salto" : "ajuste gradual",
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "ntp",
    site: "redes",
    title: "NTP: acertando o relógio pela rede",
    summary:
      "Como dois computadores comparam relógios sem saber quanto a rede demora: os quatro carimbos do NTP, atraso e deslocamento, o erro de caminhos assimétricos, o filtro de amostras e o ajuste sem voltar no tempo.",
    area: "Aplicação",
    refs: [
      { rfc: 5905, section: "8", note: "NTPv4: protocolo e cálculo de atraso e deslocamento" },
      { rfc: 5905, section: "10", note: "Filtro de relógio" },
    ],
    simplifications: [
      "O relógio do cliente não deriva durante a troca; o erro é constante.",
      "Os tempos estão em milissegundos inteiros; o NTP usa carimbos de 64 bits com frações de nanossegundo.",
      "O limite de 128 ms e a taxa de 500 ppm são os padrões do ntpd; outras implementações escolhem valores próprios.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "erro",
        kind: "int",
        label: "Erro do relógio do cliente (ms)",
        min: -2000,
        max: 2000,
        help: "Negativo: atrasado.",
      },
      { key: "atraso", kind: "int", label: "Atraso em cada sentido (ms)", min: 5, max: 200 },
      { key: "assimetria", kind: "int", label: "Atraso extra na ida, no passo 4 (ms)", min: 0, max: 100 },
    ],
  },
  build,
  intro: {
    text: "Para acertar o relógio pela rede, o cliente pergunta a hora a um servidor. Mas a resposta chega atrasada, e ele não sabe quanto. Você vai ver como quatro carimbos de tempo resolvem isso e onde a conta pode errar.",
    facts: [
      ["Erro do cliente", signed(DEFAULTS.erro)],
      ["Atraso", `${DEFAULTS.atraso} ms por sentido`],
      ["Protocolo", "UDP, porta 123"],
    ],
  },
  outro: {
    title: "NTP em resumo",
    text: "Com os carimbos T1 a T4, o cliente calcula o atraso de ida e volta e o deslocamento do seu relógio, sem conhecer o atraso de cada sentido. A conta é exata se os dois sentidos demoram o mesmo e erra metade da diferença quando não. Por isso o NTP prefere a amostra de menor atraso, e corrige pequenos erros acelerando ou freando o relógio, em vez de saltar.",
    facts: (run) => [
      ["δ e θ", `${ms(Number(run.stats.delay))} e ${signed(Number(run.stats.offset))}`],
      ["Erro na assimetria", signed(Number(run.stats.skewError))],
      ["Ajuste", String(run.stats.step)],
    ],
  },
  next: ["udp", "tls13"],
  practice,
};

export default lesson;
