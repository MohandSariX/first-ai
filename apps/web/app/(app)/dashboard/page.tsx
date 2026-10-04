import { hasPermission } from "@first-ai/auth";
import { PageHeader, StatusBadge } from "@first-ai/ui";
import type { Metadata } from "next";
import Link from "next/link";

import { formatDate } from "../../../lib/format";
import { withCrm } from "../../../lib/crm";

export const metadata: Metadata = { title: "Tableau de bord" };
export default async function DashboardPage() {
  const { data, canReadLeads } = await withCrm(async ({ context, dashboard }) => ({ data: await dashboard.getDashboard(context), canReadLeads: hasPermission(context.role, "leads.read") }));
  const metrics = [{ label: "Clients actifs", value: data.activeCustomers, href: "/customers" }, { label: "Prospects ouverts", value: data.openLeads, href: "/leads" }, { label: "Prestations actives", value: data.activeServices, href: "/services" }];
  return <div className="space-y-8"><PageHeader title="Tableau de bord" description="Vue opérationnelle de votre activité CRM."/><section aria-label="Indicateurs" className="grid gap-3 sm:grid-cols-3">{metrics.map(metric=><Link key={metric.label} href={metric.href} className="rounded-2xl border border-neutral-200 bg-white p-5 transition hover:border-neutral-300"><p className="text-sm text-neutral-500">{metric.label}</p><p className="mt-3 text-3xl font-semibold tabular-nums">{metric.value ?? "—"}</p></Link>)}</section><section><div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-semibold">À faire maintenant</h2><p className="text-sm text-neutral-500">Prospects nouveaux à prendre en charge.</p></div>{canReadLeads ? <Link href="/leads?status=new" className="text-sm font-medium underline-offset-4 hover:underline">Voir tout</Link> : null}</div>{!canReadLeads ? <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-500">Les prospects ne sont pas accessibles avec votre rôle.</div> : data.recentLeads.length === 0 ? <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">Aucun nouveau prospect en attente.</div> : <div className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200 bg-white">{data.recentLeads.map(lead=><div key={lead.id} className="flex items-center justify-between gap-4 p-4"><div className="min-w-0"><p className="truncate font-medium">{lead.companyName ?? [lead.firstName,lead.lastName].filter(Boolean).join(" ")}</p><p className="mt-1 text-xs text-neutral-500">Créé le {formatDate(lead.createdAt)}</p></div><StatusBadge tone="blue">Nouveau</StatusBadge></div>)}</div>}</section></div>;
}
