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
    const invoiceId = formText(form, "invoiceId");
    const creditNoteId = formText(form, "creditNoteId");
    await withCrm(async ({ context, quotes, jobs, reports, invoices, payments, billing, creditNotes }) => {
      switch (operation) {
        case "credit.create": destination = `/credit-notes/${(await creditNotes.createDraft(context, input)).id}`; break;
        case "credit.setItem": await creditNotes.setItem(context, creditNoteId, input); break;
        case "credit.removeItem": await creditNotes.removeItem(context, creditNoteId, Number(formText(form, "originalLineIndex"))); break;
        case "credit.cancel": await creditNotes.cancel(context, creditNoteId); break;
        case "credit.issue": {
          if (form.get("confirmed") !== "on") throw new z.ZodError([{ code: "custom", path: ["confirmed"], message: "Confirmez l’émission définitive de l’avoir." }]);
          const issued = await creditNotes.issue(context, creditNoteId);
          revalidatePath(`/invoices/${issued.originalInvoiceId}`); break;
        }
        case "billing.terms": await billing.updateInvoiceTerms(context, input); break;
        case "invoice.business": await invoices.updateBusinessDetails(context, invoiceId, input); break;
        case "billing.seller": await billing.updateSeller(context, input); break;
        case "billing.customer": await billing.updateCustomer(context, formText(form, "customerId"), input); break;
        case "invoice.classify": await invoices.updateClassification(context, invoiceId, input); break;
        case "payment.record": await payments.recordPayment(context, invoiceId, input); break;
        case "payment.cancel": await payments.cancelPayment(context, invoiceId, formText(form, "paymentId"), input); break;
        case "invoice.create": destination = `/invoices/${(await invoices.createDraftInvoice(context, input)).id}`; break;
        case "invoice.addItem": await invoices.addInvoiceItem(context, invoiceId, input); break;
        case "invoice.updateItem": await invoices.updateInvoiceItem(context, invoiceId, formText(form, "itemId"), input); break;
        case "invoice.removeItem": await invoices.removeInvoiceItem(context, invoiceId, formText(form, "itemId")); break;
        case "invoice.issue": {
          if (form.get("confirmed") !== "on") throw new z.ZodError([{ code: "custom", path: ["confirmed"], message: "Confirmez l’émission : les lignes seront figées." }]);
          await invoices.issueInvoice(context, invoiceId); break;
        }
        case "invoice.cancel": await invoices.cancelInvoice(context, invoiceId); break;
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
    revalidatePath("/credit-notes");
    if (creditNoteId) revalidatePath(`/credit-notes/${creditNoteId}`);
    for (const path of ["/settings/billing", "/customers", ...(formText(form, "customerId") ? [`/customers/${formText(form, "customerId")}`] : []), "/invoices", ...(invoiceId ? [`/invoices/${invoiceId}`] : []), "/quotes", "/jobs", "/dashboard", ...(quoteId ? [`/quotes/${quoteId}`] : []), ...(jobId ? [`/jobs/${jobId}`] : [])]) revalidatePath(path);
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
