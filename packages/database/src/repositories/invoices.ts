import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import type { CreateDraftInvoiceInput } from "@first-ai/schemas";
import type { createDatabaseClient } from "../client.js";
import { customers, invoices, invoiceItems, organizations, users } from "../schema/index.js";
import { RepositorySession } from "./operations.js";

type Database = ReturnType<typeof createDatabaseClient>;
type Session = Pick<Database, "select" | "insert" | "update" | "delete">;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export interface InvoiceScope { organizationId: string; invoiceId: string }
const where = (s: InvoiceScope) => and(eq(invoices.organizationId, s.organizationId), eq(invoices.id, s.invoiceId), isNull(invoices.deletedAt));
function row<T>(v: T | undefined): T { if (v === undefined) throw new Error("Persistence operation returned no row."); return v; }
export function invoiceNumber(year: number, sequence: number) {
  if (!Number.isInteger(year) || year < 1000 || year > 9999 || !Number.isInteger(sequence) || sequence < 1 || sequence > 999999) throw new Error("Invoice numbering capacity exceeded.");
  return `FAC-${year}-${String(sequence).padStart(6, "0")}`;
}

export class InvoiceRepository {
  constructor(private readonly db: Session, private readonly transactional = false) {}
  async get(s: InvoiceScope, lock = false) { const query = this.db.select().from(invoices).where(where(s)).limit(1); return (await (lock ? query.for("update") : query))[0]; }
  async search(s: { organizationId: string; query?: string; status?: Invoice["status"]; customerId?: string; limit: number; offset: number }) {
    return this.db.select({ invoice: invoices, customerName: customers.name }).from(invoices)
      .innerJoin(customers, and(eq(customers.id, invoices.customerId), eq(customers.organizationId, s.organizationId)))
      .where(and(eq(invoices.organizationId, s.organizationId), isNull(invoices.deletedAt), s.status ? eq(invoices.status, s.status) : undefined, s.customerId ? eq(invoices.customerId, s.customerId) : undefined, s.query ? or(ilike(invoices.invoiceNumber, `%${s.query}%`), ilike(customers.name, `%${s.query}%`)) : undefined))
      .orderBy(desc(invoices.createdAt), invoices.id).limit(Math.min(100, Math.max(1, s.limit))).offset(Math.min(10000, Math.max(0, s.offset)));
  }
  // Same cross-process organization lock as quotes. Cancelled/soft-deleted numbers stay reserved.
  async create(organizationId: string, createdByUserId: string, input: CreateDraftInvoiceInput) {
    if (!this.transactional) throw new Error("Invoice numbering requires a transaction.");
    row((await this.db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId)).for("update"))[0]);
    const year = Number(input.issueDate.slice(0, 4)), prefix = `FAC-${year}-`;
    const previous = (await this.db.select({ number: invoices.invoiceNumber }).from(invoices).where(and(eq(invoices.organizationId, organizationId), ilike(invoices.invoiceNumber, `${prefix}%`))).orderBy(desc(invoices.invoiceNumber)).limit(1))[0];
    const sequence = previous ? Number(previous.number.slice(prefix.length)) + 1 : 1;
    return row((await this.db.insert(invoices).values({ ...input, organizationId, createdByUserId, invoiceNumber: invoiceNumber(year, sequence) }).returning())[0]);
  }
  async update(s: InvoiceScope, input: Partial<Pick<Invoice, "status" | "issuedAt" | "subtotal" | "taxAmount" | "total" | "amountPaid" | "amountDue" | "paidAt" | "documentSnapshot">>) { return (await this.db.update(invoices).set({ ...input, updatedAt: new Date() }).where(where(s)).returning())[0]; }
  async items(s: InvoiceScope) { return this.db.select().from(invoiceItems).where(and(eq(invoiceItems.organizationId, s.organizationId), eq(invoiceItems.invoiceId, s.invoiceId))).orderBy(invoiceItems.sortOrder, invoiceItems.createdAt, invoiceItems.id).limit(201); }
  async addItem(s: InvoiceScope, input: Omit<typeof invoiceItems.$inferInsert, "id" | "organizationId" | "invoiceId" | "createdAt" | "updatedAt">) { return row((await this.db.insert(invoiceItems).values({ ...input, ...s }).returning())[0]); }
  async updateItem(s: InvoiceScope, itemId: string, input: Partial<Pick<InvoiceItem, "serviceId" | "description" | "quantity" | "unitPrice" | "taxRate" | "sortOrder">>) { return (await this.db.update(invoiceItems).set({ ...input, updatedAt: new Date() }).where(and(eq(invoiceItems.organizationId, s.organizationId), eq(invoiceItems.invoiceId, s.invoiceId), eq(invoiceItems.id, itemId))).returning())[0]; }
  async removeItem(s: InvoiceScope, itemId: string) { return (await this.db.delete(invoiceItems).where(and(eq(invoiceItems.organizationId, s.organizationId), eq(invoiceItems.invoiceId, s.invoiceId), eq(invoiceItems.id, itemId))).returning())[0]; }
}

export class InvoiceSession extends RepositorySession {
  readonly invoices: InvoiceRepository;
  constructor(private readonly invoiceDb: Session, transactional = false) { super(invoiceDb, transactional); this.invoices = new InvoiceRepository(invoiceDb, transactional); }
  async membership(i: { organizationId: string; userId: string; authUserId: string }) {
    const [org] = await this.invoiceDb.select({ id: organizations.id }).from(organizations).where(and(eq(organizations.id, i.organizationId), eq(organizations.status, "active"), isNull(organizations.deletedAt))).for("share");
    if (!org) return undefined;
    return (await this.invoiceDb.select({ role: users.role }).from(users).where(and(eq(users.id, i.userId), eq(users.authUserId, i.authUserId), eq(users.organizationId, i.organizationId), eq(users.status, "active"), isNull(users.deletedAt))).limit(1).for("share"))[0];
  }
  async billingIdentity(s: InvoiceScope, customerId: string) {
    // Shared locks freeze both identities until issue commit; never use a service-site address.
    const seller = (await this.invoiceDb.select().from(organizations).where(and(eq(organizations.id, s.organizationId), eq(organizations.status, "active"), isNull(organizations.deletedAt))).limit(1).for("share"))[0];
    const customer = (await this.invoiceDb.select().from(customers).where(and(eq(customers.organizationId, s.organizationId), eq(customers.id, customerId), isNull(customers.deletedAt))).limit(1).for("share"))[0];
    return { seller, customer };
  }
  async customer(organizationId: string, customerId: string) { return (await this.db.select({ id: customers.id }).from(customers).where(and(eq(customers.organizationId, organizationId), eq(customers.id, customerId), isNull(customers.deletedAt))).limit(1)).length > 0; }
}
export interface InvoiceStoreInterface extends Pick<InvoiceSession, "invoices" | "customer" | "service" | "quotes" | "jobs" | "timezone"> {
  transaction<T>(fn: (s: InvoiceSession) => Promise<T>): Promise<T>;
}
export class InvoiceStore extends InvoiceSession implements InvoiceStoreInterface {
  constructor(private readonly database: Database) { super(database); }
  async transaction<T>(fn: (s: InvoiceSession) => Promise<T>): Promise<T> { return this.database.transaction(tx => fn(new InvoiceSession(tx, true))); }
}
