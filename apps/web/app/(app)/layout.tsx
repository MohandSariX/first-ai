import { AppNavigation } from "../../components/app-navigation";
import { requireBusinessUser } from "../../lib/auth";

export default async function ApplicationLayout({ children }: { readonly children: React.ReactNode }) {
  const user = await requireBusinessUser();
  return <div className="min-h-screen bg-neutral-50"><AppNavigation userName="Compte First AI" role={user.role}/><main className="mx-auto min-h-screen max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:ml-60 lg:px-8 lg:pb-10 lg:pt-8">{children}</main></div>;
}
