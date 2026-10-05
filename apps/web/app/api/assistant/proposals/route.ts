import { ApprovalRepository, createDatabaseClient } from "@first-ai/database";
import { proposalDecisionSchema } from "@first-ai/schemas";
import { ApprovalService, ApprovalError, proposalView } from "@first-ai/tools";
import { NextResponse } from "next/server";
import { getBusinessUser } from "../../../../lib/auth";
import { hasSameOrigin } from "../../../../lib/request-security";

export const runtime = "nodejs";
export async function GET() {
  const user = await getBusinessUser();
  if (!user) return NextResponse.json({error:{message:"Connectez-vous."}},{status:401});
  const db = createDatabaseClient();
  try { return NextResponse.json({proposals:await new ApprovalService(new ApprovalRepository(db)).list(user)},{headers:{"Cache-Control":"no-store"}}); }
  catch { return NextResponse.json({error:{message:"Les propositions sont temporairement indisponibles."}},{status:503}); }
  finally { await db.$client.end(); }
}
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return NextResponse.json({error:{message:"Origine non autorisée."}},{status:403});
  if (!await getBusinessUser()) return NextResponse.json({error:{message:"Connectez-vous."}},{status:401});
  let parsed;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Missing body");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const c = await reader.read(); if (c.done) break; size += c.value.byteLength; if (size > 1024) { await reader.cancel(); throw new Error("Body too large"); } chunks.push(c.value); }
    parsed = proposalDecisionSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch { return NextResponse.json({error:{message:"Décision invalide."}},{status:400}); }
  const db = createDatabaseClient();
  try {
    const p = await new ApprovalService(new ApprovalRepository(db)).decide(parsed.proposalId,parsed.decision,async () => {
      const current = await getBusinessUser();
      if (!current) throw new ApprovalError("FORBIDDEN","Adhésion inactive ou session expirée.");
      return current;
    });
    return NextResponse.json({proposal:proposalView(p)},{headers:{"Cache-Control":"no-store"}});
  } catch (e:unknown) {
    const code = e instanceof ApprovalError ? e.code : "INTERNAL_ERROR";
    return NextResponse.json({error:{code,message:code === "NOT_FOUND" ? "Proposition introuvable." : code === "CONFLICT" ? "Cette proposition ne peut plus être exécutée." : "Approbation impossible. Vérifiez vos droits ou réessayez plus tard."}},{status:code === "NOT_FOUND" ? 404 : code === "CONFLICT" ? 409 : code === "FORBIDDEN" ? 403 : 503});
  } finally { await db.$client.end(); }
}
