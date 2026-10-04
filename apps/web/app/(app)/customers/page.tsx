import { hasPermission } from "@first-ai/auth";
import { EmptyState, inputClassName, PageHeader, secondaryButtonClassName, StatusBadge } from "@first-ai/ui";
import type { Metadata } from "next";
import Link from "next/link";

import { CustomerForm } from "../../../components/forms";
import { withCrm } from "../../../lib/crm";

export const metadata: Metadata = { title: "Clients" };
const PAGE_SIZE = 20;
export default async function CustomersPage({ searchParams }: { readonly searchParams: Promise<{ q?: string; page?: string; created?: string }> }) {
  const params = await searchParams; const page = Math.max(Number.parseInt(params.page ?? "1",10) || 1,1); const query = params.q?.trim();
  const { rows, canWrite } = await withCrm(async ({ context, customers }) => ({ rows: await customers.searchCustomers(context,{ query, limit: PAGE_SIZE, offset: (page-1)*PAGE_SIZE }), canWrite: hasPermission(context.role,"customers.write") }));
  const href = (next: number) => `/customers?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(next) })}`;
  return <div className="space-y-6"><PageHeader title="Clients" description="Clients actifs, coordonnées et statut commercial."/><form role="search" className="flex gap-2"><label className="sr-only" htmlFor="customer-search">Rechercher un client</label><input id="customer-search" name="q" defaultValue={query} placeholder="Nom, SIRET, téléphone ou e-mail" className={inputClassName}/><button className={secondaryButtonClassName}>Rechercher</button></form>{canWrite ? <CustomerForm/> : null}{rows.length===0 ? <EmptyState title="Aucun client" description={query ? "Aucun client ne correspond à votre recherche." : "Créez votre premier client pour commencer."}/> : <div className="grid gap-3">{rows.map(customer=><Link key={customer.id} href={`/customers/${customer.id}`} className="grid gap-3 rounded-2xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-400 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-center"><div><h2 className="font-medium">{customer.name}</h2><p className="mt-1 text-xs text-neutral-500">{customer.type.replaceAll("_"," ")}</p></div><div className="text-sm"><p>{customer.phone ?? "—"}</p><p className="text-neutral-500">{customer.billingEmail ?? "—"}</p></div><div className="text-sm text-neutral-500">{customer.siret ?? "SIRET non renseigné"}</div><StatusBadge tone={customer.status === "active" ? "green" : customer.status === "blocked" ? "red" : "neutral"}>{customer.status}</StatusBadge></Link>)}</div>}<nav aria-label="Pagination clients" className="flex justify-between"><span>{page>1?<Link className={secondaryButtonClassName} href={href(page-1)}>Précédent</Link>:null}</span>{rows.length===PAGE_SIZE?<Link className={secondaryButtonClassName} href={href(page+1)}>Suivant</Link>:null}</nav></div>;
}
