import { z } from "zod";

// A manual receipt records money already received; it never initiates a transfer.
export const PAYMENT_STATUSES = ["completed", "cancelled"] as const;
export const PAYMENT_METHODS = ["bank_transfer", "card", "cash", "cheque", "other"] as const;
export const recordPaymentSchema = z.strictObject({
  amount: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Montant décimal attendu.").refine(v => /[1-9]/.test(v), "Le montant doit être positif."),
  method: z.enum(PAYMENT_METHODS), paidAt: z.iso.datetime({ offset: true }),
  reference: z.string().trim().max(200).default(""), idempotencyKey: z.uuid(),
});
export const cancelPaymentSchema = z.strictObject({ reason: z.string().trim().min(1).max(1000) });
export const listPaymentsSchema = z.strictObject({ limit: z.number().int().min(1).max(100).default(20), offset: z.number().int().min(0).max(10000).default(0) });
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
