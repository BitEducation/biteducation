import type { LessonModule, Params } from "../../../contracts/types.ts";
import { ascii, frameOf, known } from "../../../sim/net/bytes.ts";
import { icmpEcho, icmpError } from "../../../sim/net/icmp.ts";
import { ipv4, PROTO } from "../../../sim/net/ipv4.ts";
import { payloadLayer } from "../../../sim/net/tcp.ts";
import { udp } from "../../../sim/net/udp.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { seqScene, talk } from "../../../sim/shared/seq.ts";
import { DAVI, GW, ISP, LIA } from "../plan.ts";

/**
 * ICMP: ping measures the round trip; traceroute sends probes with TTL 1, 2, 3… and learns each
 * router from the "time exceeded" it sends back. One-way delays per link are fixed.
 */
export const HOPS = [
  { id: "r1", name: "roteador do campus", ip: GW.ip, ms: 1 },
  { id: "r2", name: "provedor", ip: ISP.ip, ms: 6 },
  { id: "r3", name: "troca de tráfego", ip: "198.51.100.129", ms: 9 },
  { id: "davi", name: "biblioteca", ip: DAVI.ip, ms: 4 },
] as const;
export const DEFAULTS = { pings: 3 };
const PAYLOAD = ascii("abcdefghijklmnopqrstuvwabcdefghi");
const ID = 0x4c49;
const TRACE_PORT = 33434;

const clamp = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
};

/** One-way delay from Lia to hop k (1-based). */
export const oneWay = (k: number) => HOPS.slice(0, k).reduce((n, h) => n + h.ms, 0);

const scene = seqScene(
  [
    { id: "lia", kind: "laptop", label: "Lia", sub: LIA.ip },
    { id: "r1", kind: "router", label: "Campus", sub: GW.ip },
    { id: "r2", kind: "router", label: "Provedor", sub: ISP.ip },
    { id: "r3", kind: "router", label: "Troca de tráfego", sub: "198.51.100.129" },
    { id: "davi", kind: "server", label: "Biblioteca", sub: DAVI.ip },
  ],
  {
    width: 1000,
    height: 520,
    widgets: [
      {
        kind: "table",
        id: "trace",
        title: "Saída do traceroute",
        at: [60, 250],
        columns: ["TTL", "Quem respondeu", "Endereço", "Tempo"],
        widths: [60, 220, 170, 100],
        rows: 4,
      },
    ],
  },
);

export function build(p: Params) {
  const pings = clamp(p.pings, 1, 5, DEFAULTS.pings);
  const b = lessonBuilder();
  const names = Object.fromEntries([["lia", "Lia"], ...HOPS.map((h) => [h.id, h.name])]);
  const c = talk(b, names);
  const path = HOPS.map((h) => h.id);
  const rtt = 2 * oneWay(HOPS.length);
  const echo = (reply: boolean, seq: number, ttl: number) => {
    const ic = icmpEcho({ reply, id: ID, seq, data: PAYLOAD });
    const ip = ipv4({
      src: reply ? DAVI.ip : LIA.ip,
      dst: reply ? LIA.ip : DAVI.ip,
      proto: PROTO.icmp,
      payloadLen: ic.bytes.length,
      ttl,
      id: 0x1000 + seq,
      df: false,
    });
    return frameOf(
      `f-${reply ? "rep" : "req"}-${seq}`,
      reply ? `Echo reply ${seq}` : `Echo request ${seq}`,
      reply ? "A resposta devolve os mesmos dados." : "32 bytes de dados que voltarão iguais.",
      [ip, ic],
      // The TTL tells where the capture was taken: as sent, or as it arrives after the hops.
      reply
        ? "Chegando ao notebook da Lia, depois dos roteadores (o TTL já foi descontado)"
        : "Saindo do notebook da Lia, antes do primeiro roteador",
    );
  };

  b.step(
    {
      id: "s1-ping",
      title: "Um ping",
      subtitle: "Echo request e echo reply",
      text: `O comando ping manda uma mensagem [[icmp]] do tipo 8, **echo request**, com um identificador, um número de sequência e alguns bytes de dados. Quem recebe devolve um tipo 0, **echo reply**, com os mesmos bytes. O tempo entre ir e voltar é o [[rtt]]: aqui, ${rtt} ms. ICMP não tem portas: ele anda direto sobre o IP, com protocolo 1.`,
      facts: [
        ["Tipo", "8 → 0"],
        ["Dados", `${PAYLOAD.length} bytes`],
        ["RTT", `${rtt} ms`],
      ],
      highlight: ["lia", "davi"],
    },
    () => {
      c.send("lia", "davi", "echo 1", {
        dt: oneWay(4),
        via: path.slice(0, 3),
        frame: echo(false, 1, 64),
        detail: "seq 1, TTL 64",
      });
      c.send("davi", "lia", "reply 1", {
        dt: oneWay(4),
        via: [...path.slice(0, 3)].reverse(),
        role: "b",
        frame: echo(true, 1, 64 - 3),
        detail: `${rtt} ms`,
      });
    },
  );

  b.step(
    {
      id: "s2-varios",
      title: "Vários pings",
      subtitle: "Média, variação e perda",
      text: `O ping repete a cada segundo, somando 1 à sequência. Comparando vários RTTs dá para ver a variação (o *jitter*) e se algum pedido se perdeu. Repare no TTL da resposta: o servidor partiu de 64 e chegou ${64 - 3}, então há 3 roteadores no caminho de volta. É um primeiro palpite de distância, antes do traceroute.`,
      facts: [
        ["Pings", String(pings)],
        ["TTL na resposta", String(64 - 3)],
        ["Perdas", "0"],
      ],
      highlight: ["lia"],
    },
    () => {
      for (let s = 2; s <= pings; s++) {
        c.at(Math.max(c.t, (s - 1) * 1000));
        c.send("lia", "davi", `echo ${s}`, {
          dt: oneWay(4),
          via: path.slice(0, 3),
          frame: echo(false, s, 64),
        });
        c.send("davi", "lia", `reply ${s}`, {
          dt: oneWay(4),
          via: [...path.slice(0, 3)].reverse(),
          role: "b",
          frame: echo(true, s, 61),
          detail: `${rtt} ms`,
        });
      }
      if (pings === 1) c.note("lia", `1 pacote, 0% de perda, ${rtt} ms`, "good", { dt: 1 });
      else c.note("lia", `${pings} pacotes, 0% de perda, média ${rtt} ms`, "good", { dt: 1 });
    },
  );

  const probe = (ttl: number, k: number) => {
    const u = udp({
      src: LIA.ip,
      dst: DAVI.ip,
      sport: 54000,
      dport: TRACE_PORT + k,
      payload: Array(24).fill(0),
    });
    const ip = ipv4({
      src: LIA.ip,
      dst: DAVI.ip,
      proto: PROTO.udp,
      payloadLen: 8 + 24,
      ttl,
      id: 0x2000 + k,
      df: false,
    });
    return { ip, u };
  };
  const quotedOf = (ttlAtHop: number, k: number) => {
    const pr = probe(ttlAtHop, k);
    // What the router quotes: the IP header as it arrived (TTL already decremented to 0 or 1) + 8 bytes.
    return [...known(pr.ip.bytes), ...known(pr.u.bytes).slice(0, 8)];
  };
  const errFrame = (k: number, type: 3 | 11) => {
    const hop = HOPS[k - 1] as (typeof HOPS)[number];
    const quoted = quotedOf(type === 11 ? 1 : 1 + (k - 4), k);
    const ic = icmpError({ type, code: type === 11 ? 0 : 3, quoted });
    const ip = ipv4({
      src: hop.ip,
      dst: LIA.ip,
      proto: PROTO.icmp,
      payloadLen: ic.bytes.length,
      ttl: 64,
      id: 0x3000 + k,
      df: false,
    });
    return frameOf(
      `f-err-${k}`,
      type === 11 ? `Tempo excedido (${hop.name})` : "Porta inalcançável (biblioteca)",
      type === 11 ? `O TTL chegou a zero no ${hop.name}.` : "A sonda chegou: não há programa nessa porta.",
      [ip, ic],
      `Saindo do ${hop.name}, de volta para a Lia`,
    );
  };
  const probeFrame = (ttl: number, k: number) => {
    const pr = probe(ttl, k);
    return frameOf(
      `f-probe-${k}`,
      `Sonda com TTL ${ttl}`,
      "UDP para uma porta alta que ninguém usa.",
      [pr.ip, pr.u, payloadLayer("dados", "Dados", Array(24).fill(0), "24 bytes zerados", "muted")],
      "Saindo do notebook da Lia, antes do primeiro roteador",
    );
  };
  const traceRow = (k: number) => {
    const hop = HOPS[k - 1] as (typeof HOPS)[number];
    c.row("trace", k - 1, [String(k), hop.name, hop.ip, `${2 * oneWay(k)} ms`], {
      mark: "new",
      dt: 0,
      label: `Salto ${k}: ${hop.ip}`,
    });
  };

  c.at(Math.max(c.t, pings * 1000));
  b.step(
    {
      id: "s3-ttl1",
      quiz: {
        kind: "choice",
        prompt: "A primeira sonda do traceroute sai com TTL 1. Quem responde, e com o quê?",
        options: [
          "O primeiro roteador, com um ICMP de tempo excedido",
          "O destino, com um echo reply",
          "Ninguém: o pacote some sem aviso",
        ],
        answer: 0,
        explain:
          "O primeiro roteador baixa o TTL para zero, descarta a sonda e avisa quem a enviou com um ICMP tipo 11. O endereço de origem desse aviso revela o roteador, e é assim que o traceroute monta a lista de saltos.",
      },
      title: "TTL 1",
      subtitle: "Morre no primeiro roteador",
      text: `O traceroute aproveita uma regra do IP: quando um roteador baixa o [[ttl]] para zero, ele descarta o pacote e devolve um ICMP **tempo excedido** (tipo 11) a quem enviou. Então a primeira sonda sai com TTL 1. O roteador do campus a descarta e responde, e o endereço de origem dessa resposta revela quem ele é.`,
      facts: [
        ["Sonda", "TTL 1"],
        ["Resposta", "ICMP tipo 11"],
        ["Salto 1", `${GW.ip}, ${2 * oneWay(1)} ms`],
      ],
      highlight: ["r1"],
    },
    () => {
      c.send("lia", "r1", "TTL 1", {
        dt: oneWay(1),
        frame: probeFrame(1, 1),
        detail: `UDP → ${TRACE_PORT + 1}`,
      });
      c.state("r1", "TTL 1 → 0: descarta", { dt: 0, tone: "bad", role: "warn" });
      c.send("r1", "lia", "tempo excedido", { dt: oneWay(1), role: "warn", frame: errFrame(1, 11) });
      traceRow(1);
    },
  );

  b.step(
    {
      id: "s4-ttl23",
      quiz: {
        kind: "pick",
        prompt:
          "A próxima sonda sai com TTL 2. Qual equipamento vai descartá-la e responder com tempo excedido?",
        targets: [
          { id: "r1", label: "Campus" },
          { id: "r2", label: "Provedor" },
          { id: "r3", label: "Troca de tráfego" },
          { id: "davi", label: "Biblioteca" },
        ],
        answer: "r2",
        explain:
          "O campus baixa o TTL de 2 para 1 e repassa. O provedor baixa para 0, descarta e avisa a Lia. Cada TTL a mais revela um salto adiante.",
      },
      title: "TTL 2 e 3",
      subtitle: "Um roteador mais longe a cada vez",
      text: "Com TTL 2 a sonda passa pelo campus (que baixa para 1) e morre no provedor; com TTL 3, morre na troca de tráfego. Cada resposta mostra um salto e o seu RTT. A mensagem de erro carrega o cabeçalho IP e os primeiros 8 bytes da sonda original: é pela porta de destino ali dentro que o traceroute sabe a qual sonda cada resposta se refere.",
      facts: [
        ["Salto 2", `${ISP.ip}, ${2 * oneWay(2)} ms`],
        ["Salto 3", `198.51.100.129, ${2 * oneWay(3)} ms`],
        ["Dentro do erro", "cabeçalho IP + 8 bytes"],
      ],
      highlight: ["r2", "r3"],
    },
    () => {
      for (const k of [2, 3]) {
        const hop = HOPS[k - 1] as (typeof HOPS)[number];
        c.send("lia", hop.id, `TTL ${k}`, {
          dt: oneWay(k),
          via: path.slice(0, k - 1),
          frame: probeFrame(k, k),
        });
        c.state(hop.id, "TTL 1 → 0: descarta", { dt: 0, tone: "bad", role: "warn" });
        c.send(hop.id, "lia", "tempo excedido", {
          dt: oneWay(k),
          via: path.slice(0, k - 1).reverse(),
          role: "warn",
          frame: errFrame(k, 11),
        });
        traceRow(k);
      }
    },
  );

  b.step(
    {
      id: "s5-destino",
      title: "Chegou ao destino",
      subtitle: "Porta inalcançável quer dizer sucesso",
      text: `Com TTL 4 a sonda chega à biblioteca. Ninguém está escutando a porta ${TRACE_PORT + 4}, então o servidor responde com ICMP tipo 3, código 3: **porta inalcançável**. Para o traceroute, esse erro é a notícia boa: o destino foi alcançado e a lista de saltos está completa.`,
      facts: [
        ["Salto 4", `${DAVI.ip}, ${2 * oneWay(4)} ms`],
        ["Resposta", "ICMP 3/3"],
        ["Saltos", "4"],
      ],
      highlight: ["davi"],
      quiz: {
        kind: "number",
        prompt: "Com quantos de TTL uma sonda chega à biblioteca, com o mínimo possível, neste caminho?",
        answer: 4,
        explain:
          "Há 3 roteadores no caminho e cada um subtrai 1. Com TTL 3 a sonda morre no terceiro; com **4** ela sai do terceiro com TTL 1 e chega ao servidor.",
      },
    },
    () => {
      c.send("lia", "davi", "TTL 4", { dt: oneWay(4), via: path.slice(0, 3), frame: probeFrame(4, 4) });
      c.state("davi", `porta ${TRACE_PORT + 4} fechada`, { dt: 0, tone: "warn", role: "warn" });
      c.send("davi", "lia", "porta inalcançável", {
        dt: oneWay(4),
        via: path.slice(0, 3).reverse(),
        role: "b",
        frame: errFrame(4, 3),
      });
      traceRow(4);
    },
  );

  b.step(
    {
      id: "s6-cuidado",
      title: "Lendo com cuidado",
      subtitle: "O que o traceroute não garante",
      text: 'Muitos roteadores limitam ou bloqueiam respostas ICMP, e aparecem como `* * *` sem estarem quebrados. O caminho de volta pode ser diferente do de ida, e cada sonda pode seguir uma rota diferente quando há balanceamento. Por isso o ICMP não deve ser bloqueado por inteiro: sem o tipo 3, código 4 ("precisa fragmentar"), a descoberta de MTU do caminho para de funcionar.',
      facts: [
        ["* * *", "silêncio, não necessariamente falha"],
        ["Ida e volta", "podem ser caminhos diferentes"],
        ["Não bloquear", "ICMP 3/4 (MTU)"],
      ],
      highlight: ["r2", "r3"],
    },
    () => {
      c.note("r3", "pode limitar respostas ICMP", "warn", { dt: 1 });
    },
  );

  return b.done({ rtt, hops: HOPS.length, pings });
}

const lesson: LessonModule = {
  meta: {
    slug: "ping-traceroute",
    site: "redes",
    title: "ICMP: ping e traceroute",
    summary:
      "Como o ping mede ida e volta e como o traceroute usa o TTL para revelar cada roteador do caminho.",
    area: "Rede",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 5,
        section: "5.7.4",
        note: "Protocolos de controle da Internet: ICMP",
        verified: true,
      },
      { rfc: 792, note: "ICMP" },
      { rfc: 1812, section: "4.3", note: "Requisitos de ICMP para roteadores" },
    ],
    simplifications: [
      "Uma sonda por TTL; o traceroute de verdade manda três e mostra três tempos.",
      "Atrasos fixos por enlace; na prática o RTT varia a cada pacote.",
      "Nenhum roteador limita as respostas ICMP nesta simulação.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [{ key: "pings", kind: "int", label: "Quantidade de pings", min: 1, max: 5 }],
  },
  build,
  intro: {
    text: "Quando a internet parece lenta, as duas primeiras ferramentas são o ping e o traceroute. As duas usam o ICMP, o protocolo de mensagens de controle do IP. Você vai ver como uma mede o tempo de ida e volta e como a outra engana o TTL para descobrir cada roteador do caminho.",
    facts: [
      ["Origem", LIA.ip],
      ["Destino", DAVI.ip],
      ["Roteadores no caminho", "3"],
    ],
  },
  outro: {
    title: "ICMP em resumo",
    text: "O ping mede o RTT com echo request e reply. O traceroute manda sondas com TTL crescente e monta o caminho a partir dos erros de tempo excedido, até o porta inalcançável do destino.",
    facts: (run) => [
      ["RTT até a biblioteca", `${run.stats.rtt} ms`],
      ["Saltos", String(run.stats.hops)],
    ],
  },
  next: ["nat", "roteamento"],
};

export default lesson;
