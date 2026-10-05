"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withCrm } from "../lib/crm";
import { requireBusinessUser } from "../lib/auth";
import { formText, operationSchema, parseOperationalForm } from "../lib/operational-form-input";
import type { ActionState } from "./actions";

export async function operationalAction(_state: ActionState, form: FormData): Promise<ActionState> {
  await requireBusinessUser();
  let destination: string | undefined;
  try {
    const operation = operationSchema.parse(formText(form, "operation"));
    const input = parseOperationalForm(operation, form);
    const quoteId = formText(form, "quoteId"), jobId = formText(form, "jobId");
    await withCrm(async ({ context, quotes, jobs, reports }) => {
      switch (operation) {
        case "quote.create": destination = `/quotes/${(await quotes.createDraftQuote(context, input)).id}`; break;
        case "quote.update": await quotes.updateDraftQuote(context, quoteId, input); break;
        case "quote.addItem": await quotes.addQuoteItem(context, quoteId, input); break;
        case "quote.updateItem": await quotes.updateQuoteItem(context, quoteId, formText(form, "itemId"), input); break;
        case "quote.removeItem": await quotes.removeQuoteItem(context, quoteId, formText(form, "itemId")); break;
        case "quote.ready": await quotes.markQuoteReady(context, quoteId); break;
        case "quote.accept": {
          if (form.get("confirmed") !== "on") throw new z.ZodError([{ code: "custom", path: ["confirmed"], message: "Confirmez l’acceptation et la création de l’intervention." }]);
          destination = `/jobs/${(await quotes.acceptQuoteAndCreateJob(context, quoteId, input)).job.id}?created=1`; break;
        }
        case "quote.reject": await quotes.rejectQuote(context, quoteId); break;
        case "job.create": destination = `/jobs/${(await jobs.createDraftJob(context, input)).id}`; break;
        case "job.schedule": await jobs.scheduleJob(context, jobId, input); break;
        case "job.reschedule": await jobs.rescheduleJob(context, jobId, input); break;
        case "job.assign": await jobs.assignTechnician(context, jobId, input); break;
        case "job.start": await jobs.startJob(context, jobId); break;
        case "job.complete": await jobs.completeJob(context, jobId); break;
        case "job.cancel": await jobs.cancelJob(context, jobId); break;
        case "report.create": await reports.createJobReportDraft(context, input); break;
        case "report.update": await reports.updateJobReport(context, jobId, input); break;
        case "report.complete": await reports.completeJobReport(context, jobId); break;
      }
    });
    for (const path of ["/quotes", "/jobs", "/dashboard", ...(quoteId ? [`/quotes/${quoteId}`] : []), ...(jobId ? [`/jobs/${jobId}`] : [])]) revalidatePath(path);
  } catch (error) {
    if (error instanceof z.ZodError) return { success: false, message: "Vérifiez les champs indiqués.", fieldErrors: error.flatten().fieldErrors };
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "FORBIDDEN") return { success: false, message: "Vous n’avez pas l’autorisation d’effectuer cette action." };
    if (code === "NOT_FOUND") return { success: false, message: "La ressource demandée est introuvable." };
    if (code === "CONFLICT" && error instanceof Error) return { success: false, message: error.message };
    console.error(JSON.stringify({ event: "operational_action_failed", code: "INTERNAL_ERROR" }));
    return { success: false, message: "L’opération n’a pas pu être enregistrée. Réessayez." };
  }
  if (destination) redirect(destination);
  return { success: true, message: "Modification enregistrée." };
}
