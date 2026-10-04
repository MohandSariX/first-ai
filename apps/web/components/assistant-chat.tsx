"use client";

import { directorChatInputSchema, directorChatResponseSchema } from "@first-ai/schemas";
import { buttonClassName, inputClassName, SafeMarkdown } from "@first-ai/ui";
import { useEffect, useRef, useState, type FormEvent } from "react";

type Message = { id: number; role: "user" | "assistant"; text: string; provider?: "ollama" | "openai"; model?: string; fallbackUsed?: boolean };
export function AssistantChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
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
        body: JSON.stringify(parsed.data),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        // Error strings are constructed on the server, never raw SDK/database messages.
        const failure = body as { error?: { message?: string } };
        setError(failure.error?.message ?? "L’assistant est indisponible. Réessayez.");
        return;
      }
      const result = directorChatResponseSchema.parse(body);
      setMessages((previous) => [...previous.slice(-19), { id: sequence.current++, role: "assistant", text: result.text, provider: result.provider, model: result.model, fallbackUsed: result.fallbackUsed }]);
    } catch {
      setError("Impossible de joindre l’assistant. Le CRM reste accessible.");
    } finally { setPending(false); }
  }
  return <section className="rounded-2xl border border-neutral-200 bg-white" aria-label="Conversation avec Director">
    <div className="border-b border-neutral-100 px-5 py-4"><h2 className="font-semibold">Director</h2><p className="text-xs text-neutral-500">Lecture seule · Vos droits CRM sont respectés</p></div>
    <div className="min-h-64 max-h-[55dvh] space-y-5 overflow-y-auto p-4 sm:p-6" role="log" aria-live="polite" aria-busy={pending}>
      {messages.length === 0 && <div className="py-8 text-center"><h3 className="font-medium">Comprenez votre activité CRM</h3><p className="mt-2 text-sm text-neutral-500">Clients actifs, nouveaux prospects, prestations : posez votre question.</p><p className="mt-4 text-sm text-neutral-600">« Combien ai-je de clients actifs ? »</p></div>}
      {messages.map((entry) => <div key={entry.id} className={entry.role === "user" ? "ml-6 rounded-xl bg-neutral-100 p-4 sm:ml-16" : "mr-4"}>
        <p className="mb-1 text-xs font-semibold text-neutral-500">{entry.role === "user" ? "Vous" : "Director"}</p>{entry.role === "assistant" ? <SafeMarkdown>{entry.text}</SafeMarkdown> : <p className="whitespace-pre-wrap break-words text-sm leading-6">{entry.text}</p>}
        {entry.provider && <p className="mt-2 text-xs text-neutral-400">{entry.provider === "ollama" ? "Local" : "Cloud"} · {entry.model}{entry.fallbackUsed ? " · secours cloud" : ""}</p>}
      </div>)}
      {pending && <p className="text-sm text-neutral-500" role="status">Director consulte votre demande…</p>}
      <div ref={end} />
    </div>
    <form onSubmit={send} className="border-t border-neutral-100 p-4">
      <label htmlFor="assistant-message" className="mb-2 block text-sm font-medium">Votre message</label>
      <textarea id="assistant-message" value={message} onChange={(event) => setMessage(event.target.value)} className={inputClassName} rows={3} maxLength={2000} required disabled={pending} aria-describedby="assistant-help assistant-error" />
      <div className="mt-3 flex items-center justify-between gap-3"><p id="assistant-help" className="text-xs text-neutral-500">Sans mémoire entre les demandes. N’envoyez pas de secrets.</p><button type="submit" className={buttonClassName} disabled={pending}>{pending ? "En cours…" : "Envoyer"}</button></div>
      <p id="assistant-error" role={error ? "alert" : undefined} className="mt-2 text-sm text-red-700">{error}</p>
    </form>
  </section>;
}
