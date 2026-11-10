import type { Frame, LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { type Access, type MemOp, type PagingConfig, runPaging } from "../../../sim/os/paging.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { paginacaoTlb as practice } from "../practice.ts";

/**
 * Paging and TLB. Worked by hand.
 * 16-bit virtual addresses, 4 KiB pages (4-bit VPN + 12-bit offset), 8 physical frames.
 */
const VA_BITS = 16;
const FRAMES = 8;
const RESIDENT: Record<number, number> = { 0: 2, 1: 6, 2: 0, 3: 5, 4: 1 };
const DEFAULT_SEQ = "0x3A7C 0x3B00 0x7010 0x7014w 0x3A80 0x0120 0x1004 0x3A84 0x7018 0x0124";
export const TLB_NS = 1;
export const MEM_NS = 100;

const hex = (n: number, w = 4) => `0x${n.toString(16).toUpperCase().padStart(w, "0")}`;

export function parseSeq(s: string): MemOp[] {
  const items = s.split(/[\s,;]+/).filter(Boolean);
  if (!items.length || items.length > 32) throw new Error("Use de 1 a 32 endereços");
  return items.map((it) => {
    const m = /^(0x[0-9a-f]{1,4})(w?)$/i.exec(it);
    if (!m) throw new Error(`Endereço inválido: ${it.slice(0, 12)} (use 0x1234 ou 0x1234w para escrita)`);
    return { addr: Number.parseInt(m[1] as string, 16), write: m[2] !== "" };
  });
}

function readParams(p: Params) {
  const pageSize = Number(p.pagina ?? 4096) === 8192 ? 8192 : 4096;
  const tlbSize = Number(p.tlb ?? 4);
  const resident: Record<number, number> = {};
  const pages = 2 ** VA_BITS / pageSize;
  for (const [v, f] of Object.entries(RESIDENT)) if (Number(v) < pages) resident[Number(v)] = f;
  const cfg: PagingConfig = {
    vaBits: VA_BITS,
    pageSize,
    tlbSize,
    frames: FRAMES,
    resident,
    tlbPolicy: p.politica === "fifo" ? "fifo" : "lru",
  };
  return { cfg, ops: parseSeq(String(p.enderecos ?? DEFAULT_SEQ)), pages };
}

function scene(p: Params): SceneSpec {
  const { cfg, pages } = readParams(p);
  return {
    viewBox: [960, 640],
    zones: [
      {
        id: "mmu",
        title: "MMU (hardware)",
        rect: { x: 190, y: 20, w: 380, h: 64 + cfg.tlbSize * 24 + 70 },
        tone: "cpu",
      },
      { id: "ram", title: "RAM", rect: { x: 600, y: 20, w: 340, h: 600 }, tone: "mem" },
    ],
    nodes: [
      { id: "cpu", kind: "cpu", label: "CPU", sub: "planilha", at: [90, 90], w: 140 },
      { id: "ptbr", kind: "box", label: "PTBR", sub: "aponta a tabela", at: [480, 74], w: 150, h: 44 },
      { id: "disk", kind: "disk", label: "Disco", sub: "área de troca", at: [100, 520], w: 140 },
      { id: "os", kind: "kernel", label: "Kernel", sub: "trata faltas", at: [100, 400], w: 140 },
    ],
    links: [
      { id: "l-cpu-tlb", from: "cpu", to: "ptbr", style: "bus" },
      { id: "l-os-disk", from: "os", to: "disk", style: "dashed" },
    ],
    widgets: [
      {
        kind: "table",
        id: "tlb",
        title: `TLB (${cfg.tlbSize} entradas, ${cfg.tlbPolicy === "fifo" ? "FIFO" : "LRU"})`,
        at: [210, 120],
        columns: ["VPN", "Quadro", "Último uso"],
        widths: [70, 80, 100],
        rows: cfg.tlbSize,
      },
      { kind: "counter", id: "hits", title: "Acertos na TLB", at: [210, 150 + cfg.tlbSize * 24 + 8] },
      {
        kind: "table",
        id: "pt",
        title: "Tabela de páginas",
        at: [620, 56],
        columns: ["VPN", "V", "Quadro", "A", "D"],
        widths: [60, 40, 70, 40, 40],
        rows: pages,
      },
      {
        kind: "grid",
        id: "frames",
        title: "Quadros físicos",
        at: [250, 560],
        cols: FRAMES,
        rows: 1,
        cellW: 40,
        indexLabel: "dec",
      },
    ],
  };
}

function bitsOf(n: number, width: number): number[] {
  return Array.from({ length: width }, (_, i) => (n >>> (width - 1 - i)) & 1);
}

function vaFrame(id: string, a: Access, offsetBits: number): Frame {
  const vpnBits = VA_BITS - offsetBits;
  return {
    id,
    title: `Endereço virtual ${hex(a.vaddr)}`,
    summary: `${vpnBits} bits de página virtual e ${offsetBits} bits de deslocamento dentro da página.`,
    unit: "bit",
    data: bitsOf(a.vaddr, VA_BITS),
    where: "Sai da CPU, numa instrução de load ou store",
    layers: [
      {
        id: "vpn",
        label: "VPN",
        role: "a",
        from: 0,
        to: vpnBits,
        fields: [
          {
            label: "Página virtual",
            value: `${a.vpn} (${hex(a.vpn, 1)})`,
            from: 0,
            to: vpnBits,
            note: "Índice na TLB e na tabela de páginas",
          },
        ],
      },
      {
        id: "off",
        label: "Offset",
        role: "b",
        from: vpnBits,
        to: VA_BITS,
        fields: [
          {
            label: "Deslocamento",
            value: hex(a.offset, 3),
            from: vpnBits,
            to: VA_BITS,
            note: "Copiado sem mudar para o endereço físico",
          },
        ],
      },
    ],
  };
}

function paFrame(id: string, a: Access, offsetBits: number): Frame {
  const frameBits = Math.log2(FRAMES);
  const width = frameBits + offsetBits;
  return {
    id,
    title: `Endereço físico ${hex(a.paddr)}`,
    summary: `Quadro ${a.frame} seguido do mesmo offset: ${a.frame} × ${2 ** offsetBits} + ${hex(a.offset, 3)}.`,
    unit: "bit",
    data: bitsOf(a.paddr, width),
    where: "Vai da MMU para o barramento de memória",
    layers: [
      {
        id: "pfn",
        label: "Quadro",
        role: "ctrl",
        from: 0,
        to: frameBits,
        fields: [
          {
            label: "Número do quadro",
            value: String(a.frame),
            from: 0,
            to: frameBits,
            note: "Veio da PTE (ou da TLB)",
          },
        ],
      },
      {
        id: "off",
        label: "Offset",
        role: "b",
        from: frameBits,
        to: width,
        fields: [
          {
            label: "Deslocamento",
            value: hex(a.offset, 3),
            from: frameBits,
            to: width,
            note: "Passa igual do endereço virtual para o físico: a tradução troca só o número da página",
          },
        ],
      },
    ],
  };
}

/** Didactic PTE: the low byte follows Sv32 (D A G U X W R V); the PPN is shrunk to 3 bits. */
function pteFrame(
  id: string,
  vpn: number,
  frame: number,
  valid: boolean,
  accessed: boolean,
  dirty: boolean,
): Frame {
  const bits = [...bitsOf(frame, 3), dirty ? 1 : 0, accessed ? 1 : 0, 0, 1, 0, 1, 1, valid ? 1 : 0];
  const flag = (label: string, i: number, v: number, note: string) => ({
    label,
    value: String(v),
    from: i,
    to: i + 1,
    note,
  });
  return {
    id,
    title: `PTE da página ${vpn}`,
    summary: "Entrada da tabela de páginas em formato didático: os 8 bits de baixo seguem o Sv32 do RISC-V.",
    unit: "bit",
    data: bits,
    where: "Na tabela de páginas, na RAM",
    layers: [
      {
        id: "ppn",
        label: "PPN",
        role: "ctrl",
        from: 0,
        to: 3,
        fields: [
          {
            label: "Quadro físico",
            value: valid ? String(frame) : "—",
            from: 0,
            to: 3,
            note: "No Sv32 real são 22 bits",
          },
        ],
      },
      {
        id: "flags",
        label: "Bits de controle",
        role: "a",
        from: 3,
        to: 11,
        fields: [
          flag("D (sujo)", 3, bits[3] ?? 0, "Ligado pelo hardware numa escrita"),
          flag("A (acessado)", 4, bits[4] ?? 0, "Ligado em qualquer acesso"),
          flag("G (global)", 5, 0, "Mapeamento comum a todos os processos"),
          flag("U (usuário)", 6, 1, "Acessível em modo usuário"),
          flag("X", 7, 0, "Pode executar"),
          flag("W", 8, 1, "Pode escrever"),
          flag("R", 9, 1, "Pode ler"),
          flag("V (válida)", 10, bits[10] ?? 0, "0 = a página não está na memória: falta de página"),
        ],
      },
    ],
  };
}

export function eat(hitRate: number): number {
  return hitRate * (TLB_NS + MEM_NS) + (1 - hitRate) * (TLB_NS + 2 * MEM_NS);
}

export function build(p: Params) {
  const { cfg, ops, pages } = readParams(p);
  const r = runPaging(cfg, ops);
  const offsetBits = r.offsetBits;
  const b = lessonBuilder();
  let seq = 0;
  let hits = 0;
  const row = (i: number, who: string, what: string, detail: string) => ({
    cols: { t: `#${i + 1}`, who, what, detail },
  });

  // initial state of the widgets
  const ptCells = (
    vpn: number,
    pte: { present: boolean; frame: number; accessed: boolean; dirty: boolean },
  ) => [
    String(vpn),
    pte.present ? "1" : "0",
    pte.present ? String(pte.frame) : "—",
    pte.accessed ? "1" : "0",
    pte.dirty ? "1" : "0",
  ];
  let ptPrev = Array.from({ length: pages }, (_, v) => ({
    present: v in cfg.resident,
    frame: cfg.resident[v] ?? 0,
    accessed: false,
    dirty: false,
  }));
  let tlbPrev: string[][] = [];

  const setup = () => {
    seq++;
    ptPrev.forEach((pte, v) => {
      b.ev({
        t: seq,
        kind: "row",
        table: "pt",
        index: v,
        cells: ptCells(v, pte),
        role: "muted",
        label: `PTE ${v}`,
      });
    });
    for (const [v, f] of Object.entries(cfg.resident))
      b.ev({
        t: seq,
        kind: "cell",
        grid: "frames",
        index: f,
        value: `p${v}`,
        role: "muted",
        label: `Quadro ${f}: página ${v}`,
      });
    b.ev({ t: seq, kind: "count", counter: "hits", value: "0 / 0", role: "ctrl", label: "Contador zerado" });
  };

  const syncTables = (
    a: Access,
    markVpn: number | null,
    mark: "hit" | "new" | "bad" | "warn" | undefined,
  ) => {
    const tlbRows = a.tlb.map((e) => [String(e.vpn), String(e.frame), `#${e.lastUse + 1}`]);
    for (let k = 0; k < cfg.tlbSize; k++) {
      const cells = tlbRows[k] ?? ["", "", ""];
      if (
        JSON.stringify(cells) !== JSON.stringify(tlbPrev[k] ?? ["", "", ""]) ||
        (markVpn !== null && cells[0] === String(markVpn))
      )
        b.ev({
          t: seq,
          kind: "row",
          table: "tlb",
          index: k,
          cells,
          ...(cells[0] === String(markVpn) && mark ? { mark } : {}),
          role: "ctrl",
          label: `TLB linha ${k}`,
        });
    }
    tlbPrev = tlbRows;
    a.table.forEach((pte, v) => {
      if (JSON.stringify(pte) !== JSON.stringify(ptPrev[v]))
        b.ev({
          t: seq,
          kind: "row",
          table: "pt",
          index: v,
          cells: ptCells(v, pte),
          ...(v === a.vpn ? { mark: "new" as const } : {}),
          role: "a",
          label: `PTE ${v} atualizada`,
        });
    });
    ptPrev = a.table;
  };

  type Part = "addr" | "lookup" | "finish";
  const emit = (a: Access, parts: Part[] = ["addr", "lookup", "finish"]) => {
    const kind = a.write ? "escreve" : "lê";
    if (parts.includes("addr")) {
      seq++;
      const fr = b.frame(vaFrame(`va-${a.i}`, a, offsetBits));
      b.ev({
        t: seq,
        kind: "state",
        target: "cpu",
        text: `${kind} ${hex(a.vaddr)}`,
        tone: "active",
        role: "a",
        label: `A CPU ${kind} ${hex(a.vaddr)}`,
        frame: fr,
        row: row(
          a.i,
          "CPU",
          `${a.write ? "Escrita" : "Leitura"} em ${hex(a.vaddr)}`,
          `VPN ${a.vpn} · offset ${hex(a.offset, 3)}`,
        ),
      });
      b.ev({
        t: seq,
        kind: "note",
        at: "cpu",
        text: `VPN ${a.vpn} | offset ${hex(a.offset, 3)}`,
        tone: "info",
        role: "a",
        label: "Endereço dividido",
      });
    }
    if (parts.includes("lookup")) {
      seq++;
      b.ev({
        t: seq,
        kind: "move",
        from: "cpu",
        to: "tlb",
        role: "a",
        label: `Procura a página ${a.vpn} na TLB`,
      });
      seq++;
      if (a.tlbHit) {
        hits++;
        b.ev({
          t: seq,
          kind: "note",
          at: "tlb",
          text: `acerto: página ${a.vpn} → quadro ${a.frame}`,
          tone: "good",
          role: "ctrl",
          label: "TLB hit",
          row: row(a.i, "TLB", "Acerto (hit)", `Quadro ${a.frame}, sem ler a tabela`),
        });
      } else {
        b.ev({
          t: seq,
          kind: "note",
          at: "tlb",
          text: `falha: página ${a.vpn} não está na TLB`,
          tone: "warn",
          role: "warn",
          label: "TLB miss",
          row: row(a.i, "TLB", "Falha (miss)", "Consulta a tabela de páginas na RAM"),
        });
        seq++;
        const pteBefore = ptPrev[a.vpn] ?? { present: false, frame: 0, accessed: false, dirty: false };
        const fr = b.frame(
          pteFrame(
            `pte-${a.i}`,
            a.vpn,
            pteBefore.frame,
            pteBefore.present,
            pteBefore.accessed,
            pteBefore.dirty,
          ),
        );
        b.ev({
          t: seq,
          kind: "move",
          from: "ptbr",
          to: "pt",
          role: "a",
          label: "Lê a PTE na tabela de páginas",
          frame: fr,
        });
        b.ev({
          t: seq,
          kind: "row",
          table: "pt",
          index: a.vpn,
          cells: ptCells(a.vpn, pteBefore),
          mark: pteBefore.present ? "hit" : "bad",
          role: pteBefore.present ? "a" : "bad",
          label: pteBefore.present ? `PTE ${a.vpn} válida` : `PTE ${a.vpn} inválida`,
          row: row(
            a.i,
            "MMU",
            `Lê a PTE ${a.vpn}`,
            pteBefore.present ? `V=1, quadro ${pteBefore.frame}` : "V=0: a página não está na memória",
          ),
        });
        if (a.fault) {
          seq++;
          b.ev({
            t: seq,
            kind: "note",
            at: "os",
            text: "falta de página!",
            tone: "bad",
            role: "bad",
            label: "Falta de página",
            row: row(a.i, "MMU", "Trap: falta de página", "O kernel assume"),
          });
          b.ev({
            t: seq,
            kind: "state",
            target: "os",
            text: "tratando a falta",
            tone: "warn",
            role: "bad",
            label: "Kernel trata a falta",
          });
          if (a.victim !== null) {
            seq++;
            b.ev({
              t: seq,
              kind: "note",
              at: "os",
              text: `expulsa a página ${a.victim}${a.victimDirty ? " (suja: grava no disco)" : ""}`,
              tone: "warn",
              role: "warn",
              label: "Substituição",
              row: row(
                a.i,
                "Kernel",
                `Expulsa a página ${a.victim} (FIFO)`,
                a.victimDirty ? "Estava suja: grava no disco antes" : "Estava limpa: só descarta",
              ),
            });
            if (a.victimDirty)
              b.ev({
                t: seq,
                kind: "move",
                from: "os",
                to: "disk",
                role: "warn",
                label: "Grava a página suja",
              });
          }
          seq++;
          b.ev({
            t: seq,
            kind: "move",
            from: "disk",
            to: "frames",
            role: "b",
            label: `Traz a página ${a.vpn} do disco`,
            row: row(
              a.i,
              "Kernel",
              `Carrega a página ${a.vpn} no quadro ${a.frame}`,
              "Lê do disco (milissegundos)",
            ),
          });
          b.ev({
            t: seq,
            kind: "cell",
            grid: "frames",
            index: a.frame,
            value: `p${a.vpn}`,
            mark: "new",
            role: "b",
            label: `Quadro ${a.frame} recebe a página ${a.vpn}`,
          });
          b.ev({
            t: seq,
            kind: "state",
            target: "os",
            text: "",
            tone: "none",
            role: "muted",
            label: "Kernel devolve o controle",
          });
        }
      }
    }
    if (parts.includes("finish")) {
      seq++;
      const fr = b.frame(paFrame(`pa-${a.i}`, a, offsetBits));
      b.ev({
        t: seq,
        kind: "move",
        from: "tlb",
        to: "frames",
        role: "b",
        label: `Acessa ${hex(a.paddr)}`,
        frame: fr,
        row: row(
          a.i,
          "MMU",
          `Endereço físico ${hex(a.paddr)}`,
          `quadro ${a.frame} · offset ${hex(a.offset, 3)}`,
        ),
      });
      b.ev({
        t: seq,
        kind: "cell",
        grid: "frames",
        index: a.frame,
        value: `p${a.vpn}`,
        mark: a.write ? "dirty" : "hit",
        role: "b",
        label: `Acesso ao quadro ${a.frame}`,
      });
      syncTables(a, a.vpn, a.tlbHit ? "hit" : "new");
      b.ev({
        t: seq,
        kind: "count",
        counter: "hits",
        value: `${hits} / ${a.i + 1}`,
        role: "ctrl",
        label: "Acertos atualizados",
      });
      b.ev({
        t: seq,
        kind: "state",
        target: "cpu",
        text: "",
        tone: "none",
        role: "muted",
        label: "Acesso concluído",
      });
    }
  };

  const acc = r.accesses;
  const a0 = acc[0] as Access;
  b.step(
    {
      id: "s1-endereco",
      title: "Um endereço virtual",
      subtitle: "Página e deslocamento",
      text: `A planilha quer ler ${hex(a0.vaddr)}. Com páginas de ${cfg.pageSize / 1024} KiB, os ${offsetBits} bits de baixo são o [[offset]] dentro da página e os ${VA_BITS - offsetBits} de cima são o número da página virtual, a [[vpn]]. Dividir não custa nada: são só fios diferentes saindo da CPU. Abra o inspetor (I) para ver os bits.`,
      facts: [
        ["Endereço", hex(a0.vaddr)],
        ["VPN", String(a0.vpn)],
        ["Offset", hex(a0.offset, 3)],
        ["Página", `${cfg.pageSize} bytes`],
      ],
      highlight: ["cpu"],
    },
    () => {
      setup();
      emit(a0, ["addr"]);
    },
  );
  b.step(
    {
      id: "s2-tlb-miss",
      title: "Falha na TLB",
      subtitle: "A tradução não está no atalho",
      text: `A [[mmu]] procura a página ${a0.vpn} na [[tlb]], que começa vazia. Sem a tradução no atalho, ela usa o [[ptbr]] para achar a [[tabela-de-paginas]] na RAM e lê a [[pte]] ${a0.vpn}. Isso é um acesso extra à memória antes do acesso de verdade.`,
      facts: [
        ["TLB", "vazia"],
        ["PTE lida", `página ${a0.vpn}`],
        ["Custo extra", `+${MEM_NS} ns`],
      ],
      highlight: ["ptbr"],
    },
    () => emit(a0, ["lookup"]),
  );
  b.step(
    {
      id: "s3-traducao",
      title: "A tradução",
      subtitle: "Quadro no lugar da página",
      text: `A PTE diz que a página ${a0.vpn} está no [[quadro]] ${a0.frame}. O endereço físico é o número do quadro seguido do mesmo offset: ${a0.frame} × ${cfg.pageSize} + ${hex(a0.offset, 3)} = **${hex(a0.paddr)}**. A MMU guarda essa tradução na TLB para a próxima vez.`,
      facts: [
        ["Quadro", String(a0.frame)],
        ["Endereço físico", hex(a0.paddr)],
        ["TLB", "1 entrada ocupada"],
      ],
    },
    () => emit(a0, ["finish"]),
  );

  let i = 1;
  const firstHit = acc.findIndex((a, k) => k >= 1 && a.tlbHit);
  if (firstHit >= 1) {
    const h = acc[firstHit] as Access;
    b.step(
      {
        id: "s4-tlb-hit",
        title: "Acerto na TLB",
        subtitle: "Mesma página, tradução imediata",
        text: `O próximo acesso, ${hex(h.vaddr)}, cai na mesma página ${h.vpn}. A TLB responde na hora com o quadro ${h.frame}, sem ler a tabela de páginas. Programas acessam endereços próximos o tempo todo ([[localidade|localidade espacial]]), por isso uma TLB pequena acerta a maioria das vezes.`,
        facts: [
          ["Endereço", `${hex(h.vaddr)} → ${hex(h.paddr)}`],
          ["Acesso à tabela", "nenhum"],
          ["Custo", `${TLB_NS + MEM_NS} ns em vez de ${TLB_NS + 2 * MEM_NS} ns`],
        ],
      },
      () => {
        for (; i <= firstHit; i++) emit(acc[i] as Access);
      },
    );
  }
  const firstFault = acc.findIndex((a, k) => k >= i && a.fault);
  if (firstFault >= i) {
    const f = acc[firstFault] as Access;
    const freeBefore = Array.from({ length: FRAMES }, (_, k) => k).filter(
      (k) => !(acc[firstFault - 1]?.table ?? ptPrev).some((pte) => pte.present && pte.frame === k),
    );
    b.step(
      {
        id: "s5-falta",
        title: "Falta de página",
        subtitle: "A página está no disco",
        text: `Agora a planilha acessa ${hex(f.vaddr)}, na página ${f.vpn}, que nunca foi carregada: a PTE tem V = 0. A MMU gera um [[trap]] de [[falta-de-pagina]]. O kernel escolhe um quadro${f.victim === null ? " livre" : ""}, lê a página do disco, preenche a PTE e manda a instrução rodar de novo, que agora encontra a tradução.`,
        facts: [
          ["Página", String(f.vpn)],
          ["Quadro escolhido", String(f.frame)],
          ["Endereço físico", hex(f.paddr)],
          ["Custo", "milissegundos (disco)"],
        ],
        highlight: ["os", "disk"],
        quiz: {
          kind: "number",
          prompt: `A página de ${hex(f.vaddr)} não está na memória. Os quadros livres são ${freeBefore.join(", ") || "nenhum"} e o kernel usa ${f.victim === null ? "o primeiro livre" : "o quadro da página mais antiga (FIFO)"}. Qual será o endereço físico? Responda em hexadecimal (0x…) ou decimal.`,
          answer: f.paddr,
          explain: `O quadro escolhido é o ${f.frame}. O offset não muda: ${f.frame} × ${cfg.pageSize} + ${hex(f.offset, 3)} = **${hex(f.paddr)}** (${f.paddr} em decimal).`,
        },
      },
      () => {
        for (; i <= firstFault; i++) emit(acc[i] as Access);
      },
    );
  }
  const firstWrite = acc.findIndex((a, k) => k >= i && a.write);
  if (firstWrite >= i) {
    const w = acc[firstWrite] as Access;
    b.step(
      {
        id: "s6-bits",
        quiz: {
          kind: "choice",
          prompt: "O kernel precisa liberar um quadro. Qual página sai mais barato?",
          options: [
            "Uma com D = 0, que pode ser descartada sem gravar",
            "Uma com D = 1, porque já foi atualizada",
            "Tanto faz: toda página volta para o disco",
          ],
          answer: 0,
          explain:
            "Se a página não foi escrita desde que veio do disco, a cópia lá ainda vale: basta esquecê-la. Uma página suja precisa ser gravada antes, o que custa uma escrita no disco.",
        },
        title: "Os bits A e D",
        subtitle: "O hardware anota o uso",
        text: `Na escrita em ${hex(w.vaddr)} o hardware liga o [[bit-sujo]] D da página ${w.vpn}; qualquer acesso liga o bit A. O kernel usa esses bits na hora de liberar um quadro: uma página limpa pode ser descartada, porque o disco já tem a cópia; uma suja precisa ser gravada antes.`,
        facts: [
          ["Página", String(w.vpn)],
          ["D (sujo)", "1"],
          ["A (acessado)", "1"],
        ],
      },
      () => {
        for (; i <= firstWrite; i++) emit(acc[i] as Access);
      },
    );
  }
  const hitRate = r.hits / acc.length;
  const eatNs = eat(hitRate);
  b.step(
    {
      id: "s7-custo",
      title: "Quanto custa",
      subtitle: "Tempo efetivo de acesso",
      text: `Com TLB de ${TLB_NS} ns e memória de ${MEM_NS} ns, um acerto custa ${TLB_NS + MEM_NS} ns e uma falha ${TLB_NS + 2 * MEM_NS} ns (lê a PTE e depois o dado). Nesta sequência a taxa de acerto foi ${Math.round(hitRate * 100)}%, o que dá um tempo efetivo de ${Math.round(eatNs)} ns por acesso, sem contar as faltas de página, que custam milhões de vezes mais.`,
      facts: [
        ["Acertos", `${r.hits} de ${acc.length}`],
        ["Taxa de acerto", `${Math.round(hitRate * 100)}%`],
        ["Tempo efetivo", `${Math.round(eatNs)} ns`],
        ["Faltas de página", String(r.faults)],
      ],
    },
    () => {
      for (; i < acc.length; i++) emit(acc[i] as Access);
      seq++;
      b.ev({
        t: seq,
        kind: "note",
        at: "hits",
        text: `tempo efetivo ≈ ${Math.round(eatNs)} ns`,
        tone: "info",
        role: "ctrl",
        label: "Tempo efetivo de acesso",
        row: row(
          acc.length - 1,
          "Resumo",
          "Tempo efetivo",
          `${Math.round(hitRate * 100)}% × ${TLB_NS + MEM_NS} + ${100 - Math.round(hitRate * 100)}% × ${TLB_NS + 2 * MEM_NS} ≈ ${Math.round(eatNs)} ns`,
        ),
      });
    },
  );

  const notes: string[] = [];
  if (r.faults > acc.length / 3)
    notes.push(
      `Houve ${r.faults} faltas de página em ${acc.length} acessos: a sequência pula entre muitas páginas para só ${FRAMES} quadros.`,
    );
  if (hitRate < 0.5)
    notes.push(
      `A taxa de acerto da TLB ficou em ${Math.round(hitRate * 100)}%: poucos acessos repetem a mesma página.`,
    );
  return b.done({ hits: r.hits, accesses: acc.length, faults: r.faults, hitRate, eat: eatNs }, notes);
}

const lesson: LessonModule = {
  meta: {
    slug: "paginacao-tlb",
    site: "so",
    title: "Paginação e TLB",
    summary:
      "Como a MMU traduz cada endereço virtual em físico, por que a TLB faz isso ficar rápido e o que acontece numa falta de página.",
    area: "Gerência de memória",
    refs: [
      {
        book: "tanenbaum-mos",
        chapter: 3,
        section: "3.3",
        note: "Paginação, tabelas de páginas e TLB",
        verified: true,
      },
      {
        book: "maziero-so",
        chapter: 14,
        section: "14.7",
        note: "Memória virtual por páginas",
        verified: true,
      },
    ],
    simplifications: [
      "Endereços de 16 bits e só 8 quadros, para caber na tela; sistemas reais usam 39 a 57 bits.",
      "Tabela de páginas de um nível; a lição de tabelas multinível mostra o caso real.",
      "A PTE é didática: o byte de controle segue o Sv32, mas o número do quadro tem só 3 bits.",
      "Quando falta quadro, o kernel usa FIFO; a lição de substituição compara FIFO, LRU e Relógio.",
      "O tempo efetivo ignora caches de dados e o custo das faltas de página.",
    ],
  },
  scene,
  params: {
    defaults: { pagina: "4096", tlb: 4, politica: "lru", enderecos: DEFAULT_SEQ },
    fields: [
      {
        key: "pagina",
        kind: "choice",
        label: "Tamanho da página",
        options: [
          { value: "4096", label: "4 KiB (16 páginas)" },
          { value: "8192", label: "8 KiB (8 páginas)" },
        ],
      },
      { key: "tlb", kind: "int", label: "Entradas da TLB", min: 1, max: 8 },
      {
        key: "politica",
        kind: "choice",
        label: "Substituição na TLB",
        options: [
          { value: "lru", label: "LRU (menos usada recentemente)" },
          { value: "fifo", label: "FIFO (mais antiga)" },
        ],
      },
      {
        key: "enderecos",
        kind: "list",
        label: "Sequência de endereços",
        maxItems: 32,
        pattern: "0x[0-9a-fA-F]{1,4}w?",
        placeholder: DEFAULT_SEQ,
        help: "Até 32 endereços em hexadecimal; um w no fim indica escrita (0x7014w).",
      },
    ],
  },
  build,
  intro: {
    text: "Cada programa acha que tem a memória toda para si, começando do endereço zero. Quem cria essa ilusão é a [[mmu]], que traduz cada [[endereco-virtual]] em [[endereco-fisico]], em todo load e store. Nesta lição você acompanha a planilha da Lia acessando dez endereços e vê a tradução bit a bit, a TLB economizando tempo e uma falta de página.",
    facts: [
      ["Endereço virtual", "16 bits"],
      ["Página", "4 KiB"],
      ["TLB", "4 entradas, LRU"],
      ["RAM", "8 quadros"],
    ],
  },
  outro: {
    title: "Tradução em resumo",
    text: "A página muda, o offset fica: traduzir é trocar o número da página pelo do quadro. A TLB evita ler a tabela na maioria dos acessos, e a falta de página permite que só parte do programa esteja na RAM.",
    facts: (run) => [
      ["Acertos na TLB", `${run.stats.hits} de ${run.stats.accesses}`],
      ["Faltas de página", String(run.stats.faults)],
      ["Tempo efetivo", `${Math.round(Number(run.stats.eat))} ns`],
    ],
  },
  next: ["produtor-consumidor"],
  counter: {
    test: (ev) => ev.kind === "note" && ev.label === "Falta de página",
    label: (n) => (n === 1 ? "1 falta de página" : `${n} faltas de página`),
  },
  practice,
};

export default lesson;
