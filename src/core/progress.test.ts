import { describe, expect, it } from "vitest";
import {
  dueReviews,
  emptyProgress,
  isProgress,
  lessonPercent,
  markDone,
  markSeen,
  mergeProgress,
  REVIEW_AFTER,
  recordQuiz,
} from "./progress.ts";

describe("progress", () => {
  it("tracks seen steps, quiz and completion", () => {
    const p = emptyProgress();
    expect(markSeen(p, "rr", "s1-a", 10)).toBe(true);
    expect(markSeen(p, "rr", "s1-a", 11)).toBe(false);
    recordQuiz(p, "rr", "s2-b", true, 12);
    expect(lessonPercent(p.lessons.rr, 4)).toBe(24);
    markDone(p, "rr", ["s1-a", "s2-b"], 13);
    expect(lessonPercent(p.lessons.rr, 4)).toBe(100);
    expect(isProgress(p)).toBe(true);
  });
  it("never reaches 100% without the outro", () => {
    const p = emptyProgress();
    for (const s of ["s1-a", "s2-b", "s3-c"]) markSeen(p, "x", s);
    expect(lessonPercent(p.lessons.x, 3)).toBe(95);
  });
  it("rejects malformed or hostile imports", () => {
    expect(isProgress({ v: 2, lessons: {} })).toBe(false);
    expect(isProgress({ v: 1, lessons: { "<x>": { seen: [], done: false, quiz: {}, updatedAt: 1 } } })).toBe(
      false,
    );
    expect(
      isProgress({ v: 1, lessons: { a: { seen: ["<img>"], done: false, quiz: {}, updatedAt: 1 } } }),
    ).toBe(false);
    expect(
      isProgress({
        v: 1,
        lessons: { a: { seen: Array(65).fill("s1-a"), done: false, quiz: {}, updatedAt: 1 } },
      }),
    ).toBe(false);
  });
  it("merge keeps the most recent entry per lesson", () => {
    const a = { v: 1 as const, lessons: { x: { seen: ["s1-a"], done: false, quiz: {}, updatedAt: 5 } } };
    const b = {
      v: 1 as const,
      lessons: {
        x: { seen: [], done: true, quiz: {}, updatedAt: 9 },
        y: { seen: [], done: false, quiz: {}, updatedAt: 1 },
      },
    };
    const m = mergeProgress(a, b);
    expect(m.lessons.x?.done).toBe(true);
    expect(Object.keys(m.lessons)).toEqual(["x", "y"]);
  });
});

describe("dueReviews", () => {
  it("lists wrong answers first, then right answers older than a week", () => {
    const p = emptyProgress();
    const now = 100 * REVIEW_AFTER;
    recordQuiz(p, "dns", "s2-raiz", true, now - 1000);
    recordQuiz(p, "dns", "s4-cache", true, now - REVIEW_AFTER - 5);
    recordQuiz(p, "tcp-conexao", "s3-perda", false, now - 10);
    const due = dueReviews(p, now);
    expect(due.map((d) => d.stepId)).toEqual(["s3-perda", "s4-cache"]);
    expect(due[0]?.ok).toBe(false);
  });
});
