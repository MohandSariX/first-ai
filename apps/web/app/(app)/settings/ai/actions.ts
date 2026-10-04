"use server";

import { AiSettingsService } from "@first-ai/agents/settings";
import { AiSettingsRepository } from "@first-ai/database";
import { aiSettingsSchema } from "@first-ai/schemas";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withCrm } from "../../../../lib/crm";
import type { ActionState } from "../../../actions";

export async function updateAiSettingsAction(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const input = Object.fromEntries(Object.keys(aiSettingsSchema.shape).map((key) => [key, key === "fallbackEnabled" ? form.get(key) === "on" : form.get(key)]));
    await withCrm(({ context, database }) => new AiSettingsService(new AiSettingsRepository(database)).update(context, input));
    revalidatePath("/settings/ai");
    return { success: true, message: "Paramètres enregistrés. Ils seront utilisés dès la prochaine demande." };
  } catch (error: unknown) {
    if (error instanceof z.ZodError) return { success: false, message: "Vérifiez les champs indiqués.", fieldErrors: error.flatten().fieldErrors };
    return { success: false, message: "Modification impossible. Vérifiez vos droits puis réessayez." };
  }
}
