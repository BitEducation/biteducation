/**
 * Global keyboard shortcuts. Keys are named like "Space", "ArrowRight",
 * "Shift+ArrowRight", "Mod+k", "k", "?", "g h" (sequence). Ignored while typing,
 * inside open menus or while a modal dialog is open.
 */
export type ShortcutMap = Record<string, (e: KeyboardEvent) => void>;

const TYPING = "input, textarea, select, [contenteditable=''], [contenteditable='true'], .menu:not([hidden])";

function keyName(e: KeyboardEvent): string {
  let k = e.key === " " ? "Space" : e.key;
  if (k.length === 1) k = k.toLowerCase();
  const mods: string[] = [];
  if (e.metaKey || e.ctrlKey) mods.push("Mod");
  if (e.altKey) mods.push("Alt");
  // Shift is meaningful only for non-printable keys ("?" already encodes it).
  if (e.shiftKey && e.key.length > 1) mods.push("Shift");
  return [...mods, k].join("+");
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(TYPING) !== null;
}

export function bindShortcuts(map: ShortcutMap, target: Document | HTMLElement = document): () => void {
  let pending: string | null = null;
  let pendingTimer: ReturnType<typeof setTimeout> | undefined;
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.isComposing) return;
    if (document.querySelector("dialog[open]")) return;
    const name = keyName(e);
    if (isTypingTarget(e.target) && name !== "Mod+k") return;
    const seq = pending ? `${pending} ${name}` : null;
    pending = null;
    clearTimeout(pendingTimer);
    const fn = (seq && map[seq]) || map[name];
    if (fn) {
      e.preventDefault();
      fn(e);
      return;
    }
    if (Object.keys(map).some((k) => k.startsWith(`${name} `))) {
      pending = name;
      pendingTimer = setTimeout(() => {
        pending = null;
      }, 900);
    }
  };
  target.addEventListener("keydown", onKey as EventListener);
  return () => {
    target.removeEventListener("keydown", onKey as EventListener);
    clearTimeout(pendingTimer);
  };
}
