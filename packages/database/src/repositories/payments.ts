import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { createDatabaseClient } from "../client.js";
import { organizations, payments, users } from "../schema/index.js";
import { InvoiceRepository, type InvoiceScope } from "./invoices.js";

type Database = ReturnType<typeof createDatabaseClient>;
type Session = Pick<Database, "select" | "insert" | "update" | "delete">;
export type Payment = typeof payments.$inferSelect;
export type PaymentIdentity = { organizationId: string; userId: string; authUserId: string };
const scoped = (s: InvoiceScope) => and(eq(payments.organizationId, s.organizationId), eq(payments.invoiceId, s.invoiceId));
export class PaymentRepository {
  constructor(private readonly db: Session) {}
  async get(s: InvoiceScope, paymentId: string) { return (await this.db.select().from(payments).where(and(scoped(s), eq(payments.id, paymentId))).limit(1))[0]; }
  async byKey(organizationId: string, key: string) { return (await this.db.select().from(payments).where(and(eq(payments.organizationId, organizationId), eq(payments.idempotencyKey, key))).limit(1))[0]; }
  async list(s: InvoiceScope, pagination: { limit: number; offset: number }) { return this.db.select().from(payments).where(scoped(s)).orderBy(desc(payments.createdAt), payments.id).limit(Math.min(100, Math.max(1, pagination.limit))).offset(Math.min(10000, Math.max(0, pagination.offset))); }
  async summary(s: InvoiceScope) {
    const [r] = await this.db.select({ amount: sql<string>`coalesce(sum(${payments.amount}), 0)::text`, paidAt: sql<string | null>`max(${payments.paidAt})::text` }).from(payments).where(and(scoped(s), eq(payments.status, "completed")));
    if (!r) throw new Error("Payment summary failed."); return { amount: r.amount, paidAt: r.paidAt ? new Date(r.paidAt) : null };
  }
  async create(input: typeof payments.$inferInsert) { return (await this.db.insert(payments).values(input).onConflictDoNothing({ target: [payments.organizationId, payments.idempotencyKey] }).returning())[0]; }
  async cancel(s: InvoiceScope, paymentId: string, userId: string, reason: string) { return (await this.db.update(payments).set({ status: "cancelled", cancelledAt: new Date(), cancelledByUserId: userId, cancellationReason: reason, updatedAt: new Date() }).where(and(scoped(s), eq(payments.id, paymentId), eq(payments.status, "completed"))).returning())[0]; }
}
export class PaymentSession {
  readonly invoices: InvoiceRepository;
  readonly payments: PaymentRepository;
  constructor(private readonly db: Session) { this.invoices = new InvoiceRepository(db); this.payments = new PaymentRepository(db); }
  async membership(i: PaymentIdentity) {
    // Shared locks keep membership/organization valid until financial commit.
    const [org] = await this.db.select({ id: organizations.id }).from(organizations).where(and(eq(organizations.id, i.organizationId), eq(organizations.status, "active"), isNull(organizations.deletedAt))).for("share");
    if (!org) return undefined;
    return (await this.db.select({ role: users.role }).from(users).where(and(eq(users.id, i.userId), eq(users.authUserId, i.authUserId), eq(users.organizationId, i.organizationId), eq(users.status, "active"), isNull(users.deletedAt))).limit(1).for("share"))[0];
  }
}
export interface PaymentStoreInterface extends Pick<PaymentSession, "payments" | "invoices"> {
  transaction<T>(operation: (s: PaymentSession) => Promise<T>): Promise<T>;
}
export class PaymentStore extends PaymentSession implements PaymentStoreInterface {
  constructor(private readonly database: Database) { super(database); }
  transaction<T>(operation: (s: PaymentSession) => Promise<T>) { return this.database.transaction(tx => operation(new PaymentSession(tx))); }
}
