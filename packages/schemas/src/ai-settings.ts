import { z } from "zod";

export const aiModes = ["LOCAL_ONLY", "HYBRID", "CLOUD_ONLY"] as const;
export const hybridModelProfiles = ["LOCAL_FAST", "LOCAL_STANDARD", "CLOUD_STANDARD", "CLOUD_REASONING"] as const;
// Fixed loopback destinations prevent settings from becoming an SSRF primitive.
export const ollamaBaseUrlSchema = z.url().max(200).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)
      && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/";
  } catch { return false; }
}, "Utilisez une URL HTTP locale (localhost ou 127.0.0.1), sans chemin ni identifiants.");
const modelName = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/, "Nom de modèle invalide.");
export const aiSettingsSchema = z.strictObject({
  mode: z.enum(aiModes), ollamaBaseUrl: ollamaBaseUrlSchema,
  localFastModel: modelName, localStandardModel: modelName,
  cloudStandardModel: modelName, cloudReasoningModel: modelName,
  fallbackEnabled: z.boolean(),
});
export type AiSettings = z.infer<typeof aiSettingsSchema>;
