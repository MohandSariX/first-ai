"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { financialRetentionPolicySchema, financialArchivePeriodSchema } from "@first-ai/schemas";
const responseSchema = z.object({ id: z.uuid().optional(), valid: z.boolean().optional(), success: z.boolean().optional(), error: z.object({ message: z.string() }).optional() });
export function RetentionSettings({ policy, configure, exportAllowed, latestId }: { policy: { closingMonth: number; closingDay: number; retentionYears: number } | null; configure: boolean; exportAllowed: boolean; latestId: string | null }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [fields, setFields] = useState<Record<string, string>>({}); const router = useRouter();
  async function send(input: unknown) {
    setBusy(true); setMessage(""); setFields({});
    try { const r = await fetch("/api/financial-archives", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }); const data = responseSchema.parse(await r.json()); setMessage(data.error?.message ?? (data.valid === false ? "Archive invalide." : data.valid === true ? "Archive vérifiée : fichiers et empreintes cohérents." : "Opération réussie.")); if (r.ok) router.refresh(); }
    catch { setMessage("Le service d’archive est temporairement indisponible."); } finally { setBusy(false); }
  }
  const field = (name: string, label: string, value: number | string, type = "number") => <label className="block text-sm" key={name}>{label}<input name={name} type={type} defaultValue={value} required aria-invalid={Boolean(fields[name])} aria-describedby={fields[name] ? `${name}-error` : undefined} className="mt-1 block w-full rounded-lg border p-3"/>{fields[name] ? <span id={`${name}-error`} className="text-red-700">{fields[name]}</span> : null}</label>;
  return <div className="space-y-6">
    {configure ? <form className="space-y-3 rounded-xl border p-4" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); const p = financialRetentionPolicySchema.safeParse({ closingMonth: Number(f.get("closingMonth")), closingDay: Number(f.get("closingDay")), retentionYears: Number(f.get("retentionYears")) }); if (!p.success) { setFields(Object.fromEntries(p.error.issues.map(i => [String(i.path[0]), i.message]))); return; } void send({ action: "configure", policy: p.data }); }}><h2 className="font-semibold">Clôture comptable déclarée</h2>{field("closingMonth", "Mois de clôture", policy?.closingMonth ?? "")}{field("closingDay", "Jour de clôture", policy?.closingDay ?? "")}{field("retentionYears", "Années de conservation (minimum 10)", policy?.retentionYears ?? 10)}<button disabled={busy} className="rounded-lg bg-neutral-900 p-3 text-white">Enregistrer la politique</button></form> : null}
    {exportAllowed ? <form className="space-y-3 rounded-xl border p-4" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget), p = financialArchivePeriodSchema.safeParse({ from: f.get("from"), to: f.get("to") }); if (!p.success) { setMessage("Période invalide."); return; } void send({ action: "export", period: p.data }); }}><h2 className="font-semibold">Export financier borné</h2>{field("from", "Émissions depuis", "", "date")}{field("to", "Émissions jusqu’au", "", "date")}<p className="text-sm text-neutral-600">Manifest, snapshots, PDF originaux disponibles, paiements, audit et compteurs. Maximum 200 documents / 100 Mo. Pas un backup complet ni une restauration.</p><button disabled={busy || !policy} className="rounded-lg bg-neutral-900 p-3 text-white disabled:opacity-40">Créer l’export</button></form> : null}
    {latestId && exportAllowed ? <div className="space-y-3"><a className="block underline" href={`/api/financial-archives?id=${latestId}`}>Télécharger le dernier export</a><button disabled={busy} className="rounded-lg border p-3" onClick={() => void send({ action: "verify", id: latestId })}>Vérifier l’archive</button></div> : null}
    {message ? <p role="status" className="rounded-xl border p-4">{message}</p> : null}{busy ? <p role="status">Opération en cours…</p> : null}
  </div>;
}
