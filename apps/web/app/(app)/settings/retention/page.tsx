import { hasPermission } from "@first-ai/auth";
import { AuthorizationError } from "@first-ai/tools";
import { EmptyState, PageHeader } from "@first-ai/ui";
import { withCrm } from "../../../../lib/crm";
import { RetentionSettings } from "../../../../components/retention-settings";
export const metadata = { title: "Conservation financière" };
export default async function RetentionPage() {
  let data;
  try { data = await withCrm(async c => ({ ...await c.retention.settings(c.context), configure: hasPermission(c.context.role, "financialArchive.configure"), exportAllowed: hasPermission(c.context.role, "financialArchive.export") })); }
  catch (e) { if (e instanceof AuthorizationError) return <EmptyState title="Accès non autorisé" description="Votre rôle ne permet pas de consulter les archives financières."/>; throw e; }
  return <div className="space-y-6"><PageHeader title="Conservation financière" description="Fondation technique locale. Conformité fiscale et sauvegarde production non établies."/>
    <p className="rounded-xl border p-4">{data.policy ? `Politique v${data.policy.version} : clôture ${data.policy.closingDay}/${data.policy.closingMonth}, conservation ${data.policy.retentionYears} ans après clôture.` : "Politique incomplète : clôture non déclarée. Échéances inconnues ; aucune purge ni export d’archive autorisé."}</p>
    <p className="text-sm text-neutral-600">Les originaux sont figés à l’émission. Aucun changement de politique ne raccourcit ou n’invente une échéance historique. Aucun original antérieur à M5B n’est fabriqué. Aucune suppression automatique.</p>
    <RetentionSettings policy={data.policy ?? null} configure={data.configure} exportAllowed={data.exportAllowed} latestId={data.latestExport?.id ?? null}/>
  </div>;
}
