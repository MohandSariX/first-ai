import { secondaryButtonClassName } from "@first-ai/ui";
import Link from "next/link";
export default function NotFound() { return <main className="flex min-h-[70vh] items-center justify-center p-6"><section className="text-center"><p className="text-sm font-medium text-neutral-500">404</p><h1 className="mt-2 text-2xl font-semibold">Ressource introuvable</h1><p className="mt-2 text-sm text-neutral-500">Cette ressource est absente ou ne vous est pas accessible.</p><Link href="/dashboard" className={`${secondaryButtonClassName} mt-6`}>Retour au tableau de bord</Link></section></main>; }
