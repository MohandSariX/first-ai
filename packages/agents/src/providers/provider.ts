import type { DirectorExecution } from "../types.js";
import type { AiProviderName } from "../hybrid-router.js";

export interface AiProvider {
  readonly name: AiProviderName;
  execute(input: DirectorExecution): Promise<string>;
}
