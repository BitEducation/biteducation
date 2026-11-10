import { describe, expect, it } from "vitest";
import { isVisible } from "./visibility.ts";

describe("lesson visibility", () => {
  it("drafts only in dev, review in dev or preview, published always", () => {
    const prod = { dev: false, showReview: false };
    const preview = { dev: false, showReview: true };
    const dev = { dev: true, showReview: false };
    expect([isVisible("draft", prod), isVisible("draft", preview), isVisible("draft", dev)]).toEqual([
      false,
      false,
      true,
    ]);
    expect([isVisible("review", prod), isVisible("review", preview), isVisible("review", dev)]).toEqual([
      false,
      true,
      true,
    ]);
    expect([isVisible("published", prod), isVisible("published", preview)]).toEqual([true, true]);
  });
});
