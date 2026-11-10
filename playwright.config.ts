import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://127.0.0.1:${PORT}`, locale: "pt-BR", trace: "retain-on-failure" },
  webServer: {
    command: "npx tsx scripts/serve-dist.ts",
    env: { PORT: String(PORT) },
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
