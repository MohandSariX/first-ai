import type { DirectorExecution } from "../types.js";
import type { AiProvider } from "./provider.js";

export class OpenAIProvider implements AiProvider {
  readonly name = "openai";
  async execute(input: DirectorExecution): Promise<string> {
    // Local-only runs need neither cloud initialization nor its credentials.
    const { executeDirector } = await import("../director/director.js");
    return executeDirector(input);
  }
}
