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

const requiredText = z.string().trim().min(1);
const optionalText = requiredText.optional();
const optionalEmail = z.email().optional();
const optionalPhone = requiredText.optional();
const optionalCountry = z.string().trim().length(2).optional();

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
  organizationId: z.uuid(),
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
  organizationId: z.uuid(),
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
  organizationId: z.uuid(),
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
  primaryContactId: z.uuid().optional(),
  notes: optionalText,
});

export type CreateOrganizationInput = z.infer<
  typeof createOrganizationSchema
>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type CreateContactInput = z.infer<typeof createContactSchema>;
export type CreateCustomerSiteInput = z.infer<typeof createCustomerSiteSchema>;
