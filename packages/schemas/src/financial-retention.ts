import { z } from "zod";
export const financialRetentionPolicySchema = z.strictObject({ closingMonth: z.number().int().min(1).max(12), closingDay: z.number().int().min(1).max(31), retentionYears: z.number().int().min(10).max(50) }).refine(p => p.closingDay <= new Date(Date.UTC(2001, p.closingMonth, 0)).getUTCDate(), { message: "Jour de clôture invalide (29 février non pris en charge).", path: ["closingDay"] });
export type FinancialRetentionPolicy = z.infer<typeof financialRetentionPolicySchema>;
// Civil accounting dates, not UTC instants. No inference from organization creation.
export function financialRetentionDeadline(date: string, policy: FinancialRetentionPolicy | null) {
  z.iso.date().parse(date);
  if (!policy) return { accountingClose: null, retentionUntil: null };
  const p = financialRetentionPolicySchema.parse({ closingMonth: policy.closingMonth, closingDay: policy.closingDay, retentionYears: policy.retentionYears }), year = Number(date.slice(0, 4));
  const end = (y: number) => `${y}-${String(p.closingMonth).padStart(2, "0")}-${String(p.closingDay).padStart(2, "0")}`;
  const closeYear = date <= end(year) ? year : year + 1;
  return { accountingClose: end(closeYear), retentionUntil: end(closeYear + p.retentionYears) };
}
export const financialArchivePeriodSchema = z.strictObject({ from: z.iso.date(), to: z.iso.date() }).refine(p => p.from <= p.to, { message: "Période invalide." });
export const financialArchiveManifestSchema = z.strictObject({ version: z.literal(1), organizationId: z.uuid(), exportId: z.uuid(), createdAt: z.iso.datetime(), period: financialArchivePeriodSchema, files: z.array(z.strictObject({ name: z.string().regex(/^(records\.json|documents\/[0-9a-f-]{36}\.pdf)$/), sha256: z.string().regex(/^[0-9a-f]{64}$/), bytes: z.number().int().min(1).max(100 * 1024 * 1024) })).min(1).max(201) });
export const financialArchiveBundleSchema = z.strictObject({ manifest: financialArchiveManifestSchema, files: z.array(z.strictObject({ name: z.string().max(80), base64: z.string().max(140 * 1024 * 1024) })).min(1).max(201) });
