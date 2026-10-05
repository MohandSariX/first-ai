import type { UserRole } from "./roles.js";

export const PERMISSIONS = [
  "organizations.read",
  "users.read",
  "customers.read",
  "customers.write",
  "contacts.read",
  "contacts.write",
  "sites.read",
  "sites.write",
  "leads.read",
  "leads.write",
  "services.read",
  "services.write",
  "quotes.read", "quotes.write", "quotes.accept",
  "jobs.read", "jobs.write", "jobs.schedule", "jobs.execute",
  "job_reports.read", "job_reports.write",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Readonly<
  Record<UserRole, readonly Permission[]>
> = {
  OWNER: PERMISSIONS,
  ADMIN: PERMISSIONS,
  MANAGER: PERMISSIONS,
  TECHNICIAN: ["organizations.read", "customers.read", "contacts.read", "sites.read", "services.read", "jobs.read", "jobs.execute", "job_reports.read", "job_reports.write"],
  ACCOUNTANT: ["organizations.read", "customers.read", "contacts.read", "sites.read", "services.read", "quotes.read", "jobs.read"],
  READ_ONLY: ["organizations.read", "users.read", "customers.read", "contacts.read", "sites.read", "leads.read", "services.read", "quotes.read", "jobs.read", "job_reports.read"],
};

export function hasPermission(
  role: UserRole,
  permission: Permission,
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
