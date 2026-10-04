import { AiSettingsService, canManageAiSettings, OllamaProvider } from "@first-ai/agents/settings";
import { AiSettingsRepository } from "@first-ai/database";
import { PageHeader } from "@first-ai/ui";
import { AiSettingsForm } from "../../../../components/ai-settings-form";
import { withCrm } from "../../../../lib/crm";

export default async function AiSettingsPage() {
  const { settings, editable } = await withCrm(async ({ context, database }) => ({
    settings: await new AiSettingsService(new AiSettingsRepository(database)).get(context), editable: canManageAiSettings(context.role),
  }));
  const health = await new OllamaProvider(settings.ollamaBaseUrl).health(settings.localStandardModel);
  return <div className="mx-auto max-w-3xl space-y-6"><PageHeader title="Intelligence artificielle" description="Configuration par organisation · Director reste en lecture seule."/>
    <section className="rounded-xl border border-neutral-200 bg-white p-4" aria-label="État Ollama"><h2 className="font-medium">{health.status === "unavailable" ? "Ollama indisponible" : health.status === "model_missing" ? "Ollama disponible — modèle standard absent" : "Ollama disponible"}</h2><p className="mt-2 break-words text-sm text-neutral-500">Modèles locaux installés : {health.models.length ? health.models.join(", ") : "aucun modèle détecté"}.</p></section>
    <AiSettingsForm settings={settings} models={health.models} editable={editable}/>
  </div>;
}
