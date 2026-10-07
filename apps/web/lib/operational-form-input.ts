import { acceptQuoteSchema, addQuoteItemSchema, assignTechnicianSchema, createDraftJobSchema, createDraftQuoteSchema, createJobReportSchema, scheduleJobSchema, updateDraftQuoteSchema, updateJobReportSchema, updateQuoteItemSchema } from "@first-ai/schemas";
import { z } from "zod";
import { createDraftInvoiceSchema, addInvoiceItemSchema, updateInvoiceItemSchema, recordPaymentSchema, cancelPaymentSchema } from "@first-ai/schemas";
import { sellerBillingSchema, customerBillingSchema, invoiceClassificationSchema } from "@first-ai/schemas";
import { invoiceBusinessDetailsSchema, sellerInvoiceTermsSchema } from "@first-ai/schemas";
import { createCreditNoteSchema, creditNoteItemInputSchema } from "@first-ai/schemas";
export const operationSchema = z.enum(["credit.create", "credit.setItem", "credit.removeItem", "credit.issue", "credit.cancel", "billing.terms", "invoice.business", "billing.seller", "billing.customer", "invoice.classify", "payment.record", "payment.cancel", "invoice.create", "invoice.addItem", "invoice.updateItem", "invoice.removeItem", "invoice.issue", "invoice.cancel", "quote.create", "quote.update", "quote.addItem", "quote.updateItem", "quote.removeItem", "quote.ready", "quote.accept", "quote.reject", "job.create", "job.schedule", "job.reschedule", "job.assign", "job.start", "job.complete", "job.cancel", "report.create", "report.update", "report.complete"]);
export type Operation = z.infer<typeof operationSchema>;
export function formText(form: FormData, key: string): string { const v = form.get(key); return typeof v === "string" ? v.trim() : ""; }
const optional = (f: FormData, k: string) => formText(f, k) || undefined;
const creditLineIndex = (f: FormData) => creditNoteItemInputSchema.shape.originalLineIndex.parse(formText(f, "originalLineIndex") ? Number(formText(f, "originalLineIndex")) : undefined);
const itemInput = (f: FormData) => ({ serviceId: optional(f, "serviceId") ?? null, description: formText(f, "description"), quantity: formText(f, "quantity"), unitPrice: formText(f, "unitPrice"), taxRate: formText(f, "taxRate"), costEstimate: formText(f, "costEstimate"), sortOrder: Number(formText(f, "sortOrder") || "0") });
// The same schemas validate the browser form and the server action, before service validation.
export function parseOperationalForm(operation: Operation, f: FormData) {
  switch (operation) {
    case "credit.create": return createCreditNoteSchema.parse({ originalInvoiceId: formText(f, "invoiceId"), correctionType: formText(f, "correctionType"), reason: formText(f, "reason"), idempotencyKey: formText(f, "idempotencyKey") });
    case "credit.setItem": return creditNoteItemInputSchema.parse({ originalLineIndex: creditLineIndex(f), subtotal: formText(f, "subtotal") });
    case "credit.removeItem": return { originalLineIndex: creditLineIndex(f) };
    case "billing.terms": case "invoice.business": {
      const schema = operation === "billing.terms" ? sellerInvoiceTermsSchema : invoiceBusinessDetailsSchema;
      return schema.parse(Object.fromEntries(Object.keys(schema.shape).map(key => {
        const value = formText(f, key);
        const booleans = ["purchaseOrderIssued", "deliveryAddressDifferent", "b2bRecoveryIndemnity"];
        return [key, booleans.includes(key) ? value === "yes" ? true : value === "no" ? false : null : ["dueDays", "legalRateMultiplier"].includes(key) ? value ? Number(value) : null : value || null];
      })));
    }
    case "billing.seller": case "billing.customer": {
      const schema = operation === "billing.seller" ? sellerBillingSchema : customerBillingSchema;
      return schema.parse(Object.fromEntries(Object.keys(schema.shape).map(key => {
        const value = formText(f, key);
        return [key, key === "vatOnDebits" || key === "taxablePerson" ? (value === "yes" ? true : value === "no" ? false : null) : value || null];
      })));
    }
    case "invoice.classify": return invoiceClassificationSchema.parse(Object.fromEntries(Object.keys(invoiceClassificationSchema.shape).map(key => [key, formText(f, key) || null])));
    case "payment.record": return recordPaymentSchema.parse({ amount: formText(f, "amount"), method: formText(f, "method"), paidAt: formText(f, "paidAt"), reference: formText(f, "reference"), idempotencyKey: formText(f, "idempotencyKey") });
    case "payment.cancel": return cancelPaymentSchema.parse({ reason: formText(f, "reason") });
    case "invoice.create": {
      if (formText(f, "issueDate") || formText(f, "issuedAt")) throw new Error("La date d’émission est attribuée par le serveur.");
      return createDraftInvoiceSchema.parse({ customerId: formText(f, "customerId"), dueDate: formText(f, "dueDate"), quoteId: optional(f, "sourceQuoteId"), jobId: optional(f, "sourceJobId"), notes: optional(f, "notes"), internalNotes: optional(f, "internalNotes") });
    }
    case "invoice.addItem": case "invoice.updateItem": {
      const item = { serviceId: optional(f, "serviceId") ?? null, description: formText(f, "description"), quantity: formText(f, "quantity"), unitPrice: formText(f, "unitPrice"), taxRate: formText(f, "taxRate"), sortOrder: Number(formText(f, "sortOrder") || "0"), unit: formText(f, "unit") || "unité", kind: formText(f, "kind") || "item", discountAmount: formText(f, "discountAmount") || "0" };
      return (operation === "invoice.addItem" ? addInvoiceItemSchema : updateInvoiceItemSchema).parse(item);
    }
    case "quote.create": return createDraftQuoteSchema.parse({ customerId: formText(f, "customerId"), siteId: formText(f, "siteId"), validUntil: optional(f, "validUntil"), notes: optional(f, "notes") });
    case "quote.update": return updateDraftQuoteSchema.parse({ validUntil: optional(f, "validUntil"), notes: optional(f, "notes") });
    case "quote.addItem": return addQuoteItemSchema.parse(itemInput(f));
    case "quote.updateItem": return updateQuoteItemSchema.parse(itemInput(f));
    case "quote.accept": return acceptQuoteSchema.parse({ serviceId: formText(f, "serviceId") });
    case "job.create": return createDraftJobSchema.parse({ customerId: formText(f, "customerId"), siteId: formText(f, "siteId"), serviceId: formText(f, "serviceId"), description: formText(f, "description"), priority: optional(f, "priority"), infestationLevel: optional(f, "infestationLevel"), price: formText(f, "price"), estimatedCost: formText(f, "estimatedCost") });
    case "job.schedule": case "job.reschedule": return scheduleJobSchema.parse({ scheduledStart: formText(f, "scheduledStart"), scheduledEnd: formText(f, "scheduledEnd") });
    case "job.assign": return assignTechnicianSchema.parse({ assignedUserId: optional(f, "assignedUserId") ?? null });
    case "report.create": return createJobReportSchema.parse({ jobId: formText(f, "jobId"), observations: optional(f, "observations") });
    case "report.update": return updateJobReportSchema.parse({ observations: optional(f, "observations"), infestationLevelBefore: optional(f, "infestationLevelBefore"), infestationLevelAfter: optional(f, "infestationLevelAfter"), treatmentPerformed: optional(f, "treatmentPerformed"), productsUsedSummary: optional(f, "productsUsedSummary"), recommendations: optional(f, "recommendations"), followUpRequired: f.get("followUpRequired") === "on", followUpDate: optional(f, "followUpDate") ?? null });
    default: return {};
  }
}
