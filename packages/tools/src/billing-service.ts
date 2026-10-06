import { hasPermission, type CurrentBusinessUser, type Permission } from "@first-ai/auth";
import type { InvoiceSession, InvoiceStoreInterface } from "@first-ai/database";
import { customerBillingSchema, sellerBillingSchema, sellerInvoiceTermsSchema } from "@first-ai/schemas";
import { z } from "zod";
import { AuthorizationError, ResourceNotFoundError } from "./crm-services.js";

export class BillingIdentityService {
  constructor(private readonly store: InvoiceStoreInterface) {}
  private async authorized<T>(c: CurrentBusinessUser, permission: Permission, work: (s: InvoiceSession) => Promise<T>) {
    if (!hasPermission(c.role, permission)) throw new AuthorizationError("Action non autorisée.");
    return this.store.transaction(async s => {
      const membership = await s.membership(c);
      if (!membership || !hasPermission(membership.role, permission)) throw new AuthorizationError("Adhésion inactive ou action non autorisée.");
      return work(s);
    });
  }
  getSeller(c: CurrentBusinessUser) { return this.authorized(c, "invoices.read", s => s.sellerIdentity(c.organizationId)); }
  updateSeller(c: CurrentBusinessUser, input: unknown) { const parsed = sellerBillingSchema.parse(input); return this.authorized(c, "billing.seller.write", s => s.updateSellerIdentity(c.organizationId, parsed)); }
  updateInvoiceTerms(c: CurrentBusinessUser, input: unknown) { const parsed = sellerInvoiceTermsSchema.parse(input); return this.authorized(c, "billing.seller.write", s => s.updateInvoiceTerms(c.organizationId, parsed)); }
  getCustomer(c: CurrentBusinessUser, id: string) { z.uuid().parse(id); return this.authorized(c, "invoices.read", async s => { const row = await s.customerIdentity(c.organizationId, id); if (!row) throw new ResourceNotFoundError("Client introuvable."); return row; }); }
  updateCustomer(c: CurrentBusinessUser, id: string, input: unknown) { z.uuid().parse(id); const parsed = customerBillingSchema.parse(input); return this.authorized(c, "billing.customer.write", async s => { const row = await s.updateCustomerIdentity(c.organizationId, id, parsed); if (!row) throw new ResourceNotFoundError("Client introuvable."); return row; }); }
}
