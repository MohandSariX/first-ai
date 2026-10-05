import { PageHeader } from "@first-ai/ui";
import { AssistantChat } from "../../../components/assistant-chat";
import { requireBusinessUser } from "../../../lib/auth";
import Link from "next/link";

export default async function AssistantPage() {
  await requireBusinessUser();
  return <div className="mx-auto max-w-3xl">
    <PageHeader title="Assistant" description="First AI · Director et spécialistes — lecture et propositions supervisées." action={<Link href="/settings/ai" className="text-sm text-neutral-600 underline underline-offset-4">Intelligence artificielle</Link>} />
    <AssistantChat />
  </div>;
}
