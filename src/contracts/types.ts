/**
 * Normative shapes shared by simulators, the engine, the UI and the build scripts.
 * This module has no runtime code and no imports.
 */

export type SiteId = "redes" | "so" | "arq";

export type Role = "a" | "b" | "ctrl" | "crypto" | "bad" | "muted" | "warn" | "s3" | "s4" | "s5" | "s6";

export type Fact = readonly [label: string, value: string];

export type BookId = "tanenbaum-mos" | "tanenbaum-sco" | "tanenbaum-cn" | "maziero-so";

export type Reference =
  /** `chapter` is a number, or a letter for an appendix. */
  | { book: BookId; chapter: number | string; section?: string; note?: string; verified: boolean }
  | { rfc: number; section?: string; note?: string }
  | { url: string; title: string; note?: string };

export type LessonStatus = "draft" | "review" | "published";

export interface CatalogEntry {
  slug: string;
  title: string;
  subtitle: string;
  group: string;
  level: 1 | 2 | 3;
  minutes: number;
  /** Number of steps of the default run (checked by check-content); used for progress without loading the lesson. */
  steps: number;
  status: LessonStatus;
  tags: string[];
  prerequisites?: string[];
  /** Lessons of the OTHER sites that cover the same idea, as "site/slug" (shown both ways). */
  related?: string[];
  load: () => Promise<{ default: LessonModule }>;
}

export interface Catalog {
  site: SiteId;
  name: string;
  tagline: string;
  groups: { id: string; title: string }[];
  lessons: CatalogEntry[];
}

/* ---------- scene ---------- */

export type NodeKind =
  | "laptop"
  | "server"
  | "router"
  | "switch"
  | "cloud"
  | "attacker"
  | "firewall"
  | "dns"
  | "cpu"
  | "process"
  | "kernel"
  | "disk"
  | "device"
  | "timer"
  | "memory"
  | "alu"
  | "regfile"
  | "pc"
  | "imem"
  | "dmem"
  | "cache"
  | "box"
  | "layer";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SceneNode {
  id: string;
  kind: NodeKind;
  label: string;
  sub?: string;
  at: readonly [x: number, y: number];
  w?: number;
  h?: number;
  hidden?: boolean;
}

export interface SceneLink {
  id: string;
  from: string;
  to: string;
  /** Intermediate points; without them the link is drawn as an elbow. */
  via?: readonly (readonly [number, number])[];
  style?: "solid" | "dashed" | "bus";
}

export type Widget =
  | { kind: "queue"; id: string; title: string; at: readonly [number, number]; capacity: number }
  | {
      kind: "grid";
      id: string;
      title: string;
      at: readonly [number, number];
      cols: number;
      rows: number;
      cellW?: number;
      /** "bit" numbers the cells from the highest bit down to 0 (a bit ruler). */
      indexLabel?: "dec" | "hex" | "bit" | "none";
    }
  | {
      kind: "table";
      id: string;
      title: string;
      at: readonly [number, number];
      columns: string[];
      widths: number[];
      rows: number;
    }
  | {
      kind: "gantt";
      id: string;
      title: string;
      at: readonly [number, number];
      lanes: string[];
      span: number;
      width: number;
    }
  | {
      kind: "pipeline";
      id: string;
      title: string;
      at: readonly [number, number];
      stages: string[];
      cycles: number;
      cellW?: number;
    }
  | {
      kind: "counter";
      id: string;
      title: string;
      at: readonly [number, number];
    }
  | {
      kind: "chart";
      id: string;
      title: string;
      at: readonly [number, number];
      width: number;
      height: number;
      x: { label: string; max: number };
      y: { label: string; max: number };
    };

export interface SceneSpec {
  viewBox: readonly [w: number, h: number];
  zones?: {
    id: string;
    title: string;
    rect: Rect;
    tone?: "kernel" | "user" | "lan" | "wan" | "attacker" | "cpu" | "mem";
  }[];
  nodes: SceneNode[];
  links?: SceneLink[];
  widgets?: Widget[];
}

/* ---------- trace ---------- */

export interface EventRow {
  cols: Record<string, string>;
}

interface TraceBase {
  /** Logical time (simulated ms, ticks or clock cycles). Events with the same t animate together. */
  t: number;
  role: Role;
  label: string;
  row?: EventRow;
  frame?: string;
  lost?: boolean;
}

export type TraceEvent =
  | (TraceBase & { kind: "move"; from: string; to: string; via?: string[] })
  | (TraceBase & {
      kind: "state";
      target: string;
      text?: string;
      tone?: "none" | "bad" | "good" | "warn" | "active";
    })
  | (TraceBase & { kind: "enqueue"; queue: string; item: string; itemRole?: Role })
  | (TraceBase & { kind: "dequeue"; queue: string; item: string })
  | (TraceBase & { kind: "cell"; grid: string; index: number; value: string; mark?: CellMark })
  | (TraceBase & { kind: "row"; table: string; index: number; cells: string[]; mark?: RowMark })
  | (TraceBase & {
      kind: "gantt";
      lane: string;
      from: number;
      to: number;
      item: string;
      itemRole: Role;
      /** Widget id, needed only when several gantt widgets share lane names. */
      gantt?: string;
    })
  | (TraceBase & {
      kind: "stage";
      pipeline: string;
      cycle: number;
      /** One entry per stage: the instruction label occupying it, or null when empty. */
      stages: (string | null)[];
      marks?: (CellMark | undefined)[];
    })
  | (TraceBase & { kind: "count"; counter: string; value: string })
  | (TraceBase & { kind: "plot"; chart: string; series: string; x: number; y: number; seriesRole?: Role })
  | (TraceBase & { kind: "note"; at: string; text: string; tone?: "info" | "warn" | "bad" | "good" })
  | (TraceBase & { kind: "show" | "hide"; targets: string[] });

export type CellMark = "hit" | "miss" | "evict" | "dirty" | "new" | "bubble" | "flush";
export type RowMark = "hit" | "miss" | "new" | "bad" | "warn";

/* ---------- frames (inspector) ---------- */

export interface FieldNode {
  label: string;
  value: string;
  from?: number;
  to?: number;
  note?: string;
  example?: boolean;
  children?: FieldNode[];
}

export interface FrameLayer {
  id: string;
  label: string;
  role: Role;
  from: number;
  to: number;
  fields: FieldNode[];
}

export interface Frame {
  id: string;
  title: string;
  summary: string;
  unit: "byte" | "bit" | "word32";
  /** Byte values, bit values (0/1) or 32-bit words. null = unknown, encrypted or random ("··"). */
  data: (number | null)[];
  layers: FrameLayer[];
  where?: string;
  /** For word32: address of data[0]. */
  baseAddress?: number;
}

/* ---------- lessons ---------- */

export type Quiz =
  | { kind: "choice"; prompt: string; options: string[]; answer: number; explain: string }
  | { kind: "number"; prompt: string; answer: number; tolerance?: number; unit?: string; explain: string }
  | {
      kind: "pick";
      prompt: string;
      targets: { id: string; label: string }[];
      answer: string;
      explain: string;
    };

export interface Step {
  /** Stable id, pattern ^s\d+-[a-z0-9-]+$ (URL anchor and translation key). */
  id: string;
  title: string;
  subtitle: string;
  text: string;
  facts: Fact[];
  /** Half-open slice [start, end) of the trace played in this step. */
  events: readonly [start: number, end: number];
  highlight?: string[];
  quiz?: Quiz;
  /** Tags used by content checks (e.g. "signals", "defense" in attack lessons). */
  tags?: string[];
}

export interface LessonRun {
  steps: Step[];
  trace: TraceEvent[];
  frames: Record<string, Frame>;
  /** Free-form numbers for the outro and the lab narrative. */
  stats: Record<string, number | string>;
  /** Automatic notes for lab mode, when the hand-written text no longer applies. */
  labNotes?: string[];
}

export type ParamField =
  | { key: string; kind: "int"; label: string; min: number; max: number; step?: number; help?: string }
  | { key: string; kind: "choice"; label: string; options: { value: string; label: string }[]; help?: string }
  | {
      key: string;
      kind: "list";
      label: string;
      maxItems: number;
      pattern: string;
      placeholder: string;
      help?: string;
    }
  | { key: string; kind: "bool"; label: string; help?: string }
  | {
      key: string;
      kind: "text";
      label: string;
      maxLength: number;
      /** Whole-value regex (trusted, written by the lesson author). */
      pattern: string;
      placeholder: string;
      rows?: number;
      help?: string;
    };

export type ParamValue = number | string | boolean;
export type Params = Record<string, ParamValue>;

export interface LessonModule {
  meta: {
    slug: string;
    site: SiteId;
    title: string;
    summary: string;
    area: string;
    refs: Reference[];
    simplifications: string[];
  };
  /** Static scene, or a function of the params when the Lab changes the layout (lanes, counts). */
  scene: SceneSpec | ((params: Params) => SceneSpec);
  params: { defaults: Params; fields?: ParamField[] };
  /** PURE and deterministic: same params, same run. */
  build: (params: Params) => LessonRun;
  intro: { text: string; facts: Fact[] };
  outro: { title: string; text: string; facts: (run: LessonRun) => Fact[] };
  next?: string[];
  /** Generated exercises: same lesson, new numbers, answers computed by the simulator. */
  practice?: Practice[];
  /** Optional counter in the controls ("1 falta de página", "2 bolhas"). */
  counter?: { test: (ev: TraceEvent) => boolean; label: (n: number) => string };
}

export interface PracticeItem {
  prompt: string;
  /** Number, or a non-negative integer the learner may also type as 0x… */
  answer: number;
  tolerance?: number;
  unit?: string;
  /** How to show the answer when decimal would hide it (hex words, addresses). */
  shown?: string;
  explain: string;
}

export interface Practice {
  /** Short name of the exercise ("Endereço físico"). */
  title: string;
  /** PURE: the same seed always gives the same exercise. */
  make: (seed: number) => PracticeItem;
}

/** A curated sequence of lessons, possibly crossing sites ("site/slug"). */
export interface Trail {
  id: string;
  title: string;
  summary: string;
  items: string[];
}

export interface GlossaryEntry {
  id: string;
  term: string;
  def: string;
  see?: string[];
}

export interface EventColumn {
  key: string;
  label: string;
}
