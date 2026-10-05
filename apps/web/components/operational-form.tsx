"use client";
import { useActionState, useId } from "react";
import { z } from "zod";
import { buttonClassName, FormField, inputClassName } from "@first-ai/ui";
import { operationalAction } from "../app/operational-actions";
import type { ActionState } from "../app/actions";
import { parseOperationalForm, type Operation } from "../lib/operational-form-input";
export interface OperationalField { name: string; label: string; type?: "text" | "textarea" | "select" | "checkbox" | "date" | "datetime-local"; value?: string; checked?: boolean; required?: boolean; options?: { value: string; label: string }[]; help?: string }
export function OperationalForm({ operation, fields = [], hidden = {}, submit, title }: { operation: Operation; fields?: OperationalField[]; hidden?: Record<string, string>; submit: string; title?: string }) {
  const prefix = useId();
  const [state, action, pending] = useActionState(async (previous: ActionState, form: FormData): Promise<ActionState> => {
    // Convert local device date/time once, preserving the instant sent to the server in UTC.
    try {
      for (const field of fields) if (field.type === "datetime-local") { const value = form.get(field.name); if (typeof value === "string" && value) form.set(field.name, new Date(value).toISOString()); }
      parseOperationalForm(operation, form);
    } catch (error) { if (error instanceof z.ZodError) return { success: false, message: "Vérifiez les champs indiqués.", fieldErrors: error.flatten().fieldErrors }; return { success: false, message: "Date ou saisie invalide." }; }
    return operationalAction(previous, form);
  }, { success: false });
  const fieldAria = (name: string) => ({ "aria-invalid": Boolean(state.fieldErrors?.[name]?.length), "aria-describedby": state.fieldErrors?.[name]?.length ? `${prefix}-${name}-error` : undefined });
  return <form action={action} className="space-y-4" aria-label={title ?? submit}>
    {title ? <h3 className="font-semibold">{title}</h3> : null}
    <input type="hidden" name="operation" value={operation}/>{Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value}/>)}
    <div className="grid gap-4 sm:grid-cols-2">{fields.map(field => <FormField key={field.name} name={`${prefix}-${field.name}`} label={field.label} error={state.fieldErrors?.[field.name]?.[0]}>
      {field.type === "textarea" ? <textarea id={`${prefix}-${field.name}`} {...fieldAria(field.name)} name={field.name} defaultValue={field.value} required={field.required} rows={3} maxLength={5000} className={inputClassName}/> : field.type === "select" ? <select id={`${prefix}-${field.name}`} {...fieldAria(field.name)} name={field.name} defaultValue={field.value ?? ""} required={field.required} className={inputClassName}><option value="">Sélectionner</option>{field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : field.type === "checkbox" ? <input id={`${prefix}-${field.name}`} {...fieldAria(field.name)} name={field.name} type="checkbox" defaultChecked={field.checked} required={field.required} className="h-5 w-5 accent-neutral-950"/> : <input id={`${prefix}-${field.name}`} {...fieldAria(field.name)} name={field.name} type={field.type ?? "text"} defaultValue={field.value} required={field.required} maxLength={5000} className={inputClassName}/>}
      {field.help ? <p className="mt-1 text-xs text-neutral-500">{field.help}</p> : null}
    </FormField>)}</div>
    {state.message ? <p role={state.success ? "status" : "alert"} className={`text-sm ${state.success ? "text-green-700" : "text-red-700"}`}>{state.message}</p> : null}
    <button type="submit" disabled={pending} className={buttonClassName}>{pending ? "Enregistrement…" : submit}</button>
  </form>;
}
