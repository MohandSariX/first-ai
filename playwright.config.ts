import { randomUUID } from "node:crypto";
import { defineConfig } from "@playwright/test";

process.env.E2E_TEST_RUN_ID ??= randomUUID();
const port = Number(process.env.E2E_PORT ?? 3100);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("E2E_PORT must be a valid local port.");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  retries: 0,
  // Cold App Router compilation can take longer than a warm route navigation.
  expect: { timeout: 45_000 },
  reporter: "line",
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  webServer: {
    command: `pnpm --filter @first-ai/web dev --port ${port}`,
    url: `http://127.0.0.1:${port}/login`,
    // Never let a web-only .env.local key turn deterministic E2E into a paid call.
    env: { FIRST_AI_E2E: "true", OPENAI_API_KEY: "" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
  globalSetup: "./tests/e2e/global-setup.ts",
});
