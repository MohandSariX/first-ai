import { randomUUID } from "node:crypto";
import { z } from "zod";
import { hasPermission, type CurrentBusinessUser, type Permission } from "@first-ai/auth";
import type { InvoiceSession, InvoiceStoreInterface } from "@first-ai/database";
import { financialRetentionPolicySchema, financialArchivePeriodSchema, financialArchiveBundleSchema, financialRetentionDeadline, invoiceIssueCalendar } from "@first-ai/schemas";
import { AuthorizationError, ResourceNotFoundError } from "./crm-services.js";
import { OperationalConflictError } from "./operational-policies.js";
import { LocalFinancialStorage, financialHash, financialStorageKey, type FinancialArtifactStorage } from "./financial-storage.js";
import { financialArchiveRecordsSchema, verifyFinancialArchive } from "./financial-archive.js";

export class FinancialRetentionService {
  constructor(private readonly store: InvoiceStoreInterface, private readonly storage: FinancialArtifactStorage = new LocalFinancialStorage()) {}
  private async member(s: InvoiceSession, c: CurrentBusinessUser, permission: Permission) {
    if (!hasPermission(c.role, permission)) throw new AuthorizationError("Action d’archive non autorisée.");
    const m = await s.membership(c);
    if (!m || !hasPermission(m.role, permission)) throw new AuthorizationError("Adhésion inactive ou action non autorisée.");
  }
  async settings(c: CurrentBusinessUser) { return this.store.transaction(async s => { await this.member(s, c, "financialArchive.read"); return { policy: await s.retention.policy(c.organizationId), latestExport: await s.retention.latestExport(c.organizationId) }; }); }
  async configure(c: CurrentBusinessUser, input: unknown) {
    const p = financialRetentionPolicySchema.parse(input);
    return this.store.transaction(async s => { await this.member(s, c, "financialArchive.configure"); const saved = await s.retention.savePolicy(c.organizationId, p); await s.financialAudit.archive(c, "billing.retention_changed", { fields: ["closingMonth", "closingDay", "retentionYears"] }); return saved; });
  }
  async original(c: CurrentBusinessUser, kind: "invoice" | "credit_note", id: string) {
    z.uuid().parse(id);
    return this.store.transaction(async s => {
      await this.member(s, c, kind === "invoice" ? "invoices.read" : "creditNotes.read");
      const artifact = await s.retention.artifact(c.organizationId, kind, id);
      if (!artifact) return undefined; // Existing service still verifies tenant/resource for a legacy copy.
      const bytes = await this.storage.read(c.organizationId, artifact.storageKey, artifact.sha256, artifact.byteSize);
      return { artifact, bytes };
    });
  }
  async artifactStatus(c: CurrentBusinessUser, kind: "invoice" | "credit_note", id: string) {
    z.uuid().parse(id);
    return this.store.transaction(async s => { await this.member(s, c, kind === "invoice" ? "invoices.read" : "creditNotes.read"); const a = await s.retention.artifact(c.organizationId, kind, id); return a ? { originalPreserved: true, retentionUntil: a.retentionUntil } : { originalPreserved: false, retentionUntil: null }; });
  }
  async createExport(c: CurrentBusinessUser, input: unknown) {
    const period = financialArchivePeriodSchema.parse(input);
    return this.store.transaction(async s => {
      await s.retention.consistentSnapshot(); await this.member(s, c, "financialArchive.export");
      const policy = await s.retention.policy(c.organizationId);
      if (!policy) throw new OperationalConflictError("Configurez la clôture comptable et la durée de conservation avant un export d’archive.");
      const raw = await s.retention.records(c.organizationId, period.from, period.to), timeZone = await s.timezone(c.organizationId);
      const policyValue = { closingMonth: policy.closingMonth, closingDay: policy.closingDay, retentionYears: policy.retentionYears };
      const retained = (d: Date) => financialRetentionDeadline(invoiceIssueCalendar(d, timeZone).issueDate, policyValue);
      const files: { name: string; base64: string }[] = [];
      let sourceBytes = 0;
      const documents = [];
      for (const row of [...raw.invoices.map(i => ({ kind: "invoice" as const, id: i.id, number: i.invoiceNumber!, issueDate: i.issueDate!, snapshot: i.documentSnapshot })), ...raw.creditNotes.map(n => ({ kind: "credit_note" as const, id: n.id, number: n.number!, issueDate: n.issueDate!, snapshot: n.snapshot }))]) {
        const a = raw.artifacts.find(a => a.entityType === row.kind && a.entityId === row.id);
        let artifact = null;
        if (a) {
          // Unknown historic retention is not silently filled by today's configuration.
          if (!a.retentionUntil) throw new OperationalConflictError("Un document a une échéance de conservation inconnue. Un cadrage explicite est requis, sans backfill silencieux.");
          const name = `documents/${row.id}.pdf`, bytes = await this.storage.read(c.organizationId, a.storageKey, a.sha256, a.byteSize);
          sourceBytes += bytes.length;
          if (sourceBytes > 70 * 1024 * 1024) throw new OperationalConflictError("Export trop volumineux ; réduisez la période.");
          files.push({ name, base64: bytes.toString("base64") });
          artifact = { name, sha256: a.sha256, bytes: a.byteSize, rendererVersion: a.rendererVersion, accountingClose: a.accountingClose, retentionUntil: a.retentionUntil, policy: a.policy };
        }
        documents.push({ ...row, artifact, legacy: !a });
      }
      const records = financialArchiveRecordsSchema.parse({ version: 1, organizationId: c.organizationId, policy: { ...policyValue, version: policy.version }, documents,
        payments: raw.payments.map(p => ({ id: p.id, invoiceId: p.invoiceId, amount: p.amount, method: p.method, status: p.status, paidAt: p.paidAt.toISOString(), createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(), cancelledAt: p.cancelledAt?.toISOString() ?? null, cancelledByUserId: p.cancelledByUserId, cancellationReason: p.cancellationReason, ...retained(p.updatedAt > p.paidAt ? p.updatedAt : p.paidAt) })),
        auditEvents: raw.auditEvents.map(e => ({ ...e, occurredAt: e.occurredAt.toISOString(), ...retained(e.occurredAt) })), counters: raw.counters });
      const recordsBytes = Buffer.from(JSON.stringify(records));
      if (sourceBytes + recordsBytes.length > 70 * 1024 * 1024) throw new OperationalConflictError("Export trop volumineux ; réduisez la période.");
      files.unshift({ name: "records.json", base64: recordsBytes.toString("base64") });
      const id = randomUUID(), createdAt = new Date();
      const bundle = financialArchiveBundleSchema.parse({ manifest: { version: 1, organizationId: c.organizationId, exportId: id, createdAt: createdAt.toISOString(), period, files: files.map(f => { const b = Buffer.from(f.base64, "base64"); return { name: f.name, sha256: financialHash(b), bytes: b.length }; }) }, files });
      const verification = verifyFinancialArchive(bundle);
      if (!verification.valid) throw new OperationalConflictError("Export incohérent ; aucune archive validée.");
      const bytes = Buffer.from(JSON.stringify(bundle)); if (bytes.length > 100 * 1024 * 1024) throw new OperationalConflictError("Export trop volumineux ; réduisez la période.");
      const sha256 = financialHash(bytes), storageKey = financialStorageKey(c.organizationId, "export", id, sha256);
      await this.storage.put(c.organizationId, storageKey, bytes);
      await s.retention.addExport({ id, organizationId: c.organizationId, sha256, byteSize: bytes.length, storageKey, periodFrom: period.from, periodTo: period.to, createdAt });
      await s.financialAudit.archive(c, "billing.archive_exported", { number: id }); return { id };
    });
  }
  async downloadExport(c: CurrentBusinessUser, id: string) {
    z.uuid().parse(id);
    return this.store.transaction(async s => { await this.member(s, c, "financialArchive.export"); const a = await s.retention.getExport(c.organizationId, id); if (!a) throw new ResourceNotFoundError("Archive introuvable."); return this.storage.read(c.organizationId, a.storageKey, a.sha256, a.byteSize); });
  }
  async verifyExport(c: CurrentBusinessUser, id: string) {
    z.uuid().parse(id);
    return this.store.transaction(async s => { await this.member(s, c, "financialArchive.export"); const a = await s.retention.getExport(c.organizationId, id); if (!a) throw new ResourceNotFoundError("Archive introuvable.");
      const bytes = await this.storage.read(c.organizationId, a.storageKey, a.sha256, a.byteSize);
      const result = verifyFinancialArchive(JSON.parse(bytes.toString("utf8")));
      await s.financialAudit.archive(c, "billing.archive_verified", { number: id, to: result.valid ? "valid" : "invalid" }); return result;
    });
  }
}
