"use client";

import { directorChatInputSchema, directorChatResponseSchema, proposalViewSchema, type ProposalView, type Specialist } from "@first-ai/schemas";
import { buttonClassName, inputClassName, SafeMarkdown } from "@first-ai/ui";
import { useEffect, useRef, useState, type FormEvent } from "react";

type Message = { id: number; role: "user" | "assistant"; text: string; provider?: "ollama" | "openai"; model?: string; fallbackUsed?: boolean; specialist?: "director" | Specialist };
const names = {director:"Director",pricing:"Pricing",planning:"Planning",technician:"Technician"};
export function AssistantChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [specialist,setSpecialist] = useState<Specialist | "director">("director");
  const [proposals,setProposals] = useState<ProposalView[]>([]);
  const [deciding,setDeciding] = useState<string | null>(null);
  useEffect(() => { void fetch("/api/assistant/proposals").then(r => r.json()).then((data: {proposals?:unknown[]}) => { if (data.proposals) setProposals(data.proposals.map(p => proposalViewSchema.parse(p))); }).catch(() => setError("Chargement des propositions impossible.")); },[]);
  async function decide(id:string,decision:"approve"|"reject") {
    if (deciding) return;
    setDeciding(id); setError("");
    try {
      const response = await fetch("/api/assistant/proposals",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({proposalId:id,decision})});
      const data: {proposal?:unknown;error?:{message?:string}} = await response.json();
      if (!response.ok) { setError(data.error?.message ?? "Approbation impossible."); return; }
      const updated = proposalViewSchema.parse(data.proposal);
      setProposals(previous => previous.map(p => p.id === id ? updated : p));
    } catch { setError("Approbation impossible. Consultez le statut avant de réessayer."); }
    finally { setDeciding(null); }
  }
  const end = useRef<HTMLDivElement>(null);
  const sequence = useRef(0);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages, pending]);
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const parsed = directorChatInputSchema.safeParse({ message });
    if (!parsed.success) { setError("Saisissez un message entre 1 et 2 000 caractères."); return; }
    setPending(true); setError(""); setMessage("");
    setMessages((previous) => [...previous.slice(-19), { id: sequence.current++, role: "user", text: parsed.data.message }]);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({...parsed.data,...(specialist !== "director" ? {specialist} : {})}),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        // Error strings are constructed on the server, never raw SDK/database messages.
        const failure = body as { error?: { message?: string } };
        setError(failure.error?.message ?? "L’assistant est indisponible. Réessayez.");
        return;
      }
      const result = directorChatResponseSchema.parse(body);
      if (result.proposals) setProposals(result.proposals);
      setMessages((previous) => [...previous.slice(-19), { id: sequence.current++, role: "assistant", text: result.text, provider: result.provider, model: result.model, fallbackUsed: result.fallbackUsed, specialist:result.specialist }]);
    } catch {
      setError("Impossible de joindre l’assistant. Le CRM reste accessible.");
    } finally { setPending(false); }
  }
  return <section className="rounded-2xl border border-neutral-200 bg-white" aria-label="Conversation avec Director">
    <div className="border-b border-neutral-100 px-5 py-4"><h2 className="font-semibold">Director</h2><p className="text-xs text-neutral-500">Lecture seule · Les spécialistes proposent, vous approuvez</p><label htmlFor="specialist" className="mt-3 block text-sm">Assistant spécialisé</label><select id="specialist" className={inputClassName} value={specialist} disabled={pending} onChange={e => setSpecialist(e.target.value as Specialist | "director")}><option value="director">Director · Orientation automatique</option><option value="pricing">Pricing · Devis et marges</option><option value="planning">Planning · Créneaux et affectations</option><option value="technician">Technician · Terrain et rapports</option></select></div>
    <div className="min-h-64 max-h-[55dvh] space-y-5 overflow-y-auto p-4 sm:p-6" role="log" aria-live="polite" aria-busy={pending}>
      {messages.length === 0 && <div className="py-8 text-center"><h3 className="font-medium">Comprenez votre activité CRM</h3><p className="mt-2 text-sm text-neutral-500">Clients actifs, nouveaux prospects, prestations : posez votre question.</p><p className="mt-4 text-sm text-neutral-600">« Combien ai-je de clients actifs ? »</p></div>}
      {messages.map((entry) => <div key={entry.id} className={entry.role === "user" ? "ml-6 rounded-xl bg-neutral-100 p-4 sm:ml-16" : "mr-4"}>
        <p className="mb-1 text-xs font-semibold text-neutral-500">{entry.role === "user" ? "Vous" : names[entry.specialist ?? "director"]}</p>{entry.role === "assistant" ? <SafeMarkdown>{entry.text}</SafeMarkdown> : <p className="whitespace-pre-wrap break-words text-sm leading-6">{entry.text}</p>}
        {entry.provider && <p className="mt-2 text-xs text-neutral-400">{entry.provider === "ollama" ? "Local" : "Cloud"} · {entry.model}{entry.fallbackUsed ? " · secours cloud" : ""}</p>}
      </div>)}
      {pending && <p className="text-sm text-neutral-500" role="status">Director consulte votre demande…</p>}
      <div ref={end} />
    </div>
    {proposals.length > 0 && <section className="space-y-3 border-t p-4" aria-label="Propositions à valider"><h3 className="font-semibold">Propositions</h3>{proposals.map(p => <article key={p.id} className="min-w-0 rounded-xl border p-3"><p className="text-xs text-neutral-500">{p.specialist} · Risque {p.riskLevel} · {p.status}</p><h4 className="mt-1 font-medium">{p.summary}</h4><p className="break-words text-xs text-neutral-500">{p.action}</p><dl className="my-3 space-y-1 text-sm">{Object.entries(p.payload).map(([key,value]) => <div key={key} className="min-w-0"><dt className="text-neutral-500">{key}</dt><dd className="whitespace-pre-wrap break-words">{String(value ?? "—")}</dd></div>)}</dl>{p.status === "pending" && <div className="flex flex-wrap gap-2"><button className={buttonClassName} disabled={!!deciding || pending} onClick={() => { if (window.confirm("Approuver et exécuter cette action ? Les droits et les données seront revérifiés.")) void decide(p.id,"approve"); }}>Approuver</button><button className={buttonClassName} disabled={!!deciding || pending} onClick={() => void decide(p.id,"reject")}>Rejeter</button></div>}{p.status === "executed" && p.result && <a className="text-sm underline" href={p.result.href}>Action exécutée · Ouvrir la ressource</a>}{p.status === "failed" && <p role="status" className="text-sm text-red-700">Échec sans mutation. Les droits, l’état ou le créneau ne permettent plus cette action. Demandez une nouvelle proposition.</p>}{p.status === "expired" && <p className="text-sm">Proposition expirée. Demandez une nouvelle proposition.</p>}</article>)}</section>}
    <form onSubmit={send} className="border-t border-neutral-100 p-4">
      <label htmlFor="assistant-message" className="mb-2 block text-sm font-medium">Votre message</label>
      <textarea id="assistant-message" value={message} onChange={(event) => setMessage(event.target.value)} className={inputClassName} rows={3} maxLength={2000} required disabled={pending} aria-describedby="assistant-help assistant-error" />
      <div className="mt-3 flex items-center justify-between gap-3"><p id="assistant-help" className="text-xs text-neutral-500">Sans mémoire entre les demandes. N’envoyez pas de secrets.</p><button type="submit" className={buttonClassName} disabled={pending}>{pending ? "En cours…" : "Envoyer"}</button></div>
      <p id="assistant-error" role={error ? "alert" : undefined} className="mt-2 text-sm text-red-700">{error}</p>
    </form>
  </section>;
}
