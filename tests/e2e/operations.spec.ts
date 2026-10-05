import { expect, test } from "@playwright/test";
import { e2eFixture } from "./fixture";

test("owner accepts a quote, creates a job and completes a mobile field report", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(e2eFixture.email); await page.getByLabel("Mot de passe").fill(e2eFixture.password); await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
  await page.goto("/quotes"); await page.getByText("Nouveau devis", { exact: true }).click();
  await page.getByLabel("Client du nouveau brouillon").selectOption({ label: e2eFixture.operationalCustomerName }); await page.getByRole("button", { name: "Choisir", exact: true }).click();
  await page.getByLabel("Site", { exact: true }).selectOption({ label: "Site Terrain Fictif" }); await page.getByRole("button", { name: "Créer le brouillon", exact: true }).click();
  await expect(page.getByRole("heading", { name: /DEV-\d{4}-\d{6}/ })).toBeVisible();
  const add = page.getByRole("form", { name: "Ajouter une ligne" });
  await add.getByLabel("Prestation", { exact: true }).selectOption({ label: e2eFixture.serviceName }); await add.getByLabel("Description", { exact: true }).fill("Traitement terrain fictif E2E");
  await add.getByLabel("Quantité").fill("2"); await add.getByLabel("Prix unitaire HT (€)").fill("100"); await add.getByLabel("TVA (%)").fill("20"); await add.getByLabel("Coût estimé unitaire (€)").fill("30");
  await add.getByRole("button", { name: "Ajouter la ligne" }).click();
  await expect(page.getByTestId("quote-subtotal")).toHaveText("200,00 €"); await expect(page.getByTestId("quote-total")).toHaveText("240,00 €");
  await page.getByRole("button", { name: "Marquer prêt" }).click();
  await page.getByLabel("Prestation principale de l’intervention").selectOption({ label: e2eFixture.serviceName }); await page.getByLabel("Je confirme l’acceptation et la création d’une intervention brouillon.").check();
  await page.getByRole("button", { name: "Accepter et créer l’intervention" }).click();
  await expect(page).toHaveURL(/\/jobs\/[\da-f-]+\?created=1/); await expect(page.getByText("Devis accepté. Intervention brouillon créée.")).toBeVisible();
  await page.getByLabel("Début prévu").fill("2026-11-15T09:00"); await page.getByLabel("Fin prévue").fill("2026-11-15T10:00"); await page.getByRole("button", { name: "Planifier l’intervention" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Démarrer l’intervention" }).click(); await page.getByRole("button", { name: "Créer le rapport brouillon" }).click();
  await page.getByLabel("Observations", { exact: true }).fill("Observation fictive, aucun client réel."); await page.getByLabel("Traitement réalisé").fill("Traitement de test uniquement."); await page.getByLabel("Infestation avant").selectOption("high"); await page.getByLabel("Infestation après").selectOption("low");
  await page.getByRole("button", { name: "Enregistrer le rapport" }).click(); await page.getByRole("button", { name: "Finaliser le rapport" }).click(); await expect(page.getByText("Rapport finalisé", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Terminer l’intervention" }).click(); await expect(page.getByText("Terminée", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
