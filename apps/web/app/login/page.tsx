import { buttonClassName, FormField, inputClassName } from "@first-ai/ui";
import type { Metadata } from "next";

import { loginAction } from "../actions";

export const metadata: Metadata = { title: "Connexion" };
export default async function LoginPage({ searchParams }: { readonly searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="flex min-h-screen items-center justify-center px-5 py-12"><section className="w-full max-w-sm rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8"><p className="text-sm font-semibold tracking-wide text-neutral-500">FIRST AI</p><h1 className="mt-3 text-2xl font-semibold">Connexion</h1><p className="mt-2 text-sm text-neutral-500">Accédez à votre espace opérationnel.</p>{error === undefined ? null : <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">E-mail ou mot de passe incorrect.</p>}<form action={loginAction} className="mt-6 space-y-4"><FormField label="E-mail" name="email"><input id="email" name="email" type="email" autoComplete="email" required className={inputClassName}/></FormField><FormField label="Mot de passe" name="password"><input id="password" name="password" type="password" autoComplete="current-password" required className={inputClassName}/></FormField><button type="submit" className={`${buttonClassName} w-full`}>Se connecter</button></form><p className="mt-5 text-center text-xs text-neutral-400">Utilisez votre compte local First AI.</p></section></main>;
}
