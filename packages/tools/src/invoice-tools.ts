import { z } from "zod";
import { searchInvoicesSchema } from "@first-ai/schemas";
import type { Tool, ToolContext } from "./crm-tools.js";
import type { InvoiceService } from "./invoice-service.js";

// Read infrastructure only. No invoice mutation tool or approval action is registered.
export function createInvoiceToolRegistry(service: InvoiceService): Readonly<Record<string, Tool>> {
  const getSchema = z.strictObject({ invoiceId: z.uuid() });
  const wrap = (definition: Omit<Tool, "execute">, run: (context: ToolContext, input: unknown) => Promise<unknown>): Tool => ({
    ...definition,
    async execute(context, input) {
      try { return { success: true, data: await run(context, definition.inputSchema.parse(input)) }; }
      catch (error) {
        const code = error instanceof z.ZodError ? "VALIDATION_ERROR" : typeof error === "object" && error !== null && "code" in error ? String(error.code) : "INTERNAL_ERROR";
        return { success: false, error: { code, message: code === "FORBIDDEN" ? "Accès non autorisé." : code === "NOT_FOUND" ? "Facture introuvable." : "Lecture impossible." } };
      }
    },
  });
  return {
    "invoices.get": wrap({ name: "invoices.get", description: "Lire une facture et ses lignes autorisées.", permission: "invoices.read", risk: 0, inputSchema: getSchema }, (c, i) => service.getInvoice(c, getSchema.parse(i).invoiceId)),
    "invoices.search": wrap({ name: "invoices.search", description: "Rechercher une page de factures par numéro, client ou statut.", permission: "invoices.read", risk: 0, inputSchema: searchInvoicesSchema }, (c, i) => service.searchInvoices(c, i)),
  };
}
