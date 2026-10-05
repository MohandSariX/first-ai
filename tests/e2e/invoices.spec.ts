import { expect, test } from "@playwright/test";
import { e2eFixture } from "./fixture";

test("owner creates, edits and issues a fictional invoice on mobile", async ({ page }) => {
  await page.goto("/login"); await page.getByLabel("E-mail").fill(e2eFixture.email); await page.getByLabel("Mot de passe").fill(e2eFixture.password); await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
  await page.goto("/invoices"); await page.getByText("Nouvelle facture", { exact: true }).click();
  await page.getByLabel("Client", { exact: true }).selectOption({ label: e2eFixture.operationalCustomerName });
  await page.getByLabel("Date d’émission prévue").fill("2026-10-05"); await page.getByLabel("Échéance").fill("2026-11-05"); await page.getByRole("button", { name: "Créer le brouillon" }).click();
  await expect(page.getByRole("heading", { name: /FAC-2026-\d{6}/ })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const add = page.getByRole("form", { name: "Ajouter une ligne" });
  await add.getByLabel("Description").fill("Facturation fictive E2E"); await add.getByLabel("Quantité").fill("2"); await add.getByLabel("Prix unitaire HT (€)").fill("100.10"); await add.getByLabel("TVA (%)").fill("20"); await add.getByRole("button", { name: "Ajouter la ligne" }).click();
  const totals = page.getByRole("region", { name: "Totaux" }); await expect(totals).toContainText("240,24 €");
  await page.getByText("Modifier la ligne", { exact: true }).click(); const edit = page.getByRole("form", { name: "Enregistrer la ligne" }); await edit.getByLabel("Quantité").fill("3"); await edit.getByRole("button", { name: "Enregistrer la ligne" }).click(); await expect(totals).toContainText("360,36 €");
  await page.getByLabel("Je confirme l’émission et le verrouillage des lignes").check(); await page.getByRole("button", { name: "Émettre la facture" }).click(); await expect(page.getByText("Émise", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Ajouter la ligne" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
