import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { createDatabaseClient } from "../client.js";
import { creditNotes, creditNoteItems, invoices } from "../schema/index.js";
import { InvoiceSession, type InvoiceScope } from "./invoices.js";
import { PaymentRepository } from "./payments.js";

type Database = ReturnType<typeof createDatabaseClient>;
type Session = Pick<Database, "select" | "insert" | "update" | "delete" | "execute">;
export type CreditNote = typeof creditNotes.$inferSelect;
export interface CreditNoteScope { organizationId: string; creditNoteId: string }
const scoped = (s: CreditNoteScope) => and(eq(creditNotes.organizationId, s.organizationId), eq(creditNotes.id, s.creditNoteId));
export function creditNoteNumber(year: number, sequence: number) {
  if (!Number.isInteger(year) || year < 1000 || year > 9999 || !Number.isInteger(sequence) || sequence < 1 || sequence > 999999) throw new Error("Credit note numbering capacity exceeded.");
  return `AV-${year}-${String(sequence).padStart(6, "0")}`;
}
export class CreditNoteRepository {
  constructor(private readonly db: Session, private readonly transactional = false) {}
  async get(s: CreditNoteScope, lock = false) { const q = this.db.select().from(creditNotes).where(scoped(s)).limit(1); return (await (lock ? q.for("update") : q))[0]; }
  async byKey(organizationId: string, key: string) { return (await this.db.select().from(creditNotes).where(and(eq(creditNotes.organizationId, organizationId), eq(creditNotes.idempotencyKey, key))).limit(1))[0]; }
  async search(s: { organizationId: string; query?: string; originalInvoiceId?: string; status?: CreditNote["status"]; limit: number; offset: number }) {
    return this.db.select({ creditNote: creditNotes, invoiceNumber: invoices.invoiceNumber }).from(creditNotes).innerJoin(invoices, and(eq(invoices.id, creditNotes.originalInvoiceId), eq(invoices.organizationId, s.organizationId)))
      .where(and(eq(creditNotes.organizationId, s.organizationId), s.originalInvoiceId ? eq(creditNotes.originalInvoiceId, s.originalInvoiceId) : undefined, s.status ? eq(creditNotes.status, s.status) : undefined, s.query ? or(ilike(creditNotes.number, `%${s.query}%`), ilike(invoices.invoiceNumber, `%${s.query}%`), ilike(creditNotes.reason, `%${s.query}%`)) : undefined))
      .orderBy(desc(creditNotes.createdAt), creditNotes.id).limit(Math.min(100, Math.max(1, s.limit))).offset(Math.min(10000, Math.max(0, s.offset)));
  }
  async create(input: typeof creditNotes.$inferInsert) { return (await this.db.insert(creditNotes).values(input).onConflictDoNothing({ target: [creditNotes.organizationId, creditNotes.idempotencyKey] }).returning())[0]; }
  async update(s: CreditNoteScope, input: Partial<Pick<CreditNote, "status" | "number" | "issueDate" | "issuedAt" | "subtotal" | "taxAmount" | "total" | "snapshot">>) { return (await this.db.update(creditNotes).set({ ...input, updatedAt: new Date() }).where(scoped(s)).returning())[0]; }
  async items(s: CreditNoteScope) { return this.db.select().from(creditNoteItems).where(and(eq(creditNoteItems.organizationId, s.organizationId), eq(creditNoteItems.creditNoteId, s.creditNoteId))).orderBy(creditNoteItems.originalLineIndex).limit(201); }
  async setItem(s: CreditNoteScope, originalInvoiceId: string, originalLineIndex: number, subtotal: string, taxAmount: string, total: string) {
    return (await this.db.insert(creditNoteItems).values({ ...s, originalInvoiceId, originalLineIndex, subtotal, taxAmount, total }).onConflictDoUpdate({ target: [creditNoteItems.creditNoteId, creditNoteItems.originalLineIndex], set: { subtotal, taxAmount, total, updatedAt: new Date() } }).returning())[0];
  }
  async removeItem(s: CreditNoteScope, originalLineIndex: number) { return this.db.delete(creditNoteItems).where(and(eq(creditNoteItems.organizationId, s.organizationId), eq(creditNoteItems.creditNoteId, s.creditNoteId), eq(creditNoteItems.originalLineIndex, originalLineIndex))); }
  async correctedLines(s: InvoiceScope) {
    return this.db.select({ originalLineIndex: creditNoteItems.originalLineIndex, subtotal: sql<string>`sum(${creditNoteItems.subtotal})::text`, taxAmount: sql<string>`sum(${creditNoteItems.taxAmount})::text` }).from(creditNoteItems)
      .innerJoin(creditNotes, and(eq(creditNotes.id, creditNoteItems.creditNoteId), eq(creditNotes.organizationId, s.organizationId)))
      .where(and(eq(creditNoteItems.organizationId, s.organizationId), eq(creditNoteItems.originalInvoiceId, s.invoiceId), eq(creditNotes.status, "issued"))).groupBy(creditNoteItems.originalLineIndex);
  }
  async summary(s: InvoiceScope) { const [r] = await this.db.select({ amount: sql<string>`coalesce(sum(${creditNotes.total}),0)::text` }).from(creditNotes).where(and(eq(creditNotes.organizationId, s.organizationId), eq(creditNotes.originalInvoiceId, s.invoiceId), eq(creditNotes.status, "issued"))); if (!r) throw new Error("Credit summary failed"); return r.amount; }
  async allocate(s: CreditNoteScope) {
    if (!this.transactional) throw new Error("Credit allocation requires an issue transaction.");
    const [r] = await this.db.execute<{ number: string; issue_date: string; issued_at: string; time_zone: string; fiscal_year: number }>(sql`select number, issue_date::text, issued_at::text, time_zone, fiscal_year from public.allocate_credit_note_number(${s.organizationId}::uuid, ${s.creditNoteId}::uuid)`);
    if (!r) throw new Error("Allocation failed"); return { number: r.number, issueDate: r.issue_date, issuedAt: new Date(r.issued_at), timeZone: r.time_zone, fiscalYear: r.fiscal_year };
  }
}
export class CreditNoteSession extends InvoiceSession {
  readonly creditNotes: CreditNoteRepository;
  readonly payments: PaymentRepository;
  constructor(db: Session, transactional = false) { super(db, transactional); this.creditNotes = new CreditNoteRepository(db, transactional); this.payments = new PaymentRepository(db); }
}
export interface CreditNoteStoreInterface extends Pick<CreditNoteSession, "creditNotes"> { transaction<T>(work: (s: CreditNoteSession) => Promise<T>): Promise<T> }
export class CreditNoteStore extends CreditNoteSession implements CreditNoteStoreInterface {
  constructor(private readonly database: Database) { super(database); }
  transaction<T>(work: (s: CreditNoteSession) => Promise<T>) { return this.database.transaction(tx => work(new CreditNoteSession(tx, true))); }
}
