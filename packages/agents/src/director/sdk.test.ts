import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocked = vi.hoisted(() => ({
  run: vi.fn(), close: vi.fn(async () => undefined), Agent: vi.fn(), Runner: vi.fn(),
}));
vi.mock("@openai/agents", () => ({
  Agent: class { constructor(configuration: unknown) { mocked.Agent(configuration); } },
  AgentsError: class extends Error {},
  MaxTurnsExceededError: class extends Error {},
  InvalidToolInputError: class extends Error {},
  OpenAIProvider: class { close = mocked.close; },
  Runner: class {
    constructor(configuration: unknown) { mocked.Runner(configuration); }
    on = vi.fn();
    run = mocked.run;
  },
  tool: (configuration: unknown) => configuration,
}));
import { executeDirector } from "./director.js";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("OpenAI Agents SDK adapter (no network)", () => {
  it("fails clearly with no key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(executeDirector({ message: "Bonjour", model: "mock", tools: [], signal: new AbortController().signal, onUsage: vi.fn() })).rejects.toMatchObject({ code: "OPENAI_NOT_CONFIGURED" });
    expect(mocked.run).not.toHaveBeenCalled();
  });
  it("uses versioned instructions, strict tools, bounded Responses runs and usage", async () => {
    // This is only a mocked configuration marker, not a credential.
    vi.stubEnv("OPENAI_API_KEY", "mock-only");
    mocked.run.mockResolvedValue({ finalOutput: "OK", state: { usage: { inputTokens: 10, outputTokens: 1, requests: 1 } } });
    const usage = vi.fn(); const controller = new AbortController();
    const invoke = vi.fn(async () => "{}");
    const result = await executeDirector({ message: "Bonjour", model: "configured-model", tools: [
      { name: "customers_get", description: "Read customer", parameters: z.strictObject({ customerId: z.uuid() }), invoke },
    ], signal: controller.signal, onUsage: usage });
    expect(result).toBe("OK");
    expect(mocked.Agent).toHaveBeenCalledWith(expect.objectContaining({
      name: "director:v1", model: "configured-model",
      modelSettings: { maxTokens: 1500, parallelToolCalls: false, store: false },
      tools: [expect.objectContaining({ strict: true, name: "customers_get" })],
    }));
    expect(mocked.Runner).toHaveBeenCalledWith(expect.objectContaining({ traceIncludeSensitiveData: false }));
    expect(mocked.run).toHaveBeenCalledWith(expect.anything(), "Bonjour", { maxTurns: 6, signal: controller.signal });
    expect(usage).toHaveBeenCalledWith(10, 1, 1);
    expect(mocked.close).toHaveBeenCalledOnce();
  });
});
