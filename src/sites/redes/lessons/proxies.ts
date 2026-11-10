import type { LessonModule, Params, Role, SceneSpec } from "../../../contracts/types.ts";
import {
  balance,
  durations,
  LAN_MS,
  ORIGIN_MS,
  runCache,
  type Served,
  workload,
} from "../../../sim/net/proxy.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Proxies on both ends of the Web: a shared cache near the clients (hits, freshness, conditional
 * revalidation, what must never be shared) and a reverse proxy in front of several servers.
 */
export const DEFAULTS = { capacidade: 4, validade: 5, servidores: 3 };
const N = 15;
const OBJ_KB = 50;
const NOT_MODIFIED_KB = 0.3;
const CLIENTS = ["c1", "c2", "c3"];

const dec = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1).replace(".", ","));

function clamp(p: Params) {
  const cap = Math.min(8, Math.max(1, Math.round(Number(p.capacidade ?? DEFAULTS.capacidade))));
  const age = Math.min(30, Math.max(1, Math.round(Number(p.validade ?? DEFAULTS.validade))));
  const servers = Math.min(5, Math.max(2, Math.round(Number(p.servidores ?? DEFAULTS.servidores))));
  return { cap, age, servers };
}

const backendY = (k: number, n: number) => Math.round(200 + (k - (n - 1) / 2) * (n > 3 ? 70 : 120));

function scene(p: Params): SceneSpec {
  const { servers } = clamp(p);
  const cy = [80, 200, 320];
  return {
    viewBox: [960, 600],
    nodes: [
      ...CLIENTS.map((id, i) => ({
        id,
        kind: "laptop" as const,
        label: `Cliente ${i + 1}`,
        at: [110, cy[i] ?? 200] as [number, number],
      })),
      { id: "proxy", kind: "server", label: "Proxy", sub: "intermediário", at: [440, 200] },
      {
        id: "origem",
        kind: "cloud",
        label: "Servidor de origem",
        sub: `${ORIGIN_MS} ms de ida e volta`,
        at: [790, 200],
      },
      ...Array.from({ length: servers }, (_, k) => ({
        id: `b${k + 1}`,
        kind: "server" as const,
        label: `Servidor ${k + 1}`,
        at: [800, backendY(k, servers)] as [number, number],
        hidden: true,
      })),
    ],
    links: [
      {
        id: "lc1",
        from: "c1",
        to: "proxy",
        via: [
          [300, 80],
          [300, 200],
        ],
      },
      { id: "lc2", from: "c2", to: "proxy" },
      {
        id: "lc3",
        from: "c3",
        to: "proxy",
        via: [
          [300, 320],
          [300, 200],
        ],
      },
      { id: "lo", from: "proxy", to: "origem", style: "dashed" },
      ...Array.from({ length: servers }, (_, k) => {
        const y = backendY(k, servers);
        return y === 200
          ? { id: `lb${k + 1}`, from: "proxy", to: `b${k + 1}` }
          : {
              id: `lb${k + 1}`,
              from: "proxy",
              to: `b${k + 1}`,
              via: [
                [620, 200],
                [620, y],
              ] as [number, number][],
            };
      }),
    ],
    widgets: [
      {
        kind: "grid",
        id: "pedidos",
        title: `${N} pedidos, um por segundo: número do objeto e resultado`,
        at: [40, 410],
        cols: N,
        rows: 2,
        cellW: 34,
        indexLabel: "none",
      },
      { kind: "counter", id: "acertos", title: "Acertos", at: [640, 410] },
      { kind: "counter", id: "tempo", title: "Tempo médio", at: [790, 410] },
      { kind: "counter", id: "origemkb", title: "Vindos da origem", at: [640, 500] },
      { kind: "counter", id: "resp", title: "Resposta média", at: [790, 500] },
    ],
  };
}

export function build(p: Params) {
  const { cap, age, servers } = clamp(p);
  const b = lessonBuilder();
  const names: Record<string, string> = {
    c1: "cliente 1",
    c2: "cliente 2",
    c3: "cliente 3",
    proxy: "proxy",
    origem: "origem",
  };
  for (let k = 1; k <= 5; k++) names[`b${k}`] = `servidor ${k}`;
  const c = talk(b, names, (t) => String(t));

  const reqs = workload(N);
  const long = runCache(reqs, cap, 3600);
  const short = runCache(reqs, cap, age);
  const kb = (r: ReturnType<typeof runCache>) => r.misses * OBJ_KB + r.revalidated * NOT_MODIFIED_KB;
  const noProxyMs = LAN_MS + ORIGIN_MS;
  const durs = durations(N);
  const rr = balance("rr", servers, durs);
  const least = balance("least", servers, durs);
  const firstHit = long.served.find((s) => s.result === "hit");

  const mark: Record<Served["result"], { sym: string; role: Role; cell: "hit" | "miss" | "dirty" }> = {
    hit: { sym: "✓", role: "crypto", cell: "hit" },
    miss: { sym: "×", role: "bad", cell: "miss" },
    revalidated: { sym: "↻", role: "warn", cell: "dirty" },
  };
  const play = (served: Served[], row: number, animate: number) => {
    served.forEach((s, i) => {
      const who = CLIENTS[s.req.client] ?? "c1";
      const name = s.req.obj.slice(4);
      if (i < animate) {
        c.send(who, "proxy", `GET ${s.req.obj}`, { role: "a", what: `GET ${s.req.obj}` });
        if (s.result !== "hit")
          c.send("proxy", "origem", s.result === "miss" ? "GET" : "If-None-Match", {
            role: s.result === "miss" ? "bad" : "warn",
            what: s.result === "miss" ? "falta: busca na origem" : "revalida",
            detail: s.result === "miss" ? `${OBJ_KB} KB` : "304 Not Modified",
          });
        c.send("proxy", who, s.result === "hit" ? "da cache" : "200", {
          dt: s.result === "hit" ? 1 : 1,
          role: mark[s.result].role,
          what: s.result === "hit" ? "acerto" : "entregue",
          detail: `${s.ms} ms`,
        });
      }
      c.cell("pedidos", row * N + i, `${name}${mark[s.result].sym}`, {
        dt: i < animate ? 0 : 1,
        mark: mark[s.result].cell,
        role: mark[s.result].role,
        ...(i >= animate
          ? {
              log: {
                who: `cliente ${s.req.client + 1}`,
                what: `${s.req.obj}: ${s.result === "hit" ? "acerto" : s.result === "miss" ? "falta" : "revalidado"}`,
                detail: `${s.ms} ms`,
              },
            }
          : {}),
      });
    });
  };
  const counters = (r: ReturnType<typeof runCache>) => {
    c.count("acertos", `${r.hits}/${N}`, { label: `${r.hits} acertos em ${N}` });
    c.count("tempo", `${dec(r.meanMs)} ms`, { label: `média ${dec(r.meanMs)} ms` });
    c.count("origemkb", `${dec(kb(r))} KB`, { label: `${dec(kb(r))} KB da origem` });
  };

  b.step(
    {
      id: "s1-longe",
      title: "Todo pedido vai longe",
      subtitle: `${noProxyMs} ms por pedido`,
      text: `Três computadores de uma empresa pedem páginas e imagens a um servidor distante, a ${ORIGIN_MS} ms de ida e volta. Sem nada no meio, cada pedido custa ${LAN_MS} ms na rede local mais ${ORIGIN_MS} ms até a origem, ${noProxyMs} ms, mesmo quando o colega da mesa ao lado acabou de baixar o mesmo objeto. Os pedidos não são uniformes: alguns objetos, como o logotipo, aparecem muito mais que outros.`,
      facts: [
        ["Pedidos", String(N)],
        ["Por pedido", `${noProxyMs} ms`],
        ["Da origem", `${N * OBJ_KB} KB`],
      ],
      highlight: ["origem"],
    },
    () => {
      for (let i = 0; i < 2 * N; i++) c.cell("pedidos", i, "", { role: "muted" });
      b.ev({
        t: c.t,
        kind: "state",
        target: "proxy",
        text: "cache compartilhado",
        tone: "active",
        role: "a",
        label: "proxy de cache",
      });
      c.send("c1", "proxy", `GET ${reqs[0]?.obj}`, { role: "a", what: "pedido" });
      c.send("proxy", "origem", "GET", { role: "bad", what: "vai até a origem" });
      c.send("origem", "c1", "200", { role: "a", what: "resposta", detail: `${noProxyMs} ms` });
      c.count("tempo", `${noProxyMs} ms`, { label: `${noProxyMs} ms por pedido` });
      c.count("origemkb", `${N * OBJ_KB} KB`, { label: `${N * OBJ_KB} KB da origem` });
    },
  );

  b.step(
    {
      id: "s2-cache",
      title: "Um cache compartilhado",
      subtitle: `${long.hits} acertos em ${N}`,
      text: `Um [[proxy]] na saída da rede recebe os pedidos de todos e guarda as respostas, com espaço para ${cap} ${cap === 1 ? "objeto" : "objetos"}. ${firstHit ? `Já no pedido ${long.served.indexOf(firstHit) + 1}, ${firstHit.req.obj} sai da cache em ${LAN_MS} ms.` : ""} Nos ${N} pedidos foram ${long.hits} acertos e ${long.misses} faltas: tempo médio de ${dec(long.meanMs)} ms em vez de ${noProxyMs}, e ${dec(kb(long))} KB vindos da origem em vez de ${N * OBJ_KB}. Quando enche, a cache descarta o objeto usado há mais tempo, como o [[lru]].`,
      facts: [
        ["Acertos", `${long.hits} de ${N}`],
        ["Tempo médio", `${dec(long.meanMs)} ms`],
        ["Da origem", `${dec(kb(long))} KB`],
      ],
      highlight: ["proxy"],
      quiz: {
        kind: "number",
        prompt: `Com ${long.hits} acertos de ${LAN_MS} ms e ${long.misses} faltas de ${noProxyMs} ms, qual o tempo médio por pedido, em ms?`,
        answer: long.meanMs,
        tolerance: 0.1,
        unit: "ms",
        explain: `(${long.hits} × ${LAN_MS} + ${long.misses} × ${noProxyMs}) / ${N} = ${dec(long.meanMs)} ms.`,
      },
    },
    () => {
      play(long.served, 0, 4);
      counters(long);
    },
  );

  b.step(
    {
      id: "s3-validade",
      title: "Ainda está fresco?",
      subtitle: `${short.revalidated} revalidações`,
      text: `A origem diz por quanto tempo cada resposta vale, no cabeçalho Cache-Control: max-age. Com ${age} s de validade, ${short.revalidated} dos pedidos encontram uma cópia vencida. O proxy não a descarta: pergunta à origem se mudou, com um GET condicional (If-None-Match e a [[etag]]). Se não mudou, a resposta é um 304 de uns ${dec(NOT_MODIFIED_KB)} KB, em vez de ${OBJ_KB} KB. Ainda custa a ida e volta, mas não a banda: ${dec(kb(short))} KB da origem.`,
      facts: [
        ["max-age", `${age} s`],
        ["Revalidações", String(short.revalidated)],
        ["Da origem", `${dec(kb(short))} KB`],
      ],
      highlight: ["proxy", "origem"],
    },
    () => {
      play(short.served, 1, 0);
      counters(short);
    },
  );

  const tlsBackend = `b${Math.ceil(servers / 2)}`;
  b.step(
    {
      id: "s4-reverso",
      title: "Proxy do outro lado",
      subtitle: `um endereço, ${servers} servidores`,
      text: `Do lado do site, um proxy reverso fica na frente de ${servers} servidores iguais. Para o cliente, existe um só endereço e um só certificado: o proxy encerra a conexão [[tls]], escolhe um servidor e repassa o pedido pela rede interna. Como o servidor vê o pedido vindo do proxy, o endereço real do cliente segue no cabeçalho X-Forwarded-For. O proxy também pode guardar respostas, comprimir e barrar pedidos malformados antes que cheguem aos servidores.`,
      facts: [
        ["Servidores", String(servers)],
        ["TLS", "encerrado no proxy"],
        ["Cliente real", "X-Forwarded-For"],
      ],
      highlight: ["proxy"],
    },
    () => {
      c.hide(["origem"]);
      for (const id of ["acertos", "tempo", "origemkb"]) c.count(id, "–", { label: "só no cache" });
      c.show(Array.from({ length: servers }, (_, k) => `b${k + 1}`));
      b.ev({
        t: c.t,
        kind: "state",
        target: "proxy",
        text: "proxy reverso",
        tone: "active",
        role: "ctrl",
        label: "proxy reverso",
      });
      c.send("c2", "proxy", "HTTPS", { role: "crypto", what: "conexão TLS", detail: "certificado do site" });
      c.send("proxy", tlsBackend, "HTTP + X-Forwarded-For", {
        role: "a",
        what: "repassa",
        detail: "rede interna",
      });
      c.send(tlsBackend, "proxy", "200", { role: "a", what: "resposta" });
      c.send("proxy", "c2", "HTTPS", { role: "crypto", what: "resposta cifrada" });
    },
  );

  b.step(
    {
      id: "s5-balanco",
      title: "Dividir a carga",
      subtitle: `${dec(rr.mean)} → ${dec(least.mean)} ticks`,
      text: `Chega um pedido por tick; a maioria leva 1 tick, mas um em cada cinco é um relatório de 9. No revezamento, o proxy manda cada pedido ao próximo servidor da vez, sem olhar quem está ocupado, e pedidos rápidos ficam presos atrás de relatórios: resposta média de ${dec(rr.mean)} ticks. Mandando ao servidor com menos conexões abertas, a média cai para ${dec(least.mean)}. A linha de cima da grade mostra o revezamento, a de baixo, menos conexões.`,
      facts: [
        ["Revezamento", `${dec(rr.mean)} ticks`],
        ["Menos conexões", `${dec(least.mean)} ticks`],
        ["Servidores", String(servers)],
      ],
      highlight: [],
    },
    () => {
      for (const [row, r] of [
        [0, rr],
        [1, least],
      ] as const)
        r.picks.forEach((k, i) => {
          c.cell("pedidos", row * N + i, `S${k + 1}`, {
            dt: i === 0 ? 1 : 0,
            mark: durs[i] === 9 ? "dirty" : "new",
            role: (["a", "b", "crypto", "warn", "ctrl"] as Role[])[k] ?? "a",
          });
        });
      c.count("resp", `${dec(rr.mean)} → ${dec(least.mean)}`, {
        label: `revezamento ${dec(rr.mean)}, menos conexões ${dec(least.mean)} ticks`,
        dt: 1,
      });
    },
  );

  b.step(
    {
      id: "s6-privado",
      title: "O que não se compartilha",
      subtitle: "Cache-Control: private",
      text: `Um cache compartilhado só pode guardar o que serve para todos. Se guardasse a página "minha conta" de um usuário, logado por [[cookie]], a entregaria ao próximo que pedisse o mesmo endereço. Por isso respostas com Cache-Control: private ou no-store, e pedidos com Authorization, não vão para a cache compartilhada; o cabeçalho Vary avisa quando a mesma URL tem versões diferentes, por idioma ou compressão. Com HTTPS, um proxy no meio do caminho só enxerga o destino, não o conteúdo.`,
      facts: [
        ["private / no-store", "fora da cache compartilhada"],
        ["Vary", "uma cópia por variante"],
        ["HTTPS", "proxy vê só o destino"],
      ],
      highlight: ["proxy"],
      quiz: {
        kind: "choice",
        prompt: "Qual resposta um proxy compartilhado não deve guardar?",
        options: [
          "A página da conta com Cache-Control: private",
          "O logotipo com max-age=86400",
          "Uma folha de estilos pública",
        ],
        answer: 0,
        explain: "Ela é de um usuário só; guardada, seria entregue a outra pessoa.",
      },
    },
    () => {
      c.note("proxy", "private: não guarda", "warn", { dt: 1 });
    },
  );

  return b.done({
    hits: long.hits,
    meanMs: dec(long.meanMs),
    originKb: dec(kb(long)),
    revalidated: short.revalidated,
    rr: dec(rr.mean),
    least: dec(least.mean),
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "proxies",
    site: "redes",
    title: "Proxies: cache e proxy reverso",
    summary:
      "O intermediário dos dois lados da Web: o cache compartilhado perto dos clientes, com validade e revalidação, e o proxy reverso na frente dos servidores, encerrando TLS e dividindo a carga; e o que nunca deve ser compartilhado.",
    area: "Aplicação",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 7,
        section: "7.5.2",
        note: "Parques de servidores e proxies Web",
        verified: true,
      },
      { rfc: 9111, note: "HTTP Caching" },
    ],
    simplifications: [
      `Todos os objetos têm ${OBJ_KB} KB e a origem responde sempre em ${ORIGIN_MS} ms.`,
      "Na revalidação, nenhum objeto mudou; todas as respostas são 304.",
      "Cada servidor atende um pedido por vez, sem custo para trocar de pedido.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "capacidade", kind: "int", label: "Objetos que cabem na cache", min: 1, max: 8 },
      { key: "validade", kind: "int", label: "max-age no passo 3 (s)", min: 1, max: 30 },
      { key: "servidores", kind: "int", label: "Servidores atrás do proxy reverso", min: 2, max: 5 },
    ],
  },
  build,
  intro: {
    text: "Entre o navegador e o site costuma haver intermediários: um cache perto de quem pede e um proxy reverso perto de quem responde. Você vai medir quanto tempo e banda o primeiro economiza e como o segundo divide os pedidos entre servidores.",
    facts: [
      ["Pedidos", String(N)],
      ["Objeto", `${OBJ_KB} KB`],
      ["Origem", `${ORIGIN_MS} ms`],
    ],
  },
  outro: {
    title: "Proxies em resumo",
    text: "Um proxy de cache atende pedidos repetidos de perto, poupando tempo e banda, e revalida cópias vencidas com um GET condicional. Um proxy reverso dá um único endereço a vários servidores, encerra o TLS e escolhe para onde vai cada pedido; olhar quantas conexões cada servidor tem funciona melhor que o revezamento cego. Respostas privadas nunca entram num cache compartilhado.",
    facts: (run) => [
      ["Acertos", `${run.stats.hits} de ${N}`],
      ["Tempo médio", `${run.stats.meanMs} ms`],
      ["Balanceamento", `${run.stats.rr} → ${run.stats.least} ticks`],
    ],
  },
  next: ["http", "tls13"],
};

export default lesson;
