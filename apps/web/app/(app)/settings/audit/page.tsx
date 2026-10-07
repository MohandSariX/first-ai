import { AuthorizationError } from "@first-ai/tools";
import { EmptyState, PageHeader } from "@first-ai/ui";
import Link from "next/link";
import { withCrm } from "../../../../lib/crm";
import { formatDateTime, formatMoney } from "../../../../lib/format";
import { OperationalPagination } from "../../../../components/operational-list";
export const metadata = { title: "Audit financier" };
const labels: Readonly<Record<string, string>> = {
  "invoice.issued": "Facture émise", "invoice.cancelled": "Brouillon de facture annulé", "invoice.status_changed": "Situation de facture actualisée", "invoice.metadata_changed": "Note administrative modifiée",
  "credit_note.issued": "Avoir émis", "credit_note.cancelled": "Brouillon d’avoir annulé", "payment.recorded": "Encaissement manuel enregistré", "payment.cancelled": "Saisie d’encaissement annulée",
  "invoice.artifact_persisted": "Original de facture conservé", "credit_note.artifact_persisted": "Original d’avoir conservé", "billing.retention_changed": "Politique de conservation modifiée", "billing.archive_exported": "Archive financière exportée", "billing.archive_verified": "Archive financière vérifiée",
  "billing.seller_changed": "Identité vendeur configurée", "billing.customer_changed": "Identité client configurée", "billing.terms_changed": "Conditions de règlement configurées",
};
export default async function FinancialAuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const p = await searchParams, page = Math.min(501, Math.max(1, Number.parseInt(p.page ?? "1", 10) || 1));
  let data;
  try { data = await withCrm(async c => ({ rows: await c.financialAudit.list(c.context, { limit: 20, offset: (page - 1) * 20 }), timezone: await c.invoices.getTimezone(c.context) })); }
  catch (e) { if (e instanceof AuthorizationError) return <EmptyState title="Accès non autorisé" description="Votre rôle ne permet pas de consulter l’audit financier."/>; throw e; }
  return <div className="space-y-6"><PageHeader title="Audit financier" description="Journal en lecture seule depuis M5A. Aucun historique antérieur reconstitué. Les encaissements sont déclaratifs, sans vérification bancaire."/>
    {data.rows.length ? <ol className="space-y-3">{data.rows.map(e => {
      const invoiceId = e.entityType === "invoice" ? e.entityId : e.metadata.invoiceId;
      const href = e.entityType === "credit_note" ? `/credit-notes/${e.entityId}` : typeof invoiceId === "string" ? `/invoices/${invoiceId}` : undefined;
      return <li key={e.id} className="min-w-0 space-y-2 break-words rounded-2xl border bg-white p-4"><h2 className="font-semibold">{labels[e.eventType] ?? "Événement financier"}</h2>
        <time dateTime={e.occurredAt.toISOString()} className="text-sm text-neutral-600">{formatDateTime(e.occurredAt, data.timezone)}</time>
        <p className="text-sm">Acteur : utilisateur {e.actorUserId.slice(0, 8)}</p>
        {typeof e.metadata.number === "string" ? <p>{e.metadata.number}</p> : null}
        {typeof e.metadata.amount === "string" ? <p>Montant : {formatMoney(e.metadata.amount)}</p> : null}
        {Array.isArray(e.metadata.fields) ? <p className="text-sm text-neutral-600">Champs configurés : {e.metadata.fields.join(", ")}</p> : null}
        {href ? <Link className="text-sm underline" href={href}>Consulter le document</Link> : null}
      </li>;
    })}</ol> : <EmptyState title="Aucun événement financier" description="Les opérations financières effectuées depuis M5A apparaîtront ici."/>}
    <OperationalPagination route="/settings/audit" page={page} hasNext={data.rows.length === 20} params={{}}/>
  </div>;
}
