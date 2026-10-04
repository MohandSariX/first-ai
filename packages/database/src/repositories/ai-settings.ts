import { eq } from "drizzle-orm";
import type { createDatabaseClient } from "../client.js";
import { aiSettings } from "../schema/index.js";

type Values = Omit<typeof aiSettings.$inferInsert, "organizationId" | "updatedAt">;
export class AiSettingsRepository {
  constructor(private readonly database: ReturnType<typeof createDatabaseClient>) {}
  async get(organizationId: string) {
    const [row] = await this.database.select().from(aiSettings).where(eq(aiSettings.organizationId, organizationId)).limit(1);
    return row;
  }
  async initialize(organizationId: string, values: Values) {
    await this.database.insert(aiSettings).values({ ...values, organizationId }).onConflictDoNothing();
    return this.get(organizationId);
  }
  async update(organizationId: string, values: Values) {
    await this.database.insert(aiSettings).values({ ...values, organizationId }).onConflictDoUpdate({
      target: aiSettings.organizationId, set: { ...values, updatedAt: new Date() },
    });
  }
}
