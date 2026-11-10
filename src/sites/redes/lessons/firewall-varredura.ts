import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { decide, type Policy, scan, scanAlert, type Verdict } from "../../../sim/net/firewall.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Simulated port scan against one server: what open, closed and filtered mean, how an IDS spots a
 * scan, why a blocklist leaks, and how default-deny with connection state shrinks what is visible.
 * Outcomes are modelled from the rules; no probe is sent.
 */
export const DEFAULTS = { intervalo: 200, limiar: 10 };
const PORTS = [21, 22, 23, 25, 53, 80, 110, 139, 143, 443, 445, 993, 3306, 3389, 5432, 8080];
const SERVICES = new Set([22, 80, 443, 3306, 8080]);
const SCANNER = "198.51.100.66";
const ADMIN = "192.0.2.";
const UPDATE = "192.0.2.80";
const WINDOW = 5000;

const NONE: Policy = { name: "Sem firewall", rules: [], fallback: "aceita", stateful: false };
const BLOCK: Policy = {
  name: "Lista de bloqueio",
  rules: [
    { action: "descarta", port: 3306, note: "banco de dados só interno" },
    { action: "descarta", port: 445, note: "compartilhamento de arquivos" },
  ],
  fallback: "aceita",
  stateful: false,
};
const BLOCK_ACK: Policy = {
  ...BLOCK,
  rules: [{ action: "aceita", ack: true, note: "deixa passar respostas (ACK)" }, ...BLOCK.rules],
};
const DENY: Policy = {
  name: "Negar por padrão",
  rules: [
    { action: "aceita", port: 80, note: "site" },
    { action: "aceita", port: 443, note: "site com TLS" },
    { action: "aceita", port: 22, from: ADMIN, note: "SSH só da rede de administração" },
  ],
  fallback: "descarta",
  stateful: true,
};

function clamp(p: Params) {
  const interval = Math.min(2000, Math.max(50, Math.round(Number(p.intervalo ?? DEFAULTS.intervalo))));
  const threshold = Math.min(16, Math.max(4, Math.round(Number(p.limiar ?? DEFAULTS.limiar))));
  return { interval, threshold };
}

const scene: SceneSpec = {
  viewBox: [960, 640],
  nodes: [
    { id: "varredor", kind: "attacker", label: "Varredor", sub: SCANNER, at: [110, 150] },
    { id: "fw", kind: "firewall", label: "Firewall", sub: "filtra pacotes", at: [450, 150] },
    { id: "srv", kind: "server", label: "Servidor", sub: "203.0.113.20", at: [800, 150] },
    { id: "ids", kind: "box", label: "IDS", sub: "olha o tráfego", at: [450, 280], w: 120, h: 44 },
  ],
  links: [
    { id: "l-vf", from: "varredor", to: "fw" },
    { id: "l-fs", from: "fw", to: "srv" },
    { id: "l-fi", from: "fw", to: "ids", style: "dashed" },
  ],
  widgets: [
    {
      kind: "grid",
      id: "portas",
      title: "Varredura de 16 portas · ✓ aberta · ✗ fechada (RST) · ? filtrada (silêncio)",
      at: [40, 360],
      cols: 16,
      rows: 3,
      cellW: 50,
      indexLabel: "none",
    },
    { kind: "counter", id: "abertas", title: "Abertas", at: [40, 520] },
    { kind: "counter", id: "fechadas", title: "Fechadas", at: [190, 520] },
    { kind: "counter", id: "filtradas", title: "Filtradas", at: [340, 520] },
    {
      kind: "table",
      id: "conexoes",
      title: "Segmentos com ACK chegando",
      at: [520, 510],
      columns: ["De", "Sem estado", "Com estado"],
      widths: [170, 100, 110],
      rows: 2,
    },
  ],
};

const MARK: Record<Verdict, string> = { aberta: "✓", fechada: "✗", filtrada: "?" };
const ROW_NAMES = ["sem firewall", "lista de bloqueio", "negar por padrão"];

export function build(p: Params) {
  const { interval, threshold } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, { varredor: "varredor", fw: "firewall", srv: "servidor", ids: "IDS" }, (t) => String(t));
  const results = [NONE, BLOCK, DENY].map((pol) => scan(pol, SERVICES, PORTS, SCANNER));
  const tally = (r: (typeof results)[number]) => ({
    aberta: r.filter((x) => x.verdict === "aberta").length,
    fechada: r.filter((x) => x.verdict === "fechada").length,
    filtrada: r.filter((x) => x.verdict === "filtrada").length,
  });
  const totals = results.map(tally);
  const alertAt = scanAlert(PORTS.length, interval, threshold, WINDOW);
  const scanMs = (PORTS.length - 1) * interval;
  const openNames = (r: (typeof results)[number]) =>
    r.filter((x) => x.verdict === "aberta").map((x) => x.port);
  const list = (xs: number[]) =>
    xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`;

  const drawRow = (row: number) => {
    const r = results[row] as (typeof results)[number];
    r.forEach((x, i) => {
      c.cell("portas", row * 16 + i, `${x.port}${MARK[x.verdict]}`, {
        dt: i === 0 ? 1 : 0,
        role: x.verdict === "aberta" ? "a" : x.verdict === "filtrada" ? "ctrl" : "muted",
        ...(x.verdict === "aberta" ? { mark: "hit" as const } : {}),
        ...(i === 0
          ? { log: { who: ROW_NAMES[row] ?? "", what: "varredura", detail: `${tally(r).aberta} abertas` } }
          : {}),
      });
    });
    const t = totals[row] as ReturnType<typeof tally>;
    c.count("abertas", String(t.aberta));
    c.count("fechadas", String(t.fechada));
    c.count("filtradas", String(t.filtrada));
  };

  b.step(
    {
      id: "s1-sondas",
      title: "Aberta, fechada ou filtrada",
      subtitle: "Três respostas possíveis",
      text: `Para saber se uma [[porta]] TCP está em uso, basta começar um [[handshake]]: mandar um SYN e ver o que volta. Um SYN-ACK diz que há um serviço ouvindo, porta aberta. Um RST diz que a máquina existe mas ninguém ouve ali, porta fechada. Silêncio quer dizer que algo no caminho descartou o pacote: porta filtrada. Testar muitas portas assim é uma varredura, o primeiro passo de quem procura um serviço vulnerável.`,
      facts: [
        ["SYN-ACK", "aberta"],
        ["RST", "fechada"],
        ["Nada", "filtrada"],
      ],
      highlight: ["srv"],
    },
    () => {
      c.send("varredor", "srv", "SYN :80", { role: "bad", what: "sonda", detail: "porta 80" });
      c.send("srv", "varredor", "SYN-ACK", { role: "b", what: "porta 80 aberta" });
      c.send("varredor", "srv", "SYN :23", { role: "bad", what: "sonda", detail: "porta 23" });
      c.send("srv", "varredor", "RST", { role: "b", what: "porta 23 fechada" });
    },
  );

  const t0 = totals[0] as ReturnType<typeof tally>;
  b.step(
    {
      id: "s2-varredura",
      title: "Sem firewall",
      subtitle: `${t0.aberta} portas abertas`,
      text: `Sem filtro nenhum, a varredura de ${PORTS.length} portas comuns devolve um mapa completo: ${list(openNames(results[0] ?? []))} respondem SYN-ACK, as outras respondem RST. Entre as abertas há serviços que nunca deveriam ser vistos de fora, como o banco de dados na 3306 e um painel administrativo na 8080. Com uma sonda a cada ${interval} ms, tudo leva ${(scanMs / 1000).toFixed(1).replace(".", ",")} s.`,
      facts: [
        ["Abertas", String(t0.aberta)],
        ["Fechadas", String(t0.fechada)],
        ["Duração", `${(scanMs / 1000).toFixed(1).replace(".", ",")} s`],
      ],
      highlight: ["srv"],
      quiz: {
        kind: "number",
        prompt: `Sem firewall, quantas das ${PORTS.length} portas aparecem abertas?`,
        answer: t0.aberta,
        explain: `Os serviços ouvindo são ${list([...SERVICES])}: cada um responde SYN-ACK.`,
      },
    },
    () => drawRow(0),
  );

  b.step(
    {
      id: "s3-sinais",
      title: "O IDS vê a varredura",
      subtitle: alertAt === null ? "Lenta demais para o limiar" : `Alerta na sonda ${alertAt + 1}`,
      text:
        alertAt === null
          ? `Um [[ids]] que conta portas distintas por origem dispara com ${threshold} portas em ${WINDOW / 1000} s. Com uma sonda a cada ${interval} ms, nunca há mais de ${Math.min(PORTS.length, Math.ceil(WINDOW / interval))} na janela, e a varredura passa abaixo do limiar. Varreduras lentas trocam tempo por discrição; contra elas, janelas maiores e correlação de registros ao longo de horas.`
          : `Um [[ids]] que conta portas distintas por origem vê ${SCANNER} tocar ${threshold} portas diferentes em menos de ${WINDOW / 1000} s e dispara na sonda ${alertAt + 1}, depois de ${((alertAt * interval) / 1000).toFixed(1).replace(".", ",")} s. Outros sinais: muitos RST saindo do servidor, conexões que nunca completam o handshake e uma origem que nunca fala com nenhum serviço de verdade.`,
      facts: [
        ["Limiar", `${threshold} portas em ${WINDOW / 1000} s`],
        ["Intervalo", `${interval} ms`],
        ["Alerta", alertAt === null ? "não dispara" : `sonda ${alertAt + 1}`],
      ],
      highlight: ["ids"],
      tags: ["signals"],
    },
    () => {
      c.send("fw", "ids", "cópia", { role: "muted", what: "IDS observa o tráfego" });
      c.state("ids", alertAt === null ? "sem alerta" : `alerta: ${threshold} portas`, {
        tone: alertAt === null ? "warn" : "bad",
        label: alertAt === null ? "varredura abaixo do limiar" : `alerta de varredura vinda de ${SCANNER}`,
      });
    },
  );

  const t1 = totals[1] as ReturnType<typeof tally>;
  b.step(
    {
      id: "s4-bloqueio",
      title: "Lista do que proibir",
      subtitle: `${t1.aberta} ainda abertas`,
      text: `O primeiro [[firewall]] deixa tudo passar e bloqueia o que alguém lembrou: o banco de dados e o compartilhamento de arquivos. As duas portas agora ficam em silêncio, filtradas. Mas o painel na 8080 e o SSH continuam expostos, porque ninguém os incluiu na lista. Uma lista de bloqueio só protege o que já se sabe que existe; cada serviço novo nasce exposto.`,
      facts: [
        ["Regras", "descarta 3306 e 445"],
        ["Padrão", "aceita"],
        ["Ainda abertas", list(openNames(results[1] ?? []))],
      ],
      highlight: ["fw"],
    },
    () => {
      c.state("fw", "lista de bloqueio", { tone: "warn", label: "firewall com lista de bloqueio", dt: 1 });
      drawRow(1);
    },
  );

  const t2 = totals[2] as ReturnType<typeof tally>;
  b.step(
    {
      id: "s5-padrao",
      title: "Negar por padrão",
      subtitle: `${t2.aberta} abertas, ${t2.filtrada} em silêncio`,
      text: `A regra que funciona é a inversa: descartar tudo e liberar só o necessário. O site, nas portas 80 e 443, aceita qualquer origem; o SSH só aceita a rede de administração. Para o varredor, sobram ${list(openNames(results[2] ?? []))} abertas e ${t2.filtrada} portas em silêncio, que nem confirmam se a máquina existe. Cada sonda filtrada obriga quem varre a esperar um tempo limite, o que torna a varredura mais lenta e menos informativa.`,
      facts: [
        ["Padrão", "descarta"],
        ["Liberadas", "80, 443; 22 só da administração"],
        ["Visíveis de fora", String(t2.aberta)],
      ],
      highlight: ["fw"],
      tags: ["defense"],
    },
    () => {
      c.state("fw", "nega por padrão", { tone: "good", label: "firewall nega por padrão", dt: 1 });
      drawRow(2);
    },
  );

  const legit = { port: 443, from: UPDATE, ack: true };
  const forged = { port: 3306, from: SCANNER, ack: true };
  const table = new Set([`${UPDATE}:443`]);
  const stLegit = decide(DENY, legit, table);
  const stForged = decide(DENY, forged, table);
  const slLegit = decide(BLOCK_ACK, legit);
  const slForged = decide(BLOCK_ACK, forged);
  b.step(
    {
      id: "s6-estado",
      quiz: {
        kind: "choice",
        prompt: "O varredor forja um segmento só com o bit ACK. O firewall com estado deixa passar?",
        options: [
          "Não: o ACK não casa com nenhuma conexão da tabela",
          "Sim: todo ACK é tratado como resposta",
          "Sim, mas só se for para a porta 80",
        ],
        answer: 0,
        explain:
          "O filtro com estado não julga o pacote sozinho: confere se ele pertence a uma conexão que viu começar. Um ACK sem SYN anterior não pertence a nenhuma e é descartado.",
      },
      title: "Lembrar das conexões",
      subtitle: "ACK sem conexão é descartado",
      text: `O servidor também abre conexões, por exemplo para buscar atualizações, e as respostas precisam entrar. Um filtro sem estado costuma liberar todo segmento com o bit ACK, tratando-o como resposta, e um varredor pode forjar ACKs para atravessá-lo. Um firewall com estado guarda uma tabela das conexões que viu começar: a resposta da atualização casa com uma entrada, o ACK do varredor não casa com nenhuma e é descartado.`,
      facts: [
        ["Resposta legítima", stLegit.action],
        ["ACK forjado, sem estado", slForged.action],
        ["ACK forjado, com estado", stForged.action],
      ],
      highlight: ["fw"],
      tags: ["defense"],
    },
    () => {
      c.send("srv", "fw", `SYN → ${UPDATE}`, {
        role: "b",
        what: "servidor abre conexão",
        detail: "entra na tabela",
      });
      c.row("conexoes", 0, [`${UPDATE} (resposta)`, slLegit.action, stLegit.action], { dt: 1, mark: "hit" });
      c.send("varredor", "fw", "ACK :3306", {
        role: "bad",
        what: "ACK forjado",
        lost: stForged.action !== "aceita",
      });
      c.row("conexoes", 1, [`${SCANNER} (forjado)`, slForged.action, stForged.action], {
        dt: 1,
        mark: stForged.action === "aceita" ? "bad" : "hit",
        log: { who: "firewall", what: `ACK forjado: ${stForged.action}`, detail: stForged.why },
      });
    },
  );

  return b.done({
    open0: t0.aberta,
    open1: t1.aberta,
    open2: t2.aberta,
    filtered2: t2.filtrada,
    alert: alertAt === null ? -1 : alertAt + 1,
    forged: `${slForged.action}/${stForged.action}`,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "firewall-varredura",
    site: "redes",
    title: "Firewall e varredura de portas",
    summary:
      "Uma simulação de como uma varredura descobre serviços expostos, como um IDS a percebe e por que negar por padrão, com tabela de conexões, mostra muito menos do que uma lista de bloqueio.",
    area: "Segurança",
    refs: [
      { book: "tanenbaum-cn", chapter: 8, section: "8.3.1", note: "Firewalls", verified: true },
      {
        book: "tanenbaum-cn",
        chapter: 8,
        section: "8.3.2",
        note: "Detecção e prevenção de intrusão",
        verified: true,
      },
    ],
    simplifications: [
      "O resultado de cada sonda é deduzido das regras: nenhum pacote é enviado e nada aqui funciona fora da lição.",
      "O IDS só conta portas distintas por origem numa janela de 5 segundos.",
      "A tabela de conexões guarda só origem e porta; firewalls reais guardam a tupla completa e o estado do TCP.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "intervalo", kind: "int", label: "Intervalo entre sondas (ms)", min: 50, max: 2000 },
      {
        key: "limiar",
        kind: "int",
        label: "Limiar do IDS (portas em 5 s)",
        min: 4,
        max: 16,
        help: "Com sondas espaçadas, a varredura pode ficar abaixo do limiar.",
      },
    ],
  },
  build,
  intro: {
    text: "Antes de atacar um serviço, é preciso achá-lo. Esta simulação mostra o que uma varredura de portas descobre num servidor desprotegido, como ela aparece para um IDS e quanto cada tipo de firewall deixa ver.",
    facts: [
      ["Portas testadas", String(PORTS.length)],
      ["Serviços no servidor", String(SERVICES.size)],
      ["Intervalo", `${DEFAULTS.intervalo} ms`],
    ],
  },
  outro: {
    title: "Firewall e varredura em resumo",
    text: "Uma sonda SYN distingue portas abertas, fechadas e filtradas. Muitas portas distintas de uma origem em pouco tempo denunciam a varredura. Listas de bloqueio esquecem serviços; negar por padrão expõe só o que foi liberado, e a tabela de conexões impede que segmentos forjados se passem por respostas.",
    facts: (run) => [
      ["Abertas sem firewall", String(run.stats.open0)],
      ["Com lista de bloqueio", String(run.stats.open1)],
      ["Negando por padrão", String(run.stats.open2)],
    ],
  },
  next: ["tcp-conexao", "syn-flood", "nat"],
};

export default lesson;
