import { test as base, expect, type Page } from "@playwright/test";

/** Every page starts in fast mode (no animation time) and fails on console errors. */
export const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(() => {
        (window as unknown as { __PD_FAST__: boolean }).__PD_FAST__ = true;
      });
      await use(errors);
      expect(errors, "erros no console").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export const LESSONS = [
  "redes/encapsulamento",
  "redes/tcp-conexao",
  "redes/tls13",
  "redes/arp-spoofing",
  "redes/syn-flood",
  "so/chamada-de-sistema",
  "so/round-robin",
  "so/produtor-consumidor",
  "so/paginacao-tlb",
  "arq/instrucao-riscv",
  "arq/pipeline",
  "arq/cache-direta",
];

/** Plays a lesson to the end in continuous mode, skipping quizzes. */
export async function playToEnd(page: Page, deadlineMs = 90_000) {
  const play = page.locator(".c-play");
  const count = page.locator(".step-count");
  const mode = page.locator(".c-mode");
  if ((await mode.getAttribute("aria-pressed")) !== "true") await mode.click();
  const end = Date.now() + deadlineMs;
  while (Date.now() < end) {
    const label = (await play.textContent()) ?? "";
    if ((await count.textContent())?.trim() === "Resumo" && label.includes("Repetir")) return;
    const skip = page.locator(".quiz-skip");
    const cont = page.locator(".quiz-continue");
    if (await skip.isVisible()) await skip.click();
    else if (await cont.isVisible()) await cont.click();
    else if (!label.includes("Pausar") && (await play.isEnabled())) await play.click();
    await page.waitForTimeout(50);
  }
  throw new Error(`não chegou ao fim: ${await count.textContent()}`);
}
