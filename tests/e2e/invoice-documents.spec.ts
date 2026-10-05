import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { e2eFixture } from "./fixture";

test("issued invoice PDF download is immutable, authenticated and tenant/role scoped", async ({ page, request }) => {
  for (const name of ["SUPABASE_URL", "DATABASE_URL"]) if (!["localhost", "127.0.0.1"].includes(new URL(process.env[name] ?? "missing").hostname)) throw new Error("PDF E2E refuses non-local configuration.");
  const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const ownerResult = await admin.from("users").select("id, organization_id").eq("email", e2eFixture.email).single();
  if (ownerResult.error) throw ownerResult.error;
  const owner = ownerResult.data;
  await page.goto("/login"); await page.getByLabel("E-mail").fill(e2eFixture.email); await page.getByLabel("Mot de passe").fill(e2eFixture.password); await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
  await page.goto("/invoices"); await page.getByText("Nouvelle facture", { exact: true }).click();
  await page.getByLabel("Client", { exact: true }).selectOption({ label: e2eFixture.operationalCustomerName });
  await page.getByLabel("Date d’émission prévue").fill("2026-10-05"); await page.getByLabel("Échéance").fill("2026-11-05"); await page.getByRole("button", { name: "Créer le brouillon" }).click();
  await expect(page.getByRole("heading", { name: /FAC-2026-\d{6}/ })).toBeVisible();
  const id = page.url().split("/").at(-1)!, url = `/api/invoices/${id}/pdf`;
  await expect(page.getByRole("link", { name: "Télécharger le PDF" })).toHaveCount(0);
  expect((await page.request.get(url)).status()).toBe(409);
  const add = page.getByRole("form", { name: "Ajouter une ligne" });
  await add.getByLabel("Description").fill("Prestation fictive PDF"); await add.getByLabel("Quantité").fill("1"); await add.getByLabel("Prix unitaire HT (€)").fill("100"); await add.getByLabel("TVA (%)").fill("20"); await add.getByRole("button", { name: "Ajouter la ligne" }).click();
  await expect(page.getByRole("region", { name: "Totaux" })).toContainText("120,00 €");
  await page.getByLabel("Je confirme l’émission et le verrouillage des lignes").check(); await page.getByRole("button", { name: "Émettre la facture" }).click();
  const link = page.getByRole("link", { name: "Télécharger le PDF" }); await expect(link).toBeVisible();
  const downloadPromise = page.waitForEvent("download"); await link.click(); const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^FAC-2026-\d{6}\.pdf$/);
  const path = await download.path(); if (!path) throw new Error("Download missing.");
  expect((await readFile(path)).subarray(0, 5).toString()).toBe("%PDF-");
  const original = await page.request.get(url); expect(original.status()).toBe(200); expect(original.headers()["content-type"]).toBe("application/pdf"); expect(original.headers()["cache-control"]).toContain("no-store");
  expect((await request.get(url)).status()).toBe(401);

  const foreignOrg = randomUUID(), foreignUser = randomUUID(), foreignCustomer = randomUUID(), foreignInvoice = randomUUID();
  let authId: string | undefined;
  const checked = async (operation: PromiseLike<{ error: unknown }>) => { const result = await operation; if (result.error) throw result.error; };
  try {
    const auth = await admin.auth.admin.createUser({ email: `pdf-${foreignOrg}@example.test`, password: `Fictional-${randomUUID()}`, email_confirm: true });
    if (auth.error) throw auth.error; authId = auth.data.user.id;
    await checked(admin.from("organizations").insert({ id: foreignOrg, name: "Organisation PDF Fictive B" }));
    await checked(admin.from("users").insert({ id: foreignUser, organization_id: foreignOrg, auth_user_id: authId, first_name: "Fictif", last_name: "PDF B", email: `pdf-${foreignOrg}@example.test`, role: "OWNER" }));
    await checked(admin.from("customers").insert({ id: foreignCustomer, organization_id: foreignOrg, name: "Client PDF Fictif B", type: "company" }));
    await checked(admin.from("invoices").insert({ id: foreignInvoice, organization_id: foreignOrg, customer_id: foreignCustomer, created_by_user_id: foreignUser, invoice_number: "FAC-2026-000001", issue_date: "2026-10-05", due_date: "2026-11-05" }));
    expect((await page.request.get(`/api/invoices/${foreignInvoice}/pdf`)).status()).toBe(404);
    await checked(admin.from("users").update({ role: "TECHNICIAN" }).eq("id", owner.id));
    expect((await page.request.get(url)).status()).toBe(403);
    await checked(admin.from("users").update({ role: "READ_ONLY" }).eq("id", owner.id));
    expect((await page.request.get(url)).status()).toBe(200);
    await checked(admin.from("users").update({ status: "inactive" }).eq("id", owner.id));
    expect((await page.request.get(url)).status()).toBe(401);
    await checked(admin.from("users").update({ status: "active", role: "OWNER" }).eq("id", owner.id));
    expect(await (await page.request.get(url)).body()).toEqual(await original.body());
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await checked(admin.from("users").update({ role: "OWNER", status: "active" }).eq("id", owner.id));
    for (const table of ["invoices", "customers", "users"]) await checked(admin.from(table).delete().eq("organization_id", foreignOrg));
    await checked(admin.from("organizations").delete().eq("id", foreignOrg));
    if (authId) { const result = await admin.auth.admin.deleteUser(authId); if (result.error) throw result.error; }
  }
});
