import {
  CUSTOMER_RISK_LEVELS,
  CUSTOMER_STATUSES,
  CUSTOMER_TYPES,
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
