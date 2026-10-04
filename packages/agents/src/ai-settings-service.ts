import type { CurrentBusinessUser } from "@first-ai/auth";
import { aiSettingsSchema, type AiSettings } from "@first-ai/schemas";
import { defaultAiSettings } from "./hybrid-router.js";
import { DirectorError } from "./types.js";

export interface AiSettingsStore {
  get(organizationId: string): Promise<unknown>;
  initialize(organizationId: string, values: AiSettings): Promise<unknown>;
  update(organizationId: string, values: AiSettings): Promise<void>;
}
export const canManageAiSettings = (role: CurrentBusinessUser["role"]) => role === "OWNER" || role === "ADMIN";
export class AiSettingsService {
  constructor(private readonly store: AiSettingsStore) {}
  async get(user: CurrentBusinessUser): Promise<AiSettings> {
    const existing = await this.store.get(user.organizationId);
    const row = existing ?? await this.store.initialize(user.organizationId, defaultAiSettings());
    // Persistence metadata is not part of the external editable input contract.
    return aiSettingsSchema.parse(Object.fromEntries(Object.keys(aiSettingsSchema.shape).map((key) => [key, (row as Record<string, unknown>)[key]])));
  }
  async update(user: CurrentBusinessUser, input: unknown): Promise<void> {
    if (!canManageAiSettings(user.role)) throw new DirectorError("FORBIDDEN", "Seuls les propriétaires et administrateurs peuvent modifier ces paramètres.");
    await this.store.update(user.organizationId, aiSettingsSchema.parse(input));
  }
}
