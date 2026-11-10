/** Accessible disclosure menu: button[aria-haspopup] + sibling .menu[role=menu]. */
export function bindMenu(
  button: HTMLElement,
  menu: HTMLElement,
  onPick: (item: HTMLElement) => void,
): () => void {
  const items = () => [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')];
  const open = (focusFirst: boolean) => {
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
    if (focusFirst) (items().find((i) => i.getAttribute("aria-checked") === "true") ?? items()[0])?.focus();
  };
  const close = (refocus = false) => {
    if (menu.hidden) return;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (refocus) button.focus();
  };
  const onButton = (e: MouseEvent) => {
    e.stopPropagation();
    if (menu.hidden) open(e.detail === 0);
    else close();
  };
  const onKey = (e: KeyboardEvent) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (e.key === "Tab") close();
  };
  const onClick = (e: MouseEvent) => {
    const item = (e.target as Element).closest<HTMLElement>('[role^="menuitem"]');
    if (!item) return;
    onPick(item);
    close(item.tagName !== "A");
  };
  const onDoc = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node) && e.target !== button) close();
  };
  button.addEventListener("click", onButton);
  menu.addEventListener("keydown", onKey);
  menu.addEventListener("click", onClick);
  document.addEventListener("click", onDoc);
  return () => {
    button.removeEventListener("click", onButton);
    menu.removeEventListener("keydown", onKey);
    menu.removeEventListener("click", onClick);
    document.removeEventListener("click", onDoc);
  };
}
