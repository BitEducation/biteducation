/**
 * Macro expansion (SCO 7.2): the assembler copies a macro body in place of each call, replacing
 * formal parameters (\a) by the actual ones. Also counts code size and executed instructions of
 * the same work done as a procedure call instead.
 */

export interface Macro {
  name: string;
  params: string[];
  body: string[];
}

/** Reads `.macro name a, b` … `.endm` blocks; returns the macros and the remaining lines. */
export function parse(src: string[]): { macros: Macro[]; code: string[] } {
  const macros: Macro[] = [];
  const code: string[] = [];
  let open: Macro | null = null;
  for (const raw of src) {
    const line = raw.trim();
    const m = /^\.macro\s+(\w+)\s*(.*)$/.exec(line);
    if (m) {
      open = {
        name: m[1] as string,
        params: (m[2] as string)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        body: [],
      };
      continue;
    }
    if (line === ".endm") {
      if (open) macros.push(open);
      open = null;
      continue;
    }
    if (open) open.body.push(line);
    else if (line) code.push(line);
  }
  return { macros, code };
}

export interface Expanded {
  line: string;
  /** Source line (1-based, in `code`) that produced it. */
  from: number;
}

export function expand(src: string[]): Expanded[] {
  const { macros, code } = parse(src);
  const out: Expanded[] = [];
  code.forEach((line, i) => {
    const [head, ...rest] = line.split(/\s+/);
    const mac = macros.find((m) => m.name === head);
    if (!mac) {
      out.push({ line, from: i + 1 });
      return;
    }
    const args = rest
      .join(" ")
      .split(",")
      .map((s) => s.trim());
    for (const body of mac.body) {
      let l = body;
      mac.params.forEach((p, k) => {
        l = l.split(`\\${p}`).join(args[k] ?? "");
      });
      out.push({ line: l, from: i + 1 });
    }
  });
  return out;
}

/** Words of code and instructions executed for k uses: inline macro vs a called procedure. */
export function cost(k: number, body: number, setup: number) {
  return {
    macroSize: k * body,
    procSize: body + 1 + k * (setup + 1),
    macroRun: k * body,
    procRun: k * (setup + 1 + body + 1),
  };
}

/** Smallest k from which the procedure is no larger than the macro. */
export function breakEven(body: number, setup: number): number {
  let k = 1;
  while (cost(k, body, setup).procSize > cost(k, body, setup).macroSize) k++;
  return k;
}
