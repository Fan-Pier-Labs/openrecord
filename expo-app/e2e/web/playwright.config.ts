import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the expo web export.
 *
 * Prerequisite: the export must exist (bun run export). The config then
 * brings up the three servers the tests need:
 *   :8088 — static server for the web export
 *   :4600 — mock AI backend (deterministic scripted model)
 *   :4000 — fake-mychart with CORS enabled (browser scrapes it directly)
 */
export default defineConfig({
  testDir: "./specs",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  retries: process.env.CI ? 1 : 0,
  // The flows share fake-mychart/mock server state; keep them serial.
  workers: 1,
  reporter: process.env.CI ? [["list"], ["junit", { outputFile: "results/junit.xml" }]] : "list",
  use: {
    baseURL: "http://localhost:8088",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: [
    {
      command: "bun serve-dist.ts",
      url: "http://localhost:8088",
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: "PORT=4600 bun ../mock-ai-server.ts",
      url: "http://localhost:4600/health",
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command:
        "cd ../../../fake-mychart && FAKE_MYCHART_CORS=true PORT=4000 bun run start",
      url: "http://localhost:4000/reset",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
