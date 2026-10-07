import { financialArchiveBundleSchema, invoiceDocumentSnapshotSchema, creditNoteSnapshotSchema, PAYMENT_STATUSES } from "@first-ai/schemas";
import { z } from "zod";
import { financialHash } from "./financial-storage.js";
export const financialArchiveRecordsSchema = z.strictObject({ version: z.literal(1), organizationId: z.uuid(),
  policy: z.unknown(), documents: z.array(z.strictObject({ kind: z.enum(["invoice", "credit_note"]), id: z.uuid(), number: z.string().max(32), issueDate: z.iso.date(), snapshot: z.union([invoiceDocumentSnapshotSchema, creditNoteSnapshotSchema]).nullable(), artifact: z.strictObject({ name: z.string(), sha256: z.string(), bytes: z.number().int(), rendererVersion: z.string(), accountingClose: z.iso.date().nullable(), retentionUntil: z.iso.date().nullable(), policy: z.unknown() }).nullable(), legacy: z.boolean() })).max(200),
  payments: z.array(z.object({ id: z.uuid(), invoiceId: z.uuid(), amount: z.string().regex(/^\d+\.\d{2}$/), status: z.enum(PAYMENT_STATUSES), paidAt: z.iso.datetime(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() }).passthrough()).max(10000), auditEvents: z.array(z.object({ id: z.uuid(), organizationId: z.uuid(), entityId: z.uuid(), occurredAt: z.iso.datetime(), eventType: z.string().max(64) }).passthrough()).max(10000), counters: z.unknown(),
});
// Offline, bounded, no file extraction and no database connection or mutation.
export function verifyFinancialArchive(input: unknown) {
  const parsed = financialArchiveBundleSchema.safeParse(input);
  if (!parsed.success) return { valid: false, errors: ["Structure/version d’archive invalide."] };
  const { manifest, files } = parsed.data;
  if (files.reduce((sum, f) => sum + f.base64.length, 0) > 140 * 1024 * 1024) return { valid: false, errors: ["Archive trop volumineuse."] };
  const errors: string[] = [];
  if (new Set(manifest.files.map(f => f.name)).size !== manifest.files.length || new Set(files.map(f => f.name)).size !== files.length) errors.push("Fichiers dupliqués.");
  if (files.length !== manifest.files.length) errors.push("Nombre de fichiers incohérent.");
  let total = 0;
  for (const expected of manifest.files) {
    const file = files.find(f => f.name === expected.name);
    if (!file) { errors.push(`Fichier manquant : ${expected.name}`); continue; }
    const bytes = Buffer.from(file.base64, "base64"); total += bytes.length;
    if (bytes.toString("base64") !== file.base64 || bytes.length !== expected.bytes || financialHash(bytes) !== expected.sha256) errors.push(`Empreinte/taille invalide : ${expected.name}`);
    if (expected.name.endsWith(".pdf") && bytes.subarray(0, 5).toString() !== "%PDF-") errors.push(`PDF invalide : ${expected.name}`);
    if (expected.name === "records.json") {
      try {
        const records = financialArchiveRecordsSchema.parse(JSON.parse(bytes.toString("utf8")));
        if (records.organizationId !== manifest.organizationId) errors.push("Tenant incohérent.");
        if (new Set(records.documents.map(d => `${d.kind}/${d.id}`)).size !== records.documents.length) errors.push("Documents dupliqués.");
        if (records.payments.some(p => !records.documents.some(d => d.kind === "invoice" && d.id === p.invoiceId)) || records.auditEvents.some(e => e.organizationId !== records.organizationId)) errors.push("Justificatif hors tenant/document.");
        for (const d of records.documents) {
          if (d.legacy !== (d.artifact === null)) errors.push("Provenance originale/legacy incohérente.");
          if (d.snapshot && (d.snapshot.organizationId !== records.organizationId || ("invoiceId" in d.snapshot ? d.snapshot.invoiceId : d.snapshot.creditNoteId) !== d.id)) errors.push("Snapshot hors tenant/ressource.");
          if (d.snapshot && ("invoiceId" in d.snapshot ? d.kind !== "invoice" || d.snapshot.invoice.number !== d.number || d.snapshot.invoice.issueDate !== d.issueDate : d.kind !== "credit_note" || d.snapshot.number !== d.number || d.snapshot.issueDate !== d.issueDate)) errors.push("Référence fiscale du snapshot incohérente.");
          if (d.artifact) {
            if (!d.snapshot) errors.push("Snapshot original absent.");
            const f = manifest.files.find(f => f.name === d.artifact!.name);
            if (d.artifact.name !== `documents/${d.id}.pdf` || !f || f.sha256 !== d.artifact.sha256 || f.bytes !== d.artifact.bytes) errors.push("Artefact document manquant/incohérent.");
          }
        }
        if (manifest.files.length !== 1 + records.documents.filter(d => d.artifact).length) errors.push("Artefact non référencé.");
      } catch { errors.push("Données financières JSON illisibles."); }
    }
  }
  if (!manifest.files.some(f => f.name === "records.json")) errors.push("Données financières absentes.");
  if (total > 100 * 1024 * 1024) errors.push("Archive trop volumineuse.");
  return { valid: errors.length === 0, errors };
}
