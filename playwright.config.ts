import { randomUUID } from "node:crypto";
import { defineConfig } from "@playwright/test";

process.env.E2E_TEST_RUN_ID ??= randomUUID();

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  expect: { timeout: 15_000 },
  reporter: "line",
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  webServer: {
    command: "pnpm --filter @first-ai/web dev",
    url: "http://127.0.0.1:3000/login",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  globalSetup: "./tests/e2e/global-setup.ts",
});
