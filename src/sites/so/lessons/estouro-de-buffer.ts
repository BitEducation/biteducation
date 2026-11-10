import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { BUF, FRAME, type Outcome, overflowRun, WORD } from "../../../sim/os/overflow.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Buffer overflow as a memory-layout lesson: an unchecked copy runs past an 8-byte buffer into
 * the canary, the saved frame pointer and the return address. The canary catches it at return;
 * NX and ASLR turn a hijack into a crash. No payloads, only consequences, signals and defenses.
 */
export const DEFAULTS = { entrada: 20, canario: "nao" };

function clamp(p: Params) {
  const len = Math.min(24, Math.max(1, Math.round(Number(p.entrada ?? DEFAULTS.entrada))));
  return { len, canary: p.canario === "sim" };
}

const END: Record<Outcome, string> = {
  ok: "a função retorna normalmente",
  latente: "a função retorna, com um byte estragado que ninguém viu",
  abortado: "o canário mudou: o programa é encerrado",
  quebra: "quem chamou recebe um quadro estragado e o programa cai",
  desvio: "o processador salta para um endereço que veio da entrada",
};

const SHORT: Record<string, string> = {
  ok: "retorno normal",
  latente: "dano escondido",
  abortado: "encerrado",
  quebra: "queda",
  desvio: "desvio de fluxo",
};

function scene(): SceneSpec {
  return {
    viewBox: [960, 560],
    nodes: [
      {
        id: "fn",
        kind: "process",
        label: "le_nome()",
        sub: "copia sem conferir o tamanho",
        at: [180, 80],
        w: 240,
      },
      { id: "kern", kind: "kernel", label: "Núcleo", sub: "proteções de memória", at: [760, 80], w: 220 },
    ],
    links: [{ id: "l-k", from: "fn", to: "kern" }],
    widgets: [
      {
        kind: "grid",
        id: "pilha",
        title: `Quadro da função na pilha, em palavras de ${WORD} bytes (endereços crescem →)`,
        at: [40, 190],
        cols: FRAME.length,
        rows: 1,
        cellW: 170,
        indexLabel: "none",
      },
      { kind: "counter", id: "alem", title: "Bytes além do buffer", at: [40, 300] },
      {
        kind: "table",
        id: "defesas",
        title: "Camadas de proteção",
        at: [300, 300],
        columns: ["Proteção", "O que faz", "Resultado"],
        widths: [140, 290, 200],
        rows: 3,
      },
    ],
  };
}

export function build(p: Params) {
  const { len, canary } = clamp(p);
  const r = overflowRun(len, canary);
  const raw = overflowRun(len, false);
  const b = lessonBuilder();
  const c = talk(b, { fn: "le_nome()", kern: "núcleo" }, (t) => `t${t}`);
  const pl = (k: number, one: string, many: string) => (k === 1 ? one : many);
  const hitNames = FRAME.filter((_, i) => r.hit[i] && i >= 2);
  const fill = () => {
    FRAME.forEach((name, i) => {
      c.cell("pilha", i, name, { dt: 0 });
    });
  };

  b.step(
    {
      id: "s1-quadro",
      title: "O quadro na pilha",
      subtitle: `Buffer de ${BUF} bytes`,
      text: `Quando uma função é chamada, a pilha ganha um [[quadro-de-pilha|quadro]] com as variáveis locais e, logo acima, o endereço para onde voltar. A função le_nome tem um buffer de ${BUF} bytes e copia o nome digitado para ele sem conferir o tamanho. Entre o buffer e o retorno há um canário, um valor sorteado, e o ponteiro do quadro anterior.`,
      facts: [
        ["Buffer", `${BUF} bytes`],
        ["Palavras no quadro", String(FRAME.length)],
        ["Confere o tamanho?", "não"],
      ],
      highlight: ["pilha", "fn"],
    },
    () => {
      fill();
      c.state("fn", "quadro criado", { tone: "active" });
      c.count("alem", "0", { label: "nada ainda" });
    },
  );

  b.step(
    {
      id: "s2-copia",
      title: "A cópia passa do fim",
      subtitle: `${len} bytes num espaço de ${BUF}`,
      text:
        r.over > 0
          ? `Chega uma entrada de ${len} bytes. A cópia não para no fim do buffer: segue gravando nas palavras seguintes, ${r.over} ${pl(r.over, "byte", "bytes")} além do limite. Na memória não há fronteira entre uma variável e outra, só endereços em sequência. Foram atingidos: ${hitNames.join(", ") || "só o buffer"}. Isso é um [[estouro-de-buffer|estouro de buffer]].`
          : `Chega uma entrada de ${len} bytes, que cabe no buffer de ${BUF}. A cópia termina dentro do espaço reservado e o resto do quadro fica intacto. O código continua com o defeito, porém: quem mandar uma entrada maior vai escrever além do fim. Aumente a entrada no Laboratório para ver o [[estouro-de-buffer|estouro de buffer]].`,
      facts: [
        ["Entrada", `${len} bytes`],
        ["Além do buffer", `${r.over} bytes`],
        ["Palavras atingidas", String(r.touched)],
      ],
      highlight: ["pilha", "alem"],
      quiz: {
        kind: "number",
        prompt: `O buffer tem ${BUF} bytes e a entrada copiada sem conferir tem ${len}. Quantos bytes são gravados além do fim do buffer?`,
        answer: r.over,
        unit: "bytes",
        explain: `${len} − ${BUF} = ${r.over}${r.over === 0 ? ": cabe" : ""}. ${r.over > 0 ? "Esses bytes caem nas palavras seguintes do quadro." : "Com mais de oito, o excedente cairia nas palavras seguintes."}`,
      },
    },
    () => {
      FRAME.forEach((name, i) => {
        if (!r.hit[i]) return;
        const inside = i < 2;
        c.cell("pilha", i, inside ? `${name}: entrada` : `${name} ✗`, { mark: inside ? "new" : "evict" });
      });
      c.count("alem", String(r.over), { label: `${r.over} bytes além` });
    },
  );

  b.step(
    {
      id: "s3-retorno",
      title: "O que o retorno encontra",
      subtitle: canary ? "Antes, sem canário" : END[raw.outcome],
      text: `Sem nenhuma proteção, o que acontece depende de onde a cópia parou: ${END[raw.outcome]}. O caso perigoso é o último: se a entrada chega ao [[endereco-de-retorno|endereço de retorno]], quem escolhe a entrada escolhe para onde o programa vai ao sair da função. Foi assim que funcionaram falhas famosas, como o worm de 1988.`,
      facts: [
        ["Sem proteção", SHORT[raw.outcome] ?? ""],
        ["Retorno atingido", r.hit[4] ? "sim" : "não"],
        ["Bytes até o retorno", String(4 * WORD)],
      ],
      highlight: ["pilha"],
      quiz: {
        kind: "choice",
        prompt: "Por que sobrescrever o endereço de retorno é o pior caso?",
        options: [
          "Ao sair da função, o processador salta para onde esse valor mandar",
          "Porque o endereço de retorno guarda a senha do usuário",
          "Porque ele fica fora do quadro e afeta outros processos",
        ],
        answer: 0,
        explain:
          "A instrução de retorno lê esse valor da pilha e salta para lá. Se veio da entrada, o fluxo do programa passa a obedecer a quem a escreveu.",
      },
    },
    () => {
      c.state("fn", raw.outcome === "ok" ? "retorna normalmente" : END[raw.outcome], {
        tone: raw.outcome === "ok" ? "good" : raw.outcome === "latente" ? "warn" : "bad",
      });
    },
  );

  b.step(
    {
      id: "s4-canario",
      title: "O canário",
      subtitle: canary ? "Ligado" : "Desligado neste programa",
      text: canary
        ? `Com o [[canario|canário]] ligado, o compilador grava um valor sorteado no início da execução logo abaixo do retorno e, antes de retornar, confere se ele mudou. Uma cópia que chega ao retorno passa obrigatoriamente pelo canário. ${r.over > 0 ? "Aqui ele mudou, e o programa é encerrado antes do salto." : "Aqui ele ficou intacto e a função retorna."} Melhor cair do que obedecer.`
        : `O compilador pode pôr um [[canario|canário]]: um valor sorteado no início da execução, gravado logo abaixo do retorno e conferido antes de retornar. Uma cópia que chega ao retorno passa obrigatoriamente por ele. Neste programa ele está desligado, então nada é conferido. Ligue o canário no Laboratório e repita a mesma entrada.`,
      facts: [
        ["Canário", canary ? "ligado" : "desligado"],
        ["Mudou?", r.hit[2] ? "sim" : "não"],
        ["Resultado", END[r.outcome]],
      ],
      highlight: ["pilha", "fn"],
    },
    () => {
      if (canary && r.hit[2]) {
        c.cell("pilha", 2, "canário ≠ sorteado", { mark: "miss" });
        c.state("fn", "canário mudou: encerra", { tone: "bad" });
      } else if (canary) {
        c.cell("pilha", 2, "canário ok", { mark: "hit" });
        c.state("fn", "canário ok: retorna", { tone: "good" });
      } else {
        c.cell("pilha", 2, "canário: não conferido", { mark: "dirty" });
      }
    },
  );

  b.step(
    {
      id: "s5-nx-aslr",
      title: "NX e ASLR",
      subtitle: "Se o retorno mudar mesmo assim",
      text: `Duas proteções do sistema agem se o retorno for alterado. Com [[nx|NX]], as páginas da pilha não podem ser executadas: bytes da entrada não viram instruções. Com [[aslr|ASLR]], pilha, bibliotecas e o próprio programa começam em endereços sorteados a cada execução, e quem escreveu a entrada não sabe para onde mandar o salto. O desvio vira uma queda, não uma tomada de controle.`,
      facts: [
        ["NX", "pilha não executa"],
        ["ASLR", "endereços sorteados"],
        ["Pior resultado", "queda"],
      ],
      highlight: ["kern", "defesas"],
    },
    () => {
      c.row(
        "defesas",
        0,
        ["Canário", "confere um valor sorteado antes do retorno", canary ? "ligado" : "desligado"],
        {
          dt: 1,
          mark: canary ? "hit" : "warn",
        },
      );
      c.row("defesas", 1, ["NX", "pilha e dados sem permissão de execução", "ligado"], {
        dt: 1,
        mark: "hit",
      });
      c.row("defesas", 2, ["ASLR", "sorteia onde cada região começa", "ligado"], { dt: 1, mark: "hit" });
      c.state("kern", "salto para página sem execução: falta", { tone: "warn" });
    },
  );

  b.step(
    {
      id: "s6-sinais",
      title: "Sinais de tentativa",
      subtitle: "O que aparece",
      text: `Tentativas de estouro deixam marcas. O mesmo programa cai várias vezes no mesmo ponto, com falha de segmentação, logo depois de receber entradas longas ou estranhas. Os registros mostram encerramentos por canário alterado. Um serviço que reinicia sozinho em sequência, sempre ao tratar o mesmo tipo de pedido, merece investigação antes de ser religado.`,
      facts: [
        ["Quedas repetidas", "mesmo ponto"],
        ["Registro", "canário alterado"],
        ["Gatilho", "entradas longas"],
      ],
      highlight: ["fn", "kern"],
    },
    () => {
      c.note("kern", "quedas repetidas em le_nome()", "warn", { dt: 1 });
    },
  );

  b.step(
    {
      id: "s7-defesa",
      title: "Corrigir na origem",
      subtitle: "Conferir o tamanho",
      text: `As proteções transformam o pior caso em queda, mas a correção é na origem: toda cópia confere o tamanho do destino, usando funções que recebem o limite. Linguagens com memória segura, como Rust, Go e Java, conferem isso sozinhas. Testes com entradas longas e aleatórias acham o defeito antes. E um processo com poucos privilégios faz pouco estrago mesmo se for desviado.`,
      facts: [
        ["Correção", "conferir o tamanho"],
        ["Linguagens", "com memória segura"],
        ["Privilégios", "os mínimos"],
      ],
      highlight: ["fn"],
    },
    () => {
      fill();
      c.cell("pilha", 0, "buf[0..3]: entrada", { mark: "new" });
      c.cell("pilha", 1, `buf[4..7]: corte em ${BUF}`, { mark: "new" });
      c.state("fn", `copia no máximo ${BUF} bytes`, { tone: "good" });
      c.count("alem", "0", { label: "nada além" });
    },
  );

  return b.done({ over: r.over, touched: r.touched, outcome: r.outcome, raw: raw.outcome });
}

const lesson: LessonModule = {
  meta: {
    slug: "estouro-de-buffer",
    site: "so",
    title: "Estouro de buffer",
    summary:
      "Uma cópia sem conferir o tamanho passa do fim de um buffer na pilha e alcança o endereço de retorno. O canário detecta antes do salto; NX e ASLR transformam um desvio em queda. A correção é conferir o tamanho.",
    area: "Segurança",
    refs: [
      {
        book: "tanenbaum-mos",
        chapter: 9,
        section: "9.7.1",
        note: "Ataques de transbordamento de buffer",
        verified: true,
      },
    ],
    simplifications: [
      "O quadro tem só cinco palavras e a pilha cresce num sentido fixo.",
      "A lição mostra só a consequência na memória; o conteúdo de uma entrada maliciosa fica de fora.",
      "NX e ASLR aparecem sempre ligados, como nos sistemas atuais.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "entrada", kind: "int", label: "Tamanho da entrada (bytes)", min: 1, max: 24 },
      {
        key: "canario",
        kind: "choice",
        label: "Canário do compilador",
        options: [
          { value: "nao", label: "desligado" },
          { value: "sim", label: "ligado" },
        ],
      },
    ],
  },
  build,
  intro: {
    text: "Um dos defeitos mais antigos e explorados da programação é copiar dados para um espaço menor que eles. Você vai ver uma cópia passar do fim de um buffer na pilha, o que ela atinge e como canário, NX e ASLR contêm o estrago.",
    facts: [
      ["Buffer", `${BUF} bytes`],
      ["Entrada", "tamanho no Laboratório"],
      ["Proteções", "canário, NX, ASLR"],
    ],
  },
  outro: {
    title: "Estouro de buffer em resumo",
    text: "Na pilha, as variáveis locais ficam logo abaixo do endereço de retorno. Uma cópia sem limite pode alcançá-lo e desviar o programa. O canário detecta a alteração antes do retorno, NX impede executar dados e ASLR esconde os endereços. A correção de verdade é conferir o tamanho de toda cópia.",
    facts: (rr) => [
      ["Bytes além", String(rr.stats.over)],
      ["Sem proteção", SHORT[String(rr.stats.raw)] ?? ""],
      ["Neste programa", SHORT[String(rr.stats.outcome)] ?? ""],
    ],
  },
  next: ["chamada-de-sistema", "controle-de-acesso", "senhas"],
};

export default lesson;
