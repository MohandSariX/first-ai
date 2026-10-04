import type { ReactNode } from "react";
export { SafeMarkdown } from "./safe-markdown.js";

function join(...classes: Array<string | false | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function PageHeader({ title, description, action }: { readonly title: string; readonly description?: string; readonly action?: ReactNode }) {
  return <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-semibold tracking-tight text-neutral-950 sm:text-3xl">{title}</h1>{description === undefined ? null : <p className="mt-1 text-sm text-neutral-500">{description}</p>}</div>{action}</header>;
}

export function EmptyState({ title, description }: { readonly title: string; readonly description: string }) {
  return <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-12 text-center"><h2 className="font-medium text-neutral-900">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm text-neutral-500">{description}</p></div>;
}

export function StatusBadge({ children, tone = "neutral" }: { readonly children: ReactNode; readonly tone?: "neutral" | "green" | "amber" | "red" | "blue" }) {
  const colors = { neutral: "bg-neutral-100 text-neutral-700", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700", blue: "bg-blue-50 text-blue-700" };
  return <span className={join("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", colors[tone])}>{children}</span>;
}

export function FormField({ label, name, error, children }: { readonly label: string; readonly name: string; readonly error?: string; readonly children: ReactNode }) {
  return <div><label htmlFor={name} className="mb-1.5 block text-sm font-medium text-neutral-700">{label}</label>{children}{error === undefined ? null : <p id={`${name}-error`} className="mt-1 text-xs text-red-600">{error}</p>}</div>;
}

export const inputClassName = "w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 disabled:bg-neutral-100";
export const buttonClassName = "inline-flex min-h-10 items-center justify-center rounded-xl bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButtonClassName = "inline-flex min-h-10 items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-2";
