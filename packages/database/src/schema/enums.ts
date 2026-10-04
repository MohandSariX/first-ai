import {
  CUSTOMER_RISK_LEVELS,
  CUSTOMER_STATUSES,
  CUSTOMER_TYPES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  PRICING_MODES,
  USER_ROLES,
} from "@first-ai/schemas";
import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", USER_ROLES);
export const customerTypeEnum = pgEnum("customer_type", CUSTOMER_TYPES);
export const customerStatusEnum = pgEnum(
  "customer_status",
  CUSTOMER_STATUSES,
);
export const customerRiskLevelEnum = pgEnum(
  "customer_risk_level",
  CUSTOMER_RISK_LEVELS,
);
export const leadStatusEnum = pgEnum("lead_status", LEAD_STATUSES);
export const leadSourceEnum = pgEnum("lead_source", LEAD_SOURCES);
export const pricingModeEnum = pgEnum("pricing_mode", PRICING_MODES);
