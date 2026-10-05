import { hasPermission } from "@first-ai/auth";
import { AuthorizationError, ResourceNotFoundError } from "@first-ai/tools";
import { EmptyState, PageHeader, StatusBadge } from "@first-ai/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { OperationalForm } from "../../../../components/operational-form";
import { withCrm } from "../../../../lib/crm";
import { formatMoney } from "../../../../lib/format";
import { invoiceItemFields, invoiceLabels } from "../../../../lib/invoices";
export const metadata = { title: "Détail facture" };
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!z.uuid().safeParse(id).success) notFound();
  let data;
  try { data = await withCrm(async crm => ({ invoice: await crm.invoices.getInvoice(crm.context, id), canWrite: hasPermission(crm.context.role, "invoices.write"), canIssue: hasPermission(crm.context.role, "invoices.issue") })); }
  catch (e) { if (e instanceof ResourceNotFoundError) notFound(); if (e instanceof AuthorizationError) return <EmptyState title="Accès non autorisé" description="Votre rôle ne permet pas de consulter les factures."/>; throw e; }
  const i = data.invoice, editable = data.canWrite && i.status === "draft";
  return <div className="space-y-6"><PageHeader title={i.invoiceNumber} description={`Date : ${i.issueDate} · Échéance : ${i.dueDate}`}/><StatusBadge>{invoiceLabels[i.status]}</StatusBadge>
    <div className="flex flex-wrap gap-4 text-sm underline"><Link href={`/customers/${i.customerId}`}>Client</Link>{i.quoteId ? <Link href={`/quotes/${i.quoteId}`}>Devis source</Link> : null}{i.jobId ? <Link href={`/jobs/${i.jobId}`}>Intervention source</Link> : null}</div>
    <section className="space-y-3" aria-label="Lignes de facture">{i.items.map(item => <article key={item.id} className="space-y-4 rounded-2xl border bg-white p-5"><h2 className="font-medium">{item.description}</h2><p className="text-sm">{item.quantity} × {formatMoney(item.unitPrice)} HT · TVA {item.taxRate} %</p>{editable ? <><details><summary className="cursor-pointer">Modifier la ligne</summary><OperationalForm operation="invoice.updateItem" hidden={{ invoiceId: id, itemId: item.id }} fields={invoiceItemFields(item)} submit="Enregistrer la ligne"/></details><OperationalForm operation="invoice.removeItem" hidden={{ invoiceId: id, itemId: item.id }} submit="Retirer la ligne"/></> : null}</article>)}{!i.items.length ? <EmptyState title="Aucune ligne" description="Ajoutez une ligne avant l’émission."/> : null}</section>
    {editable ? <div className="rounded-2xl border bg-white p-5"><OperationalForm title="Ajouter une ligne" operation="invoice.addItem" hidden={{ invoiceId: id }} fields={invoiceItemFields()} submit="Ajouter la ligne"/></div> : null}
    <section className="rounded-2xl border bg-white p-5" aria-label="Totaux"><h2 className="font-semibold">Totaux</h2><p>HT : {formatMoney(i.subtotal)}</p><p>TVA : {formatMoney(i.taxAmount)}</p><p className="font-semibold">TTC : {formatMoney(i.total)}</p></section>
    {i.notes ? <p className="whitespace-pre-wrap">{i.notes}</p> : null}
    {data.canIssue && i.status === "draft" ? <OperationalForm operation="invoice.issue" hidden={{ invoiceId: id }} submit="Émettre la facture" fields={[{ name: "confirmed", label: "Je confirme l’émission et le verrouillage des lignes", type: "checkbox", required: true }]}/> : null}
    {editable ? <OperationalForm operation="invoice.cancel" hidden={{ invoiceId: id }} submit="Annuler le brouillon"/> : null}
    <p className="text-xs text-neutral-500">L’émission ne génère aucun PDF et n’envoie aucun e-mail. Paiements et avoirs différés.</p></div>;
}
