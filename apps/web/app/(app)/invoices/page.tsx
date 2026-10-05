import { hasPermission } from "@first-ai/auth";
import { searchInvoicesSchema } from "@first-ai/schemas";
import { EmptyState, PageHeader, StatusBadge } from "@first-ai/ui";
import { AuthorizationError } from "@first-ai/tools";
import Link from "next/link";
import { OperationalForm } from "../../../components/operational-form";
import { OperationalFilters, OperationalPagination } from "../../../components/operational-list";
import { withCrm } from "../../../lib/crm";
import { formatMoney } from "../../../lib/format";
import { invoiceLabels } from "../../../lib/invoices";
export const metadata = { title: "Factures" };
export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const p = await searchParams, page = Math.min(501, Math.max(1, Number.parseInt(p.page ?? "1", 10) || 1));
  const parsed = searchInvoicesSchema.safeParse({ query: p.q || undefined, status: p.status || undefined, limit: 20, offset: (page - 1) * 20 });
  if (!parsed.success) return <EmptyState title="Filtres invalides" description="Vérifiez votre recherche."/>;
  let data;
  try { data = await withCrm(async crm => ({ rows: await crm.invoices.searchInvoices(crm.context, parsed.data), canWrite: hasPermission(crm.context.role, "invoices.write"), customers: hasPermission(crm.context.role, "invoices.write") ? await crm.customers.searchCustomers(crm.context, { limit: 100 }) : [] })); }
  catch (e) { if (e instanceof AuthorizationError) return <EmptyState title="Accès non autorisé" description="Votre rôle ne permet pas de consulter les factures."/>; throw e; }
  return <div className="space-y-6"><PageHeader title="Factures" description="Brouillons et émission manuelle. Aucun paiement, PDF ou envoi."/><OperationalFilters query={p.q} status={p.status} labels={invoiceLabels}/>
    {data.canWrite ? <details className="rounded-2xl border bg-white p-5"><summary className="cursor-pointer font-medium">Nouvelle facture</summary><div className="mt-5"><OperationalForm operation="invoice.create" submit="Créer le brouillon" fields={[
      { name: "customerId", label: "Client", type: "select", required: true, options: data.customers.map(c => ({ value: c.id, label: c.name })) },
      { name: "issueDate", label: "Date d’émission prévue", type: "date", required: true }, { name: "dueDate", label: "Échéance", type: "date", required: true },
      { name: "notes", label: "Notes", type: "textarea" },
    ]}/></div><p className="mt-3 text-xs text-neutral-500">Sélection limitée aux 100 premiers clients. Les liens devis/intervention restent disponibles côté service.</p></details> : null}
    {data.rows.length ? <div className="grid gap-3">{data.rows.map(({ invoice: i, customerName }) => <Link href={`/invoices/${i.id}`} key={i.id} className="grid gap-3 rounded-2xl border bg-white p-5 sm:grid-cols-3"><div><h2 className="font-semibold">{i.invoiceNumber}</h2><p>{customerName}</p></div><div><p>HT : {formatMoney(i.subtotal)}</p><p>TTC : {formatMoney(i.total)}</p><p className="text-sm text-neutral-500">Échéance : {i.dueDate}</p></div><div><StatusBadge>{invoiceLabels[i.status]}</StatusBadge></div></Link>)}</div> : <EmptyState title="Aucune facture" description="Vos factures apparaîtront ici."/>}
    <OperationalPagination route="/invoices" page={page} hasNext={data.rows.length === 20} params={{ q: p.q ?? "", status: p.status ?? "" }}/></div>;
}
