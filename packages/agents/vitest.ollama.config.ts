import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["src/**/*.ollama.test.ts"], testTimeout: 40_000, fileParallelism: false } });
