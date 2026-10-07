import { AuthorizationError } from "@first-ai/tools";
import { searchCreditNotesSchema } from "@first-ai/schemas";
import { EmptyState, PageHeader, StatusBadge } from "@first-ai/ui";
import Link from "next/link";
import { withCrm } from "../../../lib/crm";
import { formatMoney } from "../../../lib/format";
import { OperationalFilters, OperationalPagination } from "../../../components/operational-list";
export const metadata = { title: "Avoirs" };
const labels = { draft: "Brouillon", issued: "Émis", cancelled: "Annulé" };
export default async function CreditNotesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string; invoice?: string }> }) {
  const p = await searchParams, page = Math.min(501, Math.max(1, Number.parseInt(p.page ?? "1", 10) || 1));
  const parsed = searchCreditNotesSchema.safeParse({ query: p.q || undefined, status: p.status || undefined, originalInvoiceId: p.invoice || undefined, limit: 20, offset: (page - 1) * 20 });
  if (!parsed.success) return <EmptyState title="Filtres invalides" description="Vérifiez votre recherche."/>;
  let rows;
  try { rows = await withCrm(c => c.creditNotes.searchCreditNotes(c.context, parsed.data)); }
  catch (e) { if (e instanceof AuthorizationError) return <EmptyState title="Accès non autorisé" description="Votre rôle ne permet pas de consulter les avoirs."/>; throw e; }
  return <div className="space-y-6"><PageHeader title="Avoirs" description="Corrections explicites des factures émises. Aucun remboursement bancaire."/>
    <Link className="text-sm underline" href="/invoices">Créer un avoir depuis une facture émise</Link>
    <OperationalFilters query={p.q} status={p.status} labels={labels}/>
    {rows.length ? <div className="grid gap-3">{rows.map(({ creditNote: n, invoiceNumber }) => <Link key={n.id} href={`/credit-notes/${n.id}`} className="space-y-2 break-words rounded-2xl border bg-white p-5"><h2 className="font-semibold">{n.number ?? `BROUILLON-${n.id}`}</h2><p>Facture originale : {invoiceNumber}</p><p>{n.reason}</p><p>{formatMoney(n.total)} TTC à déduire</p><StatusBadge>{labels[n.status]}</StatusBadge></Link>)}</div> : <EmptyState title="Aucun avoir" description="Les corrections de factures apparaîtront ici."/>}
    <OperationalPagination route="/credit-notes" page={page} hasNext={rows.length === 20} params={{ q: p.q ?? "", status: p.status ?? "", invoice: p.invoice ?? "" }}/>
  </div>;
}
