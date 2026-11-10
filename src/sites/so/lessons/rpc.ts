import type { LessonModule, Params } from "../../../contracts/types.ts";
import {
  type Attempt,
  type Costs,
  deposit,
  hex,
  marshal,
  remoteCost,
  unmarshal,
} from "../../../sim/os/rpc.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { seqScene, talk } from "../../../sim/shared/seq.ts";
import { rpc as practice } from "../practice.ts";

/**
 * RPC: a cash machine calls deposita(conta, valor) on the bank server. Stubs, big-endian
 * marshaling, the cost against a local call, and a lost reply under two retry semantics.
 */
const CALL = { proc: 3, args: [4242, 100] };
export const DEFAULTS = { rede: "400" };
const NETS: Record<string, string> = {
  "50": "no mesmo rack",
  "400": "no mesmo datacenter",
  "30000": "entre duas cidades",
};
const netOf = (p: Params) => (String(p.rede) in NETS ? String(p.rede) : DEFAULTS.rede);
const costsFor = (rtt: number): Costs => ({ local: 0.005, marshal: 2, rtt, server: 3 });
const START = 500;

const scene = seqScene(
  [
    { id: "app", kind: "laptop", label: "Caixa eletrônico", sub: "deposita(4242, 100)" },
    { id: "stubc", kind: "process", label: "Stub do cliente", sub: "empacota" },
    { id: "stubs", kind: "process", label: "Stub do servidor", sub: "desempacota" },
    { id: "banco", kind: "server", label: "Servidor do banco", sub: "deposita()" },
  ],
  {
    height: 600,
    widgets: [
      {
        kind: "table",
        id: "bytes",
        title: "A chamada em bytes (32 bits, big-endian)",
        at: [40, 230],
        columns: ["Campo", "Valor", "Bytes"],
        widths: [130, 80, 150],
        rows: 3,
      },
      {
        kind: "table",
        id: "custo",
        title: "Quanto custa uma chamada (µs)",
        at: [440, 230],
        columns: ["Parte", "µs"],
        widths: [280, 100],
        rows: 4,
      },
      {
        kind: "table",
        id: "tentativas",
        title: `Resposta perdida, saldo inicial ${START}`,
        at: [40, 420],
        columns: ["Semântica", "Tentativa", "Executou?", "Saldo"],
        widths: [190, 90, 210, 80],
        rows: 4,
      },
    ],
  },
);

const dec = (x: number) => String(x).replace(".", ",");

export function build(p: Params = DEFAULTS) {
  const net = netOf(p);
  const COSTS = costsFor(Number(net));
  const where = NETS[net] as string;
  const b = lessonBuilder();
  const c = talk(b, {
    app: "Caixa",
    stubc: "Stub do cliente",
    stubs: "Stub do servidor",
    banco: "Banco",
  });
  const bytes = marshal(CALL);
  const back = unmarshal(bytes);
  const remote = remoteCost(COSTS);
  const ratio = Math.round(remote / COSTS.local);
  const least = deposit("at-least-once", START, CALL.args[1] as number, [1]);
  const most = deposit("at-most-once", START, CALL.args[1] as number, [1]);
  const word = (i: number) => hex(bytes.slice(i * 4, i * 4 + 4));
  const conta = word(1);
  const tries = (rows: Attempt[], label: string, base: number) => {
    rows.forEach((a, i) => {
      c.send("stubc", "stubs", `pedido #1, tentativa ${a.attempt}`, {
        role: a.attempt > 1 ? "warn" : "a",
        detail: a.attempt > 1 ? "a resposta não veio: reenvia" : "",
      });
      if (a.executed) c.send("stubs", "banco", "deposita", { role: "a", detail: `saldo ${a.balance}` });
      c.send("stubs", "stubc", `resposta: saldo ${a.balance}`, {
        role: a.replyLost ? "bad" : "b",
        ...(a.replyLost
          ? { lost: true, detail: "perdida na rede" }
          : a.executed
            ? {}
            : { detail: "da memória de pedidos" }),
      });
      c.row(
        "tentativas",
        base + i,
        [label, String(a.attempt), a.executed ? "sim" : "não, repete a resposta", String(a.balance)],
        {
          dt: 0,
          mark: a.executed && a.attempt > 1 ? "bad" : a.executed ? "new" : "hit",
        },
      );
    });
  };
  const finalLeast = (least[least.length - 1] as Attempt).balance;
  const finalMost = (most[most.length - 1] as Attempt).balance;

  b.step(
    {
      id: "s1-stubs",
      title: "Parece uma chamada local",
      subtitle: "Os stubs fazem o resto",
      text: `O caixa chama deposita(4242, 100) como se a função estivesse no próprio programa. Essa é a ideia da [[rpc]]: quem chama não escreve código de rede. Um [[stub]] do cliente, gerado a partir da interface, recebe os argumentos, empacota e envia; o stub do servidor desempacota, chama a função de verdade e devolve o resultado pelo mesmo caminho. Quem programa o caixa vê só a chamada e o retorno.`,
      facts: [
        ["Chamada", "deposita(4242, 100)"],
        ["Gerado da interface", "os dois stubs"],
        ["Programador vê", "uma função"],
      ],
      highlight: ["app", "stubc", "stubs", "banco"],
    },
    () => {
      c.send("app", "stubc", "deposita(4242, 100)", { role: "a", detail: "chamada comum" });
      c.send("stubc", "stubs", "pedido", { role: "a", detail: `${bytes.length} bytes` });
      c.send("stubs", "banco", "deposita(4242, 100)", { role: "a" });
      c.send("banco", "stubs", `saldo ${START + (CALL.args[1] as number)}`, { role: "b" });
      c.send("stubs", "stubc", "resposta", { role: "b" });
      c.send("stubc", "app", `saldo ${START + (CALL.args[1] as number)}`, {
        role: "b",
        detail: "retorno comum",
      });
    },
  );

  b.step(
    {
      id: "s2-empacotar",
      title: "Os argumentos viram bytes",
      subtitle: `${bytes.length} bytes, o mais significativo antes`,
      text: `Cliente e servidor podem ter CPUs diferentes: um x86 guarda inteiros com o byte menos significativo primeiro, outras máquinas ao contrário. O [[empacotamento]] resolve isso fixando um formato de rede: cada número vai em 32 bits, [[big-endian]]. O procedimento 3 vira ${word(0)}, a conta 4242 vira ${conta} e o valor 100 vira ${word(2)}. O stub do servidor lê os ${bytes.length} bytes de volta e obtém ${back.args.join(" e ")}.`,
      facts: [
        ["Procedimento", word(0)],
        ["Conta 4242", conta],
        ["Valor 100", word(2)],
      ],
      highlight: ["stubc", "stubs"],
      quiz: {
        kind: "choice",
        prompt: "Em 32 bits big-endian, como vai o número 4242 (0x1092)?",
        options: [conta, "92 10 00 00", "10 92 00 00"],
        answer: 0,
        explain: `Big-endian põe o byte mais significativo primeiro: 4242 = 0x00001092, ou ${conta}.`,
      },
    },
    () => {
      const names = ["Procedimento", "Conta", "Valor"];
      [CALL.proc, ...CALL.args].forEach((v, i) => {
        c.row("bytes", i, [names[i] as string, String(v), word(i)], { dt: i === 0 ? 1 : 0, mark: "new" });
      });
    },
  );

  b.step(
    {
      id: "s3-custo",
      title: "Remota custa caro",
      subtitle: `${remote.toLocaleString("pt-BR")} µs contra ${dec(COSTS.local)} µs`,
      text: `A semelhança com uma chamada local acaba no tempo. Uma chamada comum custa uns ${dec(COSTS.local)} µs. A remota soma empacotar e desempacotar dos dois lados, ${COSTS.marshal} µs cada, a ida e volta na rede ${where}, ${COSTS.rtt.toLocaleString("pt-BR")} µs, e a execução no servidor, ${COSTS.server} µs: ${remote.toLocaleString("pt-BR")} µs, cerca de ${ratio.toLocaleString("pt-BR")} vezes mais. Um laço que faz mil chamadas remotas pequenas fica lento; agrupar o trabalho numa chamada só resolve.`,
      facts: [
        ["Local", `${dec(COSTS.local)} µs`],
        ["Remota", `${remote.toLocaleString("pt-BR")} µs`],
        ["Razão", `${ratio.toLocaleString("pt-BR")} ×`],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Empacotar e desempacotar custam ${COSTS.marshal} µs de cada lado, a ida e volta ${where} ${COSTS.rtt.toLocaleString("pt-BR")} µs e o servidor ${COSTS.server} µs. Quantos µs leva a chamada remota?`,
        answer: remote,
        tolerance: 0,
        unit: "µs",
        explain: `2 × ${COSTS.marshal} + ${COSTS.rtt.toLocaleString("pt-BR")} + ${COSTS.server} = ${remote.toLocaleString("pt-BR")} µs. A rede domina; o empacotamento quase não aparece.`,
      },
    },
    () => {
      const rows: [string, number][] = [
        ["Empacotar e desempacotar (2 lados)", 2 * COSTS.marshal],
        ["Ida e volta na rede", COSTS.rtt],
        ["Execução no servidor", COSTS.server],
        ["Total remoto", remote],
      ];
      rows.forEach(([k, v], i) => {
        c.row("custo", i, [k, String(v)], { dt: i === 0 ? 1 : 0, mark: i === 3 ? "warn" : "new" });
      });
    },
  );

  b.step(
    {
      id: "s4-falhas",
      title: "A resposta se perdeu",
      subtitle: `Saldo ${finalLeast} ou ${finalMost}`,
      text: `Agora a resposta do primeiro depósito se perde. O stub do cliente não sabe se o pedido chegou e reenvia. Com a semântica [[pelo-menos-uma-vez]], o servidor executa de novo e o saldo vai a ${finalLeast}: 100 a mais do que o cliente pediu. Com [[no-maximo-uma-vez]], o servidor guarda o número de cada pedido já executado, reconhece a repetição e só reenvia a resposta: o saldo fica em ${finalMost}.`,
      facts: [
        ["Pelo menos uma vez", `saldo ${finalLeast}`],
        ["No máximo uma vez", `saldo ${finalMost}`],
        ["Chave", "número do pedido"],
      ],
      highlight: ["stubc", "stubs"],
      quiz: {
        kind: "choice",
        prompt: 'Para qual operação reenviar com "pelo menos uma vez" não causa problema?',
        options: ["Consultar o saldo", "Depositar 100", "Transferir 50"],
        answer: 0,
        explain:
          "Consultar é idempotente: executar duas vezes dá o mesmo resultado. Depositar e transferir mudam o estado a cada execução.",
      },
    },
    () => {
      tries(least, "Pelo menos uma vez", 0);
      tries(most, "No máximo uma vez", least.length);
    },
  );

  b.step(
    {
      id: "s5-hoje",
      title: "RPC hoje",
      subtitle: "Interface, gerador e prazo",
      text: "Sistemas atuais como gRPC seguem a mesma receita: a interface é escrita numa linguagem própria, um gerador produz os stubs e o formato de rede é fixo, em gRPC o Protocol Buffers. Duas práticas vêm das falhas que vimos: toda chamada tem um prazo, para o cliente não esperar para sempre, e operações que mudam estado levam uma chave de idempotência, o mesmo número de pedido do passo anterior.",
      facts: [
        ["Exemplo", "gRPC"],
        ["Formato", "Protocol Buffers"],
        ["Práticas", "prazo, chave de idempotência"],
      ],
      highlight: ["app", "banco"],
    },
    () => {
      c.state("banco", "guarda os números de pedido", { tone: "good", label: "memória de pedidos" });
    },
  );

  return b.done(
    { bytes: hex(bytes), remote, ratio, finalLeast, finalMost },
    net === DEFAULTS.rede
      ? []
      : [
          `Com a rede ${where}, a chamada remota leva ${remote.toLocaleString("pt-BR")} µs, ${ratio.toLocaleString("pt-BR")} vezes a local.`,
        ],
  );
}

const lesson: LessonModule = {
  meta: {
    slug: "rpc",
    site: "so",
    title: "RPC: chamar uma função em outra máquina",
    summary:
      "Stubs, empacotamento em big-endian, o custo contra uma chamada local e o que acontece quando a resposta se perde.",
    area: "Virtualização e distribuição",
    refs: [
      {
        book: "tanenbaum-mos",
        chapter: 8,
        section: "8.2.4",
        note: "Chamada de procedimento remoto",
        verified: true,
      },
      {
        book: "tanenbaum-cn",
        chapter: 6,
        section: "6.4.2",
        note: "Chamada de procedimentos remotos",
        verified: true,
      },
    ],
    simplifications: [
      "O formato é o mais simples possível, só inteiros de 32 bits, como no XDR; não há cabeçalho de transporte.",
      "Os custos são valores típicos de ordem de grandeza, não medidas de uma máquina.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "rede",
        kind: "choice",
        label: "Distância até o servidor",
        options: Object.entries(NETS).map(([v, l]) => ({
          value: v,
          label: `${l}, ${Number(v).toLocaleString("pt-BR")} µs`,
        })),
      },
    ],
  },
  build,
  intro: {
    text: "Um caixa eletrônico deposita dinheiro chamando uma função que roda no servidor do banco. Você vai ver o que transforma essa chamada em bytes na rede, quanto ela custa e por que uma resposta perdida pode depositar duas vezes.",
    facts: [
      ["Chamada", "deposita(4242, 100)"],
      ["Saldo inicial", String(START)],
      ["Rede", `${DEFAULTS.rede} µs ida e volta`],
    ],
  },
  outro: {
    title: "RPC em resumo",
    text: "Stubs gerados da interface escondem a rede; o empacotamento fixa um formato comum; mas a chamada custa milhares de vezes mais e pode falhar no meio. Sem memória de pedidos, um reenvio repete o efeito.",
    facts: (run) => [
      ["Bytes na rede", String(run.stats.bytes)],
      ["Custo remoto", `${Number(run.stats.remote).toLocaleString("pt-BR")} µs`],
      ["Saldo com reenvio cego", String(run.stats.finalLeast)],
    ],
  },
  next: ["ipc", "chamada-de-sistema"],
  practice,
};

export default lesson;
