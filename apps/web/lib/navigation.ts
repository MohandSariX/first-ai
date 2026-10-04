import { hasPermission, type Permission, type UserRole } from "@first-ai/auth";

export const navigationItems = [
  { href: "/assistant", label: "Assistant", short: "Assistant", icon: "✧", permission: "customers.read" },
  { href: "/dashboard", label: "Tableau de bord", short: "Accueil", icon: "⌂", permission: "customers.read" },
  { href: "/customers", label: "Clients", short: "Clients", icon: "◎", permission: "customers.read" },
  { href: "/leads", label: "Prospects", short: "Prospects", icon: "◇", permission: "leads.read" },
  { href: "/services", label: "Prestations", short: "Services", icon: "▦", permission: "services.read" },
] as const;

export function getNavigationItems(role: UserRole) {
  return navigationItems.filter((item) => hasPermission(role, item.permission as Permission));
}
