import { describe, expect, it } from "vitest";
import type { SceneSpec, Step, TraceEvent } from "../contracts/types.ts";
import { focusOf } from "./focus.ts";

const spec: SceneSpec = {
  viewBox: [100, 100],
  nodes: [],
  widgets: [
    { kind: "gantt", id: "g", title: "", at: [0, 0], lanes: ["L1"], span: 4, width: 100 },
    { kind: "table", id: "t", title: "", at: [0, 0], columns: ["a"], widths: [10], rows: 1 },
  ],
};
const trace: TraceEvent[] = [
  { t: 1, kind: "row", table: "t", index: 0, cells: ["x"], role: "a", label: "" },
  { t: 2, kind: "gantt", lane: "L1", from: 0, to: 1, item: "", itemRole: "a", role: "a", label: "" },
  { t: 3, kind: "move", from: "a", to: "b", role: "a", label: "" },
];
const step = (highlight?: string[]): Step => ({
  id: "s1-x",
  title: "",
  subtitle: "",
  text: "",
  facts: [],
  events: [0, 2],
  ...(highlight ? { highlight } : {}),
});

describe("focusOf", () => {
  it("keeps the author's highlight", () => {
    expect(focusOf(step(["n"]), trace, spec)).toEqual(["n"]);
  });
  it("falls back to what the step changes, within its own events", () => {
    expect(focusOf(step([]), trace, spec)).toEqual(["t", "g"]);
    expect(focusOf(step(), trace, spec)).toEqual(["t", "g"]);
  });
  it("handles no step", () => {
    expect(focusOf(undefined, trace, spec)).toEqual([]);
  });
});
