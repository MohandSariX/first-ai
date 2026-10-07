import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { e2eFixture } from "./fixture";
import { confirmInvoiceBusiness } from "./invoice-business";

test("M4 partial credit note, immutable invoice, corrected debt and secure AVOIR download", async ({ page, request }) => {
  for (const name of ["SUPABASE_URL", "DATABASE_URL"]) if (!["localhost", "127.0.0.1"].includes(new URL(process.env[name] ?? "missing").hostname)) throw new Error("Credit E2E refuses non-local configuration.");
  const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await admin.from("users").select("id").eq("email", e2eFixture.email).single(); if (owner.error) throw owner.error;
  await page.goto("/login"); await page.getByLabel("E-mail").fill(e2eFixture.email); await page.getByLabel("Mot de passe").fill(e2eFixture.password); await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
  await page.goto("/invoices"); await page.getByText("Nouvelle facture", { exact: true }).click();
  await page.getByLabel("Client", { exact: true }).selectOption({ label: e2eFixture.operationalCustomerName }); await page.getByLabel("Échéance").fill("2026-11-05"); await page.getByRole("button", { name: "Créer le brouillon" }).click();
  await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}$/); const invoiceUrl = page.url(), invoiceId = invoiceUrl.split("/").at(-1)!;
  const item = page.getByRole("form", { name: "Ajouter une ligne" }); await item.getByLabel("Description").fill("Prestation fictive M4"); await item.getByLabel("Quantité").fill("1"); await item.getByLabel("Prix unitaire HT (€)").fill("100"); await item.getByLabel("TVA (%)").fill("20"); await item.getByRole("button").click();
  await expect(page.getByRole("region", { name: "Totaux", exact: true })).toContainText("120,00 €");
  const classification = page.getByRole("form", { name: "Enregistrer la classification" });
  await classification.getByLabel("Type de transaction").selectOption("B2B"); await classification.getByLabel("Nature des opérations").selectOption("services"); await classification.getByLabel("Territorialité fiscale").selectOption("domestic"); await classification.getByLabel("Traitement TVA de la facture").selectOption("normal"); await classification.getByRole("button").click();
  await expect(classification.getByRole("status")).toHaveText("Modification enregistrée."); await confirmInvoiceBusiness(page);
  await page.getByLabel("Je confirme l’émission et le verrouillage des lignes").check(); await page.getByRole("button", { name: "Émettre la facture" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^FAC-/); const fiscalNumber = await page.getByRole("heading", { level: 1 }).innerText();
  await page.getByText("Créer un avoir", { exact: true }).click(); await page.getByLabel("Correction", { exact: true }).selectOption("partial"); await page.getByLabel("Motif de correction").fill("Réduction tarifaire fictive M4"); await page.getByRole("button", { name: "Créer le brouillon d’avoir" }).click();
  await expect(page).toHaveURL(/\/credit-notes\/[0-9a-f-]{36}$/); const id = page.url().split("/").at(-1)!;
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^BROUILLON-/);
  await page.getByLabel("Ligne originale", { exact: true }).selectOption("0"); await page.getByLabel("Montant HT à corriger (€)").fill("20"); await page.getByRole("button", { name: "Enregistrer la correction" }).click();
  await expect(page.getByRole("region", { name: "Totaux de l’avoir" })).toContainText("24,00 €");
  await page.getByLabel("Je confirme l’émission : numéro définitif et correction figée, aucun remboursement").check(); await page.getByRole("button", { name: "Émettre l’avoir" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^AV-\d{4}-\d{6}$/); const number = await page.getByRole("heading", { level: 1 }).innerText();
  const pdfUrl = `/api/credit-notes/${id}/pdf`, pdf = await page.request.get(pdfUrl); expect(pdf.status()).toBe(200); expect(pdf.headers()["content-type"]).toBe("application/pdf"); expect((await request.get(pdfUrl)).status()).toBe(401);
  const downloadPromise = page.waitForEvent("download"); await page.getByRole("link", { name: "Télécharger le PDF de l’avoir" }).click(); const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${number}.pdf`); const path = await download.path(); if (!path) throw new Error("Download missing"); const bytes = await readFile(path); expect(bytes.subarray(0,5).toString()).toBe("%PDF-"); expect(bytes.toString("latin1")).toContain(`AVOIR ${number}`);
  const checked = async (query: PromiseLike<{ error: unknown }>) => { const r = await query; if (r.error) throw r.error; };
  try {
    await checked(admin.from("users").update({ role: "TECHNICIAN" }).eq("id", owner.data.id)); expect((await page.request.get(pdfUrl)).status()).toBe(403);
    await checked(admin.from("users").update({ role: "READ_ONLY" }).eq("id", owner.data.id)); expect((await page.request.get(pdfUrl)).status()).toBe(200);
    await checked(admin.from("users").update({ status: "inactive" }).eq("id", owner.data.id)); expect((await page.request.get(pdfUrl)).status()).toBe(401);
  } finally { await checked(admin.from("users").update({ role: "OWNER", status: "active" }).eq("id", owner.data.id)); }
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto(invoiceUrl); await expect(page.getByRole("heading", { level: 1 })).toHaveText(fiscalNumber);
  await expect(page.getByRole("region", { name: "Totaux", exact: true })).toContainText("120,00 €");
  await expect(page.getByRole("region", { name: "Encaissements" })).toContainText("Reste à payer : 96,00 €");
  await expect(page.getByRole("region", { name: "Encaissements" })).toContainText("Avoirs émis : 24,00 €");
  expect((await page.request.get(`/api/invoices/${invoiceId}/pdf`)).status()).toBe(200);
  await page.goto("/settings/audit");
  await expect(page.getByRole("heading", { name: "Audit financier", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Avoir émis", exact: true }).first()).toBeVisible();
  await expect(page.getByText(number, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  try {
    await checked(admin.from("users").update({ role: "READ_ONLY" }).eq("id", owner.data.id));
    await page.reload(); await expect(page.getByRole("heading", { name: "Accès non autorisé" })).toBeVisible();
  } finally { await checked(admin.from("users").update({ role: "OWNER" }).eq("id", owner.data.id)); }
});
