import { and, asc, desc, eq, gte, lte, inArray, or, sql } from "drizzle-orm";
import type { createDatabaseClient } from "../client.js";
import type { FinancialRetentionPolicy } from "@first-ai/schemas";
import { financialRetentionPolicies, financialArtifacts, financialArchiveExports, invoices, creditNotes, payments, financialAuditEvents, invoiceNumberCounters, creditNoteNumberCounters } from "../schema/index.js";
type Session = Pick<ReturnType<typeof createDatabaseClient>, "select" | "insert" | "execute">;
export class FinancialRetentionRepository {
  constructor(private readonly db: Session) {}
  async policy(org: string) { return (await this.db.select().from(financialRetentionPolicies).where(eq(financialRetentionPolicies.organizationId, org)).limit(1).for("share"))[0]; }
  async savePolicy(org: string, input: FinancialRetentionPolicy) { return (await this.db.insert(financialRetentionPolicies).values({ organizationId: org, ...input }).onConflictDoUpdate({ target: financialRetentionPolicies.organizationId, set: { ...input, version: sql`${financialRetentionPolicies.version} + 1`, updatedAt: new Date() } }).returning())[0]; }
  async artifact(org: string, kind: "invoice" | "credit_note", id: string) { return (await this.db.select().from(financialArtifacts).where(and(eq(financialArtifacts.organizationId, org), eq(financialArtifacts.entityType, kind), eq(financialArtifacts.entityId, id))).limit(1))[0]; }
  async addArtifact(input: typeof financialArtifacts.$inferInsert) { return (await this.db.insert(financialArtifacts).values(input).returning())[0]; }
  async addExport(input: typeof financialArchiveExports.$inferInsert) { return (await this.db.insert(financialArchiveExports).values(input).returning())[0]; }
  async getExport(org: string, id: string) { return (await this.db.select().from(financialArchiveExports).where(and(eq(financialArchiveExports.organizationId, org), eq(financialArchiveExports.id, id))).limit(1))[0]; }
  async latestExport(org: string) { return (await this.db.select().from(financialArchiveExports).where(eq(financialArchiveExports.organizationId, org)).orderBy(desc(financialArchiveExports.createdAt)).limit(1))[0]; }
  async consistentSnapshot() { await this.db.execute(sql`set transaction isolation level repeatable read`); }
  async records(org: string, from: string, to: string) {
    const invoiceRows = await this.db.select().from(invoices).where(and(eq(invoices.organizationId, org), gte(invoices.issueDate, from), lte(invoices.issueDate, to))).orderBy(asc(invoices.id)).limit(201);
    let creditRows = await this.db.select().from(creditNotes).where(and(eq(creditNotes.organizationId, org), eq(creditNotes.status, "issued"), gte(creditNotes.issueDate, from), lte(creditNotes.issueDate, to))).orderBy(asc(creditNotes.id)).limit(201);
    const ids = [...new Set([...invoiceRows.map(i => i.id), ...creditRows.map(c => c.originalInvoiceId)])];
    if (ids.length) creditRows = await this.db.select().from(creditNotes).where(and(eq(creditNotes.organizationId, org), eq(creditNotes.status, "issued"), inArray(creditNotes.originalInvoiceId, ids))).orderBy(asc(creditNotes.id)).limit(201);
    // Include original invoices outside the export period when required to read an included correction.
    const originals = ids.length ? await this.db.select().from(invoices).where(and(eq(invoices.organizationId, org), inArray(invoices.id, ids))).orderBy(asc(invoices.id)).limit(201) : [];
    if (invoiceRows.length + creditRows.length > 200 || originals.length + creditRows.length > 200) throw new Error("Export limité à 200 documents ; réduisez la période.");
    const receipts = ids.length ? await this.db.select().from(payments).where(and(eq(payments.organizationId, org), inArray(payments.invoiceId, ids))).orderBy(asc(payments.id)).limit(10001) : [];
    const documentIds = [...ids, ...creditRows.map(c => c.id), ...receipts.map(p => p.id)];
    const events = await this.db.select().from(financialAuditEvents).where(and(eq(financialAuditEvents.organizationId, org), or(documentIds.length ? inArray(financialAuditEvents.entityId, documentIds) : undefined, and(gte(financialAuditEvents.occurredAt, new Date(`${from}T00:00:00Z`)), lte(financialAuditEvents.occurredAt, new Date(`${to}T23:59:59.999Z`)))))).orderBy(asc(financialAuditEvents.id)).limit(10001);
    if (receipts.length > 10000 || events.length > 10000) throw new Error("Trop de justificatifs pour cet export borné.");
    const artifacts = documentIds.length ? await this.db.select().from(financialArtifacts).where(and(eq(financialArtifacts.organizationId, org), inArray(financialArtifacts.entityId, documentIds))).orderBy(asc(financialArtifacts.id)).limit(201) : [];
    return { invoices: originals, creditNotes: creditRows, payments: receipts, auditEvents: events, artifacts, counters: { invoices: await this.db.select().from(invoiceNumberCounters).where(eq(invoiceNumberCounters.organizationId, org)), creditNotes: await this.db.select().from(creditNoteNumberCounters).where(eq(creditNoteNumberCounters.organizationId, org)) } };
  }
}
