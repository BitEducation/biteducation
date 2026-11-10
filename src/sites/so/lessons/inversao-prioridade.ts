import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import { type Name, type Protocol, type RunResult, run, tasks } from "../../../sim/os/inversion.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Priority inversion: a medium-priority task keeps a high-priority one waiting for a lock held by a
 * low-priority task. Busy waiting makes it a livelock; priority inheritance and the priority
 * ceiling bound the wait to the rest of the critical section.
 */
export const DEFAULTS = { media: 8, secao: 4 };
const LANES: Record<Protocol, string> = {
  none: "Sem protocolo",
  spin: "Espera ocupada",
  inherit: "Herança",
  ceiling: "Teto",
};
const ORDER: Protocol[] = ["none", "spin", "inherit", "ceiling"];
const ROLE: Record<Name, Role> = { H: "bad", M: "warn", L: "a" };
const GANTT_W = 880;
const ticks = (n: number) => (n === 1 ? "1 tick" : `${n} ticks`);

function clamp(p: Params) {
  const medium = Math.min(20, Math.max(1, Math.round(Number(p.media ?? DEFAULTS.media))));
  const section = Math.min(8, Math.max(2, Math.round(Number(p.secao ?? DEFAULTS.secao))));
  return { medium, section };
}

function spanOf(medium: number, section: number) {
  const spec = tasks(medium, section);
  return spec.reduce((a, s) => a + s.pre + s.cs + s.post, 0) + 2;
}

function scene(p: Params): SceneSpec {
  const { medium, section } = clamp(p);
  return {
    viewBox: [960, 600],
    nodes: [],
    links: [],
    widgets: [
      {
        kind: "gantt",
        id: "cpu",
        title: "Quem usa a CPU a cada tick · * = com a trava · ~ = girando à espera",
        at: [40, 50],
        lanes: ORDER.map((x) => LANES[x]),
        span: spanOf(medium, section),
        width: GANTT_W,
      },
      {
        kind: "table",
        id: "res",
        title: "A tarefa H em cada protocolo",
        at: [40, 270],
        columns: ["Protocolo", "Pede a trava", "Obtém", "Espera", "Termina"],
        widths: [150, 110, 90, 90, 90],
        rows: ORDER.length,
      },
      { kind: "counter", id: "espera", title: "H esperou a trava", at: [640, 270] },
      { kind: "counter", id: "resp", title: "Resposta de H", at: [790, 270] },
    ],
  };
}

export function build(p: Params) {
  const { medium, section } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, {}, (t) => String(t));
  const span = spanOf(medium, section);
  const scale = (GANTT_W - 92) / span;
  const spec = tasks(medium, section);
  const H = spec.find((s) => s.name === "H");
  const arriveH = H?.arrive ?? 0;
  const res = Object.fromEntries(ORDER.map((x) => [x, run(spec, x, span)])) as Record<Protocol, RunResult>;
  const wait = (r: RunResult) => (r.hGot !== null && r.hAsked !== null ? r.hGot - r.hAsked : null);
  const resp = (r: RunResult) => (r.finish.H !== undefined ? r.finish.H - arriveH : null);
  const none = res.none;
  const inh = res.inherit;
  const ceil = res.ceiling;

  /** Consecutive ticks of the same task doing the same thing become one bar. */
  const draw = (x: Protocol, from = 0, to = span) => {
    type Seg = { task: Name; kind: string; from: number; to: number };
    const segs: Seg[] = [];
    for (const s of res[x].slices) {
      if (s.t < from || s.t >= to) continue;
      const last = segs[segs.length - 1];
      if (last && last.task === s.task && last.kind === s.kind && last.to === s.t) last.to = s.t + 1;
      else segs.push({ task: s.task, kind: s.kind, from: s.t, to: s.t + 1 });
    }
    for (const s of segs) {
      const mark = s.kind === "cs" ? "*" : s.kind === "spin" ? "~" : "";
      const t = c.t + 1;
      c.at(t);
      b.ev({
        t,
        kind: "gantt",
        lane: LANES[x],
        from: s.from,
        to: s.to,
        item: (s.to - s.from) * scale >= 22 ? `${s.task}${mark}` : s.task,
        itemRole: s.kind === "spin" ? "muted" : ROLE[s.task],
        role: ROLE[s.task],
        label: `${LANES[x]}: ${s.task} ${s.kind === "cs" ? "com a trava" : s.kind === "spin" ? "girando" : "executa"}, ticks ${s.from} a ${s.to}`,
        row: {
          cols: {
            t: `${s.from}–${s.to}`,
            who: s.task,
            what: s.kind === "cs" ? "seção crítica" : s.kind === "spin" ? "espera ocupada" : "executa",
            detail: LANES[x],
          },
        },
      });
    }
  };
  const result = (x: Protocol, i: number) => {
    const r = res[x];
    const w = wait(r);
    const rp = resp(r);
    c.row(
      "res",
      i,
      [
        LANES[x],
        r.hAsked === null ? "–" : `tick ${r.hAsked}`,
        r.hGot === null ? "nunca" : `tick ${r.hGot}`,
        w === null ? "sem fim" : `${w}`,
        r.finish.H === undefined ? "nunca" : `tick ${r.finish.H}`,
      ],
      { dt: 1, mark: r.done ? "new" : "bad", role: r.done ? (w && w > section ? "warn" : "crypto") : "bad" },
    );
    c.count("espera", w === null ? "∞" : `${w} ticks`, {
      label: `H esperou ${w === null ? "para sempre" : `${w} ticks`}`,
    });
    c.count("resp", rp === null ? "∞" : `${rp} ticks`, {
      label: `resposta de H: ${rp === null ? "nunca" : `${rp} ticks`}`,
    });
  };

  const wNone = wait(none) ?? 0;
  const wInh = wait(inh) ?? 0;
  const wCeil = wait(ceil) ?? 0;

  b.step(
    {
      id: "s1-cenario",
      title: "Três prioridades, uma trava",
      subtitle: `H bloqueia no tick ${none.hAsked}`,
      text: `O escalonador é [[preempcao|preemptivo]] por prioridade: sempre roda a tarefa pronta mais importante. L, de prioridade baixa, chega primeiro e pega a trava, um [[mutex]]. No tick ${arriveH} chega H, de prioridade alta, e toma a CPU de L. Um tick depois, H precisa da mesma trava, que está com L. H bloqueia e espera. Até aqui, é o esperado: L só precisa de mais ${ticks(section - 1)} para soltar a trava.`,
      facts: [
        ["H (alta)", "precisa da trava por 2 ticks"],
        ["M (média)", `${medium} ticks, sem trava`],
        ["L (baixa)", `trava por ${section} ticks`],
      ],
      highlight: [],
    },
    () => {
      for (let i = 0; i < ORDER.length; i++) c.row("res", i, ["", "", "", "", ""], { role: "muted" });
      draw("none", 0, none.hAsked ?? 0);
      c.count("espera", "–", { label: "H ainda não pediu a trava" });
      c.count("resp", "–", { label: "H ainda não terminou" });
    },
  );

  b.step(
    {
      id: "s2-inversao",
      title: "M fura a fila",
      subtitle: `H espera ${wNone} ticks`,
      text: `Com H bloqueado, a mais importante das prontas é M, que chega no tick ${spec.find((s) => s.name === "M")?.arrive} e não precisa da trava. M tem prioridade maior que L, então L não volta a rodar, e a trava continua presa. H espera ${wNone} ticks: ${ticks(medium)} de M e mais ${ticks(section - 1)} que faltavam a L. É a [[inversao-de-prioridade]]: uma tarefa média atrasa a alta, e o atraso cresce com a duração de M, que nada tem a ver com a trava.`,
      facts: [
        ["Espera de H", `${wNone} ticks`],
        ["Por causa de M", `${medium} ticks`],
        ["Resposta de H", `${resp(none)} ticks`],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: "Quantos ticks H esperou pela trava, do pedido até obtê-la?",
        answer: wNone,
        unit: "ticks",
        explain: `Do tick ${none.hAsked} ao ${none.hGot}: ${medium} de M e ${section - 1} do resto da seção de L.`,
      },
    },
    () => {
      draw("none", none.hAsked ?? 0);
      result("none", 0);
    },
  );

  b.step(
    {
      id: "s3-giro",
      title: "Espera ocupada: para sempre",
      subtitle: "H gira e L nunca roda",
      text: `Se em vez de bloquear H ficar testando a trava num laço, a [[espera-ocupada]], é pior. H continua pronta e com a maior prioridade, então o escalonador só roda H. L, que teria de rodar para soltar a trava, nunca recebe a CPU. H gira até o fim da janela de ${span} ticks e não termina nunca. Por isso travas de espera ocupada só servem quando quem segura a trava roda em outro processador ou não pode ser preemptado.`,
      facts: [
        ["H", "gira sem parar"],
        ["L", "nunca roda"],
        ["Fim", "nunca"],
      ],
      highlight: [],
    },
    () => {
      draw("spin");
      result("spin", 1);
    },
  );

  b.step(
    {
      id: "s4-heranca",
      quiz: {
        kind: "choice",
        prompt: "Com herança de prioridade, de que passa a depender a espera de H pela trava?",
        options: ["Só do que falta da seção crítica de L", "Da duração de M", "Do número de tarefas prontas"],
        answer: 0,
        explain:
          "Enquanto segura a trava pedida por H, L roda com a prioridade de H, e M não passa na frente. A espera fica limitada ao resto da seção crítica.",
      },
      title: "Herança de prioridade",
      subtitle: `espera de ${wNone} → ${wInh} ticks`,
      text: `Na [[heranca-de-prioridade]], quando H bloqueia esperando a trava de L, L passa a rodar com a prioridade de H. Agora M não consegue passar na frente: L termina a seção crítica em ${ticks(section - 1)}, solta a trava, volta à prioridade baixa, e H segue. A espera de H cai de ${wNone} para ${wInh} ticks e não depende mais de M; ela fica limitada ao resto da seção crítica. M roda depois de H, como deveria.`,
      facts: [
        ["Espera de H", `${wInh} ticks`],
        ["Resposta de H", `${resp(inh)} ticks`],
        ["Depende de M", "não"],
      ],
      highlight: [],
    },
    () => {
      draw("inherit");
      result("inherit", 2);
    },
  );

  b.step(
    {
      id: "s5-teto",
      title: "Teto de prioridade",
      subtitle: `H termina no tick ${ceil.finish.H}`,
      text: `No protocolo do [[teto-de-prioridade]], cada trava tem um teto: a maior prioridade entre as tarefas que podem usá-la, aqui a de H. Quem pega a trava sobe ao teto na hora. L já roda com a prioridade de H quando H chega, e H nem chega a disputar a trava: ${wCeil === 0 ? "espera 0 ticks por ela" : `espera ${wCeil} ticks`} e termina no tick ${ceil.finish.H}. O teto também impede alguns impasses entre travas, mas exige conhecer de antemão quem usa cada trava.`,
      facts: [
        ["Teto da trava", "prioridade de H"],
        ["Espera pela trava", `${wCeil} ticks`],
        ["Resposta de H", `${resp(ceil)} ticks`],
      ],
      highlight: [],
    },
    () => {
      draw("ceiling");
      result("ceiling", 3);
    },
  );

  b.step(
    {
      id: "s6-marte",
      title: "A sonda em Marte",
      subtitle: `${resp(none)} contra ${resp(inh)} ticks`,
      text: `Em 1997, a sonda Mars Pathfinder reiniciava sozinha em Marte. Uma tarefa de alta prioridade esperava uma trava presa por uma de baixa, enquanto tarefas médias ocupavam a CPU; um temporizador de segurança via o atraso e reiniciava o sistema. A correção foi ligar a herança de prioridade naquela trava, enviada da Terra. Hoje é opção comum: no Linux, PTHREAD_PRIO_INHERIT. Aqui, a resposta de H cai de ${resp(none)} para ${resp(inh)} ticks.`,
      facts: [
        ["Sem protocolo", `${resp(none)} ticks`],
        ["Herança", `${resp(inh)} ticks`],
        ["Teto", `${resp(ceil)} ticks`],
      ],
      highlight: [],
    },
    () => {
      c.count("espera", `${wNone} → ${wInh}`, {
        label: `espera: ${wNone} sem protocolo, ${wInh} com herança`,
        dt: 1,
      });
      c.count("resp", `${resp(none)} → ${resp(inh)}`, {
        label: `resposta: ${resp(none)} sem protocolo, ${resp(inh)} com herança`,
      });
    },
  );

  return b.done({
    waitNone: wNone,
    waitInherit: wInh,
    waitCeiling: wCeil,
    respNone: resp(none) ?? -1,
    respInherit: resp(inh) ?? -1,
    spinDone: res.spin.done ? "sim" : "não",
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "inversao-prioridade",
    site: "so",
    title: "Inversão de prioridade",
    summary:
      "Como uma tarefa de prioridade média pode atrasar indefinidamente uma de prioridade alta que espera uma trava presa por uma de prioridade baixa, por que a espera ocupada piora tudo, e como a herança e o teto de prioridade resolvem.",
    area: "Escalonamento",
    refs: [
      {
        book: "maziero-so",
        chapter: 7,
        section: "7.1",
        note: "Inversão e herança de prioridades",
        verified: true,
      },
      { book: "tanenbaum-mos", chapter: 2, section: "2.3.4", note: "Dormir e acordar", verified: true },
    ],
    simplifications: [
      "Uma CPU, três tarefas e uma trava; o tempo anda em ticks inteiros.",
      "Trocar de tarefa não custa nada, e prioridades iguais não se preemptam.",
      "No teto de prioridade, a tarefa sobe ao teto ao pegar a trava (a variante imediata).",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "media", kind: "int", label: "Duração de M (ticks)", min: 1, max: 20 },
      { key: "secao", kind: "int", label: "Seção crítica de L (ticks)", min: 2, max: 8 },
    ],
  },
  build,
  intro: {
    text: "A tarefa mais importante do sistema fica esperando, e quem a atrasa é uma tarefa que nem usa o recurso disputado. Você vai ver como isso acontece com prioridades e uma única trava, e duas formas de impedir.",
    facts: [
      ["Tarefas", "H, M e L"],
      ["Trava", "1, usada por H e L"],
      ["Protocolos", "4"],
    ],
  },
  outro: {
    title: "Inversão em resumo",
    text: "Quando uma tarefa de alta prioridade espera uma trava presa por outra de baixa, qualquer tarefa intermediária pode atrasá-la sem limite. Com espera ocupada, ela pode nunca terminar. A herança de prioridade empresta a prioridade de quem espera a quem segura a trava; o teto sobe quem pega a trava à maior prioridade possível. Nos dois casos, a espera fica limitada à seção crítica.",
    facts: (run) => [
      ["Espera sem protocolo", `${run.stats.waitNone} ticks`],
      ["Espera com herança", `${run.stats.waitInherit} ticks`],
      ["Resposta", `${run.stats.respNone} → ${run.stats.respInherit} ticks`],
    ],
  },
  next: ["escalonamento", "condicao-de-corrida"],
};

export default lesson;
