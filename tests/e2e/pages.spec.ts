import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures.ts";

const PAGES = [
  "/",
  "/redes/",
  "/so/",
  "/arq/",
  "/sobre/",
  "/so/glossario/",
  "/redes/tcp-conexao/",
  "/arq/cache-direta/",
];

for (const path of PAGES)
  test(`abre ${path} sem erros e sem violações graves de acessibilidade`, async ({ page, errors }) => {
    await page.goto(path);
    await expect(page.locator("#app")).not.toBeEmpty();
    // @axe-core/playwright pins its own playwright-core; the Page API it uses is the same
    const axe = await new AxeBuilder({ page: page as never })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    const serious = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.length} nós`)).toEqual([]);
    expect(errors).toEqual([]);
  });

test("404 mostra a busca", async ({ page, errors }) => {
  const res = await page.goto("/nao-existe/");
  expect(res?.status()).toBe(404);
  await expect(page.locator(".search-btn")).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.locator(".palette-input")).toBeFocused();
  // The browser logs the 404 status of the document itself; that one is expected.
  const i = errors.findIndex((e) => e.includes("status of 404"));
  if (i >= 0) errors.splice(i, 1);
});

test("sem JavaScript, a lição mostra o artigo completo", async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto("/redes/syn-flood/");
  await expect(page.locator("article.ssr-lesson h1")).toHaveText("SYN flood e SYN cookies");
  expect(await page.locator("article.ssr-lesson section h2").count()).toBeGreaterThanOrEqual(6);
  await ctx.close();
});

test("offline: depois de baixar o site, as lições abrem sem rede", async ({ page, context }) => {
  await page.goto("/arq/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // the page is now controlled by the service worker
  await page.locator(".p-offline").click();
  await expect(page.locator(".toast").last()).toContainText(/funcionam sem internet/);
  await context.setOffline(true);
  await page.goto("/arq/pipeline/?passo=s3-regime");
  await expect(page.locator(".step-count")).toHaveText(/Passo 3 de 6/);
  await page.goto("/arq/glossario/");
  await expect(page.locator("#app h1")).toHaveText("Glossário");
  await context.setOffline(false);
});

test("navegador em inglês continua em português; inglês só por escolha", async ({ browser }) => {
  const ctx = await browser.newContext({ locale: "en-US" });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    (window as unknown as { __PD_FAST__: boolean }).__PD_FAST__ = true;
  });
  await page.goto("/redes/encapsulamento/");
  await expect(page.locator(".step-count")).toHaveText("Visão geral");
  await page.locator(".lang-btn").click();
  await page.locator('[data-lang="en"]').click();
  await expect(page.locator(".step-count")).toHaveText("Overview");
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  await ctx.close();
});
