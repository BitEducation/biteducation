import type { Frame, LessonModule, SceneSpec } from "../../../contracts/types.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";

/**
 * The path of read(fd, buf, 512) on Linux/RISC-V. Scripted: no Lab.
 * Facts to confirm by the owner: __NR_read = 63 (include/uapi/asm-generic/unistd.h),
 * scause = 8 for an ecall from U-mode, 9 (with the interrupt bit) for an external interrupt.
 */
const FD = 3;
const BUF = 0x0001_2340;
const COUNT = 512;
const NR_READ = 63;
const ECALL_PC = 0x0001_0a3c;

const scene: SceneSpec = {
  viewBox: [960, 600],
  zones: [
    { id: "user", title: "Espaço do usuário (modo U)", rect: { x: 20, y: 20, w: 920, h: 130 }, tone: "user" },
    { id: "kernel", title: "Kernel (modo S)", rect: { x: 20, y: 170, w: 920, h: 210 }, tone: "kernel" },
    { id: "hw", title: "Hardware", rect: { x: 20, y: 400, w: 920, h: 180 }, tone: "cpu" },
  ],
  nodes: [
    { id: "editor", kind: "process", label: "editor", sub: "read(fd, buf, 512)", at: [150, 90], w: 170 },
    { id: "libc", kind: "box", label: "libc", sub: "função read()", at: [420, 90], w: 150 },
    { id: "player", kind: "process", label: "player", sub: "outro processo", at: [790, 90], w: 150 },
    { id: "trap", kind: "kernel", label: "Tratador de trap", sub: "stvec", at: [150, 240], w: 170 },
    { id: "table", kind: "box", label: "Tabela de syscalls", sub: "índice a7", at: [380, 240], w: 170 },
    { id: "vfs", kind: "kernel", label: "VFS", sub: "arquivo do fd 3", at: [590, 240], w: 140 },
    {
      id: "driver",
      kind: "kernel",
      label: "Driver do disco",
      sub: "fila de pedidos",
      at: [800, 240],
      w: 160,
    },
    { id: "sched", kind: "kernel", label: "Escalonador", sub: "escolhe quem roda", at: [480, 330], w: 170 },
    { id: "cpu", kind: "cpu", label: "CPU", sub: "RISC-V", at: [250, 490], w: 140 },
    { id: "ram", kind: "memory", label: "RAM", sub: "cache de páginas", at: [520, 490], w: 150 },
    { id: "disk", kind: "disk", label: "Disco", sub: "controlador + DMA", at: [790, 490], w: 160 },
  ],
  links: [
    { id: "l1", from: "editor", to: "libc" },
    { id: "l2", from: "trap", to: "table" },
    { id: "l3", from: "table", to: "vfs" },
    { id: "l4", from: "vfs", to: "driver" },
    { id: "l5", from: "driver", to: "disk", style: "dashed" },
    { id: "l6", from: "disk", to: "ram", style: "bus" },
  ],
  widgets: [{ kind: "counter", id: "mode", title: "Modo da CPU", at: [40, 470] }],
};

const regsFrame: Frame = {
  id: "regs-ecall",
  title: "Registradores no ecall",
  summary: "A convenção do Linux no RISC-V: número da chamada em a7, argumentos em a0 a a5.",
  unit: "word32",
  where: "Banco de registradores da CPU, no instante do ecall",
  data: [FD, BUF, COUNT, NR_READ, ECALL_PC],
  layers: [
    {
      id: "args",
      label: "Argumentos",
      role: "a",
      from: 0,
      to: 3,
      fields: [
        {
          label: "a0 (x10) = fd",
          value: String(FD),
          from: 0,
          to: 1,
          note: "0, 1 e 2 já são stdin, stdout e stderr",
        },
        {
          label: "a1 (x11) = buf",
          value: `0x${BUF.toString(16)}`,
          from: 1,
          to: 2,
          example: true,
          note: "Endereço virtual do editor",
        },
        { label: "a2 (x12) = n", value: String(COUNT), from: 2, to: 3 },
      ],
    },
    {
      id: "nr",
      label: "Número",
      role: "ctrl",
      from: 3,
      to: 4,
      fields: [
        {
          label: "a7 (x17)",
          value: `${NR_READ} = read`,
          from: 3,
          to: 4,
          note: "Tabela genérica do Linux (asm-generic/unistd.h)",
        },
      ],
    },
    {
      id: "pc",
      label: "PC",
      role: "muted",
      from: 4,
      to: 5,
      fields: [{ label: "PC do ecall", value: `0x${ECALL_PC.toString(16)}`, from: 4, to: 5, example: true }],
    },
  ],
};

const trapFrame: Frame = {
  id: "trap-csrs",
  title: "O que o hardware salva no trap",
  summary: "Registradores de controle (CSRs) do modo supervisor preenchidos pela CPU ao entrar no kernel.",
  unit: "word32",
  where: "CSRs da CPU; o kernel copia tudo para a pilha do kernel (trap frame)",
  data: [ECALL_PC, 8, 0],
  layers: [
    {
      id: "csr",
      label: "CSRs",
      role: "ctrl",
      from: 0,
      to: 3,
      fields: [
        {
          label: "sepc",
          value: `0x${ECALL_PC.toString(16)}`,
          from: 0,
          to: 1,
          example: true,
          note: "Endereço do próprio ecall; o kernel soma 4 antes de voltar",
        },
        { label: "scause", value: "8", from: 1, to: 2, note: "Chamada de ambiente (ecall) vinda do modo U" },
        {
          label: "sstatus.SPP",
          value: "0 = U",
          from: 2,
          to: 3,
          note: "Modo anterior: para onde o sret volta",
        },
      ],
    },
  ],
};

function build() {
  const b = lessonBuilder();
  let seq = 0;
  let n = 0;
  const row = (who: string, what: string, detail: string) => ({
    cols: { t: String(++n), who, what, detail },
  });
  const mode = (m: "U" | "S") =>
    b.ev({
      t: seq,
      kind: "count",
      counter: "mode",
      value: m === "U" ? "usuário (U)" : "supervisor (S)",
      role: m === "U" ? "a" : "ctrl",
      label: `Modo ${m}`,
    });
  b.frame(regsFrame);
  b.frame(trapFrame);

  b.step(
    {
      id: "s1-libc",
      title: "Uma função comum",
      subtitle: "read() começa na biblioteca",
      text: "O editor chama `read(fd, buf, 512)` para ler um pedaço do arquivo. Parece uma função qualquer, e começa como uma: o código está na libc, dentro do próprio processo. Mas ler o disco exige hardware que um programa comum não pode tocar. A libc só prepara o pedido para o kernel.",
      facts: [
        ["Chamada", "read(3, buf, 512)"],
        ["Onde roda", "modo usuário"],
        ["Quem faz o trabalho", "o kernel"],
      ],
      highlight: ["editor", "libc"],
    },
    () => {
      seq++;
      mode("U");
      b.ev({
        t: seq,
        kind: "state",
        target: "editor",
        text: "executando",
        tone: "active",
        role: "a",
        label: "O editor está na CPU",
      });
      seq++;
      b.ev({
        t: seq,
        kind: "move",
        from: "editor",
        to: "libc",
        role: "a",
        label: "Chama read() da libc",
        row: row("editor", "Chama read(3, buf, 512)", "Função da libc, ainda no modo usuário"),
      });
    },
  );
  b.step(
    {
      id: "s2-ecall",
      title: "Registradores e ecall",
      subtitle: "O pedido vai em registradores",
      text: `A libc põe os argumentos em a0, a1 e a2 e o número da [[syscall|chamada de sistema]] em a7: no Linux para RISC-V, read é a ${NR_READ}. Então executa [[ecall]], a única instrução que pede ao kernel para assumir. Abra o inspetor (I) para ver os registradores.`,
      facts: [
        ["a7", `${NR_READ} (read)`],
        ["a0, a1, a2", "fd, buf, n"],
        ["Instrução", "ecall"],
      ],
      highlight: ["libc", "cpu"],
    },
    () => {
      seq++;
      b.ev({
        t: seq,
        kind: "move",
        from: "libc",
        to: "cpu",
        role: "a",
        label: "Carrega os registradores",
        frame: regsFrame.id,
        row: row("libc", "a0=3, a1=buf, a2=512, a7=63", "Convenção de chamadas do Linux/RISC-V"),
      });
      seq++;
      b.ev({
        t: seq,
        kind: "state",
        target: "cpu",
        text: "ecall",
        tone: "warn",
        role: "ctrl",
        label: "Executa ecall",
        row: row("CPU", "ecall", "Pede para entrar no kernel"),
      });
    },
  );
  b.step(
    {
      id: "s3-trap",
      title: "O trap",
      subtitle: "Do modo usuário ao supervisor",
      text: "O ecall provoca um [[trap]]. A própria CPU, sem software no meio, guarda o endereço da instrução em `sepc`, anota a causa em `scause`, sobe para o [[modo-kernel]] e pula para o endereço em `stvec`, o tratador de traps. O programa não escolhe para onde vai: é isso que torna a entrada segura.",
      facts: [
        ["sepc", "endereço do ecall"],
        ["scause", "8: ecall do modo U"],
        ["Novo modo", "supervisor (S)"],
      ],
      highlight: ["trap", "cpu"],
    },
    () => {
      seq++;
      mode("S");
      b.ev({
        t: seq,
        kind: "move",
        from: "cpu",
        to: "trap",
        role: "ctrl",
        label: "A CPU desvia para stvec",
        frame: trapFrame.id,
        row: row("CPU", "Trap para o modo S", "sepc = PC do ecall · scause = 8"),
      });
      b.ev({
        t: seq,
        kind: "state",
        target: "editor",
        text: "no kernel",
        tone: "warn",
        role: "a",
        label: "O editor está no kernel",
      });
      seq++;
      b.ev({
        t: seq,
        kind: "state",
        target: "trap",
        text: "salva registradores",
        tone: "active",
        role: "ctrl",
        label: "Monta o trap frame",
        row: row("Kernel", "Salva os registradores do editor", "Na pilha do kernel (trap frame)"),
      });
    },
  );
  b.step(
    {
      id: "s4-caminho",
      title: "Pelo kernel até o driver",
      subtitle: "Tabela, VFS e driver",
      text: "O tratador usa a7 como índice na tabela de syscalls e chama a função de leitura. Ela confere se o fd 3 existe e se buf é um endereço válido do editor. O [[vfs]] descobre que o arquivo está num disco e, como os dados não estão em cache, o [[driver]] monta um pedido de leitura para o controlador.",
      facts: [
        ["Índice", "a7 = 63"],
        ["Verifica", "fd e ponteiro buf"],
        ["Cache de páginas", "falhou"],
      ],
      highlight: ["table", "vfs", "driver"],
    },
    () => {
      seq++;
      b.ev({
        t: seq,
        kind: "move",
        from: "trap",
        to: "table",
        role: "ctrl",
        label: "Consulta a tabela de syscalls",
        row: row("Kernel", "sys_call_table[63]", "Chama a função de leitura"),
      });
      b.ev({
        t: seq,
        kind: "state",
        target: "trap",
        text: "",
        tone: "none",
        role: "ctrl",
        label: "Tratador concluiu",
      });
      seq++;
      b.ev({
        t: seq,
        kind: "move",
        from: "table",
        to: "vfs",
        role: "ctrl",
        label: "Chega ao VFS",
        row: row("VFS", "Valida fd 3 e buf", "Procura os dados no cache de páginas: não estão"),
      });
      seq++;
      b.ev({
        t: seq,
        kind: "move",
        from: "vfs",
        to: "driver",
        role: "ctrl",
        label: "Pede ao driver",
        row: row("Driver", "Monta o pedido de leitura", "Bloco do arquivo → endereço de buf"),
      });
      seq++;
      b.ev({
        t: seq,
        kind: "move",
        from: "driver",
        to: "disk",
        role: "ctrl",
        label: "Programa o controlador do disco",
      });
      b.ev({
        t: seq,
        kind: "state",
        target: "disk",
        text: "lendo…",
        tone: "active",
        role: "b",
        label: "O disco começa a ler",
      });
    },
  );
  b.step(
    {
      id: "s5-bloqueia",
      title: "O editor bloqueia",
      subtitle: "Esperar o disco sem gastar CPU",
      text: "O disco vai levar milissegundos, milhões de ciclos de CPU. Em vez de esperar parado, o kernel marca o editor como [[bloqueado]] e chama o escalonador, que entrega a CPU ao player. O editor nem percebe: para ele, read() ainda não retornou.",
      facts: [
        ["editor", "bloqueado"],
        ["CPU", "com o player"],
        ["Espera típica", "≈ 0,1 a 10 ms"],
      ],
      highlight: ["sched", "player"],
      quiz: {
        kind: "choice",
        prompt: "O disco vai demorar alguns milissegundos. O que o kernel faz com a CPU enquanto isso?",
        options: [
          "Fica em laço consultando o disco até os dados chegarem",
          "Bloqueia o editor e entrega a CPU a outro processo pronto",
          "Desliga a CPU até a interrupção",
          "Devolve o controle ao editor com 0 bytes lidos",
        ],
        answer: 1,
        explain:
          "O editor passa a **bloqueado** e o escalonador escolhe outro processo pronto, aqui o player. Quando o disco terminar, uma interrupção avisa o kernel. Ficar consultando em laço desperdiçaria milhões de ciclos.",
      },
    },
    () => {
      seq++;
      b.ev({
        t: seq,
        kind: "state",
        target: "editor",
        text: "bloqueado (disco)",
        tone: "bad",
        role: "a",
        label: "O editor bloqueia",
        row: row("Kernel", "editor → bloqueado", "Espera o fim da leitura"),
      });
      b.ev({ t: seq, kind: "move", from: "driver", to: "sched", role: "ctrl", label: "Chama o escalonador" });
      seq++;
      b.ev({
        t: seq,
        kind: "move",
        from: "sched",
        to: "player",
        role: "ctrl",
        label: "A CPU vai para o player",
        row: row("Escalonador", "Despacha o player", "Troca de contexto"),
      });
      mode("U");
      b.ev({
        t: seq,
        kind: "state",
        target: "player",
        text: "executando",
        tone: "active",
        role: "b",
        label: "player executando",
      });
    },
  );
  b.step(
    {
      id: "s6-interrupcao",
      title: "Os dados chegam",
      subtitle: "DMA e interrupção",
      text: "O controlador copia os 512 bytes do disco para uma página do cache do kernel, na RAM, por [[dma]]: a CPU não toca em byte nenhum durante a cópia. No fim, ele dispara uma [[interrupcao]]. A CPU para o player, entra no kernel, e o driver marca o pedido como concluído e o editor como pronto de novo.",
      facts: [
        ["Cópia", "512 bytes por DMA, para o cache"],
        ["Aviso", "interrupção externa"],
        ["editor", "pronto"],
      ],
      highlight: ["disk", "ram"],
    },
    () => {
      seq++;
      b.ev({
        t: seq,
        kind: "move",
        from: "disk",
        to: "ram",
        role: "b",
        label: "DMA copia os dados para o cache",
        row: row("Disco", "DMA: 512 bytes → cache de páginas", "Sem usar a CPU"),
      });
      b.ev({
        t: seq,
        kind: "state",
        target: "disk",
        text: "pronto",
        tone: "good",
        role: "b",
        label: "Leitura concluída",
      });
      seq++;
      mode("S");
      b.ev({
        t: seq,
        kind: "move",
        from: "disk",
        to: "driver",
        role: "warn",
        label: "Interrupção do disco",
        row: row("Disco", "Interrupção", "scause = interrupção externa"),
      });
      b.ev({
        t: seq,
        kind: "state",
        target: "player",
        text: "interrompido",
        tone: "warn",
        role: "b",
        label: "player interrompido",
      });
      seq++;
      b.ev({
        t: seq,
        kind: "state",
        target: "editor",
        text: "pronto",
        tone: "none",
        role: "a",
        label: "O editor volta a ficar pronto",
        row: row("Driver", "Pedido concluído", "editor → pronto"),
      });
      b.ev({
        t: seq,
        kind: "state",
        target: "player",
        text: "executando",
        tone: "active",
        role: "b",
        label: "player continua",
      });
      mode("U");
    },
  );
  b.step(
    {
      id: "s7-retorno",
      quiz: {
        kind: "choice",
        prompt: "Antes do sret, o kernel soma 4 ao sepc. Por quê?",
        options: [
          "Para voltar à instrução seguinte, sem repetir o ecall",
          "Para pular os 4 bytes de cabeçalho do buffer",
          "Para marcar que a chamada deu certo",
        ],
        answer: 0,
        explain:
          "O sepc guardou o endereço do próprio ecall. Cada instrução RISC-V tem 4 bytes; sem a soma, o sret voltaria ao ecall e o editor pediria o mesmo read() de novo, para sempre.",
      },
      title: "A volta",
      subtitle: "sret e o valor de retorno",
      text: "Quando o escalonador devolve a CPU ao editor, o kernel copia os dados do cache para o buf do editor, põe o resultado em a0 (512 bytes lidos), soma 4 ao `sepc` para não repetir o ecall e executa `sret`: a CPU volta ao modo usuário, na instrução seguinte. Para o editor, read() foi só uma função que demorou um pouco.",
      facts: [
        ["a0", "512 (bytes lidos)"],
        ["Volta para", "sepc + 4"],
        ["Instrução", "sret"],
      ],
      highlight: ["editor"],
    },
    () => {
      seq++;
      mode("S");
      b.ev({
        t: seq,
        kind: "move",
        from: "sched",
        to: "trap",
        role: "ctrl",
        label: "O editor volta a rodar no kernel",
        row: row("Escalonador", "Despacha o editor", "Ainda dentro da syscall"),
      });
      b.ev({
        t: seq,
        kind: "state",
        target: "player",
        text: "pronto",
        tone: "none",
        role: "b",
        label: "player volta para a fila",
      });
      seq++;
      b.ev({
        t: seq,
        kind: "state",
        target: "trap",
        text: "a0 = 512 · sepc += 4",
        tone: "active",
        role: "ctrl",
        label: "Prepara o retorno",
        row: row("Kernel", "Copia para buf; a0 = 512, sepc += 4", "copy_to_user e restaura os registradores"),
      });
      seq++;
      mode("U");
      b.ev({
        t: seq,
        kind: "move",
        from: "trap",
        to: "editor",
        role: "a",
        label: "sret: de volta ao modo usuário",
        row: row("CPU", "sret", "Modo U, instrução após o ecall"),
      });
      b.ev({
        t: seq,
        kind: "state",
        target: "trap",
        text: "",
        tone: "none",
        role: "ctrl",
        label: "Kernel sai",
      });
      b.ev({
        t: seq,
        kind: "state",
        target: "editor",
        text: "read() = 512",
        tone: "good",
        role: "a",
        label: "read() retornou 512",
      });
    },
  );
  return b.done({ bytes: COUNT, nr: NR_READ, modeSwitches: 6 });
}

const lesson: LessonModule = {
  meta: {
    slug: "chamada-de-sistema",
    site: "so",
    title: "O caminho de um read()",
    summary:
      "O que acontece entre um programa pedir dados do disco e recebê-los: ecall, trap, kernel, driver, bloqueio, DMA, interrupção e sret.",
    area: "Fundamentos: chamadas de sistema",
    refs: [
      { book: "tanenbaum-mos", chapter: 1, section: "1.6", note: "Chamadas de sistema", verified: true },
      { book: "maziero-so", chapter: 2, section: "2.3", note: "Chamadas de sistema", verified: true },
      {
        url: "https://github.com/riscv/riscv-isa-manual",
        title: "The RISC-V Instruction Set Manual, Volume II: Privileged Architecture",
        note: "sepc, scause, stvec e sret",
      },
    ],
    simplifications: [
      "Registradores mostrados com 32 bits; o Linux no RISC-V costuma rodar em RV64.",
      "O cache de páginas falha de propósito, para a leitura ir até o disco.",
      "O trap frame, a pilha do kernel e as camadas de bloco do Linux aparecem resumidas em uma linha cada.",
      "A interrupção chega direto ao driver; na prática ela passa pelo controlador de interrupções (PLIC).",
    ],
  },
  scene,
  params: { defaults: {} },
  build,
  intro: {
    text: "Ler um arquivo parece tão simples quanto chamar uma função. Mas um programa comum não pode falar com o disco: só o kernel pode. Nesta lição você segue um `read()` do editor da Lia por todo o caminho: da biblioteca ao [[modo-kernel]], do driver ao disco, e de volta, passando por um processo que aproveita a CPU enquanto isso.",
    facts: [
      ["Chamada", "read(3, buf, 512)"],
      ["Arquitetura", "RISC-V com Linux"],
      ["Personagens", "editor e player"],
    ],
  },
  outro: {
    title: "A syscall em resumo",
    text: "Uma chamada de sistema é um trap controlado: o hardware troca de modo e só entra no kernel por um endereço que o kernel escolheu. Enquanto o dispositivo trabalha, o processo dorme e a CPU serve outro.",
    facts: (run) => [
      ["Bytes lidos", String(run.stats.bytes)],
      ["Número da syscall", String(run.stats.nr)],
      ["Trocas de modo", String(run.stats.modeSwitches)],
    ],
  },
  next: ["round-robin"],
};

export default lesson;
