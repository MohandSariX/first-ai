"use client";
import { buttonClassName } from "@first-ai/ui";
export default function ErrorPage({ reset }: { readonly reset: () => void }) { return <section className="mx-auto mt-20 max-w-lg rounded-2xl border border-neutral-200 bg-white p-8 text-center"><h1 className="text-xl font-semibold">Impossible de charger cette page</h1><p className="mt-2 text-sm text-neutral-500">Une erreur temporaire est survenue. Aucun détail technique sensible n’a été affiché.</p><button onClick={reset} className={`${buttonClassName} mt-5`}>Réessayer</button></section>; }
