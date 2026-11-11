import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { spreadRow } from "../../../scene/geometry.ts";
import { CONTAINERS, cgroupRun, kernelsRun, MEM_LIMIT, MICRO_PATH } from "../../../sim/os/kernels.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Kernel architectures and containers: the same read() as one system call in a monolithic kernel
 * and as four IPC messages in a microkernel; what a driver crash does in each; then containers,
 * which share one kernel and get separate views from namespaces and limits from cgroups.
 */
export const DEFAULTS = { troca: 150, uso: 300 };

function clamp(p: Params) {
  const sw = Math.min(1000, Math.max(50, Math.round(Number(p.troca ?? DEFAULTS.troca))));
  const use = Math.min(400, Math.max(64, Math.round(Number(p.uso ?? DEFAULTS.uso))));
  return { sw, use };
}

function scene(): SceneSpec {
  return {
    viewBox: [960, 640],
    zones: [
      { id: "zm", title: "Monolítico", rect: { x: 20, y: 20, w: 400, h: 250 }, tone: "kernel" },
      { id: "zu", title: "Micronúcleo", rect: { x: 440, y: 20, w: 500, h: 250 }, tone: "user" },
    ],
    nodes: [
      { id: "app_m", kind: "process", label: "Aplicação", sub: "modo usuário", at: [130, 90], w: 160 },
      {
        id: "kern_m",
        kind: "kernel",
        label: "Núcleo",
        sub: "arquivos, drivers, rede",
        at: [240, 210],
        w: 300,
      },
      // Three boxes share the zone's width; "servidor" keeps them from touching.
      ...spreadRow(
        [
          { id: "app_u", kind: "process", label: "Aplicação", sub: "modo usuário", at: [0, 0] },
          { id: "fs_u", kind: "process", label: "Arquivos", sub: "servidor", at: [0, 0], w: 140 },
          { id: "drv_u", kind: "process", label: "Driver", sub: "servidor", at: [0, 0], w: 140 },
        ],
        { x0: 450, x1: 930, y: 90, rowGap: 0 },
      ).nodes,
      {
        id: "kern_u",
        kind: "kernel",
        label: "Micronúcleo",
        sub: "IPC, escalonador, memória",
        at: [690, 210],
        w: 300,
      },
    ],
    links: [
      { id: "l-m", from: "app_m", to: "kern_m" },
      { id: "l-ua", from: "app_u", to: "kern_u" },
      { id: "l-uf", from: "fs_u", to: "kern_u" },
      { id: "l-ud", from: "drv_u", to: "kern_u" },
    ],
    widgets: [
      { kind: "counter", id: "trocas_m", title: "Trocas de modo (monolítico)", at: [40, 290] },
      { kind: "counter", id: "trocas_u", title: "Trocas de modo (micronúcleo)", at: [460, 290] },
      {
        kind: "table",
        id: "pids",
        title: "Os mesmos processos, vistos de dois lugares",
        at: [40, 370],
        columns: ["Processo", "Contêiner", "PID no host", "PID lá dentro"],
        widths: [200, 140, 160, 160],
        rows: CONTAINERS.length,
      },
      { kind: "counter", id: "mem", title: `Memória do banco (limite ${MEM_LIMIT} MiB)`, at: [740, 380] },
      {
        kind: "table",
        id: "cmp",
        title: "Isolamento",
        at: [40, 520],
        columns: ["Forma", "Núcleo", "Isola", "Começa em"],
        widths: [170, 250, 260, 170],
        rows: 2,
      },
    ],
  };
}

export function build(p: Params) {
  const { sw, use } = clamp(p);
  const k = kernelsRun(sw);
  const cg = cgroupRun(use);
  const b = lessonBuilder();
  const c = talk(
    b,
    {
      app_m: "aplicação",
      kern_m: "núcleo",
      app_u: "aplicação",
      fs_u: "arquivos",
      drv_u: "driver",
      kern_u: "micronúcleo",
    },
    (t) => `t${t}`,
  );
  const inside = new Map<string, number>();
  const pidIn = CONTAINERS.map((x) => {
    const n = (inside.get(x.name) ?? 0) + 1;
    inside.set(x.name, n);
    return n;
  });

  b.step(
    {
      id: "s1-monolitico",
      title: "Tudo dentro do núcleo",
      subtitle: `${k.mono.switches} trocas de modo`,
      text: `Num [[nucleo-monolitico|núcleo monolítico]], como o Linux, sistema de arquivos, drivers e rede rodam todos no modo privilegiado, no mesmo espaço de endereços. Um read() é uma chamada de sistema: a aplicação entra no núcleo, ele faz tudo com chamadas de função comuns e volta. São ${k.mono.switches} trocas de modo, ${k.mono.ns} ns se cada uma custar ${sw} ns.`,
      facts: [
        ["Chamadas de sistema", "1"],
        ["Trocas de modo", String(k.mono.switches)],
        ["Custo", `${k.mono.ns} ns`],
      ],
      highlight: ["kern_m", "app_m"],
    },
    () => {
      c.send("app_m", "kern_m", "read()", { what: "chamada", detail: "entra no núcleo" });
      c.state("kern_m", "arquivos → driver → disco", { tone: "active" });
      c.send("kern_m", "app_m", "dados", { role: "b", what: "retorno", detail: "volta ao usuário" });
      c.count("trocas_m", String(k.mono.switches), { label: `${k.mono.switches} trocas` });
    },
  );

  b.step(
    {
      id: "s2-micronucleo",
      title: "Serviços como processos",
      subtitle: `${k.micro.msgs} mensagens`,
      text: `Num [[micronucleo|micronúcleo]], só o mínimo fica no modo privilegiado: troca de mensagens, escalonamento e memória. Arquivos e driver viram processos comuns. O mesmo read() vira ${k.micro.msgs} mensagens: aplicação para arquivos, arquivos para driver e as duas respostas. Cada mensagem passa pelo micronúcleo, com duas trocas de modo: ${k.micro.switches} no total, ${k.micro.ns} ns.`,
      facts: [
        ["Mensagens", String(k.micro.msgs)],
        ["Trocas de modo", String(k.micro.switches)],
        ["Custo", `${k.micro.ns} ns`],
      ],
      highlight: ["kern_u", "fs_u", "drv_u"],
      quiz: {
        kind: "number",
        prompt: `No micronúcleo, o read() vira ${k.micro.msgs} mensagens, cada uma com 2 trocas de modo de ${sw} ns. Quantos ns só de trocas?`,
        answer: k.micro.ns,
        unit: "ns",
        explain: `${k.micro.msgs} × 2 × ${sw} = ${k.micro.ns} ns, contra ${k.mono.ns} ns no monolítico. É o preço de separar os serviços.`,
      },
    },
    () => {
      for (const [from, to, what] of MICRO_PATH) {
        c.send(from, "kern_u", what, { what: "mensagem", detail: `de ${from.replace("_u", "")}` });
        c.send("kern_u", to, what, { role: "b", what: "entrega", detail: `para ${to.replace("_u", "")}` });
      }
      c.count("trocas_u", String(k.micro.switches), { label: `${k.micro.switches} trocas` });
    },
  );

  b.step(
    {
      id: "s3-falha",
      title: "Quando o driver falha",
      subtitle: "Onde o erro fica",
      text: `Agora o driver de disco tem um defeito e acessa um endereço inválido. No monolítico, ele roda dentro do núcleo: o erro derruba o sistema inteiro. No micronúcleo, o driver é um processo como outro qualquer: ele cai, o micronúcleo percebe e o reinicia, e o resto continua. Na prática, Linux, Windows e macOS ficam no meio, com módulos ou partes [[nucleo-hibrido|híbridas]].`,
      facts: [
        ["Monolítico", "o sistema cai"],
        ["Micronúcleo", "o driver reinicia"],
        ["Exemplos de micro", "MINIX 3, seL4, QNX"],
      ],
      highlight: ["kern_m", "drv_u"],
      quiz: {
        kind: "choice",
        prompt: "Por que um defeito no driver não derruba o micronúcleo?",
        options: [
          "O driver roda como processo, no modo usuário, com memória própria",
          "Porque o micronúcleo não usa drivers",
          "Porque o micronúcleo confere cada instrução do driver",
        ],
        answer: 0,
        explain:
          "Fora do modo privilegiado, um acesso inválido do driver gera uma falta tratada como a de qualquer processo. No monolítico, o mesmo acesso acontece dentro do núcleo.",
      },
    },
    () => {
      c.state("kern_m", "erro no driver: sistema cai", { tone: "bad" });
      c.state("drv_u", "erro: processo encerrado", { tone: "bad" });
      c.state("drv_u", "reiniciado", { tone: "good" });
      c.state("kern_u", "continua", { tone: "good", dt: 0 });
    },
  );

  b.step(
    {
      id: "s4-namespaces",
      title: "Contêineres: o mesmo núcleo",
      subtitle: "Namespaces",
      text: `Um [[conteiner|contêiner]] não tem núcleo próprio: são processos comuns do host, que o núcleo põe em [[namespace|namespaces]] separados. Cada namespace dá uma visão própria de um recurso: PIDs, sistemas de arquivos montados, rede, usuários. O nginx é o PID ${CONTAINERS[0].hostPid} para o host, mas, dentro do contêiner web, ele se vê como PID 1, e não enxerga o postgres do lado.`,
      facts: [
        ["Núcleos", "1, compartilhado"],
        ["nginx no host", String(CONTAINERS[0].hostPid)],
        ["nginx lá dentro", "1"],
      ],
      highlight: ["pids"],
      quiz: {
        kind: "choice",
        prompt: "Um contêiner tem o próprio núcleo?",
        options: [
          "Não: seus processos rodam no núcleo do host, com visões separadas",
          "Sim: cada contêiner carrega um núcleo mínimo",
          "Sim, igual a uma máquina virtual",
        ],
        answer: 0,
        explain:
          "É isso que torna o contêiner leve: não há núcleo para iniciar. E é também por isso que um defeito no núcleo afeta todos os contêineres.",
      },
    },
    () => {
      CONTAINERS.forEach((x, i) => {
        c.row("pids", i, [x.proc, x.name, String(x.hostPid), String(pidIn[i])], { dt: 1, mark: "new" });
      });
    },
  );

  b.step(
    {
      id: "s5-cgroups",
      title: "Limites com cgroups",
      subtitle: cg.killed ? "O banco passou do limite" : "Dentro do limite",
      text: cg.killed
        ? `Namespaces separam o que cada um vê; [[cgroup|cgroups]] limitam o que cada um usa: CPU, memória, E/S. O contêiner banco tem limite de ${MEM_LIMIT} MiB e tenta usar ${use}. O núcleo encerra um processo dele por falta de memória, e só dele: o contêiner web nem percebe. Sem o limite, o banco disputaria a memória do host com todos.`
        : `Namespaces separam o que cada um vê; [[cgroup|cgroups]] limitam o que cada um usa: CPU, memória, E/S. O contêiner banco tem limite de ${MEM_LIMIT} MiB e usa ${use}, abaixo dele. Se passasse, o núcleo encerraria um processo dele por falta de memória, e só dele, sem afetar o contêiner web.`,
      facts: [
        ["Limite", `${MEM_LIMIT} MiB`],
        ["Uso", `${use} MiB`],
        ["Encerrado?", cg.killed ? "sim, só no banco" : "não"],
      ],
      highlight: ["mem", "pids"],
    },
    () => {
      c.count("mem", `${use} MiB`, { label: `${use} de ${MEM_LIMIT} MiB` });
      if (cg.killed) c.row("pids", 2, ["postgres", "banco", "—", "encerrado"], { dt: 1, mark: "bad" });
      else
        c.row("pids", 2, ["postgres", "banco", String(CONTAINERS[2].hostPid), "1"], { dt: 1, mark: "hit" });
    },
  );

  b.step(
    {
      id: "s6-vm",
      title: "Contêiner ou máquina virtual",
      subtitle: "Quanto cada um isola",
      text: `Uma máquina virtual tem núcleo próprio sobre um [[hipervisor|hipervisor]]: isola mais, mas leva segundos para começar e gasta a memória de um sistema inteiro. Um contêiner começa em milissegundos, mas todos dividem o mesmo núcleo, e uma falha nele afeta todos. Por isso nuvens públicas costumam rodar contêineres de clientes diferentes dentro de máquinas virtuais.`,
      facts: [
        ["VM", "núcleo próprio"],
        ["Contêiner", "núcleo do host"],
        ["Clientes diferentes", "contêiner dentro de VM"],
      ],
      highlight: ["cmp"],
    },
    () => {
      c.row("cmp", 0, ["Máquina virtual", "próprio, sobre hipervisor", "até o núcleo", "segundos"], {
        dt: 1,
        mark: "hit",
      });
      c.row("cmp", 1, ["Contêiner", "o do host, compartilhado", "visões e limites", "milissegundos"], {
        dt: 1,
        mark: "new",
      });
    },
  );

  return b.done({ mono: k.mono.ns, micro: k.micro.ns, msgs: k.micro.msgs, killed: cg.killed ? 1 : 0 });
}

const lesson: LessonModule = {
  meta: {
    slug: "conteineres",
    site: "so",
    title: "Arquiteturas de núcleo e contêineres",
    summary:
      "O mesmo read() num núcleo monolítico e num micronúcleo, o que acontece quando um driver falha em cada um, e como contêineres dividem um único núcleo com namespaces e cgroups.",
    area: "Virtualização e distribuição",
    refs: [
      { book: "maziero-so", chapter: 3, section: "3.2", note: "Sistemas micronúcleo", verified: true },
      {
        book: "maziero-so",
        chapter: 3,
        section: "3.5",
        note: "Arquiteturas avançadas e contêineres",
        verified: true,
      },
      { book: "tanenbaum-mos", chapter: 1, section: "1.7.1", note: "Sistemas monolíticos", verified: true },
      { book: "tanenbaum-mos", chapter: 1, section: "1.7.3", note: "Micronúcleos", verified: true },
    ],
    simplifications: [
      "O custo de uma mensagem é só o das duas trocas de modo; cópias e escalonamento ficam de fora.",
      "No micronúcleo, o disco aparece só pelo driver; o hardware não está na cena.",
      "Namespaces e cgroups aparecem pelos efeitos, sem a interface do núcleo.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "troca", kind: "int", label: "Custo de uma troca de modo (ns)", min: 50, max: 1000 },
      {
        key: "uso",
        kind: "int",
        label: `Memória que o banco tenta usar (MiB, limite ${MEM_LIMIT})`,
        min: 64,
        max: 400,
      },
    ],
  },
  build,
  intro: {
    text: "Onde ficam o sistema de arquivos e os drivers? Dentro do núcleo, ou como processos? Você vai seguir o mesmo read() nas duas arquiteturas, ver o que uma falha de driver causa e depois como contêineres isolam programas sem núcleo próprio.",
    facts: [
      ["Arquiteturas", "monolítica e micronúcleo"],
      ["Pedido", "um read()"],
      ["Contêineres", "web e banco"],
    ],
  },
  outro: {
    title: "Núcleos e contêineres em resumo",
    text: "O núcleo monolítico é rápido porque tudo está junto, e frágil pelo mesmo motivo. O micronúcleo isola serviços como processos e paga em mensagens. Contêineres são processos do host com visões separadas por namespaces e limites impostos por cgroups; isolam menos que uma máquina virtual, mas começam em milissegundos.",
    facts: (r) => [
      ["read() monolítico", `${r.stats.mono} ns`],
      ["read() micronúcleo", `${r.stats.micro} ns`],
      ["Banco encerrado", r.stats.killed === 1 ? "sim" : "não"],
    ],
  },
  next: ["virtualizacao", "chamada-de-sistema", "controle-de-acesso"],
};

export default lesson;
