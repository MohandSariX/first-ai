import { expect, type Page } from "@playwright/test";

export async function confirmInvoiceBusiness(page: Page, reference?: string) {
  const form = page.getByRole("form", { name: "Enregistrer les dates et références" });
  await form.getByLabel("Date réelle d’exécution / livraison").fill("2026-10-01");
  await form.getByLabel("Bon de commande établi par l’acheteur").selectOption(reference ? "yes" : "no");
  if (reference) await form.getByLabel("Référence commande / acheteur").fill(reference);
  await form.getByRole("button").click();
  await expect(form.getByRole("status")).toHaveText("Modification enregistrée.");
}
