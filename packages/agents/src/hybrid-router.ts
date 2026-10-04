import { aiSettingsSchema, type AiSettings } from "@first-ai/schemas";

export type AiProviderName = "ollama" | "openai";
export type HybridModelProfile = "LOCAL_FAST" | "LOCAL_STANDARD" | "CLOUD_STANDARD" | "CLOUD_REASONING";
export type RoutingClass = "SIMPLE_LOOKUP" | "SUMMARY" | "STANDARD_ANALYSIS" | "COMPLEX_REASONING" | "SENSITIVE_REASONING";
export interface ModelSelection { provider: AiProviderName; model: string; modelProfile: HybridModelProfile; routingClass: RoutingClass }
export function defaultAiSettings(env: Readonly<Record<string, string | undefined>> = process.env): AiSettings {
  return aiSettingsSchema.parse({ mode: "HYBRID", ollamaBaseUrl: env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
    localFastModel: env.OLLAMA_MODEL_FAST || "qwen3:1.7b", localStandardModel: env.OLLAMA_MODEL_STANDARD || "qwen3:4b-instruct",
    cloudStandardModel: env.OPENAI_MODEL_STANDARD || "gpt-5.4-mini", cloudReasoningModel: env.OPENAI_MODEL_REASONING || "gpt-5.4", fallbackEnabled: true });
}
export function classifyWorkload(message: string): RoutingClass {
  const text = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/fiscal|impot|juridique|tresorerie|finance|bancaire/.test(text)) return "SENSITIVE_REASONING";
  if (/strategie|raisonnement complexe|scenario|arbitrage/.test(text)) return "COMPLEX_REASONING";
  if (/resume|synthese|fais.*point/.test(text)) return "SUMMARY";
  if (/analyse|tendance|explique/.test(text)) return "STANDARD_ANALYSIS";
  return "SIMPLE_LOOKUP";
}
export class HybridModelRouter {
  resolve(settings: AiSettings, routingClass: RoutingClass, agentConfiguration: { readonly modelProfile: HybridModelProfile } = { modelProfile: "LOCAL_STANDARD" }): ModelSelection {
    const complex = routingClass === "COMPLEX_REASONING" || routingClass === "SENSITIVE_REASONING";
    const requestedCloud = agentConfiguration.modelProfile.startsWith("CLOUD_");
    if (settings.mode === "CLOUD_ONLY" || (settings.mode === "HYBRID" && (complex || requestedCloud))) return this.cloud(settings, routingClass, agentConfiguration.modelProfile === "CLOUD_REASONING");
    // Organization mode is authoritative even if an agent asks for a cloud profile.
    const fast = routingClass === "SIMPLE_LOOKUP" || agentConfiguration.modelProfile === "LOCAL_FAST";
    return { provider: "ollama", modelProfile: fast ? "LOCAL_FAST" : "LOCAL_STANDARD", model: fast ? settings.localFastModel : settings.localStandardModel, routingClass };
  }
  cloud(settings: AiSettings, routingClass: RoutingClass, preferReasoning = false): ModelSelection {
    const reasoning = preferReasoning || routingClass === "COMPLEX_REASONING" || routingClass === "SENSITIVE_REASONING";
    return { provider: "openai", modelProfile: reasoning ? "CLOUD_REASONING" : "CLOUD_STANDARD", model: reasoning ? settings.cloudReasoningModel : settings.cloudStandardModel, routingClass };
  }
}
