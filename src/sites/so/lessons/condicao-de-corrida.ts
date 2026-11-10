import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import { type Guard, guarded, type RaceResult, type ROp, runRace, type Tick } from "../../../sim/os/race.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";

/**
 * Two threads deposit into one balance. The same round robin runs five versions side by side:
 * one after the other, interleaved without protection, a naive flag, Peterson, TSL and a mutex.
 */
export const DEFAULTS = { quantum: 1, dep1: 100, dep2: 50 };
const START = 500;
const NAMES = ["Ana", "Bia"] as const;
const ROLES: Role[] = ["a", "b"];

interface Version {
  lane: string;
  guard: Guard;
  quantum: number;
}

function clamp(p: Params) {
  const q = Math.min(4, Math.max(1, Math.round(Number(p.quantum ?? DEFAULTS.quantum))));
  const d1 = Math.min(900, Math.max(1, Math.round(Number(p.dep1 ?? DEFAULTS.dep1))));
  const d2 = Math.min(900, Math.max(1, Math.round(Number(p.dep2 ?? DEFAULTS.dep2))));
  return { q, d1, d2 };
}

function versions(q: number): Version[] {
  return [
    { lane: "Em sequência", guard: "none", quantum: Number.POSITIVE_INFINITY },
    { lane: "Intercalado", guard: "none", quantum: q },
    { lane: "Trava ingênua", guard: "naive", quantum: q },
    { lane: "Peterson", guard: "peterson", quantum: q },
    { lane: "TSL", guard: "tsl", quantum: q },
    { lane: "Mutex", guard: "mutex", quantum: q },
  ];
}

function runAll(p: Params) {
  const { q, d1, d2 } = clamp(p);
  return versions(q).map((v) => ({
    ...v,
    r: runRace([guarded(v.guard, d1, 0), guarded(v.guard, d2, 1)], { saldo: START }, v.quantum),
  }));
}

function scene(p: Params): SceneSpec {
  const runs = runAll(p);
  const span = Math.max(...runs.map((x) => x.r.ticks.length));
  return {
    viewBox: [960, 500],
    nodes: [],
    links: [],
    widgets: [
      {
        kind: "gantt",
        id: "tempo",
        title: "Uma operação por tick · Ana em uma cor, Bia em outra",
        at: [40, 50],
        lanes: runs.map((x) => x.lane),
        span,
        width: 880,
      },
      {
        kind: "table",
        id: "res",
        title: `Saldo inicial ${START}`,
        at: [40, 300],
        columns: ["Versão", "Saldo final", "Juntas na seção", "Voltas de espera", "Bloqueios"],
        widths: [150, 120, 160, 160, 120],
        rows: 6,
      },
    ],
  };
}

/** Short code drawn inside a one-tick bar. */
function code(op: ROp, outcome: Tick["outcome"]): string {
  if (outcome === "spin") return "esp";
  if (outcome === "block") return "dorme";
  switch (op.k) {
    case "load":
      return "lê";
    case "add":
      return "soma";
    case "store":
      return "grava";
    case "set":
      return op.val === 0 ? "sai" : op.v === "vez" ? "vez" : op.v === "ocupado" ? "marca" : "quer";
    case "spin":
      return "testa";
    case "tsl":
      return "tsl";
    case "lock":
      return "lock";
    case "unlock":
      return "unlock";
  }
}

/** One line of the event log, in words. */
function explainTick(t: Tick): string {
  const op = t.op;
  if (t.outcome === "spin") return "testa de novo e continua esperando";
  if (t.outcome === "block") return "encontra o mutex fechado e dorme";
  switch (op.k) {
    case "load":
      return `carrega saldo = ${t.reg}`;
    case "add":
      return `soma ${op.n} no registrador: ${t.reg}`;
    case "store":
      return `grava saldo = ${t.mem.saldo}`;
    case "set":
      return `${op.v} = ${t.mem[op.v]}`;
    case "spin":
      return `${op.what} não; segue`;
    case "tsl":
      return "tsl: lê 0 e grava 1 de uma vez";
    case "lock":
      return "fecha o mutex";
    case "unlock":
      return t.outcome === "wake" ? "abre o mutex e acorda quem dormia" : "abre o mutex";
  }
}

const voltas = (n: number) => (n === 1 ? "1 volta" : `${n} voltas`);

export function build(p: Params) {
  const { q, d1, d2 } = clamp(p);
  const b = lessonBuilder();
  const runs = runAll(p);
  const right = START + d1 + d2;
  let seq = 0;

  const draw = (i: number) => {
    const v = runs[i] as Version & { r: RaceResult };
    for (const t of v.r.ticks) {
      seq += 1;
      const who = NAMES[t.tid] as string;
      const role = ROLES[t.tid] as Role;
      b.ev({
        t: seq,
        kind: "gantt",
        lane: v.lane,
        from: t.t - 1,
        to: t.t,
        item: code(t.op, t.outcome),
        itemRole: t.outcome === "spin" || t.outcome === "block" ? "muted" : role,
        role,
        label: `${v.lane}, tick ${t.t}: ${who} ${explainTick(t)}`,
        row: {
          cols: {
            t: String(t.t),
            who: `${v.lane} · ${who}`,
            what: code(t.op, t.outcome),
            detail: explainTick(t),
          },
        },
      });
    }
    seq += 1;
    const bad = v.r.saldo !== right;
    b.ev({
      t: seq,
      kind: "row",
      table: "res",
      index: i,
      cells: [
        v.lane,
        String(v.r.saldo),
        v.r.maxInCS > 1 ? "sim" : "não",
        String(v.r.spins),
        String(v.r.blocks),
      ],
      ...(bad ? { mark: "bad" as const } : { mark: "hit" as const }),
      role: bad ? "bad" : "b",
      label: `${v.lane}: saldo ${v.r.saldo}`,
    });
  };

  const R = (i: number) => (runs[i] as { r: RaceResult }).r;
  const seqRun = R(0);
  b.step(
    {
      id: "s1-sequencia",
      title: "Uma depois da outra",
      subtitle: `${START} + ${d1} + ${d2}`,
      text: `Duas [[thread|threads]] depositam na mesma conta: Ana ${d1} e Bia ${d2}, com saldo inicial ${START}. Em C é uma linha, saldo += valor, mas o compilador gera três instruções: lê o saldo para um registrador, soma, grava de volta. Rodando uma depois da outra, o resultado é ${seqRun.saldo}, como esperado. Cada barra da linha do tempo é uma instrução.`,
      facts: [
        ["Saldo inicial", String(START)],
        ["Depósitos", `${d1} e ${d2}`],
        ["Saldo final", String(seqRun.saldo)],
      ],
      highlight: [],
    },
    () => draw(0),
  );

  const race = R(1);
  const lost = right - race.saldo;
  // the thread whose store is overwritten by the other's later store loses its deposit
  const lastStore = [...race.ticks].reverse().find((t) => t.op.k === "store");
  const lostWho = lost > 0 && lastStore ? (NAMES[1 - lastStore.tid] as string) : "";
  b.step(
    {
      id: "s2-corrida",
      title: "Intercaladas pelo escalonador",
      subtitle: `Quantum de ${q === 1 ? "1 instrução" : `${q} instruções`}`,
      text:
        race.saldo === right
          ? `Agora o escalonador troca de thread a cada ${q} instruções. Com esse [[quantum]], cada depósito termina antes da troca e o saldo fica ${race.saldo}. Foi sorte: se a troca cair entre o lê e o grava, as duas leem o mesmo valor e um depósito some. No Laboratório, tente o quantum 1.`
          : `Agora o escalonador troca de thread a cada ${q === 1 ? "instrução" : `${q} instruções`}. As duas leem ${START} antes que qualquer uma grave; cada uma soma o seu valor e grava por cima da outra. O saldo termina em ${race.saldo}: o depósito de ${lost}${lostWho ? `, de ${lostWho},` : ""} sumiu. É uma [[condicao-de-corrida]]: o resultado depende da ordem.`,
      facts: [
        ["Esperado", String(right)],
        ["Obtido", String(race.saldo)],
        ["Perdido", String(lost)],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Com troca a cada ${q === 1 ? "instrução" : `${q} instruções`}, começando por Ana, quanto vai valer o saldo no final?`,
        answer: race.saldo,
        explain:
          race.saldo === right
            ? `Cada thread faz lê, soma e grava sem ser interrompida no meio: ${START} + ${d1} + ${d2} = ${right}.`
            : `As duas leem ${START}. Quem grava por último vence: o saldo fica ${race.saldo}, e ${lost} se perde.`,
      },
    },
    () => draw(1),
  );

  const naive = R(2);
  b.step(
    {
      id: "s3-trava-ingenua",
      title: "Uma trava ingênua",
      subtitle: "Testar e marcar em dois passos",
      text:
        naive.maxInCS > 1
          ? `As três instruções formam uma [[secao-critica]]: só uma thread por vez pode estar nela. Primeira ideia: uma variável ocupado. Quem chega testa se vale 0 e então marca 1. Mas as duas testam antes de qualquer uma marcar, e entram juntas: o saldo fica ${naive.saldo}. Teste e marcação separados só mudaram a corrida de lugar.`
          : `As três instruções formam uma [[secao-critica]]: só uma thread por vez pode estar nela. Primeira ideia: uma variável ocupado. Quem chega testa se vale 0 e então marca 1. Desta vez ninguém foi interrompido entre testar e marcar, e o saldo ficou ${naive.saldo}. Com quantum 1, as duas testam antes de marcar e entram juntas.`,
      facts: [
        ["Juntas na seção", naive.maxInCS > 1 ? "sim" : "não"],
        ["Saldo final", String(naive.saldo)],
        ["Problema", "teste e marca separados"],
      ],
      highlight: [],
    },
    () => draw(2),
  );

  const pet = R(3);
  const firstIn = pet.ticks.find((t) => t.op.k === "load");
  const first = NAMES[firstIn?.tid ?? 0] as string;
  const other = NAMES[1 - (firstIn?.tid ?? 0)] as string;
  b.step(
    {
      id: "s4-peterson",
      title: "O algoritmo de Peterson",
      subtitle: "Querer e ceder a vez",
      text: `Peterson resolve só com leituras e escritas comuns. Cada thread marca que quer entrar, cede a vez para a outra e espera enquanto a outra quer e a vez é dela. Se as duas chegam juntas, quem cedeu a vez por último espera. Aqui, ${first} entra primeiro e ${other} gasta ${voltas(pet.spins)} de [[espera-ocupada]]. O saldo fica ${pet.saldo}.`,
      facts: [
        ["Entra primeiro", first],
        ["Voltas de espera", String(pet.spins)],
        ["Saldo final", String(pet.saldo)],
      ],
      highlight: [],
      quiz: {
        kind: "choice",
        prompt: "Ana e Bia marcam que querem entrar e cedem a vez, nessa ordem. Quem entra primeiro?",
        options: ["Ana", "Bia"],
        answer: firstIn?.tid ?? 0,
        explain: `A variável vez guarda o último valor escrito. ${other} cedeu a vez por último, então ${first} entra e ${other} espera.`,
      },
    },
    () => draw(3),
  );

  const tsl = R(4);
  b.step(
    {
      id: "s5-tsl",
      title: "Ajuda do hardware",
      subtitle: "Testar e marcar de uma vez",
      text: `Peterson vale para duas threads e depende de a memória não reordenar as escritas. Os processadores oferecem uma instrução [[tsl|atômica]] que lê a trava e grava 1 numa só operação, sem que ninguém se meta no meio: xchg no x86, amoswap no RISC-V. Quem lê 0 entra; quem lê 1 tenta de novo. Funciona para qualquer número de threads, mas ${other} ainda gasta ${voltas(tsl.spins)} girando.`,
      facts: [
        ["Instrução", "testa e marca, atômica"],
        ["Voltas de espera", String(tsl.spins)],
        ["Saldo final", String(tsl.saldo)],
      ],
      highlight: [],
    },
    () => draw(4),
  );

  const mx = R(5);
  b.step(
    {
      id: "s6-mutex",
      title: "Dormir em vez de girar",
      subtitle: "Mutex do sistema operacional",
      text: `Girar desperdiça a CPU que a outra thread precisa para sair da seção. Um [[mutex]] usa a instrução atômica por dentro, mas, se estiver fechado, pede ao sistema operacional para [[bloqueado|bloquear]] a thread. Ela gasta um tick para descobrir e dormir, sai da fila de prontos e só volta quando o unlock a acorda: ${voltas(mx.spins)} e ${mx.blocks === 1 ? "1 bloqueio" : `${mx.blocks} bloqueios`}. Para esperas curtas, girar pode sair mais barato que dormir.`,
      facts: [
        ["Voltas de espera", String(mx.spins)],
        ["Bloqueios", String(mx.blocks)],
        ["Ticks no total", String(mx.ticks.length)],
      ],
      highlight: [],
    },
    () => draw(5),
  );

  return b.done({
    race: race.saldo,
    naive: naive.saldo,
    petersonSpins: pet.spins,
    tslSpins: tsl.spins,
    mutexTicks: mx.ticks.length,
    first,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "condicao-de-corrida",
    site: "so",
    title: "Condição de corrida e exclusão mútua",
    summary:
      "Dois depósitos na mesma conta, um deles perdido, e quatro formas de proteger a seção crítica: trava ingênua, Peterson, instrução atômica e mutex.",
    area: "Concorrência",
    refs: [
      {
        book: "tanenbaum-mos",
        chapter: 2,
        section: "2.3.1",
        note: "Condições de corrida",
        verified: true,
      },
      {
        book: "tanenbaum-mos",
        chapter: 2,
        section: "2.3.3",
        note: "Exclusão mútua com espera ocupada",
        verified: true,
      },
      { book: "tanenbaum-mos", chapter: 2, section: "2.3.6", note: "Mutexes", verified: true },
      { book: "maziero-so", chapter: 10, section: "10.2", note: "Exclusão mútua", verified: true },
    ],
    simplifications: [
      "Uma CPU e um tick por instrução; com vários núcleos as threads rodam de fato ao mesmo tempo.",
      "O escalonador alterna as threads a cada quantum fixo, sem interrupções em outros pontos.",
      "A memória executa as escritas na ordem do programa; CPUs reais podem reordenar e exigem barreiras.",
      "Lock e unlock aparecem como uma instrução cada; por dentro, eles usam uma instrução atômica e chamadas ao sistema.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "quantum",
        kind: "int",
        label: "Instruções por vez",
        min: 1,
        max: 4,
        help: "Quantas instruções cada thread roda antes de o escalonador trocar.",
      },
      { key: "dep1", kind: "int", label: "Depósito de Ana", min: 1, max: 900 },
      { key: "dep2", kind: "int", label: "Depósito de Bia", min: 1, max: 900 },
    ],
  },
  build,
  intro: {
    text: "Quando duas threads mexem na mesma variável, o resultado pode depender de quem o escalonador põe na CPU, e em que instante. Você vai ver um depósito sumir e comparar quatro formas de impedir isso, da ideia ingênua ao mutex do sistema operacional.",
    facts: [
      ["Saldo inicial", String(START)],
      ["Depósitos", `${DEFAULTS.dep1} e ${DEFAULTS.dep2}`],
      ["Troca", "a cada instrução"],
    ],
  },
  outro: {
    title: "Exclusão mútua em resumo",
    text: "Ler, alterar e gravar uma variável compartilhada é uma seção crítica. Sem proteção, uma troca de thread no meio dela perde atualizações. Testar e marcar em dois passos não basta; Peterson resolve para duas threads, a instrução atômica para qualquer número, e o mutex troca a espera ocupada pelo bloqueio.",
    facts: (run) => [
      ["Sem proteção", String(run.stats.race)],
      ["Voltas com TSL", String(run.stats.tslSpins)],
      ["Ticks com mutex", String(run.stats.mutexTicks)],
    ],
  },
  next: ["produtor-consumidor", "impasses"],
};

export default lesson;
