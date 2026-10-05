"use client";

import type { UserRole } from "@first-ai/auth";
import { secondaryButtonClassName } from "@first-ai/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { logoutAction } from "../app/actions";
import { getNavigationItems } from "../lib/navigation";

export function AppNavigation({ userName, role }: { readonly userName: string; readonly role: UserRole }) {
  const pathname = usePathname();
  const visibleLinks = getNavigationItems(role);
  const secondaryRoutes: readonly string[] = ["/services", "/quotes", "/invoices"];
  const primaryLinks = visibleLinks.filter(link => !secondaryRoutes.includes(link.href));
  const secondaryLinks = visibleLinks.filter(link => secondaryRoutes.includes(link.href));
  const active = (href: string) => pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
  return <>
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-neutral-200 bg-white px-4 py-6 lg:flex lg:flex-col">
      <Link href="/dashboard" className="px-3 text-xl font-semibold tracking-tight">First AI</Link>
      <nav aria-label="Navigation principale" className="mt-10 space-y-1">{visibleLinks.map((link) => <Link key={link.href} href={link.href} aria-current={active(link.href) ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${active(link.href) ? "bg-neutral-950 text-white" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950"}`}><span aria-hidden>{link.icon}</span>{link.label}</Link>)}</nav>
      <Link href="/settings/ai" aria-current={active("/settings/ai") ? "page" : undefined} className="mt-6 rounded-xl px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100">Intelligence artificielle</Link>
      <div className="mt-auto border-t border-neutral-200 pt-4"><p className="truncate px-2 text-sm font-medium">{userName}</p><p className="px-2 text-xs text-neutral-500">{role}</p><form action={logoutAction} className="mt-3"><button className={`${secondaryButtonClassName} w-full`} type="submit">Se déconnecter</button></form></div>
    </aside>
    <details className="mb-4 rounded-xl border border-neutral-200 bg-white p-3 lg:hidden"><summary className="cursor-pointer text-sm font-medium">Sections et compte</summary><nav aria-label="Navigation secondaire mobile" className="mt-3 flex flex-wrap gap-3">{secondaryLinks.map(link => <Link key={link.href} href={link.href} aria-current={active(link.href) ? "page" : undefined} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm">{link.label}</Link>)}<Link href="/settings/ai" className="rounded-lg border border-neutral-200 px-3 py-2 text-sm">Intelligence artificielle</Link></nav><form action={logoutAction} className="mt-3"><button className={secondaryButtonClassName} type="submit">Se déconnecter</button></form></details>
    <nav aria-label="Navigation mobile" className="fixed inset-x-0 bottom-0 z-40 grid border-t border-neutral-200 bg-white/95 px-1 pb-[max(.4rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur lg:hidden" style={{ gridTemplateColumns: `repeat(${primaryLinks.length}, minmax(0, 1fr))` }}>{primaryLinks.map((link) => <Link key={link.href} href={link.href} aria-current={active(link.href) ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium ${active(link.href) ? "text-neutral-950" : "text-neutral-500"}`}><span className={`text-lg ${active(link.href) ? "font-bold" : ""}`} aria-hidden>{link.icon}</span>{link.short}</Link>)}</nav>
  </>;
}
