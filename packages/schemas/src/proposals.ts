import { z } from "zod";
import { addQuoteItemSchema, updateQuoteItemSchema, createDraftQuoteSchema, scheduleJobSchema, assignTechnicianSchema, createJobReportSchema, updateJobReportSchema } from "./operations.js";

export const specialistSchema = z.enum(["pricing", "planning", "technician"]);
export type Specialist = z.infer<typeof specialistSchema>;
const job = z.strictObject({ jobId: z.uuid() });
const quote = z.strictObject({ quoteId: z.uuid() });
// Closed schemas: neither tenant context nor executable tool names come from the model.
export const proposalPayloadSchemas = {
  "quotes.createDraft": createDraftQuoteSchema,
  "quotes.addItem": addQuoteItemSchema.extend({ quoteId: z.uuid() }),
  "quotes.updateItem": updateQuoteItemSchema.extend({ quoteId: z.uuid(), itemId: z.uuid() }),
  "quotes.markReady": quote,
  "jobs.schedule": scheduleJobSchema.extend({ jobId: z.uuid() }),
  "jobs.reschedule": scheduleJobSchema.extend({ jobId: z.uuid() }),
  "jobs.assignTechnician": assignTechnicianSchema.extend({ jobId: z.uuid() }),
  "jobs.start": job,
  "reports.createDraft": createJobReportSchema,
  "reports.update": updateJobReportSchema.extend({ jobId: z.uuid() }),
  "reports.complete": job,
  "jobs.complete": job,
} as const;
export type ProposalAction = keyof typeof proposalPayloadSchemas;
export const proposalStatusSchema = z.enum(["pending", "approved", "rejected", "executed", "expired", "failed"]);
export const assistantInputSchema = z.strictObject({ message: z.string().trim().min(1).max(2000), specialist: specialistSchema.optional() });
export const proposalDecisionSchema = z.strictObject({ proposalId: z.uuid(), decision: z.enum(["approve", "reject"]) });
export const proposalViewSchema = z.object({ id: z.uuid(), specialist: specialistSchema, action: z.string(), summary: z.string(), payload: z.record(z.string(), z.unknown()), riskLevel: z.number(), status: proposalStatusSchema, result: z.object({ resourceId: z.uuid(), href: z.string() }).nullable(), errorCode: z.string().nullable() });
export type ProposalView = z.infer<typeof proposalViewSchema>;
