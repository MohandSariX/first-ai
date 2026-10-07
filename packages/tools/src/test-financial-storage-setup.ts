import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";
// One isolated directory per Vitest worker/file; never the application's live storage.
const directory = await mkdtemp(join(tmpdir(), "first-ai-financial-test-"));
process.env.FINANCIAL_STORAGE_DIRECTORY = directory;
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });
