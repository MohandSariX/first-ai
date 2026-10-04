"use client";

import { type AiSettings, aiModes, aiSettingsSchema } from "@first-ai/schemas";
import { FormField, buttonClassName, inputClassName } from "@first-ai/ui";
import { useActionState, useState, type FormEvent } from "react";
import { updateAiSettingsAction } from "../app/(app)/settings/ai/actions";
import type { ActionState } from "../app/actions";

const fields = [
  ["ollamaBaseUrl", "URL Ollama"], ["localFastModel", "Modèle local rapide"], ["localStandardModel", "Modèle local standard"],
  ["cloudStandardModel", "Modèle cloud standard"], ["cloudReasoningModel", "Modèle cloud raisonnement"],
] as const;
export function AiSettingsForm({ settings, models, editable }: { readonly settings: AiSettings; readonly models: readonly string[]; readonly editable: boolean }) {
  const [state, action, pending] = useActionState(updateAiSettingsAction, { success: false } as ActionState);
  const [clientErrors, setClientErrors] = useState<ActionState["fieldErrors"]>();
  const fieldErrors = clientErrors ?? state.fieldErrors;
  function validate(event: FormEvent<HTMLFormElement>) {
    const form = new FormData(event.currentTarget);
    const input = Object.fromEntries(Object.keys(aiSettingsSchema.shape).map((key) => [key, key === "fallbackEnabled" ? form.get(key) === "on" : form.get(key)]));
    const parsed = aiSettingsSchema.safeParse(input);
    if (!parsed.success) { event.preventDefault(); setClientErrors(parsed.error.flatten().fieldErrors); }
    else setClientErrors(undefined);
  }
  return <form action={action} onSubmit={validate} className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-5">
    <fieldset disabled={!editable || pending} className="grid gap-5 sm:grid-cols-2">
      <FormField label="Mode IA" name="mode" error={fieldErrors?.mode?.[0]}><select id="mode" name="mode" defaultValue={settings.mode} className={inputClassName}>{aiModes.map((mode) => <option value={mode} key={mode}>{({ LOCAL_ONLY: "Local uniquement", HYBRID: "Hybride", CLOUD_ONLY: "Cloud uniquement" })[mode]}</option>)}</select></FormField>
      {fields.map(([key, label]) => <FormField key={key} name={key} label={label} error={fieldErrors?.[key]?.[0]}><input id={key} name={key} defaultValue={settings[key]} className={inputClassName} required maxLength={key === "ollamaBaseUrl" ? 200 : 120} list={key.startsWith("local") ? "installed-models" : undefined} aria-invalid={!!fieldErrors?.[key]} aria-describedby={fieldErrors?.[key] ? `${key}-error` : undefined}/></FormField>)}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="fallbackEnabled" defaultChecked={settings.fallbackEnabled}/> Fallback vers le cloud</label>
    </fieldset>
    <datalist id="installed-models">{models.map((model) => <option value={model} key={model}/>)}</datalist>
    <p className="text-xs text-neutral-500">Choisissez un modèle installé ou saisissez son nom. Aucun modèle n’est téléchargé automatiquement. En mode local uniquement, aucun appel cloud n’est autorisé.</p>
    {editable ? <button type="submit" disabled={pending} className={buttonClassName}>{pending ? "Enregistrement…" : "Enregistrer"}</button> : <p className="text-sm text-neutral-500">Consultation seule — modification réservée aux propriétaires et administrateurs.</p>}
    {state.message && <p role="status" className={state.success ? "text-sm text-emerald-700" : "text-sm text-red-700"}>{state.message}</p>}
  </form>;
}
