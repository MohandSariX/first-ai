import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { createDatabaseClient } from "../client.js";
import { financialAuditEvents } from "../schema/financial-audit.js";
type Session = Pick<ReturnType<typeof createDatabaseClient>, "select" | "execute">;

// Set only after locking/revalidating membership. Local variables cannot leak through the pool.
export async function setFinancialActor(db: Session, c: { organizationId: string; userId: string; authUserId: string }) {
  await db.execute(sql`select set_config('first_ai.actor_user', ${c.userId}, true), set_config('first_ai.actor_auth', ${c.authUserId}, true), set_config('first_ai.actor_org', ${c.organizationId}, true), set_config('first_ai.correlation', ${randomUUID()}, true)`);
}
export class FinancialAuditRepository {
  constructor(private readonly db: Session) {}
  async list(s: { organizationId: string; limit: number; offset: number }) {
    return this.db.select().from(financialAuditEvents).where(eq(financialAuditEvents.organizationId, s.organizationId)).orderBy(desc(financialAuditEvents.occurredAt), desc(financialAuditEvents.id)).limit(Math.min(100, Math.max(1, s.limit))).offset(Math.min(10000, Math.max(0, s.offset)));
  }
  async get(organizationId: string, id: string) { return (await this.db.select().from(financialAuditEvents).where(and(eq(financialAuditEvents.organizationId, organizationId), eq(financialAuditEvents.id, id))).limit(1))[0]; }
  // Configuration records field names only, not billing values or personal information.
  async configuration(c: { organizationId: string; userId: string }, entityType: "organization" | "customer", entityId: string, eventType: "billing.seller_changed" | "billing.customer_changed" | "billing.terms_changed", fields: string[]) {
    await this.db.execute(sql`insert into public.financial_audit_events (organization_id, entity_type, entity_id, event_type, actor_user_id, correlation_id, metadata) values (${c.organizationId}::uuid, ${entityType}, ${entityId}::uuid, ${eventType}, ${c.userId}::uuid, current_setting('first_ai.correlation')::uuid, ${JSON.stringify({ fields })}::jsonb)`);
  }
  async archive(c: { organizationId: string; userId: string }, eventType: "billing.retention_changed" | "billing.archive_exported" | "billing.archive_verified", metadata: { fields?: string[]; number?: string; to?: string }) {
    await this.db.execute(sql`insert into public.financial_audit_events (organization_id,entity_type,entity_id,event_type,actor_user_id,correlation_id,metadata) values (${c.organizationId}::uuid,'organization',${c.organizationId}::uuid,${eventType},${c.userId}::uuid,current_setting('first_ai.correlation')::uuid,${JSON.stringify(metadata)}::jsonb)`);
  }
}
