import type { CatalogEntry, SiteId } from "../contracts/types.ts";
import { readJson, remove, writeJson } from "./storage.ts";

export interface LessonProgress {
  seen: string[];
  done: boolean;
  quiz: Record<string, { ok: boolean; at: number }>;
  lastStep?: string;
  updatedAt: number;
}

export interface Progress {
  v: 1;
  lessons: Record<string, LessonProgress>;
}

const MAX_LESSONS = 500;
const MAX_STEPS = 64;
const ID = /^[a-z0-9-]{1,64}$/;

const key = (site: SiteId) => `biteducation:${site}:progress:v1`;

function isLessonProgress(v: unknown): v is LessonProgress {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.seen) || o.seen.length > MAX_STEPS) return false;
  if (!o.seen.every((s) => typeof s === "string" && ID.test(s))) return false;
  if (typeof o.done !== "boolean" || typeof o.updatedAt !== "number") return false;
  if (o.lastStep !== undefined && (typeof o.lastStep !== "string" || !ID.test(o.lastStep))) return false;
  if (typeof o.quiz !== "object" || o.quiz === null) return false;
  const quiz = Object.entries(o.quiz as Record<string, unknown>);
  if (quiz.length > MAX_STEPS) return false;
  return quiz.every(
    ([k, q]) =>
      ID.test(k) &&
      typeof q === "object" &&
      q !== null &&
      typeof (q as { ok?: unknown }).ok === "boolean" &&
      typeof (q as { at?: unknown }).at === "number",
  );
}

export function isProgress(v: unknown): v is Progress {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (o.v !== 1 || typeof o.lessons !== "object" || o.lessons === null) return false;
  const entries = Object.entries(o.lessons as Record<string, unknown>);
  return (
    entries.length <= MAX_LESSONS && entries.every(([slug, lp]) => ID.test(slug) && isLessonProgress(lp))
  );
}

export function emptyProgress(): Progress {
  return { v: 1, lessons: {} };
}

export function loadProgress(site: SiteId): Progress {
  return readJson(key(site), isProgress) ?? emptyProgress();
}

export function saveProgress(site: SiteId, p: Progress): void {
  writeJson(key(site), p);
}

export function clearProgress(site: SiteId): void {
  remove(key(site));
}

function lessonOf(p: Progress, slug: string): LessonProgress {
  p.lessons[slug] ??= { seen: [], done: false, quiz: {}, updatedAt: 0 };
  return p.lessons[slug];
}

export function markSeen(p: Progress, slug: string, stepId: string, now = Date.now()): boolean {
  const lp = lessonOf(p, slug);
  lp.lastStep = stepId;
  lp.updatedAt = now;
  if (lp.seen.includes(stepId)) return false;
  lp.seen.push(stepId);
  return true;
}

export function markDone(p: Progress, slug: string, stepIds: string[], now = Date.now()): void {
  const lp = lessonOf(p, slug);
  lp.done = true;
  lp.seen = [...new Set([...lp.seen, ...stepIds])];
  lp.updatedAt = now;
}

export function recordQuiz(p: Progress, slug: string, stepId: string, ok: boolean, now = Date.now()): void {
  const lp = lessonOf(p, slug);
  lp.quiz[stepId] = { ok, at: now };
  lp.updatedAt = now;
}

/** 0..100. Never 100 without reaching the outro. */
export function lessonPercent(lp: LessonProgress | undefined, stepCount: number): number {
  if (!lp) return 0;
  if (lp.done) return 100;
  if (stepCount <= 0) return 0;
  return Math.round((Math.min(lp.seen.length, stepCount) / stepCount) * 95);
}

export function lessonStatus(lp: LessonProgress | undefined): "new" | "progress" | "done" {
  if (!lp) return "new";
  if (lp.done) return "done";
  return lp.seen.length > 0 ? "progress" : "new";
}

/** Merge imported progress: the most recent entry per lesson wins. */
export function mergeProgress(current: Progress, incoming: Progress): Progress {
  const out: Progress = { v: 1, lessons: { ...current.lessons } };
  for (const [slug, lp] of Object.entries(incoming.lessons)) {
    const mine = out.lessons[slug];
    if (!mine || lp.updatedAt > mine.updatedAt) out.lessons[slug] = lp;
  }
  return out;
}

export interface ReviewItem {
  slug: string;
  stepId: string;
  ok: boolean;
  at: number;
}

const DAY = 24 * 60 * 60 * 1000;
/** A right answer comes back after this long: one look again fixes it better than none. */
export const REVIEW_AFTER = 7 * DAY;

/** Predictions worth answering again: wrong ones first, then right ones older than a week. */
export function dueReviews(p: Progress, now = Date.now(), max = 8): ReviewItem[] {
  const out: ReviewItem[] = [];
  for (const [slug, lp] of Object.entries(p.lessons))
    for (const [stepId, q] of Object.entries(lp.quiz))
      if (!q.ok || now - q.at >= REVIEW_AFTER) out.push({ slug, stepId, ok: q.ok, at: q.at });
  out.sort((a, b) => Number(a.ok) - Number(b.ok) || a.at - b.at);
  return out.slice(0, max);
}

/** Most recently touched lesson that is not finished yet, to offer "continue". */
export function lastVisited(lessons: CatalogEntry[], p: Progress): CatalogEntry | null {
  let best: CatalogEntry | null = null;
  let at = 0;
  for (const l of lessons) {
    const lp = p.lessons[l.slug];
    if (lp && !lp.done && lp.updatedAt > at) {
      at = lp.updatedAt;
      best = l;
    }
  }
  return best;
}
