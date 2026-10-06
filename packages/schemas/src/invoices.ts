import { z } from "zod";
import { quoteItemSchema } from "./operations.js";
import { invoiceClassificationSchema } from "./billing.js";

// Payment states are derived by PaymentService; delivery/write-off transitions remain deferred.
export const INVOICE_STATUSES = ["draft", "issued", "sent", "partially_paid", "paid", "overdue", "cancelled", "written_off"] as const;
export const createDraftInvoiceSchema = z.strictObject({
  ...invoiceClassificationSchema.partial().shape,
  customerId: z.uuid(), quoteId: z.uuid().optional(), jobId: z.uuid().optional(),
  dueDate: z.iso.date(),
  notes: z.string().trim().max(5000).optional(), internalNotes: z.string().trim().max(5000).optional(),
});
export const addInvoiceItemSchema = quoteItemSchema.omit({ costEstimate: true });
export const updateInvoiceItemSchema = addInvoiceItemSchema.partial();
export const searchInvoicesSchema = z.strictObject({
  query: z.string().trim().max(120).optional(), status: z.enum(INVOICE_STATUSES).optional(), customerId: z.uuid().optional(),
  limit: z.number().int().min(1).max(100).default(20), offset: z.number().int().min(0).max(10000).default(0),
});
export type CreateDraftInvoiceInput = z.infer<typeof createDraftInvoiceSchema>;
