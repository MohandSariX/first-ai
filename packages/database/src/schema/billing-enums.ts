import { pgEnum } from "drizzle-orm/pg-core";
import { BILLING_CLASSIFICATIONS, FISCAL_TERRITORIES, LEGAL_ENTITY_TYPES, OPERATION_CATEGORIES, TRANSACTION_TYPES, VAT_REGIMES, VAT_TREATMENTS } from "@first-ai/schemas";
export const legalEntityTypeEnum = pgEnum("legal_entity_type", LEGAL_ENTITY_TYPES);
export const vatRegimeEnum = pgEnum("vat_regime", VAT_REGIMES);
export const billingClassificationEnum = pgEnum("billing_classification", BILLING_CLASSIFICATIONS);
export const transactionTypeEnum = pgEnum("invoice_transaction_type", TRANSACTION_TYPES);
export const operationCategoryEnum = pgEnum("operation_category", OPERATION_CATEGORIES);
export const fiscalTerritoryEnum = pgEnum("fiscal_territory", FISCAL_TERRITORIES);
export const vatTreatmentEnum = pgEnum("vat_treatment", VAT_TREATMENTS);
