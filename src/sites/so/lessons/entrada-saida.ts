import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import { cost, DMA_SETUP, INT_COST, type IoMode, type Slice, timeline, WORD } from "../../../sim/os/io.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { entradaSaida as practice } from "../practice.ts";

/**
 * Moving one block from a device controller to memory three ways: the CPU polling the status
 * register, one interrupt per word, and a DMA controller with a single interrupt at the end;
 * then what happens when the device is faster than an interrupt.
 */
export const DEFAULTS = { tamanho: 4, intervalo: 10 };
/** Words drawn on the timeline. */
const WIN = 5;
const LANES: Record<IoMode, string> = { espera: "Espera", interrupcao: "Interrupção", dma: "DMA" };
const ITEM_ROLE: Record<Slice["item"], Role> = { "E/S": "bad", outro: "b", int: "warn", prepara: "ctrl" };
const ITEM_TEXT: Record<Slice["item"], string> = {
  "E/S": "espera",
  outro: "P2",
  int: "int",
  prepara: "prep.",
};

function clamp(p: Params) {
  const kib = Math.min(64, Math.max(1, Math.round(Number(p.tamanho ?? DEFAULTS.tamanho))));
  const interval = Math.min(100, Math.max(1, Math.round(Number(p.intervalo ?? DEFAULTS.intervalo))));
  return { kib, bytes: kib * 1024, interval };
}

const dec = (x: number, d = 1) => String(Math.round(x * 10 ** d) / 10 ** d).replace(".", ",");
const us = (x: number) => (x >= 1000 ? `${dec(x / 1000, 2)} ms` : `${dec(x)} µs`);
const pct = (x: number | null) => (x === null ? "não acompanha" : `${dec(x * 100)}%`);

function scene(p: Params): SceneSpec {
  const { interval } = clamp(p);
  return {
    viewBox: [960, 620],
    nodes: [
      { id: "cpu", kind: "cpu", label: "CPU", sub: "roda o driver", at: [130, 120] },
      { id: "mem", kind: "memory", label: "Memória", sub: "buffer do kernel", at: [460, 120] },
      { id: "ctl", kind: "device", label: "Controlador", sub: "disco", at: [800, 120] },
      { id: "dma", kind: "box", label: "Controlador de DMA", sub: "endereço e contagem", at: [630, 230] },
    ],
    links: [
      { id: "l-cpu-mem", from: "cpu", to: "mem", style: "bus" },
      { id: "l-mem-ctl", from: "mem", to: "ctl", style: "bus" },
      { id: "l-dma-ctl", from: "dma", to: "ctl", style: "dashed" },
      { id: "l-dma-mem", from: "dma", to: "mem", style: "dashed" },
    ],
    widgets: [
      {
        kind: "gantt",
        id: "tempo",
        title: `O que a CPU faz nas primeiras ${WIN} palavras (µs)`,
        at: [40, 310],
        lanes: Object.values(LANES),
        span: WIN * interval,
        width: 620,
      },
      { kind: "counter", id: "espera", title: "CPU ocupada: espera", at: [720, 300] },
      { kind: "counter", id: "interrupcao", title: "CPU ocupada: interrupção", at: [720, 380] },
      { kind: "counter", id: "dma", title: "CPU ocupada: DMA", at: [720, 460] },
      {
        kind: "table",
        id: "comparar",
        title: "Parcela da CPU gasta na transferência",
        at: [40, 470],
        columns: ["Intervalo por palavra", "Espera", "Interrupção", "DMA"],
        widths: [170, 130, 140, 130],
        rows: 3,
      },
    ],
  };
}

export function build(p: Params) {
  const { kib, bytes, interval } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, { cpu: "CPU", mem: "memória", ctl: "controlador", dma: "DMA" }, (t) => String(t));
  const poll = cost("espera", bytes, interval);
  const irq = cost("interrupcao", bytes, interval);
  const dma = cost("dma", bytes, interval);
  const words = poll.words;

  const draw = (mode: IoMode) => {
    for (const s of timeline(mode, interval, WIN))
      c.raw({
        kind: "gantt",
        lane: LANES[mode],
        from: s.from,
        to: s.to,
        item: ITEM_TEXT[s.item],
        itemRole: ITEM_ROLE[s.item],
        role: ITEM_ROLE[s.item],
        label: `${LANES[mode]}: ${ITEM_TEXT[s.item]} de ${s.from} a ${s.to} µs`,
        dt: 0,
      } as Parameters<typeof c.raw>[0]);
  };
  const counter = (mode: IoMode, x: ReturnType<typeof cost>) =>
    c.count(mode, x.cpu === null ? "não acompanha" : us(x.cpu), {
      dt: 1,
      role: x.cpu === null ? "bad" : mode === "espera" ? "bad" : "a",
      label: `${LANES[mode]}: ${x.cpu === null ? "não acompanha" : us(x.cpu)}`,
    });

  b.step(
    {
      id: "s1-controlador",
      title: "Um controlador entre os dois",
      subtitle: `${kib} KiB do disco para a memória`,
      text: `A CPU não fala com o disco, e sim com o controlador dele, por meio de registradores: um de comando, um de estado e um de dados. O [[driver]] escreve "ler bloco" no comando e precisa trazer ${kib} KiB para um buffer na memória. O controlador entrega uma palavra de ${WORD} bytes a cada ${interval} µs, ${words} palavras no total, e a transferência leva ${us(poll.transfer)} de qualquer jeito. A pergunta é quanto desse tempo a CPU fica presa nela.`,
      facts: [
        ["Bloco", `${kib} KiB = ${words} palavras`],
        ["Uma palavra a cada", `${interval} µs`],
        ["Transferência", us(poll.transfer)],
      ],
      highlight: ["cpu", "ctl"],
    },
    () => {
      c.hide(["dma"], { dt: 0 });
      c.send("cpu", "ctl", "comando", { via: ["mem"], what: "ler bloco", detail: "registrador de comando" });
      c.state("ctl", "lendo", { role: "b", label: "controlador lê o setor" });
    },
  );

  b.step(
    {
      id: "s2-espera",
      title: "Perguntar sem parar",
      subtitle: "E/S programada",
      text: `No jeito mais simples, a [[e-s-programada]], o driver fica num laço: lê o registrador de estado, e se a palavra ainda não chegou, lê de novo. Quando chega, copia para a memória e volta a perguntar. Funciona e responde rápido, mas a CPU passa os ${us(poll.transfer)} inteiros nesse laço, ${pct(poll.share)} do tempo, sem rodar mais nada. Na linha do tempo, a faixa de cima é toda espera.`,
      facts: [
        ["CPU ocupada", us(poll.cpu ?? 0)],
        ["Parcela", pct(poll.share)],
        ["Outros processos", "esperam"],
      ],
      highlight: ["cpu"],
    },
    () => {
      c.send("cpu", "ctl", "pronto?", { via: ["mem"], role: "bad", what: "lê o estado", detail: "laço" });
      c.send("ctl", "cpu", "ainda não", { via: ["mem"], role: "muted", what: "estado: ocupado" });
      c.send("ctl", "mem", "palavra", { role: "b", what: "CPU copia a palavra", detail: `${WORD} bytes` });
      draw("espera");
      counter("espera", poll);
    },
  );

  const irqOk = irq.cpu !== null;
  b.step(
    {
      id: "s3-interrupcao",
      title: "Avise quando chegar",
      subtitle: `${words} interrupções`,
      text: irqOk
        ? `Na E/S por [[interrupcao]], o driver dá o comando e bloqueia; a CPU roda outro processo, P2. A cada palavra, o controlador interrompe: a CPU salva o contexto, copia a palavra e volta, ${INT_COST} µs por vez. São ${words} interrupções, ${us(irq.cpu ?? 0)} de CPU, ${pct(irq.share)} do tempo da transferência. No resto, P2 trabalha. O custo agora é proporcional ao número de palavras, não à demora do disco.`
        : `Na E/S por [[interrupcao]], o driver dá o comando e bloqueia, e a cada palavra o controlador interrompe a CPU por ${INT_COST} µs. Só que aqui chega uma palavra a cada ${interval} µs: as interrupções vêm mais rápido do que a CPU consegue atendê-las, P2 nunca roda e palavras se perdem. Com um dispositivo tão rápido, interromper por palavra não acompanha.`,
      facts: [
        ["Interrupções", String(words)],
        ["Custo de cada", `${INT_COST} µs`],
        ["CPU ocupada", irqOk ? us(irq.cpu ?? 0) : "não acompanha"],
      ],
      highlight: ["cpu", "ctl"],
      quiz: {
        kind: "number",
        prompt: `Com ${words} palavras e ${INT_COST} µs por interrupção, quantos µs de CPU a transferência consome?`,
        answer: words * INT_COST,
        unit: "µs",
        explain: `${words} × ${INT_COST} = ${words * INT_COST} µs${irqOk ? `, contra ${poll.transfer} µs na espera ocupada` : `, mais que os ${poll.transfer} µs da transferência: não acompanha`}.`,
      },
    },
    () => {
      c.state("cpu", "roda P2", { role: "b", label: "driver bloqueia, CPU roda P2" });
      c.send("ctl", "cpu", "interrupção", { via: ["mem"], role: "warn", what: "chegou uma palavra" });
      c.send("ctl", "mem", "palavra", { role: "b", what: "handler copia", detail: `${INT_COST} µs` });
      draw("interrupcao");
      counter("interrupcao", irq);
    },
  );

  b.step(
    {
      id: "s4-dma",
      title: "Um ajudante copia",
      subtitle: "Acesso direto à memória",
      text: `Com [[dma]], o driver escreve no controlador de DMA o endereço do buffer, a contagem de ${bytes} bytes e o sentido, em ${DMA_SETUP} µs. Daí em diante o DMA pede o barramento e copia cada palavra do controlador para a memória, sem a CPU. Ao fim das ${words} palavras, uma única interrupção avisa. A CPU gasta ${us(dma.cpu ?? 0)}, ${pct(dma.share)} do tempo; o preço é o DMA disputar o barramento com ela, roubando ${words} ciclos.`,
      facts: [
        ["Preparar", `${DMA_SETUP} µs`],
        ["Interrupções", "1"],
        ["CPU ocupada", us(dma.cpu ?? 0)],
      ],
      highlight: ["dma", "mem"],
    },
    () => {
      c.show(["dma"], { dt: 0 });
      c.send("cpu", "dma", "endereço, contagem", { via: ["mem"], role: "ctrl", what: "programa o DMA" });
      c.send("ctl", "dma", "palavra", { role: "b", what: "DMA lê do controlador" });
      c.send("dma", "mem", "palavra", { role: "b", what: "DMA grava na memória", detail: `${words} vezes` });
      c.send("dma", "cpu", "fim", { via: ["mem"], role: "warn", what: "uma interrupção" });
      draw("dma");
      counter("dma", dma);
    },
  );

  const rates = [...new Set([1, interval, 100])].sort((a, z) => a - z);
  const fast = cost("interrupcao", bytes, 1);
  b.step(
    {
      id: "s5-velocidade",
      title: "Quando o dispositivo corre",
      subtitle: "Mesmo bloco, intervalos diferentes",
      text: `A tabela repete as contas para outros intervalos. Num dispositivo lento, a cada 100 µs, a interrupção custa só ${pct(cost("interrupcao", bytes, 100).share)} e já é ótima. Quanto mais rápido, pior: com uma palavra por µs, a interrupção ${fast.cpu === null ? "não acompanha" : `custa ${pct(fast.share)}`}, porque cada uma custa ${INT_COST} µs. O DMA quase não muda, porque paga por bloco, não por palavra. Discos e placas de rede usam DMA por isso.`,
      facts: [
        ["Lento (100 µs)", "interrupção serve"],
        ["Rápido (1 µs)", "só DMA"],
        ["DMA paga", "por bloco"],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt:
          "Uma placa de rede de 10 Gbit/s entrega dados quase sem pausa. Qual estratégia o driver deve usar?",
        options: [
          "DMA, com uma interrupção por lote de pacotes",
          "Uma interrupção por palavra recebida",
          "Espera ocupada, lendo o estado sem parar",
        ],
        answer: 0,
        explain: `Por palavra, as interrupções viriam mais rápido que os ${INT_COST} µs de cada uma; a espera ocupada prenderia um núcleo inteiro. O DMA copia em lote e avisa uma vez.`,
      },
    },
    () => {
      rates.forEach((r, i) => {
        const row = (["espera", "interrupcao", "dma"] as IoMode[]).map((m) => pct(cost(m, bytes, r).share));
        c.row("comparar", i, [`${r} µs`, ...row], {
          dt: 1,
          ...(r === interval ? { mark: "hit" as const } : {}),
          log: { who: `${r} µs por palavra`, what: row.join(" · ") },
        });
      });
    },
  );

  b.step(
    {
      id: "s6-hibrido",
      title: "Às vezes perguntar vence",
      subtitle: "Interrupção com espera",
      text: `A espera ocupada volta em um caso: quando a resposta chega em menos tempo do que uma interrupção custaria. SSDs NVMe muito rápidos e placas de rede sob carga pesada fazem isso. O Linux, por exemplo, usa interrupção enquanto o tráfego é baixo; quando os pacotes chegam em rajada, desliga a interrupção e passa a consultar a fila em laço, voltando a ela quando o tráfego cai. Escolher a estratégia é trocar latência por tempo de CPU.`,
      facts: [
        ["Pouca carga", "interrupção"],
        ["Rajada", "consulta em laço"],
        ["Bloco grande", "DMA"],
      ],
      highlight: ["cpu"],
    },
    () => {
      c.note("tempo", "Cada estratégia tem a sua faixa", "info", { dt: 1 });
    },
  );

  return b.done({
    words,
    transfer: poll.transfer,
    poll: poll.cpu ?? -1,
    irq: irq.cpu ?? -1,
    dma: dma.cpu ?? -1,
    irqShare: pct(irq.share),
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "entrada-saida",
    site: "so",
    title: "E/S: espera ocupada, interrupção e DMA",
    summary:
      "Um bloco do disco para a memória de três jeitos: a CPU perguntando sem parar, uma interrupção por palavra e o DMA com uma interrupção só, e quanto de CPU cada um consome.",
    area: "Arquivos e E/S",
    refs: [
      {
        book: "tanenbaum-mos",
        chapter: 5,
        section: "5.1.4",
        note: "Acesso direto à memória (DMA)",
        verified: true,
      },
      {
        book: "tanenbaum-mos",
        chapter: 5,
        section: "5.2.2",
        note: "E/S programada, por interrupção e com DMA",
        verified: true,
      },
      { book: "maziero-so", chapter: 20, section: "20.5", note: "Estratégias de interação", verified: true },
    ],
    simplifications: [
      `Custos fixos de ${INT_COST} µs por interrupção e ${DMA_SETUP} µs para programar o DMA; os reais variam com a CPU.`,
      "O controlador entrega palavras em ritmo constante; discos reais entregam setores em rajadas.",
      "O roubo de ciclos do barramento pelo DMA não atrasa a CPU na conta.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "tamanho", kind: "int", label: "Tamanho do bloco (KiB)", min: 1, max: 64 },
      { key: "intervalo", kind: "int", label: "Intervalo por palavra (µs)", min: 1, max: 100 },
    ],
  },
  build,
  intro: {
    text: "Ler um bloco do disco leva o mesmo tempo seja qual for o método; o que muda é quanto disso a CPU passa presa. Você vai comparar a espera ocupada, a interrupção por palavra e o DMA na mesma linha do tempo.",
    facts: [
      ["Bloco", `${DEFAULTS.tamanho} KiB`],
      ["Intervalo", `${DEFAULTS.intervalo} µs por palavra`],
      ["Estratégias", "3"],
    ],
  },
  outro: {
    title: "E/S em resumo",
    text: "Na espera ocupada, a CPU fica presa a transferência inteira. Com interrupções, ela paga um custo fixo por palavra e roda outros processos no intervalo, o que não serve para dispositivos rápidos. O DMA copia o bloco sozinho e interrompe uma vez. Sistemas reais misturam as três conforme a carga.",
    facts: (run) => [
      ["Espera", us(Number(run.stats.poll))],
      ["Interrupção", Number(run.stats.irq) < 0 ? "não acompanha" : us(Number(run.stats.irq))],
      ["DMA", us(Number(run.stats.dma))],
    ],
  },
  next: ["chamada-de-sistema", "escalonamento-disco"],
  practice,
};

export default lesson;
