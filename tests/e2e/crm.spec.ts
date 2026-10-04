import { expect, test } from "@playwright/test";
import { e2eFixture } from "./fixture";

test("an authenticated owner creates and opens a fictional customer", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(e2eFixture.email);
  await page.getByLabel("Mot de passe").fill(e2eFixture.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();

  await page.getByRole("link", { name: "Clients", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
  await page.getByText("Nouveau client").click();
  await page.getByLabel("Nom", { exact: true }).fill(e2eFixture.customerName);
  await page.getByLabel("Téléphone").fill("0102030405");
  await page.getByRole("button", { name: "Créer le client" }).click();

  await expect(page.getByRole("heading", { name: e2eFixture.customerName })).toBeVisible();
  await expect(page.getByText("Client créé avec succès.")).toBeVisible();
});
