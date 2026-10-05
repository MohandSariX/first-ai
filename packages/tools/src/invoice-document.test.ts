import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { writeFile } from "node:fs/promises";
import { invoiceDocumentSnapshotSchema } from "@first-ai/schemas";
import { invoiceDocumentAvailability, type InvoiceDocumentView } from "./invoice-document.js";
import { generateInvoicePdf, formatDocumentMoney } from "./invoice-pdf.js";

function fixture(): InvoiceDocumentView {
  const identity = { name: "Société Fictive", legalName: "Société Fictive Test", addressLine1: "1 Rue Fictive", addressLine2: null, postalCode: "75001", city: "Paris", country: "FR", siret: null, vatNumber: null, email: "fictional@example.test", phone: null };
  return {
    snapshot: invoiceDocumentSnapshotSchema.parse({ version: 1, organizationId: "00000000-0000-4000-8000-000000000001", invoiceId: "00000000-0000-4000-8000-000000000002", capturedAt: "2026-10-05T12:00:00Z", currency: "EUR",
      seller: identity, customer: { ...identity, name: "Client Fictif", legalName: null, addressLine1: null, postalCode: null, city: null, country: null },
      invoice: { number: "FAC-2026-000001", issueDate: "2026-10-05", dueDate: "2026-11-05", status: "issued", notes: "Notes client\nMerci de votre confiance." },
      lines: [
        { description: "Prestation fictive A", quantity: "1.000", unitPrice: "100.00", taxRate: "20.000", subtotal: "100.00", taxAmount: "20.00", total: "120.00" },
        { description: "Prestation fictive B", quantity: "1.000", unitPrice: "100.00", taxRate: "5.500", subtotal: "100.00", taxAmount: "5.50", total: "105.50" },
      ], totals: { subtotal: "200.00", taxAmount: "25.50", total: "225.50" }, taxes: [{ rate: "5.500", base: "100.00", amount: "5.50" }, { rate: "20.000", base: "100.00", amount: "20.00" }],
    }), payment: { status: "partially_paid", amountPaid: "100.00", amountDue: "125.50", asOf: "2026-10-06T12:00:00Z" },
  };
}
// Extract plain text operands from PDFKit's actual compressed WinAnsi content streams.
// No pixel snapshots, external APIs or running database required.
function renderedText(pdf: Buffer): string {
  const raw = pdf.toString("latin1"); let result = "";
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const content = inflateSync(Buffer.from(match[1]!, "latin1")).toString("latin1");
    const winAnsi = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ";
    for (const operand of content.matchAll(/<([a-f\d]+)>/gi)) result += [...Buffer.from(operand[1]!, "hex")].map(b => b >= 128 && b <= 159 ? winAnsi[b - 128] : String.fromCharCode(b)).join("");
  }
  return result;
}
describe("invoice documents", () => {
  it("keeps exact money display without floating-point conversion", () => {
    expect(formatDocumentMoney("999999999999.99")).toBe("999 999 999 999,99 €");
    expect(() => formatDocumentMoney("0.001")).toThrow();
  });
  it("rejects missing snapshots and incomplete frozen seller identity", async () => {
    expect(invoiceDocumentAvailability(null).available).toBe(false);
    const view = fixture(); view.snapshot.seller.addressLine1 = null;
    expect(invoiceDocumentAvailability(view.snapshot).available).toBe(false);
    await expect(generateInvoicePdf(view)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(invoiceDocumentSnapshotSchema.safeParse({ ...fixture().snapshot, invoice: { ...fixture().snapshot.invoice, status: "draft" } }).success).toBe(false);
  });
  it("renders real deterministic PDF bytes, French identity, snapshot totals and mixed VAT", async () => {
    const view = fixture(), bytes = await generateInvoicePdf(view);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.toString("latin1")).toContain("FACTURE FAC-2026-000001");
    const text = renderedText(bytes);
    for (const expected of ["FAC-2026-000001", "Société Fictive Test", "Client Fictif", "200,00 €", "225,50 €", "TVA 5,5 %", "TVA 20 %", "125,50 €", "Partiellement réglée", "sans vérification bancaire", "Adresse de facturation client non renseignée", "Conformité fiscale non validée"]) expect(text).toContain(expected);
    expect(await generateInvoicePdf(view)).toEqual(bytes);
    if (process.env.FIRST_AI_PDF_QA === "true") await writeFile("/private/tmp/first-ai-invoice-qa.pdf", bytes);
  });
  it("updates only the separate payment section when fully paid", async () => {
    const view = fixture(), snapshot = structuredClone(view.snapshot);
    view.payment = { ...view.payment, status: "paid", amountPaid: "225.50", amountDue: "0.00" };
    const text = renderedText(await generateInvoicePdf(view));
    expect(text).toContain("État : Réglée"); expect(text).toContain("RESTE À PAYER : 0,00 €");
    expect(view.snapshot).toEqual(snapshot);
    await expect(generateInvoicePdf({ ...view, payment: { ...view.payment, amountDue: "1.00" } })).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("paginates long descriptions and notes without truncating records", async () => {
    const view = fixture(); view.snapshot.lines[0]!.description = "Description longue fictive. ".repeat(100) + "FIN-LIGNE";
    view.snapshot.invoice.notes = "Notes explicites. ".repeat(120) + "FIN-NOTES";
    const bytes = await generateInvoicePdf(view), text = renderedText(bytes);
    expect(text).toContain("FIN-LIGNE"); expect(text).toContain("FIN-NOTES");
    expect((bytes.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(2);
    if (process.env.FIRST_AI_PDF_QA === "true") await writeFile("/private/tmp/first-ai-invoice-long-qa.pdf", bytes);
  });
  it("fails explicitly instead of silently replacing unsupported identity glyphs", async () => {
    const view = fixture(); view.snapshot.customer.name = "客户";
    await expect(generateInvoicePdf(view)).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("renders v2 billing address, fiscal identity and explicit classifications without altering legacy v1", async () => {
    const view = fixture(), legacy = structuredClone(view.snapshot);
    view.snapshot = invoiceDocumentSnapshotSchema.parse({ ...view.snapshot, version: 2,
      seller: { ...view.snapshot.seller, fiscalIdentity: { legalName: "Société Fictive Test", legalEntityType: "company", legalForm: "SAS", siren: "123456789", siret: null, vatNumber: "FR00123456789", registration: "RCS Paris (fictif)", shareCapital: "1000.00", vatRegime: "normal", vatOnDebits: false, companySize: "sme", addressLine1: "1 Rue Fictive", addressLine2: null, postalCode: "75001", city: "Paris", country: "FR" } },
      customer: { ...view.snapshot.customer, name: "Client Facturé", addressLine1: "2 Rue Facturation", postalCode: "75002", city: "Paris", country: "FR", billingIdentity: { billingClassification: "professional", billingName: "Client Facturé", billingLegalName: null, billingAddressLine1: "2 Rue Facturation", billingAddressLine2: null, billingPostalCode: "75002", billingCity: "Paris", billingCountry: "FR", establishmentCountry: "FR", taxablePerson: true, siren: "987654321", siret: null, vatNumber: null } },
      classification: { transactionType: "B2B", operationCategory: "services", fiscalTerritory: "domestic", vatTreatment: "normal", vatReason: null },
    });
    const bytes = await generateInvoicePdf(view), text = renderedText(bytes);
    for (const expected of ["2 Rue Facturation", "SIREN vendeur : 123456789", "SIREN client : 987654321", "Forme juridique : SAS", "Capital social : 1 000,00 €", "B2B - Services - TVA normale", "Conformité fiscale non validée"]) expect(text).toContain(expected);
    expect(text).not.toContain("Adresse de facturation client non renseignée");
    expect(invoiceDocumentSnapshotSchema.parse(legacy)).toEqual(legacy);
    expect(await generateInvoicePdf(view)).toEqual(bytes);
    if (process.env.FIRST_AI_PDF_QA === "true") await writeFile("/private/tmp/first-ai-invoice-m1-qa.pdf", bytes);
  });
});
