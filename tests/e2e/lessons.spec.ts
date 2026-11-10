import { expect, LESSONS, playToEnd, test } from "./fixtures.ts";

for (const path of LESSONS)
  test(`${path}: toca do começo ao fim`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/${path}/`);
    await playToEnd(page);
    await expect(page.locator(".step-count")).toHaveText("Resumo");
  });

test("?passo= abre no passo certo e ?lab= aplica os parâmetros", async ({ page }) => {
  await page.goto("/so/round-robin/?passo=s3-troca");
  await expect(page.locator(".step-count")).toHaveText(/Passo 3 de/);
  const lab = Buffer.from(JSON.stringify({ vias: "2", enderecos: "", politica: "lru" })).toString(
    "base64url",
  );
  await page.goto(`/arq/cache-direta/?lab=${lab}`);
  await expect(page.locator("body")).toContainText("2 vias");
});

test("teclado: setas, I, Esc e espaço", async ({ page }) => {
  const count = page.locator(".step-count");
  await page.goto("/redes/encapsulamento/");
  await expect(page.locator(".c-play")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(count).toHaveText(/Passo 1 de 7/);
  await page.keyboard.press("ArrowRight");
  await expect(count).toHaveText(/Passo 2 de 7/);
  await page.keyboard.press("i");
  await expect(page.locator(".inspector")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".inspector")).toBeHidden();
  await page.keyboard.press("ArrowLeft");
  await expect(count).toHaveText(/Passo 1 de 7/);
  await page.keyboard.press("Escape");
  await expect(count).toHaveText("Visão geral");
  // Space starts playing; in fast mode it may already be several steps ahead.
  await page.keyboard.press("Space");
  await expect(count).toHaveText(/Passo \d de 7|Resumo/);
});

test("vista Sequência desenha as mensagens e fica salva", async ({ page }) => {
  // Step 2 by link: the handshake of step 1 is already drawn, without its quiz in the way.
  await page.goto("/redes/tcp-conexao/?passo=s2-envio");
  await page.locator('.view-switch [data-view="seq"]').click();
  await expect(page.locator(".seq-host")).toBeVisible();
  await expect(page.locator(".seq-msg")).toHaveCount(3);
  await page.reload();
  await expect(page.locator('.view-switch [data-view="seq"]')).toHaveAttribute("aria-pressed", "true");
});

test("busca (Ctrl+K) leva à lição", async ({ page }) => {
  await page.goto("/redes/");
  await page.keyboard.press("Control+k");
  await page.locator(".palette-input").fill("syn cookies");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/redes\/syn-flood\//);
});

test("tema persiste depois de recarregar", async ({ page }) => {
  await page.goto("/so/");
  const before = await page.locator("html").getAttribute("data-theme");
  await page.locator(".theme-btn").click();
  await page.locator(`[data-theme-choice="${before === "dark" ? "light" : "dark"}"]`).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", before === "dark" ? "light" : "dark");
});

test("progresso: concluir marca o anel, e exportar/importar recupera", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/arq/pipeline/");
  await playToEnd(page);
  await page.goto("/arq/");
  const ring = page.locator('a[href$="/arq/pipeline/"] .ring');
  await expect(ring).toHaveAttribute("data-status", "done");
  const download = page.waitForEvent("download");
  await page.locator(".p-export").click();
  const file = await (await download).path();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(ring).not.toHaveAttribute("data-status", "done");
  await page.locator(".p-import input").setInputFiles(file as string);
  await expect(ring).toHaveAttribute("data-status", "done");
});

test("redes: exportar .pcap baixa uma captura válida", async ({ page }) => {
  await page.goto("/redes/arp-spoofing/");
  const download = page.waitForEvent("download");
  await page.locator(".ev-pcap").click();
  const d = await download;
  expect(d.suggestedFilename()).toBe("arp-spoofing.pcap");
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile((await d.path()) as string);
  expect(bytes.readUInt32LE(0)).toBe(0xa1b2c3d4);
  expect(bytes.readUInt32LE(20)).toBe(1);
});

test("só redes tem .pcap; lição sem bytes não mostra o botão", async ({ page }) => {
  await page.goto("/so/round-robin/");
  await expect(page.locator(".ev-copy")).toBeVisible();
  await expect(page.locator(".ev-pcap")).toHaveCount(0);
});
