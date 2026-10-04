import type { UserRole } from "./roles.js";

export const PERMISSIONS = [
  "organizations.read",
  "users.read",
  "customers.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Readonly<
  Record<UserRole, readonly Permission[]>
> = {
  OWNER: PERMISSIONS,
  ADMIN: PERMISSIONS,
  MANAGER: PERMISSIONS,
  TECHNICIAN: ["organizations.read", "customers.read"],
  ACCOUNTANT: ["organizations.read", "customers.read"],
  READ_ONLY: PERMISSIONS,
};

export function hasPermission(
  role: UserRole,
  permission: Permission,
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
