import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import {
  type Arbitration,
  arbitrate,
  burstLine,
  CLOCK_MHZ,
  LINE,
  mbps,
  readCycles,
  singleLine,
} from "../../../sim/arch/bus.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * A shared synchronous bus: the lines it carries, one read cycle by cycle, how width, clock and
 * burst mode set the bandwidth, a daisy chain that starves the device at its end, rotating turns
 * that do not, and why buses became point-to-point serial links.
 */
export const DEFAULTS = { latencia: 2, largura: "8" };
const DEVS = ["disco", "rede", "CPU"] as const;
const JOBS = [4, 2, 2];
const ROLE: Role[] = ["s3", "b", "a"];
const GANTT_W = 880;
const cycles = (n: number) => (n === 1 ? "1 ciclo" : `${n} ciclos`);
const num = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1).replace(".", ","));
const NS = 1000 / CLOCK_MHZ;

function clamp(p: Params) {
  const lat = Math.min(5, Math.max(1, Math.round(Number(p.latencia ?? DEFAULTS.latencia))));
  const width = [4, 8, 16].includes(Number(p.largura)) ? Number(p.largura) : 8;
  return { lat, width };
}

function scene(p: Params): SceneSpec {
  const { lat } = clamp(p);
  const span = arbitrate(JOBS, readCycles(lat), "daisy").end + 1;
  const gantt = (id: string, title: string, y: number) => ({
    kind: "gantt" as const,
    id,
    title,
    at: [40, y] as const,
    lanes: [...DEVS],
    span,
    width: GANTT_W,
  });
  return {
    viewBox: [960, 640],
    nodes: [
      { id: "arb", kind: "box", label: "Árbitro", sub: "concede o barramento", at: [100, 80], w: 150 },
      { id: "disco", kind: "disk", label: "Disco", sub: "DMA, mais perto", at: [290, 80] },
      { id: "rede", kind: "device", label: "Placa de rede", sub: "DMA", at: [460, 80] },
      { id: "cpu", kind: "cpu", label: "CPU", sub: "no fim da cadeia", at: [630, 80] },
      { id: "mem", kind: "memory", label: "Memória", sub: `responde em ${cycles(lat)}`, at: [840, 80] },
    ],
    links: [
      { id: "b1", from: "arb", to: "disco", style: "bus" },
      { id: "b2", from: "disco", to: "rede", style: "bus" },
      { id: "b3", from: "rede", to: "cpu", style: "bus" },
      { id: "b4", from: "cpu", to: "mem", style: "bus" },
    ],
    widgets: [
      {
        kind: "table",
        id: "ciclos",
        title: "Uma leitura, ciclo a ciclo",
        at: [40, 170],
        columns: ["Ciclo", "Endereço", "Dados", "O que acontece"],
        widths: [60, 90, 90, 280],
        rows: readCycles(lat),
      },
      {
        kind: "table",
        id: "taxa",
        title: `Trazer uma linha de ${LINE} bytes a ${CLOCK_MHZ} MHz`,
        at: [600, 170],
        columns: ["Modo", "Ciclos", "MB/s"],
        widths: [140, 80, 100],
        rows: 3,
      },
      gantt("daisy", "Cadeia (daisy chain): o mais perto do árbitro ganha", 390),
      gantt("rodizio", "Rodízio: a vez passa para o próximo", 510),
    ],
  };
}

export function build(p: Params) {
  const { lat, width } = clamp(p);
  const b = lessonBuilder();
  const c = talk(
    b,
    {
      arb: "Árbitro",
      disco: "Disco",
      rede: "Rede",
      cpu: "CPU",
      mem: "Memória",
      b1: "barramento",
      b2: "barramento",
      b3: "barramento",
      b4: "barramento",
    },
    (t) => String(t),
  );
  const rc = readCycles(lat);
  const words = LINE / width;
  const single = singleLine(lat, width);
  const burst = burstLine(lat, width);
  const peak = width * CLOCK_MHZ;
  const daisy = arbitrate(JOBS, rc, "daisy");
  const rot = arbitrate(JOBS, rc, "rotate");
  const cpu = DEVS.indexOf("CPU");

  const draw = (mode: Arbitration, id: string) => {
    for (const g of (mode === "daisy" ? daisy : rot).grants) {
      const t = c.t + 1;
      c.at(t);
      b.ev({
        t,
        kind: "gantt",
        gantt: id,
        lane: DEVS[g.dev] ?? "",
        from: g.from,
        to: g.to,
        item: DEVS[g.dev] ?? "",
        itemRole: ROLE[g.dev] ?? "a",
        role: ROLE[g.dev] ?? "a",
        label: `${mode === "daisy" ? "cadeia" : "rodízio"}: ${DEVS[g.dev]} usa o barramento, ciclos ${g.from} a ${g.to}`,
        row: {
          cols: {
            t: `${g.from}–${g.to}`,
            who: DEVS[g.dev] ?? "",
            what: "usa o barramento",
            detail: mode === "daisy" ? "cadeia" : "rodízio",
          },
        },
      });
    }
  };

  b.step(
    {
      id: "s1-fios",
      title: "Fios que todos dividem",
      subtitle: "Endereço, dados e controle",
      text: `O [[barramento]] é um conjunto de fios que liga CPU, memória e dispositivos: linhas de endereço dizem onde, linhas de dados levam o valor, e linhas de controle dizem o que fazer, como ler ou escrever. Aqui as linhas de dados têm ${width} bytes de largura e o clock é de ${CLOCK_MHZ} MHz, um ciclo a cada ${num(NS)} ns. Como os fios são de todos, só um dispositivo pode falar de cada vez, e alguém precisa decidir quem.`,
      facts: [
        ["Largura de dados", `${width} bytes`],
        ["Clock", `${CLOCK_MHZ} MHz`],
        ["Ciclo", `${num(NS)} ns`],
      ],
      highlight: ["arb", "disco", "rede", "cpu", "mem"],
    },
    () => {
      for (const id of ["b1", "b2", "b3", "b4"])
        c.state(id, "", { dt: 0, tone: "active", label: "barramento" });
      c.state("mem", "pronta", { tone: "good", label: "memória ligada ao barramento" });
    },
  );

  b.step(
    {
      id: "s2-leitura",
      title: "Uma leitura, ciclo a ciclo",
      subtitle: `${cycles(rc)} por palavra`,
      text: `A CPU quer uma palavra. No ciclo 1, ela põe o endereço nas linhas de endereço e ativa a linha de leitura. A memória precisa de ${cycles(lat)} para achar o dado${lat > 1 ? `, e ${lat === 2 ? "o ciclo do meio é de espera" : `os ${lat - 1} ciclos do meio são de espera`}` : ""}. No ciclo ${rc}, ela põe a palavra nas linhas de dados, e a CPU a captura na borda do clock. São ${cycles(rc)}, ${num(rc * NS)} ns, para ${width} bytes.`,
      facts: [
        ["Por palavra", cycles(rc)],
        ["Tempo", `${num(rc * NS)} ns`],
        ["Bytes", String(width)],
      ],
      highlight: ["cpu", "mem", "ciclos"],
      quiz: {
        kind: "number",
        prompt: `Se a memória leva ${cycles(lat)} para responder e o endereço ocupa 1 ciclo, quantos ciclos dura uma leitura?`,
        answer: rc,
        explain: `1 ciclo de endereço mais ${cycles(lat)} da memória: ${rc}.`,
      },
    },
    () => {
      c.send("cpu", "mem", "endereço + RD", { role: "ctrl", what: "CPU pede uma palavra" });
      c.row("ciclos", 0, ["1", "0x1000", "–", "CPU põe o endereço e ativa a leitura"], {
        dt: 0,
        mark: "new",
      });
      for (let k = 2; k < rc; k++)
        c.row("ciclos", k - 1, [String(k), "0x1000", "–", "memória procurando: ciclo de espera"], {
          dt: 1,
          mark: "warn",
        });
      c.row("ciclos", rc - 1, [String(rc), "0x1000", "palavra", "memória põe o dado; CPU captura na borda"], {
        dt: 1,
        mark: "hit",
      });
      c.send("mem", "cpu", `${width} bytes`, { role: "b", what: "palavra lida" });
    },
  );

  b.step(
    {
      id: "s3-rajada",
      title: "Largura, clock e rajada",
      subtitle: `${num(mbps(LINE, single))} contra ${num(mbps(LINE, burst))} MB/s`,
      text: `Uma falta de [[cache]] traz uma linha de ${LINE} bytes, ${words} palavras. Em leituras separadas, são ${words} × ${rc} = ${cycles(single)}, ${num(mbps(LINE, single))} MB/s. No modo rajada, a CPU manda o endereço uma vez e a memória entrega uma palavra por ciclo: ${rc} + ${words - 1} = ${cycles(burst)}, ${num(mbps(LINE, burst))} MB/s. O teto, uma palavra em todo ciclo, é largura × clock = ${peak} MB/s. Dobrar a largura ou o clock dobra o teto.`,
      facts: [
        ["Separadas", `${num(mbps(LINE, single))} MB/s`],
        ["Rajada", `${num(mbps(LINE, burst))} MB/s`],
        ["Teto", `${peak} MB/s`],
      ],
      highlight: ["taxa"],
    },
    () => {
      c.row("taxa", 0, ["leituras separadas", String(single), num(mbps(LINE, single))], {
        dt: 1,
        mark: "bad",
      });
      c.row("taxa", 1, ["rajada", String(burst), num(mbps(LINE, burst))], { dt: 1, mark: "hit" });
      c.row("taxa", 2, ["teto do barramento", String(words), String(peak)], { dt: 1, mark: "new" });
    },
  );

  b.step(
    {
      id: "s4-cadeia",
      title: "Quem fala primeiro",
      subtitle: `A CPU espera ${cycles(daisy.first[cpu] ?? 0)}`,
      text: `Disco, rede e CPU pedem o barramento ao mesmo tempo: o disco quer ${JOBS[0]} leituras, a rede ${JOBS[1]} e a CPU ${JOBS[2]}. Na [[arbitragem]] em cadeia, o árbitro manda a concessão por um fio que passa de dispositivo em dispositivo: quem pediu fica com ela e não a repassa. O disco, mais perto, ganha sempre que pede, e a CPU, no fim da fila, só começa no ciclo ${daisy.first[cpu]}. É simples e barato, mas quem está longe pode esperar indefinidamente.`,
      facts: [
        ["Disco começa", `ciclo ${daisy.first[0]}`],
        ["CPU começa", `ciclo ${daisy.first[cpu]}`],
        ["Tudo termina", `ciclo ${daisy.end}`],
      ],
      highlight: ["daisy", "arb"],
      quiz: {
        kind: "choice",
        prompt: "Na cadeia, por que a CPU espera mesmo tendo pedido junto com os outros?",
        options: [
          "A concessão passa primeiro pelo disco e pela rede, que ficam com ela enquanto tiverem pedidos",
          "A CPU é mais lenta para ler os sinais do barramento",
          "O árbitro sorteia a ordem a cada ciclo",
        ],
        answer: 0,
        explain: `A prioridade é a posição no fio. Enquanto disco e rede tiverem leituras, a concessão para neles; a CPU só a recebe no ciclo ${daisy.first[cpu]}.`,
      },
    },
    () => {
      c.send("arb", "disco", "concessão", { role: "ctrl", what: "concessão fica no disco" });
      draw("daisy", "daisy");
    },
  );

  b.step(
    {
      id: "s5-rodizio",
      title: "Passar a vez",
      subtitle: `A CPU começa no ciclo ${rot.first[cpu]}`,
      text: `No rodízio, quem acabou de usar o barramento vai para o fim da fila de prioridade. Disco, rede e CPU se revezam enquanto todos têm pedidos, e a CPU começa no ciclo ${rot.first[cpu]} em vez de ${daisy.first[cpu]}. O total não muda, ${cycles(rot.end)}, porque o barramento nunca fica ocioso: o que muda é quem espera. Barramentos reais misturam as duas ideias, com níveis de prioridade e rodízio dentro de cada nível.`,
      facts: [
        ["CPU na cadeia", `ciclo ${daisy.first[cpu]}`],
        ["CPU no rodízio", `ciclo ${rot.first[cpu]}`],
        ["Total", cycles(rot.end)],
      ],
      highlight: ["rodizio"],
    },
    () => {
      draw("rotate", "rodizio");
    },
  );

  b.step(
    {
      id: "s6-serial",
      title: "Do barramento ao link",
      subtitle: "Ponto a ponto e em série",
      text: `Barramentos paralelos pararam de crescer: com dezenas de fios lado a lado, os bits de uma mesma palavra chegam em instantes um pouco diferentes, e subir o clock piora isso. O PCI Express troca o barramento compartilhado por links ponto a ponto, cada um com pares de fios que mandam um bit por vez a vários gigabits por segundo, e um comutador no lugar do árbitro. Cada dispositivo tem o seu caminho, então não há mais disputa pelos mesmos fios.`,
      facts: [
        ["Problema", "bits chegam desalinhados"],
        ["PCIe", "links seriais ponto a ponto"],
        ["Arbitragem", "vira comutação"],
      ],
      highlight: [],
    },
    () => {
      for (const id of ["b2", "b3"]) c.state(id, "", { dt: 0, tone: "warn", label: "disputa" });
      c.state("arb", "comutador", { tone: "good", label: "no PCIe, um comutador" });
    },
  );

  return b.done({
    read: rc,
    single,
    burst,
    peak,
    cpuDaisy: daisy.first[cpu] ?? 0,
    cpuRotate: rot.first[cpu] ?? 0,
    end: daisy.end,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "barramentos",
    site: "arq",
    title: "Barramentos: fios compartilhados e quem fala primeiro",
    summary:
      "Uma leitura ciclo a ciclo, a taxa que sai de largura, clock e rajada, a cadeia que deixa a CPU esperando e o rodízio que divide a vez, até os links seriais do PCIe.",
    area: "Sistema",
    refs: [
      { book: "tanenbaum-sco", chapter: 3, section: "3.4.4", note: "Clock do barramento", verified: true },
      {
        book: "tanenbaum-sco",
        chapter: 3,
        section: "3.4.5",
        note: "Arbitragem de barramento",
        verified: true,
      },
      { book: "tanenbaum-sco", chapter: 3, section: "3.6", note: "Exemplos de barramentos", verified: true },
    ],
    simplifications: [
      "Barramento síncrono com um único árbitro e sem ciclos perdidos entre transações.",
      "Cada pedido é uma leitura de uma palavra; não há escrita nem rajada na arbitragem.",
      "A memória sempre leva o mesmo número de ciclos para responder.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "latencia", kind: "int", label: "Ciclos da memória para responder", min: 1, max: 5 },
      {
        key: "largura",
        kind: "choice",
        label: "Largura dos dados",
        options: [
          { value: "4", label: "4 bytes" },
          { value: "8", label: "8 bytes" },
          { value: "16", label: "16 bytes" },
        ],
      },
    ],
  },
  build,
  intro: {
    text: "Dentro do computador, CPU, memória e dispositivos conversam por fios compartilhados. Você vai seguir uma leitura ciclo a ciclo, calcular quantos megabytes por segundo cabem nesses fios e ver como o árbitro decide quem fala, e quem espera.",
    facts: [
      ["Clock", `${CLOCK_MHZ} MHz`],
      ["Largura", `${DEFAULTS.largura} bytes`],
      ["Dispositivos", DEVS.join(", ")],
    ],
  },
  outro: {
    title: "Barramentos em resumo",
    text: "Um barramento divide fios de endereço, dados e controle entre vários dispositivos, um de cada vez. A taxa sai de largura vezes clock, e o modo rajada chega perto do teto ao mandar o endereço uma vez só. A arbitragem em cadeia é simples mas injusta com quem está longe; o rodízio divide a vez. Hoje, links seriais ponto a ponto substituíram o barramento compartilhado.",
    facts: (run) => [
      ["Leitura", cycles(Number(run.stats.read))],
      ["Linha em rajada", cycles(Number(run.stats.burst))],
      ["CPU na cadeia", `ciclo ${run.stats.cpuDaisy}`],
    ],
  },
  next: ["cache-direta", "coerencia-mesi", "politicas-escrita"],
};

export default lesson;
