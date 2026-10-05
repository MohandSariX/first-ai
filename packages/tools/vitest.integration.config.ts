import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({ resolve: { alias: { "server-only": fileURLToPath(new URL("../auth/src/test-support/server-only.ts", import.meta.url)) } }, test: { include: ["src/**/*.integration.test.ts"], testTimeout: 20000, hookTimeout: 20000 } });
