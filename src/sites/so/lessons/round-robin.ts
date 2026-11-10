import type { Frame, LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import { type Proc, type SchedEvent, type SchedResult, schedule } from "../../../sim/os/sched.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { roundRobin as practice } from "../practice.ts";

/**
 * Round Robin. Example worked by hand:
 * editor (0, 5), compilador (1, 9), player (2, 2), quantum 3, context switch 1 tick.
 */
export const NAMES = ["editor", "compilador", "player", "planilha", "navegador", "terminal"] as const;
const ROLES: Role[] = ["a", "b", "s3", "s4", "s5", "s6"];
const DEFAULT_PROCS = "0:5 1:9 2:2";

export function parseProcs(spec: string): Proc[] {
  const items = spec.split(/[\s,;]+/).filter(Boolean);
  if (items.length === 0 || items.length > NAMES.length) throw new Error("Use de 1 a 6 processos");
  return items.map((it, i) => {
    const [a, b] = it.split(":").map(Number);
    if (
      !Number.isInteger(a) ||
      !Number.isInteger(b) ||
      (a ?? -1) < 0 ||
      (a ?? 99) > 30 ||
      (b ?? 0) < 1 ||
      (b ?? 99) > 12
    )
      throw new Error(`Processo ${i + 1}: use chegada:CPU com chegada 0–30 e CPU 1–12`);
    return { pid: NAMES[i] as string, arrival: a as number, burst: b as number, priority: 0 };
  });
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ","));
const pct = (n: number) => `${Math.round(n * 100)}%`;

function readParams(p: Params) {
  return {
    quantum: Number(p.quantum ?? 3),
    cost: Number(p.troca ?? 1),
    procs: parseProcs(String(p.processos ?? DEFAULT_PROCS)),
  };
}

function scene(p: Params): SceneSpec {
  const { quantum, cost, procs } = readParams(p);
  const r = schedule(procs, { algo: "rr", quantum, switchCost: cost });
  const span = Math.max(10, Math.ceil(r.makespan / 5) * 5);
  return {
    viewBox: [960, 640],
    zones: [
      { id: "kernel", title: "Kernel", rect: { x: 20, y: 20, w: 600, h: 170 }, tone: "kernel" },
      { id: "procs", title: "Processos", rect: { x: 20, y: 205, w: 920, h: 125 }, tone: "user" },
    ],
    nodes: [
      { id: "timer", kind: "timer", label: "Timer", sub: `quantum = ${quantum}`, at: [530, 72], w: 160 },
      {
        id: "disp",
        kind: "kernel",
        label: "Despachante",
        sub: `troca = ${cost} tick`,
        at: [530, 140],
        w: 160,
      },
      { id: "cpu", kind: "cpu", label: "CPU", sub: "1 núcleo", at: [820, 105] },
      ...NAMES.map((name, i) => ({
        id: `p${i}`,
        kind: "process" as const,
        label: name,
        sub: procs[i] ? `chega ${procs[i]?.arrival} · CPU ${procs[i]?.burst}` : "",
        at: [100 + i * 150, 272] as const,
        w: 136,
        hidden: true,
      })),
    ],
    links: [{ id: "l-disp-cpu", from: "disp", to: "cpu", style: "dashed" }],
    widgets: [
      { kind: "queue", id: "ready", title: "Fila de prontos", at: [40, 92], capacity: 5 },
      {
        kind: "gantt",
        id: "gantt",
        title: "Linha do tempo da CPU (ticks)",
        at: [40, 375],
        lanes: ["CPU"],
        span,
        width: 880,
      },
      {
        kind: "table",
        id: "res",
        title: "Resultado por processo",
        at: [40, 448],
        columns: ["Processo", "Espera", "Retorno", "Resposta"],
        widths: [120, 80, 80, 90],
        rows: 6,
      },
      {
        kind: "table",
        id: "cmp",
        title: "E com outro quantum?",
        at: [490, 448],
        columns: ["Política", "Espera média", "Trocas", "Uso da CPU"],
        widths: [130, 110, 70, 110],
        rows: 4,
      },
    ],
  };
}

function pcbFrame(id: string, pid: string, idx: number, remaining: number, used: number): Frame {
  const pc = 0x00010420 + idx * 0x1000;
  const sp = 0x7fffe000 - idx * 0x2000;
  return {
    id,
    title: `PCB de ${pid}`,
    summary: "O que o kernel guarda para retomar o processo exatamente de onde parou.",
    unit: "word32",
    baseAddress: 0x80ff0000 + idx * 0x40,
    where: "Memória do kernel, na tabela de processos",
    data: [100 + idx, 1, pc, sp, pc - 0x24, 0x2a, remaining, used],
    layers: [
      {
        id: "id",
        label: "Identificação",
        role: "muted",
        from: 0,
        to: 2,
        fields: [
          {
            label: "PID",
            value: String(100 + idx),
            from: 0,
            to: 1,
            example: true,
            note: "O número do processo, único enquanto ele existir",
          },
          {
            label: "Estado",
            value: "1 = pronto",
            from: 1,
            to: 2,
            note: "0 novo · 1 pronto · 2 executando · 3 bloqueado · 4 terminado",
          },
        ],
      },
      {
        id: "ctx",
        label: "Contexto da CPU",
        role: "ctrl",
        from: 2,
        to: 6,
        fields: [
          {
            label: "PC salvo",
            value: `0x${pc.toString(16)}`,
            from: 2,
            to: 3,
            example: true,
            note: "Próxima instrução a executar",
          },
          {
            label: "SP (x2)",
            value: `0x${sp.toString(16)}`,
            from: 3,
            to: 4,
            example: true,
            note: "Topo da pilha do processo",
          },
          {
            label: "ra (x1)",
            value: `0x${(pc - 0x24).toString(16)}`,
            from: 4,
            to: 5,
            example: true,
            note: "Endereço de retorno da função em andamento",
          },
          {
            label: "a0 (x10)",
            value: "42",
            from: 5,
            to: 6,
            example: true,
            note: "Os outros registradores também são salvos (omitidos)",
          },
        ],
      },
      {
        id: "sched",
        label: "Escalonamento",
        role: "a",
        from: 6,
        to: 8,
        fields: [
          {
            label: "CPU restante (ticks)",
            value: String(remaining),
            from: 6,
            to: 7,
            note: "Só o simulador sabe; um SO real não conhece o futuro",
          },
          {
            label: "Ticks usados do quantum",
            value: String(used),
            from: 7,
            to: 8,
            note: "Quando chega ao quantum, o processo volta ao fim da fila",
          },
        ],
      },
    ],
  };
}

export function build(p: Params) {
  const { quantum, cost, procs } = readParams(p);
  const r = schedule(procs, { algo: "rr", quantum, switchCost: cost });
  const b = lessonBuilder();
  const idx = new Map(procs.map((x, i) => [x.pid, i]));
  const node = (pid: string) => `p${idx.get(pid) ?? 0}`;
  const role = (pid: string): Role => ROLES[idx.get(pid) ?? 0] ?? "a";
  const remaining = new Map(procs.map((x) => [x.pid, x.burst]));
  const usedSince = new Map<string, number>();
  let seq = 0;
  const row = (t: number | string, who: string, what: string, detail: string) => ({
    cols: { t: String(t), who, what, detail },
  });

  // Group scheduler events and finished slices by tick, in the order they happen.
  type Chunk = { kind: SchedEvent["kind"]; t: number; emit: () => void };
  const chunks: Chunk[] = [];
  const sliceEnds = new Map<number, typeof r.slices>();
  for (const s of r.slices) sliceEnds.set(s.to, [...(sliceEnds.get(s.to) ?? []), s]);
  const flushSlices = (t: number) => {
    for (const s of sliceEnds.get(t) ?? []) {
      if (s.kind === "run" && s.pid) {
        remaining.set(s.pid, (remaining.get(s.pid) ?? 0) - (s.to - s.from));
        b.ev({
          t: seq,
          kind: "gantt",
          lane: "CPU",
          from: s.from,
          to: s.to,
          item: s.pid,
          itemRole: role(s.pid),
          role: role(s.pid),
          label: `${s.pid} usou a CPU de ${s.from} a ${s.to}`,
        });
      } else if (s.kind === "switch")
        b.ev({
          t: seq,
          kind: "gantt",
          lane: "CPU",
          from: s.from,
          to: s.to,
          item: "troca",
          itemRole: "muted",
          role: "muted",
          label: `Troca de contexto de ${s.from} a ${s.to}`,
        });
      else
        b.ev({
          t: seq,
          kind: "gantt",
          lane: "CPU",
          from: s.from,
          to: s.to,
          item: "ociosa",
          itemRole: "muted",
          role: "muted",
          label: `CPU ociosa de ${s.from} a ${s.to}`,
        });
    }
    sliceEnds.delete(t);
  };
  let pcbDone = false;
  for (const e of r.events) {
    chunks.push({
      kind: e.kind,
      t: e.t,
      emit: () => {
        seq++;
        flushSlices(e.t);
        switch (e.kind) {
          case "arrive":
            b.ev({
              t: seq,
              kind: "show",
              targets: [node(e.pid)],
              role: role(e.pid),
              label: `${e.pid} chega`,
            });
            b.ev({
              t: seq,
              kind: "state",
              target: node(e.pid),
              text: `pronto · resta ${remaining.get(e.pid)}`,
              tone: "none",
              role: role(e.pid),
              label: `${e.pid} fica pronto`,
            });
            seq++;
            b.ev({
              t: seq,
              kind: "move",
              from: node(e.pid),
              to: "ready",
              role: role(e.pid),
              label: `${e.pid} entra na fila`,
              row: row(e.t, e.pid, "Chega e entra na fila", `CPU necessária: ${remaining.get(e.pid)} ticks`),
            });
            b.ev({
              t: seq,
              kind: "enqueue",
              queue: "ready",
              item: e.pid,
              itemRole: role(e.pid),
              role: role(e.pid),
              label: `${e.pid} na fila de prontos`,
            });
            break;
          case "dispatch":
            usedSince.set(e.pid, 0);
            b.ev({
              t: seq,
              kind: "dequeue",
              queue: "ready",
              item: e.pid,
              role: role(e.pid),
              label: `${e.pid} sai da fila`,
            });
            b.ev({
              t: seq,
              kind: "move",
              from: "ready",
              to: "cpu",
              role: role(e.pid),
              label: `${e.pid} vai para a CPU`,
              row: row(
                e.t,
                "Despachante",
                `Despacha ${e.pid}`,
                `Restam ${remaining.get(e.pid)} ticks de CPU`,
              ),
            });
            seq++;
            b.ev({
              t: seq,
              kind: "state",
              target: node(e.pid),
              text: "executando",
              tone: "active",
              role: role(e.pid),
              label: `${e.pid} executando`,
            });
            b.ev({
              t: seq,
              kind: "state",
              target: "cpu",
              text: e.pid,
              tone: "active",
              role: role(e.pid),
              label: `CPU com ${e.pid}`,
            });
            break;
          case "preempt": {
            const left = remaining.get(e.pid) ?? 0;
            const frame = !pcbDone
              ? b.frame(pcbFrame(`pcb-${e.pid}`, e.pid, idx.get(e.pid) ?? 0, left, quantum))
              : undefined;
            pcbDone = true;
            b.ev({
              t: seq,
              kind: "state",
              target: "timer",
              text: "interrupção!",
              tone: "warn",
              role: "ctrl",
              label: "O timer interrompe a CPU",
            });
            b.ev({
              t: seq,
              kind: "note",
              at: "timer",
              text: `quantum de ${e.pid} esgotado`,
              tone: "warn",
              role: "ctrl",
              label: "Quantum esgotado",
              row: row(
                e.t,
                "Timer",
                "Interrupção: quantum esgotado",
                `${e.pid} volta ao fim da fila (resta ${left})`,
              ),
              ...(frame ? { frame } : {}),
            });
            seq++;
            b.ev({
              t: seq,
              kind: "move",
              from: "cpu",
              to: "ready",
              role: role(e.pid),
              label: `${e.pid} volta para a fila`,
            });
            b.ev({
              t: seq,
              kind: "enqueue",
              queue: "ready",
              item: e.pid,
              itemRole: role(e.pid),
              role: role(e.pid),
              label: `${e.pid} no fim da fila`,
            });
            b.ev({
              t: seq,
              kind: "state",
              target: node(e.pid),
              text: `pronto · resta ${left}`,
              tone: "none",
              role: role(e.pid),
              label: `${e.pid} pronto de novo`,
            });
            b.ev({
              t: seq,
              kind: "state",
              target: "cpu",
              text: "",
              tone: "none",
              role: "muted",
              label: "CPU livre",
            });
            b.ev({
              t: seq,
              kind: "state",
              target: "timer",
              text: "",
              tone: "none",
              role: "ctrl",
              label: "Timer rearmado",
            });
            break;
          }
          case "finish":
            b.ev({
              t: seq,
              kind: "move",
              from: "cpu",
              to: node(e.pid),
              role: role(e.pid),
              label: `${e.pid} termina`,
              row: row(e.t, e.pid, "Termina", `Retorno: ${r.stats[e.pid]?.turnaround} ticks`),
            });
            seq++;
            b.ev({
              t: seq,
              kind: "state",
              target: node(e.pid),
              text: `terminado em ${e.t}`,
              tone: "good",
              role: role(e.pid),
              label: `${e.pid} terminado`,
            });
            b.ev({
              t: seq,
              kind: "state",
              target: "cpu",
              text: "",
              tone: "none",
              role: "muted",
              label: "CPU livre",
            });
            break;
          case "switch":
            b.ev({
              t: seq,
              kind: "state",
              target: "disp",
              text: "salvando e carregando…",
              tone: "warn",
              role: "ctrl",
              label: "Troca de contexto",
              row: row(
                e.t,
                "Kernel",
                "Troca de contexto",
                `Salva ${e.from}, carrega ${e.to} (${e.until - e.t} tick)`,
              ),
            });
            b.ev({
              t: seq,
              kind: "note",
              at: "disp",
              text: `salva o PCB de ${e.from}`,
              tone: "info",
              role: "ctrl",
              label: "PCB salvo",
            });
            seq++;
            b.ev({
              t: seq,
              kind: "state",
              target: "disp",
              text: "",
              tone: "none",
              role: "ctrl",
              label: "Troca concluída",
            });
            break;
          case "idle":
            b.ev({
              t: seq,
              kind: "state",
              target: "cpu",
              text: "ociosa",
              tone: "none",
              role: "muted",
              label: "CPU ociosa",
              row: row(e.t, "CPU", "Ociosa", `Ninguém pronto até o tick ${e.until}`),
            });
            break;
        }
      },
    });
  }

  const first = r.events.findIndex((e) => e.kind === "preempt" || e.kind === "finish");
  const firstIsPreempt = r.events[first]?.kind === "preempt";
  const afterDispatch = firstIsPreempt
    ? r.events.findIndex((e, i) => i > first && e.kind === "dispatch")
    : -1;
  const firstFinish = r.events.findIndex((e) => e.kind === "finish");
  const firstP = r.events[first];
  const nextPid = afterDispatch >= 0 ? (r.events[afterDispatch] as { pid: string }).pid : null;
  const run = (from: number, to: number) => {
    for (let i = from; i < to; i++) chunks[i]?.emit();
  };
  const p0 = procs[0] as Proc;

  let cursor = 0;
  const take = (to: number) => {
    const from = cursor;
    cursor = Math.max(cursor, to);
    return () => run(from, to);
  };

  if (first > 0)
    b.step(
      {
        id: "s1-chegada",
        title: "Chegam os processos",
        subtitle: "O primeiro vai direto para a CPU",
        text: `O ${p0.pid} chega com a CPU livre e começa a rodar sem esperar. Os outros entram no fim da [[fila-de-prontos]], na ordem em que chegam. Repare que ninguém escolhe pelo tamanho: o Round Robin só olha a ordem da fila.`,
        facts: [
          ["Quantum", `${quantum} ticks`],
          ["Processos", String(procs.length)],
          ["Fila", "FIFO"],
        ],
        highlight: ["cpu"],
      },
      take(first),
    );
  if (firstIsPreempt && firstP)
    b.step(
      {
        id: "s2-timer",
        title: "O quantum acaba",
        subtitle: "O timer interrompe quem está rodando",
        text: `Depois de ${quantum} ticks o [[timer]] gera uma [[interrupcao]]. O kernel tira o ${firstP.kind === "preempt" ? firstP.pid : ""} da CPU e o coloca no **fim** da fila, mesmo que ainda falte trabalho. É isso que impede um processo longo de monopolizar a máquina.`,
        facts: [
          ["Quem sai", firstP.kind === "preempt" ? firstP.pid : "?"],
          ["Ainda falta", `${remainingAt(r, procs, firstP.t, (firstP as { pid: string }).pid)} ticks`],
          ["Motivo", "preempção por tempo"],
        ],
        highlight: ["timer", "cpu"],
        ...(nextPid
          ? {
              quiz: {
                kind: "pick" as const,
                prompt: `Quando o quantum do ${(firstP as { pid: string }).pid} acabar, quem vai para a CPU?`,
                targets: procs.map((x) => ({ id: x.pid, label: x.pid })),
                answer: nextPid,
                explain: `A CPU vai para o primeiro da fila: o **${nextPid}**. Quem acabou de sair vai para o fim, atrás de quem chegou enquanto ele rodava.`,
              },
            }
          : {}),
      },
      take(first + 1),
    );
  if (afterDispatch > 0)
    b.step(
      {
        id: "s3-troca",
        title: "Troca de contexto",
        subtitle: "Salvar um processo, carregar outro",
        text:
          cost > 0
            ? `Antes de o ${nextPid} rodar, o kernel salva os registradores do processo que saiu no [[pcb]] e carrega os do próximo. Neste exemplo isso custa ${cost} tick em que a CPU não faz trabalho útil. Abra o inspetor (I) para ver o PCB.`
            : "Com custo de troca zero, o próximo processo começa no mesmo tick. Num sistema real a troca sempre custa algo: salvar registradores, trocar a tabela de páginas e esfriar as caches.",
        facts: [
          ["Custo da troca", `${cost} tick`],
          ["Salvo no PCB", "PC, SP, registradores"],
        ],
        highlight: ["disp"],
      },
      take(afterDispatch + 1),
    );
  if (firstFinish >= cursor) {
    const f = r.events[firstFinish] as { pid: string; t: number };
    b.step(
      {
        id: "s4-termina",
        title: "Termina antes do quantum",
        subtitle: "Quem acaba cedo libera a CPU",
        text: `O ${f.pid} precisava de pouca CPU e termina no tick ${f.t}, sem esperar o timer. A CPU passa imediatamente para o próximo da fila. Processos curtos e interativos são os que mais ganham com o Round Robin.`,
        facts: [
          ["Terminou", f.pid],
          ["No tick", String(f.t)],
          ["Retorno", `${r.stats[f.pid]?.turnaround} ticks`],
        ],
        highlight: [node(f.pid)],
      },
      take(firstFinish + 1),
    );
  }
  if (cursor < chunks.length)
    b.step(
      {
        id: "s5-rodizio",
        title: "Rodízio até o fim",
        subtitle: "Cada um na sua vez",
        text: "O mesmo ciclo se repete: roda até o quantum acabar ou o processo terminar, e a CPU passa para o próximo da fila. Quando só sobra um processo, o timer ainda dispara, mas não há com quem trocar: ele continua sem pagar troca de contexto.",
        facts: [
          ["Fim de tudo", `tick ${r.makespan}`],
          ["Trocas de contexto", String(r.switches)],
        ],
        highlight: ["cpu"],
      },
      take(chunks.length),
    );

  b.step(
    {
      id: "s6-contas",
      title: "As contas",
      subtitle: "Espera, retorno e resposta",
      text: "**Retorno** (*turnaround*) é o fim menos a chegada. **Espera** é o retorno menos o tempo de CPU: o tempo parado na fila. **Resposta** é quanto demorou para rodar pela primeira vez, a métrica que o usuário sente num programa interativo.",
      facts: [
        ["Espera média", `${fmt(r.avgWait)} ticks`],
        ["Retorno médio", `${fmt(r.avgTurnaround)} ticks`],
        ["Resposta média", `${fmt(r.avgResponse)} ticks`],
        ["Uso da CPU", pct(r.utilization)],
      ],
    },
    () => {
      seq++;
      procs.forEach((x, i) => {
        const s = r.stats[x.pid];
        if (!s) return;
        b.ev({
          t: seq + i,
          kind: "row",
          table: "res",
          index: i,
          cells: [x.pid, String(s.wait), String(s.turnaround), String(s.response)],
          mark: "new",
          role: role(x.pid),
          label: `Contas de ${x.pid}`,
          row: row(
            "—",
            x.pid,
            "Resultado",
            `espera ${s.wait} · retorno ${s.turnaround} · resposta ${s.response}`,
          ),
        });
      });
      seq += procs.length;
    },
  );

  const variants: [string, SchedResult][] = [
    [`RR q=1`, schedule(procs, { algo: "rr", quantum: 1, switchCost: cost })],
    [`RR q=${quantum}`, r],
    [`RR q=20`, schedule(procs, { algo: "rr", quantum: 20, switchCost: cost })],
    ["FCFS", schedule(procs, { algo: "fcfs", switchCost: cost })],
  ];
  b.step(
    {
      id: "s7-quantum",
      quiz: {
        kind: "choice",
        prompt:
          "Se o quantum for maior que qualquer rajada de CPU, o Round Robin passa a se comportar como qual política?",
        options: [
          "FCFS: cada um roda até o fim, na ordem de chegada",
          "SJF: os mais curtos passam na frente",
          "Prioridade: o mais importante roda primeiro",
        ],
        answer: 0,
        explain:
          "Se o timer nunca dispara antes de o processo terminar, ninguém volta para o fim da fila. Sobra só a ordem de chegada, que é o FCFS.",
      },
      title: "E se o quantum mudasse?",
      subtitle: "Pequeno demais ou grande demais",
      text: "Com quantum 1 a resposta melhora, mas a CPU gasta muito tempo trocando de contexto. Com quantum 20 quase ninguém é interrompido e o Round Robin vira FCFS. O ideal fica no meio: maior que a maioria das rajadas curtas, bem maior que o custo da troca. Teste no Laboratório.",
      facts: variants.map(([name, v]) => [name, `espera ${fmt(v.avgWait)} · ${v.switches} trocas`] as const),
    },
    () => {
      seq++;
      variants.forEach(([name, v], i) => {
        b.ev({
          t: seq + i,
          kind: "row",
          table: "cmp",
          index: i,
          cells: [name, `${fmt(v.avgWait)} ticks`, String(v.switches), pct(v.utilization)],
          mark: name === `RR q=${quantum}` ? "hit" : "new",
          role: "ctrl",
          label: `Comparação: ${name}`,
        });
      });
    },
  );

  const notes: string[] = [];
  const best = [...variants].sort((x, y) => x[1].avgWait - y[1].avgWait)[0];
  if (best)
    notes.push(
      `Entre as políticas comparadas, a menor espera média foi a de ${best[0]} (${fmt(best[1].avgWait)} ticks).`,
    );
  if (r.switches > procs.length * 3)
    notes.push(`Foram ${r.switches} trocas de contexto: o quantum está pequeno para estes processos.`);
  if (r.events.every((e) => e.kind !== "preempt"))
    notes.push(
      "Nenhum processo foi interrompido pelo timer: com este quantum, o Round Robin se comportou como FCFS.",
    );

  return b.done(
    {
      avgWait: r.avgWait,
      avgTurnaround: r.avgTurnaround,
      avgResponse: r.avgResponse,
      switches: r.switches,
      utilization: r.utilization,
      makespan: r.makespan,
    },
    notes,
  );
}

function remainingAt(r: SchedResult, procs: Proc[], t: number, pid: string): number {
  const burst = procs.find((p) => p.pid === pid)?.burst ?? 0;
  const ran = r.slices
    .filter((s) => s.pid === pid && s.kind === "run" && s.to <= t)
    .reduce((a, s) => a + s.to - s.from, 0);
  return burst - ran;
}

const lesson: LessonModule = {
  meta: {
    slug: "round-robin",
    site: "so",
    title: "Round Robin e o tamanho do quantum",
    summary:
      "Como o SO reveza uma CPU entre vários processos, quanto custa cada troca e por que o quantum não pode ser nem pequeno nem grande demais.",
    area: "Escalonamento de processos",
    refs: [
      {
        book: "tanenbaum-mos",
        chapter: 2,
        section: "2.4.3",
        note: "Escalonamento em sistemas interativos",
        verified: true,
      },
      { book: "maziero-so", chapter: 6, section: "6.4", note: "Algoritmos de escalonamento", verified: true },
    ],
    simplifications: [
      "Os processos só usam CPU: não há rajadas de E/S nem bloqueios.",
      "Uma única CPU e um tick como unidade de tempo.",
      "O custo da troca de contexto é fixo; na prática ele varia e inclui o efeito nas caches e na TLB.",
      "Quando um processo chega no mesmo tick em que outro é interrompido, o que chega entra na fila antes.",
    ],
  },
  scene,
  params: {
    defaults: { quantum: 3, troca: 1, processos: DEFAULT_PROCS },
    fields: [
      { key: "quantum", kind: "int", label: "Quantum (ticks)", min: 1, max: 20 },
      { key: "troca", kind: "int", label: "Custo da troca de contexto (ticks)", min: 0, max: 3 },
      {
        key: "processos",
        kind: "list",
        label: "Processos (chegada:CPU)",
        maxItems: 6,
        pattern: "\\d{1,2}:\\d{1,2}",
        placeholder: DEFAULT_PROCS,
        help: "Até 6 processos, na ordem editor, compilador, player, planilha, navegador, terminal.",
      },
    ],
  },
  build,
  intro: {
    text: "Seu notebook tem um processador e dezenas de programas querendo usá-lo ao mesmo tempo. O [[escalonador]] precisa revezar: dá um pedaço de tempo, o [[quantum]], para cada um e passa a vez. Nesta lição você acompanha três programas da Lia, tick a tick, e descobre por que o tamanho desse pedaço muda tudo.",
    facts: [
      ["Política", "Round Robin (rodízio)"],
      ["Processos", "editor, compilador, player"],
      ["Quantum", "3 ticks"],
      ["Troca de contexto", "1 tick"],
    ],
  },
  outro: {
    title: "O rodízio em resumo",
    text: "O Round Robin troca justiça e boa resposta por trocas de contexto. O quantum controla essa troca: pequeno demais desperdiça CPU, grande demais vira FCFS.",
    facts: (run) => [
      ["Espera média", `${fmt(Number(run.stats.avgWait))} ticks`],
      ["Trocas de contexto", String(run.stats.switches)],
      ["Uso da CPU", pct(Number(run.stats.utilization))],
    ],
  },
  next: ["paginacao-tlb"],
  counter: {
    test: (ev) => ev.kind === "state" && ev.label === "Troca de contexto",
    label: (n) => (n === 1 ? "1 troca" : `${n} trocas`),
  },
  practice,
};

export default lesson;
