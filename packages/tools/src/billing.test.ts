import { describe, expect, it } from "vitest";
import { hasPermission } from "@first-ai/auth";
import { sellerBillingSchema, customerBillingSchema, invoiceClassificationSchema, validateBillingScenario, type InvoiceClassification } from "@first-ai/schemas";

const seller = sellerBillingSchema.parse({ legalName: "Société Fictive", legalEntityType: "company", legalForm: "SAS", siren: "123456789", siret: null, vatNumber: "FR00123456789", registration: "RCS Paris (fictif)", shareCapital: "1000.00", vatRegime: "normal", vatOnDebits: false, companySize: null, addressLine1: "1 Rue Fictive", addressLine2: null, postalCode: "75001", city: "Paris", country: "FR" });
const customer = customerBillingSchema.parse({ billingClassification: "professional", billingName: "Client Fictif", billingLegalName: "Client Fictif SAS", billingAddressLine1: "2 Rue Facturation", billingAddressLine2: null, billingPostalCode: "75002", billingCity: "Paris", billingCountry: "FR", establishmentCountry: "FR", taxablePerson: true, siren: "987654321", siret: null, vatNumber: null });
const classification: InvoiceClassification = { transactionType: "B2B", operationCategory: "services", fiscalTerritory: "domestic", vatTreatment: "normal", vatReason: null };
describe("M1 explicit billing qualifications", () => {
  it("supports French B2B / B2C / public scenarios independently from CRM sector", () => {
    expect(validateBillingScenario(seller, customer, classification, ["20.000", "5.500"])).toEqual([]);
    const individual = { ...customer, billingClassification: "individual" as const, billingLegalName: null, siren: null, taxablePerson: false };
    expect(validateBillingScenario(seller, individual, { ...classification, transactionType: "B2C" }, ["20"])).toEqual([]);
    expect(validateBillingScenario(seller, { ...customer, billingClassification: "public" }, { ...classification, transactionType: "B2G" }, ["20"])).toEqual([]);
    expect(validateBillingScenario(seller, individual, classification, ["20"]).length).toBeGreaterThan(0);
  });
  it("models operation categories without inferring them from services or VAT rates", () => {
    for (const operationCategory of ["services", "goods", "mixed"] as const) expect(invoiceClassificationSchema.parse({ ...classification, operationCategory }).operationCategory).toBe(operationCategory);
    expect(invoiceClassificationSchema.safeParse({ ...classification, operationCategory: undefined }).success).toBe(false);
  });
  it("keeps franchise, exemption, reverse charge and normal VAT distinct", () => {
    expect(validateBillingScenario({ ...seller, vatRegime: "franchise", vatNumber: null }, customer, { ...classification, vatTreatment: "franchise" }, ["0.000"])).toEqual([]);
    expect(validateBillingScenario({ ...seller, vatRegime: "exempt", vatNumber: null }, customer, { ...classification, vatTreatment: "exemption", vatReason: "Base légale validée fictive" }, ["0"])).toEqual([]);
    expect(validateBillingScenario(seller, customer, classification, ["0"]).length).toBeGreaterThan(0);
    expect(validateBillingScenario(seller, customer, { ...classification, vatTreatment: "exemption" }, ["0"]).length).toBeGreaterThan(0);
    expect(validateBillingScenario(seller, { ...customer, vatNumber: "FR00987654321" }, { ...classification, vatTreatment: "reverse_charge", vatReason: "Motif explicitement validé" }, ["0"])).toEqual([]);
    expect(validateBillingScenario(seller, customer, { ...classification, vatTreatment: "franchise" }, ["20"]).length).toBeGreaterThan(0);
  });
  it("requires conditional seller identity, without requiring capital/form for EI", () => {
    expect(validateBillingScenario({ ...seller, legalForm: null }, customer, classification, ["20"]).length).toBeGreaterThan(0);
    expect(validateBillingScenario({ ...seller, legalEntityType: "individual_entrepreneur", legalForm: null, shareCapital: null }, customer, classification, ["20"])).toEqual([]);
    expect(validateBillingScenario({ ...seller, siren: null }, customer, classification, ["20"]).length).toBeGreaterThan(0);
    expect(validateBillingScenario({ ...seller, vatNumber: null }, customer, classification, ["20"]).length).toBeGreaterThan(0);
    expect(sellerBillingSchema.safeParse({ ...seller, siret: "98765432100000" }).success).toBe(false);
    expect(sellerBillingSchema.safeParse({ ...seller, vatNumber: "invalid" }).success).toBe(false);
    expect(validateBillingScenario({ ...seller, registration: null }, customer, classification, ["20"]).length).toBeGreaterThan(0);
  });
  it("requires a separate explicit billing address and rejects unqualified territories", () => {
    expect(validateBillingScenario(seller, { ...customer, billingAddressLine1: null }, classification, ["20"]).length).toBeGreaterThan(0);
    expect(validateBillingScenario(seller, { ...customer, establishmentCountry: null }, classification, ["20"]).length).toBeGreaterThan(0);
    expect(validateBillingScenario(seller, customer, { ...classification, fiscalTerritory: "eu" }, ["20"]).length).toBeGreaterThan(0);
    expect(customerBillingSchema.safeParse({ ...customer, organizationId: "00000000-0000-4000-8000-000000000001" }).success).toBe(false);
  });
  it("centralizes configuration permissions without broadening AI approval actions", () => {
    for (const role of ["OWNER", "ADMIN"] as const) expect(hasPermission(role, "billing.seller.write")).toBe(true);
    for (const role of ["MANAGER", "ACCOUNTANT", "READ_ONLY", "TECHNICIAN"] as const) expect(hasPermission(role, "billing.seller.write")).toBe(false);
    for (const role of ["OWNER", "ADMIN", "MANAGER", "ACCOUNTANT"] as const) expect(hasPermission(role, "billing.customer.write")).toBe(true);
    for (const role of ["READ_ONLY", "TECHNICIAN"] as const) expect(hasPermission(role, "billing.customer.write")).toBe(false);
  });
});
