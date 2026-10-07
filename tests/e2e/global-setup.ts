import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { e2eFixture } from "./fixture";
import { fictionalInvoiceTerms } from "../../packages/tools/src/test-invoice-mentions";

function requireLocal(name: string): string {
  const value = process.env[name];
  if (value === undefined) throw new Error(`${name} is required for local E2E tests.`);
  const hostname = new URL(value).hostname;
  if (hostname !== "127.0.0.1" && hostname !== "localhost") throw new Error(`E2E tests refuse non-local ${name}: ${hostname}`);
  return value;
}

export default async function globalSetup() {
  const supabaseUrl = requireLocal("SUPABASE_URL");
  requireLocal("DATABASE_URL");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey === undefined) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for local E2E tests.");
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const organizationId = randomUUID();
  const businessUserId = randomUUID();
  const authResult = await admin.auth.admin.createUser({ email: e2eFixture.email, password: e2eFixture.password, email_confirm: true });
  if (authResult.error !== null) throw new Error(authResult.error.message);
  const authUserId = authResult.data.user.id;
  const organizationResult = await admin.from("organizations").insert({ id: organizationId, name: e2eFixture.organizationName, legal_name: "Vendeur Fictif E2E", address_line1: "1 Rue Fictive", postal_code: "75001", city: "Paris", legal_entity_type: "company", legal_form: "SAS", registration: "RCS Paris (fictif)", share_capital: "1000", siren: "123456789", vat_number: "FR00123456789", vat_regime: "normal", vat_on_debits: false });
  if (organizationResult.error !== null) throw new Error(organizationResult.error.message);
  const termsResult = await admin.from("organizations").update({ invoice_terms: fictionalInvoiceTerms }).eq("id", organizationId);
  if (termsResult.error) throw termsResult.error;
  const userResult = await admin.from("users").insert({ id: businessUserId, organization_id: organizationId, auth_user_id: authUserId, first_name: "Utilisateur", last_name: "E2E", email: e2eFixture.email, role: "OWNER" });
  if (userResult.error !== null) throw new Error(userResult.error.message);
  // Keep deterministic E2E off both live AI providers. Missing-key checks use cloud-only.
  const settingsResult = await admin.from("ai_settings").insert({ organization_id: organizationId, mode: "CLOUD_ONLY" });
  if (settingsResult.error !== null) throw new Error(settingsResult.error.message);
  const customerId = randomUUID();
  const operationalFixtures = [
    admin.from("customers").insert({ id: customerId, organization_id: organizationId, name: e2eFixture.operationalCustomerName, type: "company", billing_classification: "professional", billing_name: e2eFixture.operationalCustomerName, billing_legal_name: "Client Fictif SAS", billing_address_line1: "2 Rue Facturation Fictive", billing_postal_code: "75002", billing_city: "Paris", billing_country: "FR", establishment_country: "FR", taxable_person: true, siren: "987654321" }),
    admin.from("services").insert({ organization_id: organizationId, code: "E2E-TERRAIN", name: e2eFixture.serviceName, pricing_mode: "fixed", base_price: "100" }),
  ];
  for (const operation of operationalFixtures) { const result = await operation; if (result.error) throw new Error(result.error.message); }
  const siteFixture = await admin.from("customer_sites").insert({ organization_id: organizationId, customer_id: customerId, name: "Site Terrain Fictif", address_line1: "1 Rue du Test", postal_code: "75001", city: "Paris" });
  if (siteFixture.error) throw new Error(siteFixture.error.message);

  return async () => {
    for (const table of ["credit_notes", "payments", "invoice_items", "invoices", "approval_requests", "job_reports", "jobs", "quote_items", "quotes", "agent_tool_calls", "agent_runs", "agents", "ai_settings", "customer_sites", "contacts", "services"]) {
      const cleanup = await admin.from(table).delete().eq("organization_id", organizationId);
      if (cleanup.error !== null) throw new Error(cleanup.error.message);
    }
    const customerCleanup = await admin.from("customers").delete().eq("organization_id", organizationId);
    if (customerCleanup.error !== null) throw new Error(customerCleanup.error.message);
    const userCleanup = await admin.from("users").delete().eq("id", businessUserId);
    if (userCleanup.error !== null) throw new Error(userCleanup.error.message);
    const organizationCleanup = await admin.from("organizations").delete().eq("id", organizationId);
    if (organizationCleanup.error !== null) throw new Error(organizationCleanup.error.message);
    const authCleanup = await admin.auth.admin.deleteUser(authUserId);
    if (authCleanup.error !== null) throw new Error(authCleanup.error.message);
  };
}
