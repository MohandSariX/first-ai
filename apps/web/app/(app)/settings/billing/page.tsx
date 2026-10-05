import { hasPermission } from "@first-ai/auth";
import { sellerBillingSchema } from "@first-ai/schemas";
import { AuthorizationError } from "@first-ai/tools";
import { EmptyState, PageHeader } from "@first-ai/ui";
import { OperationalForm } from "../../../../components/operational-form";
import { billingFields } from "../../../../lib/billing-fields";
import { withCrm } from "../../../../lib/crm";
export const metadata = { title: "Identité fiscale du vendeur" };
export default async function BillingSettingsPage() {
  let data;
  try { data = await withCrm(async crm => ({ seller: await crm.billing.getSeller(crm.context), canWrite: hasPermission(crm.context.role, "billing.seller.write") })); }
  catch (error) { if (error instanceof AuthorizationError) return <EmptyState title="Accès non autorisé" description="Votre rôle ne permet pas de consulter la configuration de facturation."/>; throw error; }
  if (!data.seller) return <EmptyState title="Organisation indisponible" description="Vérifiez votre adhésion."/>;
  const fields = billingFields(Object.keys(sellerBillingSchema.shape), data.seller);
  return <div className="space-y-6"><PageHeader title="Identité fiscale du vendeur" description="Configuration explicite, sans déduction automatique ni certification fiscale."/>
    <p className="rounded-xl border p-4 text-sm">Renseignez les données réelles validées de l’émetteur. Les informations applicables sont contrôlées à l’émission. L’adresse est celle du siège ou de l’entrepreneur, jamais un site client. La taille déclarée ne détermine pas automatiquement vos obligations.</p>
    {data.canWrite ? <OperationalForm title="Configurer le vendeur" operation="billing.seller" fields={fields} submit="Enregistrer l’identité vendeur"/> : <dl className="grid gap-4 sm:grid-cols-2">{fields.map(f => <div key={f.name}><dt className="text-sm text-neutral-500">{f.label}</dt><dd className="break-words">{f.options?.find(o => o.value === f.value)?.label ?? (f.value || "Non renseigné")}</dd></div>)}</dl>}
    <p className="text-sm text-neutral-500">Les snapshots déjà émis restent inchangés. Numérotation fiscale, mentions complètes, avoirs, archivage et facturation électronique restent des jalons distincts.</p>
  </div>;
}
