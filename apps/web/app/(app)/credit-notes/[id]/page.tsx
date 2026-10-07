import { hasPermission } from "@first-ai/auth";
import { AuthorizationError, ResourceNotFoundError } from "@first-ai/tools";
import { EmptyState, PageHeader, StatusBadge } from "@first-ai/ui";
import { z } from "zod";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withCrm } from "../../../../lib/crm";
import { formatMoney } from "../../../../lib/format";
import { OperationalForm } from "../../../../components/operational-form";
export const metadata = { title: "Détail avoir" };
export default async function CreditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!z.uuid().safeParse(id).success) notFound();
  let data;
  try { data = await withCrm(async c => ({ note: await c.creditNotes.getCreditNote(c.context, id), artifact: await c.retention.artifactStatus(c.context, "credit_note", id), write: hasPermission(c.context.role, "creditNotes.write"), issue: hasPermission(c.context.role, "creditNotes.issue") })); }
  catch (e) { if (e instanceof ResourceNotFoundError) notFound(); if (e instanceof AuthorizationError) return <EmptyState title="Accès non autorisé" description="Votre rôle ne permet pas de consulter les avoirs."/>; throw e; }
  const n = data.note, editable = n.status === "draft" && data.write, hidden = { creditNoteId: id, invoiceId: n.originalInvoiceId };
  return <div className="space-y-6 break-words"><div className="break-all"><PageHeader title={n.number ?? `BROUILLON-${n.id}`} description={n.issueDate ? `Date d’émission : ${n.issueDate}` : "Numéro AV attribué uniquement à l’émission"}/></div>
    <StatusBadge>{{ draft: "Brouillon", issued: "Émis", cancelled: "Annulé" }[n.status]}</StatusBadge>
    <p><Link href={`/invoices/${n.originalInvoiceId}`} className="underline">Facture originale : {n.original.invoice.number}</Link> · {n.original.invoice.issueDate}</p>
    <p>{n.reason}</p><p>{n.correctionType === "full" ? "Correction de toutes les bases restantes" : "Correction partielle par montant HT"}</p>
    <p className="text-sm text-neutral-500">Les quantités et taux de TVA restent ceux du document original. La TVA de l’avoir est calculée exactement au prorata des bases corrigées, avec allocation cumulative des centimes.</p>
    <section aria-label="Lignes corrigées" className="space-y-3">{n.items.map(item => <article key={item.id} className="space-y-3 rounded-2xl border bg-white p-5"><h2 className="font-medium">{n.original.lines[item.originalLineIndex]?.description}</h2><p>HT corrigé : {formatMoney(item.subtotal)} · TVA : {formatMoney(item.taxAmount)} · TTC : {formatMoney(item.total)}</p>{editable && n.correctionType === "partial" ? <OperationalForm operation="credit.removeItem" hidden={{ ...hidden, originalLineIndex: String(item.originalLineIndex) }} submit="Retirer la correction"/> : null}</article>)}</section>
    {editable && n.correctionType === "partial" ? <div className="rounded-2xl border bg-white p-5"><OperationalForm operation="credit.setItem" hidden={hidden} title="Corriger une ligne" submit="Enregistrer la correction" fields={[{ name: "originalLineIndex", label: "Ligne originale", type: "select", required: true, options: n.original.lines.map((line, index) => ({ value: String(index), label: `${index + 1}. ${line.description} — ${formatMoney(line.subtotal)} HT à l’origine` })) }, { name: "subtotal", label: "Montant HT à corriger (€)", required: true, help: "Montant positif, point décimal. Remplace la correction de cette ligne dans ce brouillon." }]}/></div> : null}
    <section aria-label="Totaux de l’avoir" className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Montants à déduire</h2><p>HT : {formatMoney(n.subtotal)}</p><p>TVA : {formatMoney(n.taxAmount)}</p><p className="font-semibold">TTC : {formatMoney(n.total)}</p></section>
    {data.issue && n.status === "draft" ? <OperationalForm operation="credit.issue" hidden={hidden} submit="Émettre l’avoir" fields={[{ name: "confirmed", label: "Je confirme l’émission : numéro définitif et correction figée, aucun remboursement", type: "checkbox", required: true }]}/> : null}
    {editable ? <OperationalForm operation="credit.cancel" hidden={hidden} submit="Annuler le brouillon d’avoir"/> : null}
    {n.status === "issued" ? <div><a className="inline-flex rounded-xl bg-neutral-900 px-4 py-3 text-sm text-white" href={`/api/credit-notes/${id}/pdf`}>Télécharger le PDF de l’avoir</a><p className="mt-2 text-sm">{data.artifact.originalPreserved ? "Original émis conservé." : "Document historique : original non conservé à l’émission, copie reconstituée."}</p></div> : null}
    <p className="text-xs text-neutral-500">Les bases disponibles sont revérifiées à l’émission. Un autre avoir peut rendre ce brouillon périmé. L’original reste inchangé. Fondation technique : conformité fiscale non validée.</p>
  </div>;
}
