import { index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { userRoleEnum } from "./enums.js";
import { organizations } from "./organizations.js";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    authUserId: uuid("auth_user_id").notNull().unique(),
    firstName: varchar("first_name", { length: 120 }).notNull(),
    lastName: varchar("last_name", { length: 120 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    phone: varchar("phone", { length: 32 }),
    role: userRoleEnum("role").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("users_organization_id_idx").on(table.organizationId),
    index("users_email_idx").on(table.email),
  ],
);
