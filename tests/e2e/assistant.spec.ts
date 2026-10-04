import { expect, test } from "@playwright/test";
import { e2eFixture } from "./fixture";

test("Assistant requires authentication and accepts no forged tenant scope", async ({ page }) => {
  await page.goto("/assistant");
  await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
  const unauthorized = await page.request.post("/api/assistant", {
    headers: { Origin: new URL(page.url()).origin }, data: { message: "CRM" },
  });
  expect(unauthorized.status()).toBe(401);
  await page.getByLabel("E-mail").fill(e2eFixture.email);
  await page.getByLabel("Mot de passe").fill(e2eFixture.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { name: "Tableau de bord", exact: true })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: "Assistant", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Assistant", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Director", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Intelligence artificielle", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Intelligence artificielle", exact: true })).toBeVisible();
  await page.getByLabel("Modèle local standard").fill("qwen3:14b");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("prochaine demande");
  await page.reload();
  await expect(page.getByLabel("Modèle local standard")).toHaveValue("qwen3:14b");
  await page.getByRole("link", { name: "Assistant", exact: true }).first().click();
  const forged = await page.request.post("/api/assistant", {
    headers: { Origin: new URL(page.url()).origin }, data: { message: "CRM", organizationId: "foreign-tenant" },
  });
  expect(forged.status()).toBe(400);
  const crossOrigin = await page.request.post("/api/assistant", {
    headers: { Origin: "https://untrusted.example" }, data: { message: "CRM" },
  });
  expect(crossOrigin.status()).toBe(403);
  // The isolated test web server always disables cloud credentials.
  {
    const missingKey = await page.request.post("/api/assistant", {
      headers: { Origin: new URL(page.url()).origin }, data: { message: "Bonjour" },
    });
    expect(missingKey.status()).toBe(503);
    expect(await missingKey.json()).toMatchObject({ error: { code: "OPENAI_NOT_CONFIGURED" } });
  }
  // No OpenAI requests are made by this deterministic browser test.
  await page.route("**/api/assistant", (route) => route.fulfill({
    status: 503, contentType: "application/json",
    body: JSON.stringify({ error: { code: "OPENAI_NOT_CONFIGURED", message: "L’assistant est indisponible. Le CRM reste accessible." } }),
  }));
  await page.getByLabel("Votre message").fill("Combien ai-je de clients actifs ?");
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(page.locator("#assistant-error")).toContainText("Le CRM reste accessible");
  await page.unroute("**/api/assistant");
  await page.route("**/api/assistant", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ runId: "00000000-0000-4000-8000-000000000001", text: "**services** et *clients*\n\n- Premier\n- Second\n\n`lecture`\n\n<script>alert('unsafe')</script>", provider: "ollama", model: "qwen3:4b-instruct", fallbackUsed: false }) }));
  await page.getByLabel("Votre message").fill("Liste mes services");
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(page.locator('[role="log"] strong')).toHaveText("services");
  await expect(page.locator('[role="log"] em')).toHaveText("clients");
  await expect(page.locator('[role="log"] li')).toHaveCount(2);
  await expect(page.locator('[role="log"] script')).toHaveCount(0);
  await expect(page.getByText("Local · qwen3:4b-instruct", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Votre message")).toBeVisible();
  await page.getByRole("link", { name: "Clients", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Clients", exact: true })).toBeVisible();
});
