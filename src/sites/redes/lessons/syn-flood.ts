import type { Frame, LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { ip4, u16 } from "../../../sim/net/bytes.ts";
import { synRecvAlerts } from "../../../sim/net/ids.ts";
import {
  checkCookie,
  type FloodCfg,
  type FloodEv,
  type FloodResult,
  MSS_TABLE,
  runFlood,
  synCookie,
} from "../../../sim/net/synflood.ts";
import { type LessonBuilder, lessonBuilder } from "../../../sim/shared/builder.ts";
import { prng, randInt } from "../../../sim/shared/prng.ts";
import { DAVI, LIA } from "../plan.ts";

/**
 * SYN flood and SYN cookies. Spoofed SYNs fill the listen backlog of the
 * library server; Lia is refused; with cookies she gets in although the backlog is still full.
 * Worked by hand. Simulation only: no tools or commands.
 */
const SEED = 4987;
const SECRET = 0x5eed_c0de;
const TIMEOUT = 5;
export const DEFAULTS = { taxa: 4, fila: 8, cookies: false };
const ALERT_AT = 0.75;

const clamp = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
};
const cfgOf = (p: Params) => ({
  taxa: clamp(p.taxa, 1, 40, 4),
  fila: clamp(p.fila, 4, 32, 8),
  cookies: p.cookies === true,
});
const isTour = (c: ReturnType<typeof cfgOf>) => c.taxa === 4 && c.fila === 8 && !c.cookies;

function floodCfg(c: ReturnType<typeof cfgOf>, cookies = c.cookies): FloodCfg {
  return {
    ticks: 12,
    backlog: c.fila,
    rate: c.taxa,
    attackFrom: 2,
    attackTo: 12,
    synTimeout: TIMEOUT,
    cookies,
    legit: [0, 6],
  };
}

function scene(p: Params): SceneSpec {
  const c = cfgOf(p);
  return {
    viewBox: [960, 600],
    zones: [
      { id: "z-atk", title: "Origens forjadas", rect: { x: 20, y: 220, w: 260, h: 140 }, tone: "attacker" },
    ],
    nodes: [
      { id: "lia", kind: "laptop", label: "Lia", sub: LIA.ip, at: [140, 100] },
      {
        id: "atk",
        kind: "attacker",
        label: "Rajada de SYNs",
        sub: "IPs de origem falsos",
        at: [150, 290],
        w: 180,
      },
      { id: "net", kind: "cloud", label: "Internet", at: [430, 190] },
      { id: "davi", kind: "server", label: "Biblioteca", sub: `${DAVI.ip}:443`, at: [820, 100] },
    ],
    links: [
      { id: "a", from: "lia", to: "net", style: "bus" },
      { id: "b", from: "atk", to: "net", style: "bus" },
      { id: "c", from: "net", to: "davi", style: "bus" },
    ],
    widgets: [
      {
        kind: "queue",
        id: "fila",
        title: `Fila de conexões semiabertas (${c.fila} vagas)`,
        at: [40, 450],
        capacity: Math.min(c.fila, 8),
      },
      {
        kind: "chart",
        id: "grafico",
        title: "Conexões em SYN_RECV por segundo",
        at: [600, 230],
        width: 320,
        height: 140,
        x: { label: "segundos", max: 12 },
        y: { label: "SYN_RECV", max: c.fila + 2 },
      },
      { kind: "counter", id: "recusas", title: "SYNs descartados", at: [780, 460] },
    ],
  };
}

function cookieFrame(c: ReturnType<typeof synCookie>): Frame {
  const bits = Array.from({ length: 32 }, (_, k) => (c.isn >>> (31 - k)) & 1);
  return {
    id: "cookie",
    title: `ISN-cookie ${c.isn >>> 0}`,
    summary: "O número de sequência inicial do SYN-ACK carrega o estado da conexão.",
    unit: "bit",
    where: "Campo número de sequência do SYN-ACK",
    data: bits,
    layers: [
      {
        id: "t",
        label: "Contador de tempo",
        role: "s3",
        from: 0,
        to: 5,
        fields: [
          {
            label: "t (5 bits)",
            value: String(c.t),
            from: 0,
            to: 5,
            note: "Um contador lento; cookies velhos são recusados",
          },
        ],
      },
      {
        id: "mss",
        label: "MSS",
        role: "a",
        from: 5,
        to: 8,
        fields: [
          {
            label: "índice do MSS (3 bits)",
            value: `${c.mssIdx} = ${c.mss} bytes`,
            from: 5,
            to: 8,
            note: `Tabela: ${MSS_TABLE.join(", ")}`,
          },
        ],
      },
      {
        id: "hash",
        label: "Hash",
        role: "crypto",
        from: 8,
        to: 32,
        fields: [
          {
            label: "hash (24 bits)",
            value: `0x${c.hash.toString(16).padStart(6, "0")}`,
            from: 8,
            to: 32,
            note: "Dos IPs, portas, t e um segredo do servidor; sem o segredo não se forja",
          },
        ],
      },
    ],
  };
}

interface Mirror {
  items: { name: string; expires: number; lia: boolean }[];
  dropped: number;
}

export function build(p: Params) {
  const c = cfgOf(p);
  const tour = isTour(c);
  const b = lessonBuilder();
  const rand = prng(SEED);
  const spoofed = () => (rand() < 0.5 ? `…100.${randInt(rand, 2, 254)}` : `…113.${randInt(rand, 2, 254)}`);
  const r = runFlood(floodCfg(c));
  let tick = 0;
  const row = (t: number, who: string, what: string, detail: string) => ({
    cols: { t: `${t} s`, who, what, detail },
  });
  const m: Mirror = { items: [], dropped: 0 };

  const play = (bb: LessonBuilder, evs: FloodEv[], res: FloodResult) => {
    let lastT = -1;
    for (const e of evs) {
      if (e.t !== lastT) {
        if (lastT >= 0)
          bb.ev({
            t: tick,
            kind: "plot",
            chart: "grafico",
            series: "semiabertas",
            x: lastT,
            y: res.series[lastT] ?? 0,
            seriesRole: "bad",
            role: "bad",
            label: `${res.series[lastT]} em SYN_RECV`,
          });
        lastT = e.t;
      }
      tick++;
      if (e.kind === "expire") {
        let n = e.count;
        const keep: Mirror["items"] = [];
        for (const it of m.items) {
          if (n > 0 && !it.lia && it.expires <= e.t) {
            n--;
            bb.ev({
              t: tick,
              kind: "dequeue",
              queue: "fila",
              item: it.name,
              role: "muted",
              label: `${it.name} expira`,
            });
          } else keep.push(it);
        }
        m.items = keep;
        bb.ev({
          t: tick,
          kind: "note",
          at: "davi",
          text: `${e.count} expiram`,
          tone: "info",
          role: "muted",
          label: "Entradas antigas expiram",
          row: row(e.t, "Servidor", "Expiram", `${e.count} semiabertas após ${TIMEOUT} s`),
        });
      } else if (e.kind === "syn") {
        const name = e.who === "lia" ? "Lia" : spoofed();
        const from = e.who === "lia" ? "lia" : "atk";
        const role = e.who === "lia" ? "a" : "bad";
        if (e.result === "queued") {
          bb.ev({ t: tick, kind: "move", from, to: "davi", via: ["net"], role, label: `SYN de ${name}` });
          bb.ev({
            t: tick,
            kind: "enqueue",
            queue: "fila",
            item: name,
            itemRole: role,
            role,
            label: `${name} entra na fila`,
            ...(e.who === "lia" ? { row: row(e.t, "Lia", "SYN", "entra na fila; SYN-ACK enviado") } : {}),
          });
          m.items.push({ name, expires: e.t + TIMEOUT, lia: e.who === "lia" });
          if (e.who !== "lia")
            bb.ev({
              t: tick,
              kind: "move",
              from: "davi",
              to: "net",
              role: "muted",
              label: `SYN-ACK para ${name}`,
            });
        } else if (e.result === "dropped") {
          m.dropped++;
          bb.ev({
            t: tick,
            kind: "move",
            from,
            to: "davi",
            via: ["net"],
            role,
            label: `SYN de ${name}`,
            lost: true,
          });
          bb.ev({
            t: tick,
            kind: "count",
            counter: "recusas",
            value: String(m.dropped),
            role: "bad",
            label: "Descartado: fila cheia",
            ...(e.who === "lia"
              ? { row: row(e.t, "Lia", "SYN descartado", "fila cheia: sem resposta") }
              : {}),
          });
          if (e.who === "lia")
            bb.ev({
              t: tick,
              kind: "state",
              target: "lia",
              text: "sem resposta",
              tone: "bad",
              role: "bad",
              label: "A Lia não consegue conectar",
            });
        } else {
          bb.ev({ t: tick, kind: "move", from, to: "davi", via: ["net"], role, label: `SYN de ${name}` });
          bb.ev({
            t: tick,
            kind: "move",
            from: "davi",
            to: e.who === "lia" ? "lia" : "net",
            via: e.who === "lia" ? ["net"] : [],
            role: "crypto",
            label: "SYN-ACK com cookie",
            ...(e.who === "lia"
              ? { row: row(e.t, "Servidor", "SYN-ACK com cookie", "nada guardado na fila") }
              : {}),
          });
        }
      } else {
        const it = m.items.findIndex((x) => x.lia);
        if (it >= 0) {
          bb.ev({
            t: tick,
            kind: "dequeue",
            queue: "fila",
            item: "Lia",
            role: "a",
            label: "Lia sai da fila",
          });
          m.items.splice(it, 1);
        }
        bb.ev({ t: tick, kind: "move", from: "lia", to: "davi", via: ["net"], role: "a", label: "ACK" });
        bb.ev({
          t: tick,
          kind: "state",
          target: "lia",
          text: "ESTABLISHED",
          tone: "good",
          role: "a",
          label: "Lia conectada",
          row: row(
            e.t,
            "Lia",
            "ACK",
            e.via === "cookie" ? "cookie conferido: conexão criada" : "conexão estabelecida",
          ),
        });
      }
    }
    if (lastT >= 0)
      bb.ev({
        t: tick,
        kind: "plot",
        chart: "grafico",
        series: "semiabertas",
        x: lastT,
        y: res.series[lastT] ?? 0,
        seriesRole: "bad",
        role: "bad",
        label: `${res.series[lastT]} em SYN_RECV`,
      });
  };
  const evs = (from: number, to: number, res = r) => res.events.filter((e) => e.t >= from && e.t < to);
  const alerts = synRecvAlerts(r.series, Math.floor(c.fila * ALERT_AT));
  const signals = (bb: LessonBuilder) => {
    for (const a of alerts)
      bb.ev({
        t: ++tick,
        kind: "note",
        at: "davi",
        text: a.text,
        tone: "bad",
        role: "bad",
        label: `Alerta: ${a.text}`,
        row: { cols: { t: "—", who: "Monitor", what: "Alerta", detail: `${a.text}, desde ${a.t} s` } },
      });
    if (!alerts.length)
      bb.ev({
        t: ++tick,
        kind: "note",
        at: "davi",
        text: "sem alertas",
        tone: "good",
        role: "muted",
        label: "Nenhum limite ultrapassado",
      });
  };

  if (!tour) {
    b.step(
      {
        id: "s1-normal",
        title: "Antes do ataque",
        subtitle: "0 a 2 s",
        text: "A Lia conecta normalmente.",
        facts: [["Fila", `${c.fila} vagas`]],
      },
      () => play(b, evs(0, 2), r),
    );
    b.step(
      {
        id: "s2-ataque",
        title: "O ataque",
        subtitle: `${c.taxa} SYNs forjados por segundo`,
        text: c.cookies
          ? "Com cookies, a fila cheia não impede ninguém de entrar."
          : "Quando a fila enche, SYNs novos são descartados.",
        facts: [["SYN cookies", c.cookies ? "ligados" : "desligados"]],
        tags: c.cookies ? ["defense"] : [],
      },
      () => play(b, evs(2, 12), r),
    );
    b.step(
      {
        id: "s3-sinais",
        title: "Sinais",
        subtitle: "Contagem de SYN_RECV",
        text: "O monitor alerta quando as semiabertas passam de 75% da fila.",
        facts: [["Alertas", String(alerts.length)]],
        tags: ["signals"],
      },
      () => signals(b),
    );
    return b.done(
      {
        liaOk: r.liaOk,
        liaRefused: r.liaRefused,
        dropped: r.dropped,
        cookies: r.cookiesSent,
        max: r.maxHalfOpen,
      },
      [
        `Pico de ${r.maxHalfOpen} semiabertas numa fila de ${c.fila}.`,
        `${r.dropped} SYNs descartados; a Lia conectou ${r.liaOk} de 2 vezes.`,
        ...(c.cookies ? [`${r.cookiesSent} SYN-ACKs com cookie, sem ocupar a fila.`] : []),
        `Para manter a fila cheia bastam ${Math.ceil(c.fila / TIMEOUT)} SYNs por segundo (${c.fila} vagas ÷ ${TIMEOUT} s).`,
      ],
    );
  }

  b.step(
    {
      id: "s1-normal",
      title: "Uma conexão normal",
      subtitle: "A fila de semiabertas",
      text: `Quando um SYN chega, o servidor responde SYN-ACK e guarda a conexão numa **fila de semiabertas** (estado SYN_RECV) até o ACK final. A Lia completa o handshake em menos de um segundo e sai da fila. A fila tem ${c.fila} vagas; cada entrada sem resposta só é liberada depois de ${TIMEOUT} s.`,
      facts: [
        ["Fila", `${c.fila} vagas`],
        ["Tempo de espera", `${TIMEOUT} s`],
        ["Lia", "conectada"],
      ],
    },
    () => play(b, evs(0, 2), r),
  );
  const full = r.events.find((e) => e.kind === "syn" && e.result === "dropped");
  const fullT = full?.t ?? 4;
  b.step(
    {
      id: "s2-rajada",
      title: "A rajada",
      subtitle: `${c.taxa} SYNs por segundo, de origens falsas`,
      text: `A partir de 2 s chegam ${c.taxa} SYNs por segundo, cada um com um IP de origem **forjado**. O servidor responde SYN-ACK para endereços que não pediram nada (ou nem existem), e o ACK final nunca vem. Aos ${fullT} s a fila já está cheia e chega o primeiro SYN sem vaga.`,
      facts: [
        ["Taxa", `${c.taxa} SYN/s`],
        ["Primeiro descarte", `${fullT} s`],
        ["Custo para o atacante", "quase nenhum: sem handshake"],
      ],
      highlight: ["atk"],
    },
    () => play(b, evs(2, fullT), r),
  );
  b.step(
    {
      id: "s3-recusa",
      title: "A Lia fica de fora",
      subtitle: "Fila cheia, SYN descartado",
      text: "Novos SYNs são descartados, os forjados e os legítimos. Aos 6 s a Lia tenta de novo e não recebe resposta. As entradas forjadas expiram aos 7 s, mas a rajada ocupa as vagas no mesmo segundo. O servidor está ligado e quase sem carga de CPU, e mesmo assim ninguém entra.",
      facts: [
        ["SYN da Lia aos 6 s", "descartado"],
        [
          "Descartados até 7 s",
          String(r.events.filter((e) => e.kind === "syn" && e.result === "dropped" && e.t < 8).length),
        ],
      ],
      quiz: {
        kind: "choice",
        prompt: `A fila tem ${c.fila} vagas e cada entrada forjada dura ${TIMEOUT} s. Qual é a menor taxa de SYNs forjados que mantém a fila sempre cheia?`,
        options: ["1 por segundo", "2 por segundo", "8 por segundo", "40 por segundo"],
        answer: 1,
        explain: `Em regime, entram tantas quanto saem: ${c.fila} vagas ÷ ${TIMEOUT} s = 1,6 por segundo, então **2 SYNs por segundo** bastam. Por isso o SYN flood é barato: não precisa de muita banda.`,
      },
      highlight: ["lia"],
    },
    () => play(b, evs(fullT, 8), r),
  );
  b.step(
    {
      id: "s4-sinais",
      title: "Sinais de detecção",
      subtitle: "Muitas semiabertas, poucos ACKs",
      text: `O gráfico mostra o sintoma: as conexões em SYN_RECV ficam coladas no limite. Num servidor, listar os sockets mostra dezenas de SYN_RECV de IPs variados e quase nenhum ESTABLISHED novo; o próprio kernel costuma registrar "possível SYN flood" quando a fila transborda. O monitor desta lição alerta acima de ${Math.floor(c.fila * ALERT_AT)}.`,
      facts: [
        ["Pico de SYN_RECV", String(r.maxHalfOpen)],
        ["SYNs descartados", String(r.dropped)],
        ["Alertas", String(alerts.length)],
      ],
      tags: ["signals"],
    },
    () => {
      play(b, evs(8, 12), r);
      signals(b);
    },
  );
  const tuple = [...ip4(LIA.ip), ...u16(LIA.port), ...ip4(DAVI.ip), ...u16(443)];
  const ck = synCookie(tuple, 6, 1460, SECRET);
  const rc = runFlood(floodCfg(c, true));
  const liaCookie = rc.events.filter((e) => e.t === 6);
  b.step(
    {
      id: "s5-cookies",
      quiz: {
        kind: "choice",
        prompt:
          "Com SYN cookies e a fila cheia, onde o servidor guarda o estado de uma conexão que acabou de receber um SYN?",
        options: [
          "Em lugar nenhum: o estado vai codificado no número de sequência do SYN-ACK",
          "Numa segunda fila, maior que a primeira",
          "Num cookie HTTP que o navegador devolve depois",
        ],
        answer: 0,
        explain:
          "O número de sequência do SYN-ACK carrega o tempo, o MSS e um hash com um segredo. O cliente legítimo devolve esse número + 1 no ACK, e o servidor reconstrói o estado só nessa hora. SYNs forjados não custam memória.",
      },
      title: "Defesa: SYN cookies",
      subtitle: "Guardar o estado no próprio pacote",
      text: `Com **SYN cookies**, quando a fila está cheia o servidor não guarda nada: ele escolhe o número de sequência do SYN-ACK de modo que **ele mesmo seja o estado**. São 5 bits de um contador de tempo, 3 bits do MSS e 24 bits de um hash dos endereços, das portas e de um segredo do servidor. Abra o inspetor (I) para ver os campos do cookie ${ck.isn >>> 0}.`,
      facts: [
        ["Contador t", String(ck.t)],
        ["MSS", `${ck.mss} (índice ${ck.mssIdx})`],
        ["Hash", `0x${ck.hash.toString(16).padStart(6, "0")}`],
      ],
      tags: ["defense"],
      highlight: ["davi"],
    },
    () => {
      const fr = b.frame(cookieFrame(ck));
      b.ev({
        t: ++tick,
        kind: "state",
        target: "davi",
        text: "SYN cookies ligados",
        tone: "active",
        role: "crypto",
        label: "SYN cookies ligados",
        frame: fr,
        row: row(6, "Servidor", "Cookies ligados", `ISN = ${ck.isn >>> 0}`),
      });
      b.ev({
        t: ++tick,
        kind: "state",
        target: "lia",
        text: "tentando de novo",
        tone: "active",
        role: "a",
        label: "A Lia tenta outra vez",
      });
      play(
        b,
        liaCookie.filter((e) => e.kind === "syn" && e.who === "lia"),
        rc,
      );
    },
  );
  b.step(
    {
      id: "s6-entra",
      title: "A Lia entra",
      subtitle: "O ACK traz o cookie de volta",
      text: `O ACK da Lia confirma cookie + 1. O servidor recalcula o hash com o segredo, confere que o contador é recente e recupera o MSS: o cookie é válido, e só agora a conexão é criada, **sem nunca ter passado pela fila**, que continua cheia de entradas forjadas. A resposta a um SYN forjado vai para um IP que não responde, então não custa nada além de um pacote. Referência: RFC 4987.`,
      facts: [
        ["ACK da Lia", `ack ${(ck.isn + 1) >>> 0}`],
        ["Cookie confere", checkCookie(ck.isn, tuple, 7, SECRET) ? "sim" : "não"],
        ["Custo", "sem opções TCP grandes (só MSS)"],
      ],
      tags: ["defense"],
    },
    () => {
      play(
        b,
        rc.events.filter((e) => e.t === 7 && e.kind === "established"),
        rc,
      );
      b.ev({
        t: ++tick,
        kind: "note",
        at: "davi",
        text: "conectada sem usar a fila",
        tone: "good",
        role: "crypto",
        label: "Cookie validado",
      });
    },
  );
  return b.done({
    liaOk: r.liaOk,
    liaRefused: r.liaRefused,
    dropped: r.dropped,
    cookies: rc.cookiesSent,
    max: r.maxHalfOpen,
    isn: ck.isn >>> 0,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "syn-flood",
    site: "redes",
    title: "SYN flood e SYN cookies",
    summary:
      "Como SYNs com origem forjada esgotam a fila de conexões semiabertas, como perceber o ataque e como os SYN cookies o neutralizam.",
    area: "Segurança",
    refs: [
      { rfc: 4987, note: "Ataques de SYN flood e mitigações" },
      { rfc: 9293, section: "3.5", note: "Estabelecimento de conexão" },
      {
        book: "tanenbaum-cn",
        chapter: 6,
        section: "6.5.5",
        note: "Estabelecimento de conexões TCP",
        verified: true,
      },
      {
        book: "tanenbaum-cn",
        chapter: 8,
        section: "8.2.4",
        note: "Interrupção (negação de serviço)",
        verified: true,
      },
    ],
    simplifications: [
      "Tempo em segundos inteiros; o tempo de espera real e as retransmissões do SYN-ACK variam por sistema.",
      "Com cookies, os SYNs forjados ainda usam a fila enquanto há vagas; só o excedente recebe cookie (como no Linux).",
      "O hash do cookie aqui é o FNV-1a; sistemas reais usam um hash com chave (SipHash).",
      "Os IPs forjados são sorteados nas faixas de documentação.",
    ],
  },
  scene,
  params: {
    defaults: { ...DEFAULTS },
    fields: [
      { key: "taxa", kind: "int", label: "SYNs forjados por segundo", min: 1, max: 40 },
      { key: "fila", kind: "int", label: "Vagas na fila de semiabertas", min: 4, max: 32 },
      { key: "cookies", kind: "bool", label: "SYN cookies ligados" },
    ],
  },
  build,
  intro: {
    text: "Todo servidor [[tcp]] reserva um pouco de memória para cada handshake em andamento. Um SYN flood explora essa reserva com SYNs que nunca serão completados. Esta lição é uma simulação: você vai ver o ataque, os sinais que ele deixa e a defesa.",
    facts: [
      ["Servidor", `${DAVI.host}:443`],
      ["Fila", "8 vagas, 5 s por entrada"],
      ["Ataque", "4 SYNs/s a partir de 2 s"],
    ],
  },
  outro: {
    title: "SYN flood em resumo",
    text: "O ataque esgota uma fila pequena com pouquíssimo tráfego. Monitore SYN_RECV, ligue SYN cookies (no Linux vêm ligados por padrão para quando a fila transborda) e filtre origens forjadas na borda da rede (BCP 38).",
    facts: (run) => [
      ["SYNs descartados", String(run.stats.dropped)],
      ["Pico de semiabertas", String(run.stats.max)],
    ],
  },
  next: ["encapsulamento"],
  counter: {
    test: (ev) => ev.kind === "count" && ev.counter === "recusas",
    label: (n) => (n === 1 ? "1 SYN descartado" : `${n} SYNs descartados`),
  },
};

export default lesson;
