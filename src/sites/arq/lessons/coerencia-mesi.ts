import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import { incoherent, Mesi, type Op, pingPong, type State, type Step } from "../../../sim/arch/mesi.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Cache coherence on a shared bus: private caches disagree without a protocol, MESI states, snooping,
 * invalidation on write, the owner supplying a modified line, and false sharing.
 */
export const DEFAULTS = { escritas: 10, distancia: 8 };
const CPUS = 3;
const LINE = 64;
const OPS: Op[] = [
  { cpu: 0, kind: "R" },
  { cpu: 0, kind: "W", value: 1 },
  { cpu: 1, kind: "R" },
  { cpu: 2, kind: "R" },
  { cpu: 1, kind: "W", value: 2 },
  { cpu: 0, kind: "R" },
  { cpu: 2, kind: "W", value: 3 },
];
const STALE: Op[] = [
  { cpu: 0, kind: "R" },
  { cpu: 1, kind: "R" },
  { cpu: 0, kind: "W", value: 1 },
  { cpu: 1, kind: "R" },
];
const P = ["p1", "p2", "p3"] as const;
const ROLE: Record<State, Role> = { M: "bad", E: "crypto", S: "a", I: "muted" };

const opText = (o: Op) => `CPU ${o.cpu + 1} ${o.kind === "R" ? "lê x" : `escreve ${o.value}`}`;
const cellOf = (s: State, v: number | null) => (s === "I" ? "I" : `${s} x=${v}`);

function clamp(p: Params) {
  const writes = Math.min(40, Math.max(2, Math.round(Number(p.escritas ?? DEFAULTS.escritas))));
  const gap = Math.min(128, Math.max(4, Math.round(Number(p.distancia ?? DEFAULTS.distancia))));
  return { writes, gap };
}

function scene(): SceneSpec {
  const cpu = (id: string, n: number, x: number) => ({
    id,
    kind: "cpu" as const,
    label: `CPU ${n}`,
    sub: "com cache própria",
    at: [x, 90] as [number, number],
  });
  return {
    viewBox: [960, 600],
    nodes: [
      cpu("p1", 1, 180),
      cpu("p2", 2, 480),
      cpu("p3", 3, 780),
      { id: "bus", kind: "box", label: "Barramento", sub: "todos escutam", at: [480, 220] },
      { id: "mem", kind: "box", label: "Memória", sub: "x começa em 0", at: [480, 320] },
    ],
    links: [
      // Links leave the CPUs sideways so the state label under each CPU stays readable.
      {
        id: "l1",
        from: "p1",
        to: "bus",
        via: [
          [310, 90],
          [310, 220],
        ],
      },
      {
        id: "l2",
        from: "p2",
        to: "bus",
        via: [
          [400, 90],
          [400, 220],
        ],
      },
      {
        id: "l3",
        from: "p3",
        to: "bus",
        via: [
          [650, 90],
          [650, 220],
        ],
      },
      { id: "lm", from: "bus", to: "mem" },
    ],
    widgets: [
      {
        kind: "table",
        id: "trace",
        title: "Estado da linha de x em cada cache",
        at: [40, 384],
        columns: ["Operação", "CPU 1", "CPU 2", "CPU 3", "Memória", "Barramento"],
        widths: [118, 66, 66, 66, 66, 170],
        rows: OPS.length,
      },
      { kind: "counter", id: "tx", title: "Transações", at: [660, 384] },
      { kind: "counter", id: "wb", title: "Escritas na memória", at: [810, 384] },
      { kind: "counter", id: "sep", title: "Em linhas separadas", at: [660, 484] },
    ],
  };
}

export function build(p: Params) {
  const { writes, gap } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, { p1: "CPU 1", p2: "CPU 2", p3: "CPU 3", bus: "barramento", mem: "memória" }, (t) =>
    String(t),
  );

  const quiet = (target: string, text: string, role: Role) =>
    b.ev({ t: c.t, kind: "state", target, text, tone: "active", role, label: text });
  const clear = () => {
    for (let i = 0; i < OPS.length; i++) c.row("trace", i, ["", "", "", "", "", ""], { role: "muted" });
  };

  // Step 1: no protocol.
  const stale = incoherent(STALE, CPUS);
  const lastStale = stale[stale.length - 1];

  // Steps 2–5: MESI.
  const m = new Mesi(CPUS);
  const steps: Step[] = OPS.map((o) => m.run(o));
  const txAt = (k: number) => steps.slice(0, k).filter((s) => s.bus).length;
  const wbAt = (k: number) => steps.slice(0, k).filter((s) => s.memWrite).length;

  const show = (s: Step, i: number) => {
    const pi = P[s.op.cpu] ?? "p1";
    if (!s.bus) {
      c.note(pi, `${s.op.kind === "R" ? "acerto" : "E → M"}, sem barramento`, "good", { dt: 1 });
    } else {
      c.send(pi, "bus", s.bus, {
        role: s.bus === "BusRd" ? "a" : "warn",
        what: s.bus,
        detail: s.op.kind === "R" ? "pede a linha para ler" : "pede a linha para escrever",
      });
      if (s.flushedBy !== null) {
        const po = P[s.flushedBy] ?? "p1";
        c.send(po, "bus", `x = ${s.memory}`, {
          role: "bad",
          what: "flush",
          detail: "dona da linha em M responde",
        });
        c.send("bus", "mem", `x = ${s.memory}`, { dt: 0, role: "bad", what: "write-back" });
      }
      s.invalidated.forEach((j, k) => {
        c.send("bus", P[j] ?? "p1", "invalida", { dt: k === 0 ? 1 : 0, role: "bad", what: "invalidação" });
      });
      if (s.op.kind === "R" || s.bus === "BusRdX")
        c.send("bus", pi, `x = ${s.op.kind === "R" ? s.read : s.memory}`, {
          role: "a",
          what: "linha entregue",
          detail: s.flushedBy !== null ? `vinda da CPU ${s.flushedBy + 1}` : "vinda da memória",
        });
    }
    s.states.forEach((st, j) => {
      quiet(P[j] ?? "p1", cellOf(st, s.values[j] ?? null), ROLE[st]);
    });
    quiet("mem", `x = ${s.memory}`, "muted");
    c.row(
      "trace",
      i,
      [
        opText(s.op),
        ...s.states.map((st, j) => cellOf(st, s.values[j] ?? null)),
        String(s.memory),
        s.bus ? `${s.bus}${s.flushedBy !== null ? " + flush" : ""}` : "nenhuma",
      ],
      { mark: "new", role: s.bus ? "warn" : "crypto" },
    );
    c.count("tx", String(txAt(i + 1)), { label: `${txAt(i + 1)} transações` });
    c.count("wb", String(wbAt(i + 1)), { label: `${wbAt(i + 1)} escritas na memória` });
  };

  const sameLine = Math.floor(gap / LINE) === 0;
  const pp = pingPong(writes);
  const pingTx = sameLine ? pp.shared : pp.separate;
  const s3 = steps[2];
  const s5 = steps[4];

  b.step(
    {
      id: "s1-problema",
      title: "Duas caches, dois valores",
      subtitle: `CPU 2 lê ${lastStale?.read}, a CPU 1 tem ${lastStale?.values[0]}`,
      text: `Cada núcleo tem a sua [[cache]]. As CPUs 1 e 2 leem x = 0 e guardam uma cópia. A CPU 1 escreve ${STALE[2]?.value}, mas com write-back o valor fica só na cache dela, e a memória continua com 0. Quando a CPU 2 lê de novo, acerta na própria cache e obtém ${lastStale?.read}: um valor velho. Sem um protocolo de [[coerencia-de-cache]], programas com threads veriam a memória de jeitos diferentes em cada núcleo.`,
      facts: [
        ["CPU 1", `x = ${lastStale?.values[0]}`],
        ["CPU 2", `x = ${lastStale?.values[1]}`],
        ["Memória", `x = ${lastStale?.memory}`],
      ],
      highlight: ["p1", "p2"],
    },
    () => {
      clear();
      stale.forEach((s, i) => {
        const pi = P[s.op.cpu] ?? "p1";
        if (s.op.kind === "R" && i < 2) c.send("mem", pi, "x = 0", { role: "a", what: "lê da memória" });
        else
          c.note(
            pi,
            s.op.kind === "R" ? `lê ${s.read} da cache` : `escreve ${s.op.value} na cache`,
            s.op.kind === "R" ? "bad" : "info",
            { dt: 1 },
          );
        s.values.forEach((v, j) => {
          quiet(P[j] ?? "p1", v === null ? "vazia" : `x=${v}`, v === null ? "muted" : "a");
        });
        c.row(
          "trace",
          i,
          [
            opText(s.op),
            ...s.values.map((v) => (v === null ? "–" : `x=${v}`)),
            String(s.memory),
            "sem protocolo",
          ],
          {
            mark: i === stale.length - 1 ? "bad" : "new",
            role: i === stale.length - 1 ? "bad" : "muted",
            log: {
              who: `CPU ${s.op.cpu + 1}`,
              what: s.op.kind === "R" ? "lê x" : "escreve x",
              detail: s.op.kind === "R" ? `obtém ${s.read}` : `${s.op.value}, só na cache`,
            },
          },
        );
      });
    },
  );

  b.step(
    {
      id: "s2-estados",
      quiz: {
        kind: "choice",
        prompt: "A CPU 1 tem a linha de x em E e vai escrever. Ela precisa mandar algo pelo barramento?",
        options: [
          "Não: E garante que ninguém mais tem cópia",
          "Sim: um BusUpgr para invalidar os outros",
          "Sim: precisa gravar x na memória antes",
        ],
        answer: 0,
        explain:
          "Exclusiva quer dizer que a única cópia está nesta cache e que é igual à memória. Não há ninguém para invalidar, então a linha vai para M em silêncio. É a vantagem do E sobre um protocolo só com MSI.",
      },
      title: "Quatro estados: MESI",
      subtitle: "I → E → M sem usar o barramento",
      text: `No [[mesi]], cada linha de cada cache está em um de quatro estados: Modificada (só eu tenho, e a memória está velha), Exclusiva (só eu tenho, igual à memória), Compartilhada (outros podem ter) e Inválida. A CPU 1 lê x: ninguém mais tem a linha, então ela fica em E. Em seguida a CPU 1 escreve ${OPS[1]?.value}. Como E garante que não há outras cópias, ela passa a M sem avisar ninguém: zero tráfego no barramento.`,
      facts: [
        ["Depois da leitura", "E"],
        ["Depois da escrita", "M"],
        ["Transações", String(txAt(2))],
      ],
      highlight: ["p1"],
    },
    () => {
      clear();
      P.forEach((id) => {
        quiet(id, "I", "muted");
      });
      quiet("mem", "x = 0", "muted");
      steps.slice(0, 2).forEach((s, i) => {
        show(s, i);
      });
    },
  );

  b.step(
    {
      id: "s3-escuta",
      quiz: {
        kind: "pick",
        prompt: "A CPU 2 lê x e manda um BusRd. Quem tem o valor certo para entregar?",
        targets: [
          { id: "p1", label: "CPU 1" },
          { id: "p3", label: "CPU 3" },
          { id: "mem", label: "Memória" },
        ],
        answer: "p1",
        explain:
          "A CPU 1 está com a linha em M: escreveu 1 e ainda não devolveu à memória, que guarda o 0 antigo. Ela intervém, entrega o valor e a memória é atualizada junto.",
      },
      title: "Escutando o barramento",
      subtitle: `CPU ${(s3?.flushedBy ?? 0) + 1} entrega x = ${s3?.memory}`,
      text: `A CPU 2 lê x e manda um BusRd. Todas as caches [[escuta-de-barramento|escutam]] o barramento. A CPU 1 percebe que tem a linha em M, com o único valor certo: ela responde, a memória é atualizada para ${s3?.memory} e as duas cópias ficam S. Depois a CPU 3 lê; ninguém está em M, a memória responde e agora três caches compartilham a linha. Ler em paralelo é barato: as cópias são idênticas.`,
      facts: [
        ["Responde", `CPU ${(s3?.flushedBy ?? 0) + 1}, que estava em M`],
        ["Estados", "S, S, S"],
        ["Memória", `x = ${steps[3]?.memory}`],
      ],
      highlight: ["bus"],
    },
    () => {
      steps.slice(2, 4).forEach((s, i) => {
        show(s, i + 2);
      });
    },
  );

  b.step(
    {
      id: "s4-invalida",
      title: "Escrever invalida os outros",
      subtitle: `${s5?.invalidated.length} cópias invalidadas`,
      text: `A CPU 2 quer escrever ${OPS[4]?.value}, mas está em S: outras caches têm cópias que ficariam velhas. Ela manda um BusUpgr, um aviso de "vou escrever", sem dados. As CPUs ${s5?.invalidated.map((j) => j + 1).join(" e ")} marcam suas linhas como I, e a CPU 2 passa a M. A memória continua com ${s5?.memory}; só a CPU 2 tem o valor novo. Esse é o protocolo por invalidação: quem escreve fica com a única cópia.`,
      facts: [
        ["Pedido", "BusUpgr"],
        ["Invalidadas", String(s5?.invalidated.length)],
        ["Memória", `x = ${s5?.memory}, desatualizada`],
      ],
      highlight: ["p2"],
      quiz: {
        kind: "number",
        prompt: "Quantas caches passam para o estado I quando a CPU 2 escreve?",
        answer: s5?.invalidated.length ?? 0,
        explain: `As outras ${s5?.invalidated.length} que tinham a linha em S.`,
      },
    },
    () => {
      if (s5) show(s5, 4);
    },
  );

  b.step(
    {
      id: "s5-dono",
      title: "Quem tem M responde",
      subtitle: `${m.transactions} transações em ${OPS.length} acessos`,
      text: `A CPU 1 lê de novo: perdeu a linha, manda BusRd, e a CPU ${(steps[5]?.flushedBy ?? 0) + 1}, dona em M, entrega ${steps[5]?.read} e atualiza a memória. Por fim a CPU 3 escreve ${OPS[6]?.value} partindo de I: um BusRdX, leitura com intenção de modificar, invalida as duas cópias de uma vez. Nos ${OPS.length} acessos houve ${m.transactions} transações e ${m.memWrites} escritas na memória; a memória só é escrita quando alguém precisa do valor, não a cada escrita.`,
      facts: [
        ["Acessos", String(OPS.length)],
        ["Transações", String(m.transactions)],
        ["Escritas na memória", String(m.memWrites)],
      ],
      highlight: ["p3"],
    },
    () => {
      steps.slice(5).forEach((s, i) => {
        show(s, i + 5);
      });
    },
  );

  b.step(
    {
      id: "s6-falso",
      title: "Compartilhamento falso",
      subtitle: sameLine ? `${pp.shared} contra ${pp.separate} transações` : `${gap} bytes: linhas separadas`,
      text: sameLine
        ? `Agora as CPUs 1 e 2 alternam ${writes} escritas em variáveis diferentes, a e b, a ${gap} bytes uma da outra. A coerência trabalha com linhas de ${LINE} bytes, e as duas caem na mesma linha: cada escrita a rouba da outra cache, ${pp.shared} transações. Com as variáveis em linhas separadas seriam ${pp.separate}. É o [[compartilhamento-falso]], resolvido afastando as variáveis com [[preenchimento]] até a próxima linha.`
        : `Agora as CPUs 1 e 2 alternam ${writes} escritas em variáveis diferentes, a e b, a ${gap} bytes uma da outra. Como a linha tem ${LINE} bytes, elas caem em linhas separadas: cada CPU erra uma vez e depois escreve em M sem tráfego, ${pp.separate} transações. Na mesma linha seriam ${pp.shared}, o [[compartilhamento-falso]]. O [[preenchimento]] até ${LINE} bytes evita esse custo.`,
      facts: [
        ["Distância", `${gap} bytes`],
        ["Mesma linha", sameLine ? "sim" : "não"],
        ["Transações", String(pingTx)],
      ],
      highlight: ["p1", "p2"],
    },
    () => {
      clear();
      quiet("p3", "fora", "muted");
      const shown = Math.min(writes, OPS.length);
      for (let k = 0; k < shown; k++) {
        const cpu = k % 2;
        const miss = sameLine || k < 2;
        if (miss) {
          c.send(P[cpu] ?? "p1", "bus", "BusRdX", {
            role: "warn",
            what: "BusRdX",
            detail: `escreve ${cpu ? "b" : "a"}`,
          });
          if (sameLine && k > 0)
            c.send("bus", P[1 - cpu] ?? "p1", "invalida", { role: "bad", what: "invalidação" });
        } else c.note(P[cpu] ?? "p1", "M: acerto", "good", { dt: 1 });
        quiet(P[cpu] ?? "p1", `M ${cpu ? "b" : "a"}`, "bad");
        if (sameLine) quiet(P[1 - cpu] ?? "p1", "I", "muted");
        c.row(
          "trace",
          k,
          [
            `CPU ${cpu + 1} escreve ${cpu ? "b" : "a"}`,
            cpu ? (sameLine ? "I" : "M") : "M",
            cpu ? "M" : sameLine && k > 0 ? "I" : k > 0 ? "M" : "I",
            "",
            "",
            miss ? "BusRdX" : "nenhuma",
          ],
          { mark: miss ? "miss" : "hit", role: miss ? "warn" : "crypto" },
        );
      }
      c.count("tx", String(pingTx), { label: `${pingTx} transações em ${writes} escritas`, dt: 1 });
      c.count("sep", String(pp.separate), { label: `${pp.separate} com linhas separadas` });
    },
  );

  return b.done({
    stale: lastStale?.read ?? -1,
    transactions: m.transactions,
    memWrites: m.memWrites,
    invalidated: s5?.invalidated.length ?? 0,
    shared: pp.shared,
    separate: pp.separate,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "coerencia-mesi",
    site: "arq",
    title: "Coerência de cache: MESI",
    summary:
      "Por que núcleos com caches próprias podem ver valores diferentes da mesma variável, e como o protocolo MESI resolve isso escutando o barramento, invalidando cópias e entregando a linha modificada; e o custo do compartilhamento falso.",
    area: "Paralelismo",
    refs: [
      {
        book: "tanenbaum-sco",
        chapter: 8,
        section: "8.3.3",
        note: "Multiprocessadores simétricos UMA: caches de escuta e MESI",
        verified: true,
      },
    ],
    simplifications: [
      "Um barramento único que todos escutam; processadores atuais usam diretórios e redes no chip.",
      "Uma só linha de cache acompanhada; cada operação termina antes da próxima começar.",
      "A linha entregue pela dona em M também atualiza a memória, como no MESI descrito no livro; variantes como MOESI evitam essa escrita.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "escritas", kind: "int", label: "Escritas alternadas no passo 6", min: 2, max: 40 },
      {
        key: "distancia",
        kind: "int",
        label: "Distância entre a e b (bytes)",
        min: 4,
        max: 128,
        help: `A partir de ${LINE}, as variáveis ficam em linhas diferentes.`,
      },
    ],
  },
  build,
  intro: {
    text: "Três núcleos, cada um com a sua cache, compartilham a mesma variável x. Se um deles escreve, como os outros ficam sabendo? Você vai acompanhar cada cópia da linha mudar de estado a cada leitura e escrita.",
    facts: [
      ["CPUs", String(CPUS)],
      ["Linha", `${LINE} bytes`],
      ["Estados", "M, E, S, I"],
    ],
  },
  outro: {
    title: "Coerência em resumo",
    text: "Sem protocolo, caches privadas guardam valores velhos. O MESI marca cada linha como Modificada, Exclusiva, Compartilhada ou Inválida, e todas as caches escutam o barramento: quem escreve invalida as outras cópias, e quem tem a linha modificada a entrega quando alguém pede. Variáveis independentes na mesma linha disputam a linha mesmo sem compartilhar dados.",
    facts: (run) => [
      ["Transações", String(run.stats.transactions)],
      ["Escritas na memória", String(run.stats.memWrites)],
      ["Falso compartilhamento", `${run.stats.shared} contra ${run.stats.separate}`],
    ],
  },
  next: ["cache-direta", "pipeline"],
};

export default lesson;
