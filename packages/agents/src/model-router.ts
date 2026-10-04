import { defaultAiSettings, type HybridModelProfile } from "./hybrid-router.js";
export { HybridModelRouter, classifyWorkload } from "./hybrid-router.js";
export const MODEL_PROFILES = ["LOCAL_FAST", "LOCAL_STANDARD", "CLOUD_STANDARD", "CLOUD_REASONING"] as const;
export type ModelProfile = HybridModelProfile;
export function resolveModel(profile: ModelProfile, environment: Readonly<Record<string, string | undefined>> = process.env): string {
  const settings = defaultAiSettings(environment);
  return ({ LOCAL_FAST: settings.localFastModel, LOCAL_STANDARD: settings.localStandardModel,
    CLOUD_STANDARD: settings.cloudStandardModel, CLOUD_REASONING: settings.cloudReasoningModel })[profile];
}
