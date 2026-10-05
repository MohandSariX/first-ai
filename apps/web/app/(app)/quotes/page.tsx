import { hasPermission } from "@first-ai/auth";
import { searchQuotesSchema } from "@first-ai/schemas";
import { EmptyState, PageHeader, StatusBadge } from "@first-ai/ui";
import { AuthorizationError } from "@first-ai/tools";
import type { Metadata } from "next";
import Link from "next/link";
import { OperationalForm } from "../../../components/operational-form";
import { CustomerSelection, OperationalFilters, OperationalPagination } from "../../../components/operational-list";
import { withCrm } from "../../../lib/crm";
import { formatDate, formatMoney } from "../../../lib/format";
import { quoteLabels } from "../../../lib/operations";
export const metadata: Metadata = { title: "Devis" };
export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string; customerId?: string }> }) {
  const p = await searchParams, page = Math.min(501, Math.max(1, Number.parseInt(p.page ?? "1", 10) || 1));
  const parsed = searchQuotesSchema.safeParse({ query: p.q || undefined, status: p.status || undefined, limit: 20, offset: (page - 1) * 20 });
  if (!parsed.success) return <EmptyState title="Filtres invalides" description="Vérifiez votre recherche ou le statut demandé."/>;
  let data;
  try { data = await withCrm(async crm => {
    const canWrite = hasPermission(crm.context.role, "quotes.write");
    const [rows, customers, sites] = await Promise.all([crm.quotes.searchQuotes(crm.context, parsed.data), canWrite ? crm.customers.searchCustomers(crm.context, { limit: 100 }) : Promise.resolve([]), canWrite && p.customerId ? crm.sites.searchCustomerSites(crm.context, { customerId: p.customerId, limit: 100 }) : Promise.resolve([])]);
    return { rows, canWrite, customers, sites };
  }); } catch (e) { if (e instanceof AuthorizationError) return <EmptyState title="Accès non autorisé" description="Votre rôle ne permet pas de consulter les devis."/>; throw e; }
  return <div className="space-y-6"><PageHeader title="Devis" description="Brouillons, chiffrage déterministe et acceptation manuelle."/><OperationalFilters query={p.q} status={p.status} labels={quoteLabels}/>{data.canWrite ? <details className="rounded-2xl border border-neutral-200 bg-white p-5" open={Boolean(p.customerId)}><summary className="cursor-pointer font-medium">Nouveau devis</summary><div className="mt-5 space-y-5"><CustomerSelection customers={data.customers} value={p.customerId}/>{p.customerId ? data.sites.length ? <OperationalForm operation="quote.create" hidden={{ customerId: p.customerId }} submit="Créer le brouillon" fields={[{ name: "siteId", label: "Site", type: "select", required: true, options: data.sites.map(s => ({ value: s.id, label: s.name })) }, { name: "validUntil", label: "Valable jusqu’au", type: "date" }, { name: "notes", label: "Notes", type: "textarea" }]}/> : <p className="text-sm text-neutral-500">Ajoutez un site à ce client depuis sa fiche avant de créer un devis.</p> : null}<p className="text-xs text-neutral-500">Sélection : 100 premiers clients/sites. Retrouvez un client précis depuis sa fiche.</p></div></details> : null}{!data.rows.length ? <EmptyState title="Aucun devis" description="Les devis correspondant à votre recherche apparaîtront ici."/> : <div className="grid gap-3">{data.rows.map(({ quote: q, customerName }) => <Link key={q.id} href={`/quotes/${q.id}`} className="grid gap-3 rounded-2xl border border-neutral-200 bg-white p-5 sm:grid-cols-3"><div><h2 className="font-semibold">{q.quoteNumber}</h2><p className="text-sm text-neutral-600">{customerName}</p><p className="mt-2 text-xs text-neutral-500">Créé le {formatDate(q.createdAt)} · Validité : {q.validUntil ?? "Non définie"}</p></div><div className="text-sm"><p>HT : {formatMoney(q.subtotal)}</p><p className="font-medium">TTC : {formatMoney(q.total)}</p><p className="text-neutral-500">Marge estimée HT : {formatMoney(q.estimatedMargin)}</p></div><div><StatusBadge>{quoteLabels[q.status]}</StatusBadge></div></Link>)}</div>}<OperationalPagination route="/quotes" page={page} hasNext={data.rows.length === 20} params={{ q: p.q ?? "", status: p.status ?? "" }}/></div>;
}
