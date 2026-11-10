import { describe, expect, it } from "vitest";
import { normalize, type SearchItem, search, withinOneEdit } from "./search.ts";

const items: SearchItem[] = [
  {
    kind: "lesson",
    title: "Round Robin",
    sub: "Fatias de tempo",
    url: "/so/round-robin/",
    group: "Escalonamento",
    text: "",
    tags: ["quantum"],
  },
  {
    kind: "lesson",
    title: "Paginação e TLB",
    sub: "Tradução de endereços",
    url: "/so/paginacao-tlb/",
    group: "Memória",
    text: "",
  },
  {
    kind: "step",
    title: "O quantum acaba",
    sub: "Round Robin",
    url: "/so/round-robin/?passo=s2-x",
    group: "",
    text: "interrupção do timer",
  },
  {
    kind: "term",
    title: "TLB",
    sub: "Glossário",
    url: "/so/glossario/#tlb",
    group: "",
    text: "cache de traduções",
  },
];

describe("search", () => {
  it("normalizes accents and case", () => {
    expect(normalize("Paginação É")).toBe("paginacao e");
  });
  it("ranks title matches first and accepts prefixes", () => {
    expect(search(items, "pagin")[0]?.url).toBe("/so/paginacao-tlb/");
    expect(search(items, "quantum").map((i) => i.kind)).toEqual(["step", "lesson"]);
  });
  it("tolerates one typo in long words", () => {
    expect(search(items, "paginacau")[0]?.title).toBe("Paginação e TLB");
    expect(search(items, "tbl")).toHaveLength(0);
  });
  it("requires every query word to match", () => {
    expect(search(items, "round tlb")).toHaveLength(0);
  });
  it("withinOneEdit", () => {
    expect(withinOneEdit("abcde", "abde")).toBe(true);
    expect(withinOneEdit("abcde", "abxye")).toBe(false);
  });
});
