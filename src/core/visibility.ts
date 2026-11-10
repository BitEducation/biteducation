import type { Catalog, LessonStatus } from "../contracts/types.ts";

/**
 * Which lessons a build shows: drafts only in dev, "review" in dev and in preview
 * builds (VITE_SHOW_REVIEW=1), "published" always. The build scripts pass their own env.
 */
export interface VisibilityEnv {
  dev: boolean;
  showReview: boolean;
}

function browserEnv(): VisibilityEnv {
  const env = import.meta.env;
  return { dev: Boolean(env?.DEV), showReview: env?.VITE_SHOW_REVIEW === "1" };
}

export function isVisible(status: LessonStatus, env: VisibilityEnv): boolean {
  if (status === "published") return true;
  if (status === "review") return env.dev || env.showReview;
  return env.dev;
}

export function visibleLessons(catalog: Catalog, env: VisibilityEnv = browserEnv()) {
  return catalog.lessons.filter((l) => isVisible(l.status, env));
}
