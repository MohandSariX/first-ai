import { hasPermission, type CurrentBusinessUser } from "@first-ai/auth";
import type { InvoiceStoreInterface } from "@first-ai/database";
import { financialAuditSearchSchema } from "@first-ai/schemas";
import { AuthorizationError } from "./crm-services.js";

export class FinancialAuditService {
  constructor(private readonly store: InvoiceStoreInterface) {}
  async list(c: CurrentBusinessUser, input: unknown = {}) {
    if (!hasPermission(c.role, "financialAudit.read")) throw new AuthorizationError("Consultation de l’audit non autorisée.");
    const parsed = financialAuditSearchSchema.parse(input);
    return this.store.transaction(async s => {
      const member = await s.membership(c);
      if (!member || !hasPermission(member.role, "financialAudit.read")) throw new AuthorizationError("Adhésion inactive ou consultation non autorisée.");
      return s.financialAudit.list({ ...parsed, organizationId: c.organizationId });
    });
  }
}
