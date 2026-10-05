import { z } from "zod";
import { addQuoteItemSchema, createDraftJobSchema, createDraftQuoteSchema, createJobReportSchema, searchJobsSchema, searchQuotesSchema } from "@first-ai/schemas";
import type { Tool, ToolContext } from "./crm-tools.js";
import type { JobReportService, JobService, QuoteService } from "./operational-services.js";
export function createOperationalToolRegistry(services: { quotes: QuoteService; jobs: JobService; reports: JobReportService }): Readonly<Record<string, Tool>> {
  function tool(definition: Omit<Tool, "execute">, run: (c: ToolContext, i: unknown) => Promise<unknown>): Tool {
    return { ...definition, async execute(c, i) { try { return { success: true, data: await run(c, definition.inputSchema.parse(i)) }; } catch (error) { const code = error instanceof z.ZodError ? "VALIDATION_ERROR" : typeof error === "object" && error !== null && "code" in error ? String(error.code) : "INTERNAL_ERROR"; return { success: false, error: { code, message: code === "FORBIDDEN" ? "Action non autorisée." : code === "NOT_FOUND" ? "Ressource introuvable." : "Opération impossible." } }; } } };
  }
  const id = (key: string) => z.strictObject({ [key]: z.uuid() });
  const getId = (input: unknown, key: string) => (input as Record<string, string>)[key]!;
  const tools = [
    tool({ name: "quotes.get", description: "Lire un devis et ses lignes, dans votre organisation.", risk: 0, permission: "quotes.read", inputSchema: id("quoteId") }, (c, i) => services.quotes.getQuote(c, getId(i, "quoteId"))),
    tool({ name: "quotes.search", description: "Rechercher une page de devis par numéro, client ou statut.", risk: 0, permission: "quotes.read", inputSchema: searchQuotesSchema }, (c, i) => services.quotes.searchQuotes(c, i)),
    tool({ name: "quotes.createDraft", description: "Créer uniquement un brouillon de devis.", risk: 1, permission: "quotes.write", inputSchema: createDraftQuoteSchema }, (c, i) => services.quotes.createDraftQuote(c, i)),
    tool({ name: "quotes.addItem", description: "Ajouter une ligne à un devis brouillon.", risk: 1, permission: "quotes.write", inputSchema: addQuoteItemSchema.extend({ quoteId: z.uuid() }) }, (c, i) => { const { quoteId, ...item } = i as z.infer<typeof addQuoteItemSchema> & { quoteId: string }; return services.quotes.addQuoteItem(c, quoteId, item); }),
    tool({ name: "quotes.calculateTotals", description: "Calculer les totaux sans modifier le devis. Marge hors TVA.", risk: 0, permission: "quotes.read", inputSchema: id("quoteId") }, (c, i) => services.quotes.calculateQuote(c, getId(i, "quoteId"))),
    tool({ name: "jobs.get", description: "Lire une intervention autorisée. Techniciens : uniquement les interventions assignées.", risk: 0, permission: "jobs.read", inputSchema: id("jobId") }, (c, i) => services.jobs.getJob(c, getId(i, "jobId"))),
    tool({ name: "jobs.search", description: "Rechercher les interventions autorisées par date (AAAA-MM-JJ dans le fuseau de l’organisation), client ou statut.", risk: 0, permission: "jobs.read", inputSchema: searchJobsSchema }, (c, i) => services.jobs.searchJobs(c, i)),
    tool({ name: "jobs.getToday", description: "Interventions prévues aujourd’hui dans le fuseau de l’organisation. Liste paginée.", risk: 0, permission: "jobs.read", inputSchema: searchJobsSchema.omit({ date: true }) }, (c, i) => services.jobs.getToday(c, i)),
    tool({ name: "jobs.createDraft", description: "Créer une intervention brouillon, sans la planifier.", risk: 1, permission: "jobs.write", inputSchema: createDraftJobSchema }, (c, i) => services.jobs.createDraftJob(c, i)),
    tool({ name: "jobReports.get", description: "Lire le rapport d’une intervention autorisée.", risk: 0, permission: "job_reports.read", inputSchema: id("jobId") }, (c, i) => services.reports.getJobReport(c, getId(i, "jobId"))),
    tool({ name: "jobReports.createDraft", description: "Créer un rapport brouillon pour une intervention démarrée.", risk: 1, permission: "job_reports.write", inputSchema: createJobReportSchema }, (c, i) => services.reports.createJobReportDraft(c, i)),
  ];
  return Object.fromEntries(tools.map(t => [t.name, t]));
}
