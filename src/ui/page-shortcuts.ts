import { siteUrl } from "../core/router.ts";
import { bindShortcuts } from "../core/shortcuts.ts";
import { openHelp } from "./help.ts";

export interface PageDeps {
  openSearch(): void;
  onLang(code: string): void;
}

/** Shortcuts available on pages without a lesson (site home, glossary, hub, about). */
export function pageShortcuts(openSearch?: () => void): () => void {
  return bindShortcuts({
    ...(openSearch ? { "Mod+k": openSearch, "/": openSearch } : {}),
    "?": () => openHelp(),
    "g h": () => location.assign(siteUrl("hub")),
  });
}
