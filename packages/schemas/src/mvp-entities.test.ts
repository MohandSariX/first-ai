import { describe, expect, it } from "vitest";

import {
  createContactSchema,
  createCustomerSchema,
  createCustomerSiteSchema,
  createOrganizationSchema,
  createUserSchema,
  CUSTOMER_RISK_LEVELS,
  CUSTOMER_STATUSES,
  CUSTOMER_TYPES,
  USER_ROLES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  PRICING_MODES,
  createLeadSchema,
  createServiceSchema,
} from "./mvp-entities.js";

const organizationId = "ca9cfcfd-bdec-4bbf-a71d-2c0b39250ac2";
const authUserId = "1d2e5995-735b-49a6-9a48-c176b79bcdf5";

describe("MVP entity schemas", () => {
  it("accepts the supported enum values", () => {
    expect(USER_ROLES).toContain("OWNER");
    expect(USER_ROLES).toContain("READ_ONLY");
    expect(CUSTOMER_TYPES).toContain("property_manager");
    expect(CUSTOMER_STATUSES).toEqual([
      "active",
      "inactive",
      "blocked",
      "prospect",
    ]);
    expect(CUSTOMER_RISK_LEVELS).toContain("critical");
    expect(LEAD_STATUSES).toContain("qualified");
    expect(LEAD_SOURCES).toContain("referral");
    expect(PRICING_MODES).toContain("subscription");
  });

  it("validates focused organization and user inputs", () => {
    expect(createOrganizationSchema.parse({ name: "First AI" })).toEqual({
      name: "First AI",
    });
    expect(
      createUserSchema.safeParse({
        organizationId,
        authUserId,
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.test",
        role: "OWNER",
      }).success,
    ).toBe(true);
  });

  it("rejects unsupported customer enum values", () => {
    expect(
      createCustomerSchema.safeParse({
        organizationId,
        type: "unsupported",
        name: "Example Customer",
      }).success,
    ).toBe(false);
  });

  it("validates customer, contact, and site creation inputs", () => {
    const customerId = "4018cbee-4c12-46e8-91cc-5ca27e47c44b";

    expect(
      createCustomerSchema.safeParse({
        organizationId,
        type: "company",
        name: "Example Customer",
        status: "active",
        riskLevel: "normal",
      }).success,
    ).toBe(true);
    expect(
      createContactSchema.safeParse({
        organizationId,
        customerId,
        firstName: "Grace",
        lastName: "Hopper",
      }).success,
    ).toBe(true);
    expect(
      createCustomerSiteSchema.safeParse({
        organizationId,
        customerId,
        name: "Main site",
        addressLine1: "1 Example Street",
        postalCode: "75001",
        city: "Paris",
      }).success,
    ).toBe(true);
  });

  it("validates bounded lead scores and decimal money strings", () => {
    expect(createLeadSchema.safeParse({ companyName: "Fictional Lead", score: 100, estimatedValue: "1250.50" }).success).toBe(true);
    expect(createLeadSchema.safeParse({ companyName: "Fictional Lead", score: 101 }).success).toBe(false);
    expect(createServiceSchema.safeParse({ code: "DERAT", name: "Dératisation", pricingMode: "fixed", basePrice: "125.50" }).success).toBe(true);
    expect(createServiceSchema.safeParse({ code: "DERAT", name: "Dératisation", pricingMode: "fixed", basePrice: "12.345" }).success).toBe(false);
  });
});
