import { hasPermission } from "@first-ai/auth";
import { AuthorizationError, ResourceNotFoundError, invoiceDocumentAvailability } from "@first-ai/tools";
import { EmptyState, PageHeader, StatusBadge } from "@first-ai/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { PAYMENT_METHODS } from "@first-ai/schemas";
import { OperationalForm } from "../../../../components/operational-form";
import { withCrm } from "../../../../lib/crm";
import { formatMoney, formatDateTime } from "../../../../lib/format";
import { invoiceItemFields, invoiceLabels } from "../../../../lib/invoices";
export const metadata = { title: "Détail facture" };
export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ paymentPage?: string }> }) {
  const { id } = await params; if (!z.uuid().safeParse(id).success) notFound();
  const query = await searchParams, page = Math.min(500, Math.max(1, Number(query.paymentPage) || 1));
  let data;
  try { data = await withCrm(async crm => ({ invoice: await crm.invoices.getInvoice(crm.context, id), timezone: await crm.invoices.getTimezone(crm.context), payments: await crm.payments.listPayments(crm.context, id, { limit: 20, offset: (Math.floor(page) - 1) * 20 }), canRecord: hasPermission(crm.context.role, "payments.write"), canWrite: hasPermission(crm.context.role, "invoices.write"), canIssue: hasPermission(crm.context.role, "invoices.issue") })); }
  catch (e) { if (e instanceof ResourceNotFoundError) notFound(); if (e instanceof AuthorizationError) return <EmptyState title="Accès non autorisé" description="Votre rôle ne permet pas de consulter les factures."/>; throw e; }
  const i = data.invoice, editable = data.canWrite && i.status === "draft";
  const document = invoiceDocumentAvailability(i.documentSnapshot);
  return <div className="space-y-6"><PageHeader title={i.invoiceNumber} description={`Date : ${i.issueDate} · Échéance : ${i.dueDate}`}/><StatusBadge>{invoiceLabels[i.status]}</StatusBadge>
    <div className="flex flex-wrap gap-4 text-sm underline"><Link href={`/customers/${i.customerId}`}>Client</Link>{i.quoteId ? <Link href={`/quotes/${i.quoteId}`}>Devis source</Link> : null}{i.jobId ? <Link href={`/jobs/${i.jobId}`}>Intervention source</Link> : null}</div>
    {i.issuedAt && document.available ? <a className="inline-flex rounded-xl bg-neutral-900 px-4 py-3 text-sm text-white focus-visible:outline-2 focus-visible:outline-offset-2" href={`/api/invoices/${id}/pdf`}>Télécharger le PDF</a> : i.status !== "draft" && i.status !== "cancelled" ? <p role="status" className="rounded-xl border p-4 text-sm">{document.message}</p> : null}
    <section className="space-y-3" aria-label="Lignes de facture">{i.items.map(item => <article key={item.id} className="space-y-4 rounded-2xl border bg-white p-5"><h2 className="font-medium">{item.description}</h2><p className="text-sm">{item.quantity} × {formatMoney(item.unitPrice)} HT · TVA {item.taxRate} %</p>{editable ? <><details><summary className="cursor-pointer">Modifier la ligne</summary><OperationalForm operation="invoice.updateItem" hidden={{ invoiceId: id, itemId: item.id }} fields={invoiceItemFields(item)} submit="Enregistrer la ligne"/></details><OperationalForm operation="invoice.removeItem" hidden={{ invoiceId: id, itemId: item.id }} submit="Retirer la ligne"/></> : null}</article>)}{!i.items.length ? <EmptyState title="Aucune ligne" description="Ajoutez une ligne avant l’émission."/> : null}</section>
    {editable ? <div className="rounded-2xl border bg-white p-5"><OperationalForm title="Ajouter une ligne" operation="invoice.addItem" hidden={{ invoiceId: id }} fields={invoiceItemFields()} submit="Ajouter la ligne"/></div> : null}
    <section className="rounded-2xl border bg-white p-5" aria-label="Totaux"><h2 className="font-semibold">Totaux</h2><p>HT : {formatMoney(i.subtotal)}</p><p>TVA : {formatMoney(i.taxAmount)}</p><p className="font-semibold">TTC : {formatMoney(i.total)}</p></section>
    <section className="space-y-4 rounded-2xl border bg-white p-5" aria-label="Encaissements">
      <h2 className="font-semibold">Encaissements</h2><p>Reçu : {formatMoney(i.amountPaid)}</p><p className="font-semibold">Reste à payer : {formatMoney(i.amountDue)}</p>
      <p className="text-sm text-neutral-500">Saisie de fonds déjà reçus. Aucun paiement bancaire n’est déclenché.</p>
      {data.payments.map(p => <article key={p.id} className="space-y-2 rounded-xl border p-4"><p className="font-medium">{formatMoney(p.amount)} · {p.status === "completed" ? "Enregistré" : "Saisie annulée"}</p><p className="text-sm">{formatDateTime(p.paidAt, data.timezone)} · {methodLabels[p.method]}</p>{p.reference ? <p className="break-words text-sm">{p.reference}</p> : null}{p.cancellationReason ? <p className="break-words text-sm">Correction : {p.cancellationReason}</p> : null}{data.canRecord && p.status === "completed" ? <details><summary className="cursor-pointer text-sm">Corriger une saisie erronée</summary><OperationalForm operation="payment.cancel" hidden={{ invoiceId: id, paymentId: p.id }} fields={[{ name: "reason", label: "Motif de correction", required: true }]} submit="Annuler cette saisie"/></details> : null}</article>)}
      {!data.payments.length ? <p className="text-sm text-neutral-500">Aucun encaissement enregistré.</p> : null}
      <div className="flex justify-between text-sm">{page > 1 ? <Link href={`?paymentPage=${Math.floor(page) - 1}`}>Encaissements précédents</Link> : <span/>}{data.payments.length === 20 ? <Link href={`?paymentPage=${Math.floor(page) + 1}`}>Encaissements suivants</Link> : null}</div>
      {data.canRecord && ["issued", "sent", "overdue", "partially_paid"].includes(i.status) && i.amountDue !== "0.00" ? <OperationalForm title="Enregistrer un paiement" operation="payment.record" hidden={{ invoiceId: id, idempotencyKey: randomUUID() }} submit="Enregistrer l’encaissement" fields={[{ name: "amount", label: "Montant reçu (€)", required: true, help: "Décimales avec un point, exemple : 100.50" }, { name: "method", label: "Mode d’encaissement", type: "select", required: true, options: PAYMENT_METHODS.map(value => ({ value, label: methodLabels[value] })) }, { name: "paidAt", label: "Date de réception", type: "datetime-local", required: true }, { name: "reference", label: "Référence (facultative)" }]}/> : null}
    </section>
    {i.notes ? <p className="whitespace-pre-wrap">{i.notes}</p> : null}
    {data.canIssue && i.status === "draft" ? <OperationalForm operation="invoice.issue" hidden={{ invoiceId: id }} submit="Émettre la facture" fields={[{ name: "confirmed", label: "Je confirme l’émission et le verrouillage des lignes", type: "checkbox", required: true }]}/> : null}
    {editable ? <OperationalForm operation="invoice.cancel" hidden={{ invoiceId: id }} submit="Annuler le brouillon"/> : null}
    <p className="text-xs text-neutral-500">Le PDF utilise les données figées à l’émission et un encart d’encaissements actualisé. Aucun e-mail envoyé. Fondation technique : conformité fiscale non validée, adresse de facturation client non modélisée. Rapprochement bancaire et avoirs différés.</p></div>;
}
const methodLabels = { bank_transfer: "Virement reçu", card: "Carte", cash: "Espèces", cheque: "Chèque", other: "Autre" };
