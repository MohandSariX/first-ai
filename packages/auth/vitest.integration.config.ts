import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": fileURLToPath(
        new URL("./src/test-support/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["src/**/*.integration.test.ts"],
    hookTimeout: 20_000,
    testTimeout: 20_000,
  },
});
