import { readString, writeString } from "./storage.ts";

export type ThemeChoice = "light" | "dark" | "system";
export const SPEEDS = [0.25, 0.5, 1, 1.5, 2] as const;
export type Speed = (typeof SPEEDS)[number];

const KEYS = {
  theme: "biteducation:theme",
  speed: "biteducation:speed",
  index: "biteducation:index",
  events: "biteducation:events",
  eventsH: "biteducation:events-h",
  mode: "biteducation:mode",
  view: "biteducation:view",
} as const;

export function getTheme(): ThemeChoice {
  const v = readString(KEYS.theme);
  return v === "light" || v === "dark" ? v : "system";
}

export function resolvedTheme(choice: ThemeChoice = getTheme()): "light" | "dark" {
  if (choice !== "system") return choice;
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function setTheme(choice: ThemeChoice): void {
  writeString(KEYS.theme, choice);
  applyTheme(choice);
}

export function applyTheme(choice: ThemeChoice = getTheme()): void {
  const theme = resolvedTheme(choice);
  document.documentElement.dataset.theme = theme;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = theme === "dark" ? "#040917" : "#F4F6FB";
    if (choice !== "system") meta.removeAttribute("media");
  }
}

export function getSpeed(): Speed {
  const v = Number(readString(KEYS.speed));
  return (SPEEDS as readonly number[]).includes(v) ? (v as Speed) : 1;
}
export function setSpeed(v: Speed): void {
  writeString(KEYS.speed, String(v));
}

export function getFlag(name: "index" | "events", fallback: boolean): boolean {
  const v = readString(KEYS[name]);
  return v === null ? fallback : v === "1";
}
export function setFlag(name: "index" | "events", value: boolean): void {
  writeString(KEYS[name], value ? "1" : "0");
}

export function getEventsHeight(): number {
  const v = Number(readString(KEYS.eventsH));
  return Number.isFinite(v) && v >= 120 && v <= 900 ? v : 0;
}
export function setEventsHeight(px: number): void {
  writeString(KEYS.eventsH, String(Math.round(px)));
}

export function getContinuous(): boolean {
  return readString(KEYS.mode) !== "step";
}
export function setContinuous(v: boolean): void {
  writeString(KEYS.mode, v ? "continuous" : "step");
}

export type SceneView = "net" | "seq";
export function getView(): SceneView {
  return readString(KEYS.view) === "seq" ? "seq" : "net";
}
export function setView(v: SceneView): void {
  writeString(KEYS.view, v);
}
