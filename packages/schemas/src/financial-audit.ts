import { z } from "zod";
export const financialAuditSearchSchema = z.strictObject({ limit: z.number().int().min(1).max(100).default(25), offset: z.number().int().min(0).max(10000).default(0) });
export const invoiceAdministrativeMetadataSchema = z.strictObject({ internalNotes: z.string().trim().max(5000).nullable() });
