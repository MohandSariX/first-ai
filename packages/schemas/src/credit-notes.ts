import { z } from "zod";
import { invoiceDocumentSnapshotSchema, invoiceIssueCalendar } from "./invoice-document.js";

export const CREDIT_NOTE_STATUSES = ["draft", "issued", "cancelled"] as const;
const amount = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);
const money = z.string().regex(/^\d{1,12}\.\d{2}$/);
export const createCreditNoteSchema = z.strictObject({
  originalInvoiceId: z.uuid(), correctionType: z.enum(["partial", "full"]),
  reason: z.string().trim().min(1).max(2000), idempotencyKey: z.uuid(),
});
export const creditNoteItemInputSchema = z.strictObject({
  // Stable index in the immutable invoice snapshot; older snapshots have no item UUIDs.
  originalLineIndex: z.number().int().min(0).max(199),
  subtotal: amount.refine(v => /^\d{1,12}(\.\d{1,2})?$/.test(v) && BigInt(v.replace(".", "")) > 0n, "Montant HT strictement positif requis."),
});
export const searchCreditNotesSchema = z.strictObject({
  query: z.string().trim().max(120).optional(), status: z.enum(CREDIT_NOTE_STATUSES).optional(),
  originalInvoiceId: z.uuid().optional(), limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).max(10000).default(0),
});
export const creditNoteLineSchema = z.strictObject({
  originalLineIndex: z.number().int().min(0).max(199), description: z.string().min(1).max(5000),
  unit: z.string().max(24).nullable(), originalQuantity: z.string().max(32),
  taxRate: z.string().regex(/^\d{1,3}\.\d{3}$/), subtotal: money, taxAmount: money, total: money,
});
export const creditNoteSnapshotSchema = z.strictObject({
  version: z.literal(1), organizationId: z.uuid(), creditNoteId: z.uuid(),
  number: z.string().regex(/^AV-\d{4}-\d{6}$/), issueDate: z.iso.date(), issuedAt: z.iso.datetime(),
  timeZone: z.string().min(1).max(100), fiscalYear: z.number().int(),
  reason: z.string().min(1).max(2000), correctionType: z.enum(["partial", "full"]),
  originalInvoice: invoiceDocumentSnapshotSchema,
  lines: z.array(creditNoteLineSchema).min(1).max(200),
  totals: z.strictObject({ subtotal: money, taxAmount: money, total: money }),
  taxes: z.array(z.strictObject({ rate: z.string().max(16), base: money, amount: money })).min(1).max(200),
}).superRefine((s, ctx) => {
  try {
    const calendar = invoiceIssueCalendar(new Date(s.issuedAt), s.timeZone);
    if (s.organizationId !== s.originalInvoice.organizationId || s.issueDate !== calendar.issueDate || s.fiscalYear !== calendar.fiscalYear || !s.number.startsWith(`AV-${s.fiscalYear}-`) || s.issueDate < s.originalInvoice.invoice.issueDate) ctx.addIssue({ code: "custom", message: "Métadonnées de l’avoir incohérentes." });
  } catch { ctx.addIssue({ code: "custom", message: "Fuseau de l’avoir invalide." }); }
  try {
    const cents = (v: string) => BigInt(v.replace(".", "")); // Snapshot money is fixed at two decimals.
    const groups = new Map<string, { base: bigint; amount: bigint }>();
    let ht = 0n, vat = 0n;
    for (const line of s.lines) {
      const original = s.originalInvoice.lines[line.originalLineIndex], base = cents(line.subtotal), tax = cents(line.taxAmount);
      if (!original || base <= 0n || base > cents(original.subtotal) || tax > cents(original.taxAmount) || line.taxRate !== original.taxRate || line.description !== original.description || line.originalQuantity !== original.quantity || line.unit !== ("unit" in original ? original.unit : null) || cents(line.total) !== base + tax) throw new Error("Line mismatch");
      const group = groups.get(line.taxRate) ?? { base: 0n, amount: 0n }; group.base += base; group.amount += tax; groups.set(line.taxRate, group); ht += base; vat += tax;
    }
    if (new Set(s.lines.map(l => l.originalLineIndex)).size !== s.lines.length || ht !== cents(s.totals.subtotal) || vat !== cents(s.totals.taxAmount) || ht + vat !== cents(s.totals.total) || s.taxes.length !== groups.size || new Set(s.taxes.map(t => t.rate)).size !== s.taxes.length || s.taxes.some(t => groups.get(t.rate)?.base !== cents(t.base) || groups.get(t.rate)?.amount !== cents(t.amount))) throw new Error("Total mismatch");
  } catch { ctx.addIssue({ code: "custom", message: "Lignes, totaux ou ventilation TVA de l’avoir incohérents." }); }
});
export type CreditNoteSnapshot = z.infer<typeof creditNoteSnapshotSchema>;
export type CreditNoteLine = z.infer<typeof creditNoteLineSchema>;
