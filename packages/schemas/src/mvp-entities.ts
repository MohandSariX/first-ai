import { z } from "zod";

export const USER_ROLES = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "TECHNICIAN",
  "ACCOUNTANT",
  "READ_ONLY",
] as const;

export const CUSTOMER_TYPES = [
  "individual",
  "company",
  "property_manager",
  "restaurant",
  "hotel",
  "retail",
  "public",
  "other",
] as const;

export const CUSTOMER_STATUSES = [
  "active",
  "inactive",
  "blocked",
  "prospect",
] as const;

export const CUSTOMER_RISK_LEVELS = [
  "low",
  "normal",
  "high",
  "critical",
] as const;

export const LEAD_STATUSES = [
  "new", "contacted", "qualified", "proposal", "won", "lost", "archived",
] as const;
export const LEAD_SOURCES = [
  "website", "phone", "google_ads", "referral", "outbound", "tender", "manual", "other",
] as const;
export const PRICING_MODES = ["fixed", "hourly", "unit", "custom", "subscription"] as const;

const requiredText = z.string().trim().min(1);
const optionalText = requiredText.optional();
const optionalEmail = z.email().optional();
const optionalPhone = requiredText.optional();
const optionalCountry = z.string().trim().length(2).optional();
const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "Use a positive decimal amount with at most two decimals.");
const pagination = {
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().nonnegative().default(0),
};

export const createOrganizationSchema = z.object({
  name: requiredText,
  legalName: optionalText,
  siret: optionalText,
  vatNumber: optionalText,
  email: optionalEmail,
  phone: optionalPhone,
  addressLine1: optionalText,
  addressLine2: optionalText,
  postalCode: optionalText,
  city: optionalText,
  country: optionalCountry,
  timezone: optionalText,
  currency: z.string().trim().length(3).optional(),
});

export const createUserSchema = z.object({
  organizationId: z.uuid(),
  authUserId: z.uuid(),
  firstName: requiredText,
  lastName: requiredText,
  email: z.email(),
  phone: optionalPhone,
  role: z.enum(USER_ROLES),
});

export const createCustomerSchema = z.object({
  type: z.enum(CUSTOMER_TYPES),
  name: requiredText,
  legalName: optionalText,
  siret: optionalText,
  vatNumber: optionalText,
  billingEmail: optionalEmail,
  phone: optionalPhone,
  paymentTermsDays: z.number().int().nonnegative().optional(),
  status: z.enum(CUSTOMER_STATUSES).optional(),
  riskLevel: z.enum(CUSTOMER_RISK_LEVELS).optional(),
  notes: optionalText,
});

export const createContactSchema = z.object({
  customerId: z.uuid(),
  firstName: requiredText,
  lastName: requiredText,
  role: optionalText,
  email: optionalEmail,
  phone: optionalPhone,
  isPrimary: z.boolean().optional(),
  notes: optionalText,
});

export const createCustomerSiteSchema = z.object({
  customerId: z.uuid(),
  name: requiredText,
  addressLine1: requiredText,
  addressLine2: optionalText,
  postalCode: requiredText,
  city: requiredText,
  country: optionalCountry,
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accessInstructions: optionalText,
  accessHours: optionalText,
  primaryContactId: z.uuid().nullable().optional(),
  notes: optionalText,
});

export const updateCustomerSchema = createCustomerSchema.partial().refine((value) => Object.keys(value).length > 0);
export const updateContactSchema = createContactSchema.omit({ customerId: true }).partial().refine((value) => Object.keys(value).length > 0);
export const updateCustomerSiteSchema = createCustomerSiteSchema.omit({ customerId: true }).partial().refine((value) => Object.keys(value).length > 0);

const leadFieldsSchema = z.object({
  source: z.enum(LEAD_SOURCES).optional(),
  type: optionalText,
  companyName: optionalText,
  firstName: optionalText,
  lastName: optionalText,
  email: optionalEmail,
  phone: optionalPhone,
  addressLine1: optionalText,
  addressLine2: optionalText,
  postalCode: optionalText,
  city: optionalText,
  country: optionalCountry,
  status: z.enum(LEAD_STATUSES).optional(),
  score: z.number().int().min(0).max(100).optional(),
  assignedUserId: z.uuid().nullable().optional(),
  estimatedValue: money.nullable().optional(),
  notes: optionalText,
});
export const createLeadSchema = leadFieldsSchema.refine((value) => Boolean(value.companyName ?? value.firstName ?? value.lastName), {
  message: "A company name or person name is required.",
});

export const updateLeadSchema = leadFieldsSchema.partial().refine((value) => Object.keys(value).length > 0);
export const updateLeadStatusSchema = z.object({ status: z.enum(LEAD_STATUSES) });
export const assignLeadSchema = z.object({ assignedUserId: z.uuid().nullable() });

export const createServiceSchema = z.object({
  code: requiredText.max(64),
  name: requiredText.max(255),
  category: optionalText,
  description: optionalText,
  pricingMode: z.enum(PRICING_MODES),
  basePrice: money.nullable().optional(),
  estimatedDurationMinutes: z.number().int().positive().nullable().optional(),
  active: z.boolean().optional(),
});
export const updateServiceSchema = createServiceSchema.partial().refine((value) => Object.keys(value).length > 0);

export const entityIdSchema = z.object({ id: z.uuid() });
export const customerSearchSchema = z.object({ query: z.string().trim().max(255).optional(), status: z.enum(CUSTOMER_STATUSES).optional(), ...pagination });
export const contactSearchSchema = z.object({ query: z.string().trim().max(255).optional(), customerId: z.uuid().optional(), ...pagination });
export const customerSiteSearchSchema = z.object({ query: z.string().trim().max(255).optional(), customerId: z.uuid().optional(), ...pagination });
export const leadSearchSchema = z.object({ query: z.string().trim().max(255).optional(), status: z.enum(LEAD_STATUSES).optional(), ...pagination });
export const serviceSearchSchema = z.object({ query: z.string().trim().max(255).optional(), active: z.boolean().optional(), ...pagination });

export type CreateOrganizationInput = z.infer<
  typeof createOrganizationSchema
>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type CreateContactInput = z.infer<typeof createContactSchema>;
export type CreateCustomerSiteInput = z.infer<typeof createCustomerSiteSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type UpdateCustomerSiteInput = z.infer<typeof updateCustomerSiteSchema>;
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
