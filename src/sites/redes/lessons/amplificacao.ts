import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { factor, flood, REFLECTORS, type Reflector, rateLimited } from "../../../sim/net/amplify.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { amplificacao as practice } from "../practice.ts";

/**
 * Simulated reflection and amplification DDoS: forged source addresses, the amplification factor,
 * the sum at the victim's link, what the victim sees, and the defenses at the source (BCP 38), at
 * the reflectors (closing them, rate limiting) and upstream. Bandwidth arithmetic only.
 */
export const DEFAULTS = { protocolo: "dns", atacante: 100, vitima: 1000 };
const VICTIM = "203.0.113.80";
const REFLECTOR_COUNT = 2000;
const RRL = 5;

function clamp(p: Params) {
  const proto = p.protocolo === "ntp" ? "ntp" : "dns";
  const attacker = Math.min(1000, Math.max(10, Math.round(Number(p.atacante ?? DEFAULTS.atacante))));
  const victim = Math.min(10000, Math.max(100, Math.round(Number(p.vitima ?? DEFAULTS.vitima))));
  return { r: REFLECTORS[proto] as Reflector, attacker, victim };
}

const R = [
  [440, 110],
  [440, 260],
  [440, 410],
] as const;

const scene: SceneSpec = {
  viewBox: [960, 640],
  nodes: [
    { id: "atacante", kind: "attacker", label: "Atacante", sub: "origem forjada", at: [110, 260] },
    ...R.map((at, i) => ({
      id: `r${i}`,
      kind: "server" as const,
      label: `Refletor ${i + 1}`,
      sub: "serviço UDP aberto",
      at,
    })),
    { id: "vitima", kind: "server", label: "Vítima", sub: VICTIM, at: [820, 260] },
  ],
  links: [
    // fan out through a shared trunk so no wire crosses the middle reflector
    ...R.map(([, y], i) => ({
      id: `la${i}`,
      from: "atacante",
      to: `r${i}`,
      style: "dashed" as const,
      ...(y === 260 ? {} : { via: [[280, 260] as const, [280, y] as const] }),
    })),
    ...R.map(([, y], i) => ({
      id: `lv${i}`,
      from: `r${i}`,
      to: "vitima",
      ...(y === 260 ? {} : { via: [[640, y] as const, [640, 260] as const] }),
    })),
  ],
  widgets: [
    {
      kind: "table",
      id: "fatores",
      title: "Pedido pequeno, resposta grande",
      at: [40, 490],
      columns: ["Serviço", "Pedido", "Resposta", "Fator"],
      widths: [120, 80, 90, 70],
      rows: 2,
    },
    { kind: "counter", id: "sai", title: "Sai do atacante", at: [450, 490] },
    { kind: "counter", id: "chega", title: "Chega à vítima", at: [620, 490] },
    { kind: "counter", id: "enlace", title: "Enlace da vítima", at: [790, 490] },
    { kind: "counter", id: "carga", title: "Uso do enlace", at: [450, 570] },
  ],
};

const mbps = (v: number) =>
  v >= 1000
    ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1).replace(".", ",")} Gbit/s`
    : `${Math.round(v)} Mbit/s`;
const num = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const bytes = (n: number) => `${num(n)} B`;
const pct = (v: number) => `${num(Math.round(v * 100))}%`;
const times = (v: number) => (v >= 10 ? num(Math.round(v)) : v.toFixed(1).replace(".", ","));

export function build(p: Params) {
  const { r, attacker, victim } = clamp(p);
  const b = lessonBuilder();
  const c = talk(
    b,
    { atacante: "atacante", vitima: "vítima", r0: "refletor 1", r1: "refletor 2", r2: "refletor 3" },
    (t) => String(t),
  );
  const f = factor(r);
  const full = flood(r, attacker, victim);
  const rrl = rateLimited(r, REFLECTOR_COUNT, RRL);
  const others = Object.values(REFLECTORS);

  b.step(
    {
      id: "s1-reflexao",
      title: "A resposta vai para outro",
      subtitle: `origem forjada: ${VICTIM}`,
      text: `Num serviço sobre [[udp]] não há handshake: o servidor responde a quem o pacote diz ter enviado. Se o atacante escreve como origem o endereço da vítima, ${VICTIM}, a resposta vai para ela, que nunca perguntou nada. Isso é [[spoofing]] de origem, e o servidor enganado vira um refletor. Para a vítima, o tráfego parece vir de servidores legítimos, não do atacante.`,
      facts: [
        ["Origem escrita", VICTIM],
        ["Quem responde", "o refletor"],
        ["Quem recebe", "a vítima"],
      ],
      highlight: ["r0"],
    },
    () => {
      c.send("atacante", "r0", `pedido, origem ${VICTIM}`, {
        role: "bad",
        what: "pedido com origem forjada",
        detail: bytes(r.request),
      });
      c.send("r0", "vitima", "resposta", {
        role: "warn",
        what: "resposta não pedida",
        detail: bytes(r.response),
      });
      c.state("vitima", "recebe sem ter pedido", {
        tone: "warn",
        label: "a vítima recebe uma resposta que não pediu",
      });
    },
  );

  b.step(
    {
      id: "s2-fator",
      title: "O fator de amplificação",
      subtitle: `${r.name}: ${Math.round(f)}×`,
      text: `O atacante escolhe serviços em que um pedido curto gera uma resposta longa. No exemplo, um pedido de ${bytes(r.request)} a um ${r.name} volta como ${bytes(r.response)}: cada byte enviado vira ${Math.round(f)} na vítima. Esse é o [[fator-de-amplificacao]]. Os tamanhos são ordens de grandeza ilustrativas; serviços diferentes amplificam de dezenas a centenas de vezes, e o atacante procura os piores.`,
      facts: [
        ["Pedido", bytes(r.request)],
        ["Resposta", bytes(r.response)],
        ["Fator", `${Math.round(f)}×`],
      ],
      highlight: [],
      quiz: {
        kind: "number",
        prompt: `Um pedido de ${bytes(r.request)} gera uma resposta de ${bytes(r.response)}. Qual o fator de amplificação?`,
        answer: Math.round(f),
        explain: `${r.response} / ${r.request} = ${Math.round(f)}.`,
      },
    },
    () => {
      others.forEach((x, i) => {
        c.row(
          "fatores",
          i,
          [x.proto.toUpperCase(), bytes(x.request), bytes(x.response), `${Math.round(factor(x))}×`],
          {
            dt: 1,
            mark: x.proto === r.proto ? "bad" : "new",
            log: {
              who: x.name,
              what: `fator ${Math.round(factor(x))}×`,
              detail: `${x.request} → ${x.response} B`,
            },
          },
        );
      });
    },
  );

  b.step(
    {
      id: "s3-soma",
      title: "Milhares de refletores",
      subtitle: `${mbps(full.sent)} viram ${mbps(full.arriving)}`,
      text: `Espalhando os pedidos por milhares de refletores, nenhum deles trabalha muito, mas tudo converge para a vítima. Com ${mbps(full.sent)} de pedidos forjados e fator ${Math.round(f)}, chegam ${mbps(full.arriving)} a um enlace de ${mbps(victim)}: ${full.overload > 1 ? `${times(full.overload)} vezes a capacidade. O enlace satura e o tráfego legítimo se perde junto` : full.overload > 0.7 ? "ainda abaixo da capacidade, mas com pouca folga" : `${pct(full.overload)} da capacidade. Este enlace aguenta, mas um fator maior ou mais banda forjada mudariam isso`}. É uma [[ddos|negação de serviço distribuída]] sem que o atacante exponha o próprio endereço.`,
      facts: [
        ["Enviado", mbps(full.sent)],
        ["Recebido", mbps(full.arriving)],
        ["Uso do enlace", pct(full.overload)],
      ],
      highlight: ["vitima"],
      quiz: {
        kind: "number",
        prompt: `Com ${mbps(attacker)} de pedidos e fator ${Math.round(f)}, quantos Mbit/s chegam à vítima?`,
        answer: Math.round(full.arriving),
        explain: `${attacker} × ${Math.round(f)} = ${Math.round(full.arriving)} Mbit/s.`,
      },
    },
    () => {
      R.forEach((_, i) => {
        c.send("atacante", `r${i}`, "pedidos", {
          role: "bad",
          what: "pedidos forjados",
          dt: i === 0 ? 1 : 0,
        });
      });
      R.forEach((_, i) => {
        c.send(`r${i}`, "vitima", "respostas", {
          role: "warn",
          what: "respostas grandes",
          dt: i === 0 ? 1 : 0,
        });
      });
      c.count("sai", mbps(full.sent), { label: `atacante envia ${mbps(full.sent)}` });
      c.count("chega", mbps(full.arriving), { label: `chegam ${mbps(full.arriving)}`, role: "bad" });
      c.count("enlace", mbps(victim), { label: `enlace de ${mbps(victim)}` });
      c.count("carga", pct(full.overload), {
        label: `uso: ${pct(full.overload)}`,
        role: full.overload > 1 ? "bad" : "warn",
      });
      c.state("vitima", full.overload > 1 ? "enlace saturado" : "no limite", {
        tone: full.overload > 1 ? "bad" : "warn",
        label: full.overload > 1 ? "o enlace da vítima satura" : "o enlace da vítima fica no limite",
      });
    },
  );

  b.step(
    {
      id: "s4-sinais",
      title: "O que a vítima vê",
      subtitle: "Respostas sem perguntas",
      text: `Na borda da vítima, o padrão é claro: um volume enorme de [[udp]] vindo da porta do serviço, ${r.proto === "dns" ? "53" : "123"}, de milhares de endereços diferentes, com pacotes grandes e muitas vezes fragmentados. Nenhuma dessas respostas casa com uma pergunta feita pela vítima. A razão entre tráfego que entra e que sai dispara. Do lado dos refletores, aparecem pedidos repetidos de uma mesma origem, a vítima, que nunca confirma nada.`,
      facts: [
        ["Porta de origem", r.proto === "dns" ? "53" : "123"],
        ["Pedidos da vítima", "nenhum"],
        ["Fontes", "milhares"],
      ],
      highlight: ["vitima"],
      tags: ["signals"],
    },
    () => {
      c.note(
        "vitima",
        `UDP da porta ${r.proto === "dns" ? "53" : "123"} sem pergunta correspondente`,
        "warn",
        {
          dt: 1,
        },
      );
      c.note("r1", "mesma origem pedindo sem parar", "warn");
    },
  );

  b.step(
    {
      id: "s5-origem",
      title: "Filtrar na origem",
      subtitle: "BCP 38",
      text: `O ataque depende de uma coisa: pacotes com origem falsa saindo da rede do atacante. Com [[bcp38]], o provedor descarta na borda todo pacote cuja origem não pertence aos clientes daquela rede, e o pedido forjado nunca chega ao refletor. A medida não protege quem a adota, protege os outros, por isso a adoção é desigual. Onde ela existe, a reflexão não começa.`,
      facts: [
        ["Onde", "borda do provedor do atacante"],
        ["Descarta", "origem que não é da rede"],
        ["Beneficia", "o resto da Internet"],
      ],
      highlight: ["atacante"],
      tags: ["defense"],
    },
    () => {
      c.send("atacante", "r0", `origem ${VICTIM}`, { role: "bad", what: "pedido forjado", lost: true });
      c.note("atacante", "provedor descarta: origem não pertence a esta rede", "good");
    },
  );

  b.step(
    {
      id: "s6-refletores",
      title: "Fechar e limitar refletores",
      subtitle: `${mbps(full.arriving)} → ${mbps(Math.min(full.arriving, rrl))}`,
      text: `Do lado dos refletores, a regra é não responder a qualquer um: resolvedores só para a própria rede e comandos antigos de monitoramento desligados. Os que precisam ser públicos limitam respostas por destino; com ${RRL} por segundo, ${num(REFLECTOR_COUNT)} refletores somam no máximo ${mbps(rrl)} sobre a vítima. Para o que ainda chega, a vítima conta com filtragem no provedor e redes de distribuição com [[anycast]], que espalham o volume por muitos pontos.`,
      facts: [
        ["Limite por destino", `${RRL} respostas/s`],
        ["Teto com limite", mbps(rrl)],
        ["Uso do enlace", pct(Math.min(full.arriving, rrl) / victim)],
      ],
      highlight: ["r0", "r1", "r2"],
      tags: ["defense"],
    },
    () => {
      R.forEach((_, i) => {
        c.state(`r${i}`, `limite ${RRL}/s`, {
          tone: "good",
          label: `refletor ${i + 1} limita respostas`,
          dt: i === 0 ? 1 : 0,
        });
      });
      const after = Math.min(full.arriving, rrl);
      c.count("chega", mbps(after), { label: `chegam ${mbps(after)}`, role: "b" });
      c.count("carga", pct(after / victim), { label: `uso: ${pct(after / victim)}`, role: "b" });
      c.state("vitima", after > victim ? "ainda acima do enlace" : "respira", {
        tone: after > victim ? "warn" : "good",
        label:
          after > victim
            ? "ainda chega mais que o enlace aguenta: falta filtrar antes dele"
            : "a vítima volta a atender",
      });
    },
  );

  return b.done({
    factor: Math.round(f),
    arriving: Math.round(full.arriving),
    overload: Number(full.overload.toFixed(2)),
    limited: Math.round(rrl),
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "amplificacao",
    site: "redes",
    title: "Ataques de reflexão e amplificação",
    summary:
      "Uma simulação de como origens forjadas e serviços UDP abertos multiplicam um ataque de negação de serviço: o fator de amplificação, a soma no enlace da vítima, os sinais e as defesas em cada ponta.",
    area: "Segurança",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 8,
        section: "8.2.4",
        note: "Interrupção: reflexão e amplificação em DDoS",
        verified: true,
      },
    ],
    simplifications: [
      "Apenas aritmética de banda: nenhum pacote é montado e nada aqui funciona fora da lição.",
      "Os tamanhos de pedido e resposta são ordens de grandeza ilustrativas, não medições de um serviço específico.",
      "Todos os refletores respondem tudo e nenhum pedido se perde no caminho.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      {
        key: "protocolo",
        kind: "choice",
        label: "Serviço refletor",
        options: [
          { value: "dns", label: "DNS aberto" },
          { value: "ntp", label: "NTP com monitoramento antigo" },
        ],
      },
      { key: "atacante", kind: "int", label: "Pedidos forjados (Mbit/s)", min: 10, max: 1000 },
      { key: "vitima", kind: "int", label: "Enlace da vítima (Mbit/s)", min: 100, max: 10000 },
    ],
  },
  build,
  intro: {
    text: "Um atacante com pouca banda pode derrubar um enlace muito maior se convencer outros servidores a mandar respostas grandes para a vítima. Esta simulação mostra como, em números, o que a vítima enxerga e onde cada defesa corta o ataque.",
    facts: [
      ["Serviço", REFLECTORS.dns.name],
      ["Atacante", mbps(DEFAULTS.atacante)],
      ["Enlace da vítima", mbps(DEFAULTS.vitima)],
    ],
  },
  outro: {
    title: "Reflexão e amplificação em resumo",
    text: "UDP responde a quem o pacote diz ser, e serviços abertos com respostas grandes multiplicam o tráfego. Origens forjadas, milhares de refletores e um fator de amplificação alto saturam enlaces bem maiores que o do atacante. Filtrar origens falsas no provedor, fechar ou limitar refletores e filtrar antes do enlace da vítima cortam o ataque em pontos diferentes.",
    facts: (run) => [
      ["Fator", `${run.stats.factor}×`],
      ["Chega à vítima", `${run.stats.arriving} Mbit/s`],
      ["Com limite nos refletores", `${run.stats.limited} Mbit/s`],
    ],
  },
  next: ["syn-flood", "udp"],
  practice,
};

export default lesson;
